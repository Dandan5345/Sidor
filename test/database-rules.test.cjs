const { before, after, beforeEach, test } = require('node:test');
const { readFileSync } = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { ref, get, set, update, remove, query, orderByChild, equalTo, runTransaction, onValue } = require('firebase/database');
let env;
const schedule = id => ({ employeeId: id, name: id === 'one' ? 'First Employee' : 'Second Employee', role: 'staff', schedule: 'ראשון-בוקר', preferences: '', submissionTime: Date.now() });
const seed = () => ({
  access: { managers: { manager: true }, employees: { worker: 'one', other: 'two', stale: 'one' } },
  employees: { one: { authUid: 'worker', code: '12345' }, two: { authUid: 'other', code: '23456' } },
  employeeProfiles: { one: { firstName: 'First', lastName: 'Employee', type: 'staff' }, two: { firstName: 'Second', lastName: 'Employee', type: 'staff' } },
  schedules: { a: schedule('one'), b: schedule('two') },
  scheduleHistory: { one: { 100: schedule('one') }, two: { 100: schedule('two') } },
  rules: { staff: {} }, employeeRules: { one: { example: true }, two: { example: true } },
  settings: { allowScheduleSubmission: 'כן', weeklyAutomationEnabled: true, weeklyWindowOpensAt: Date.now() - 600000, weeklyNextCloseAt: Date.now() + 600000 }
});
const db = uid => uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database();
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-sidor-security', database: { rules: readFileSync('database.rules.json', 'utf8') } }); });
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.withSecurityRulesDisabled(async c => set(ref(c.database()), seed())); });
test('unauthenticated requests cannot read or write any application data', async () => {
  for (const path of ['/', 'employees', 'schedules', 'settings', 'employeeProfiles/one', 'access', 'rules']) {
    await assertFails(get(ref(db(), path)));
    await assertFails(set(ref(db(), path || 'intrusion'), true));
  }
});
test('self registered, anonymous-provider and revoked users do not gain membership', async () => {
  for (const uid of ['stranger', 'stale']) {
    await assertFails(get(ref(db(uid), 'settings')));
    await assertFails(get(ref(db(uid), 'employeeProfiles/one')));
    await assertFails(set(ref(db(uid), 'access/managers/' + uid), true));
  }
});
test('worker can read their profile, rules, history and query only their schedules', async () => {
  const d = db('worker');
  for (const path of ['access/employees/worker', 'employeeProfiles/one', 'settings', 'rules', 'employeeRules/one', 'scheduleHistory/one', 'schedules/a']) await assertSucceeds(get(ref(d,path)));
  const result = await assertSucceeds(get(query(ref(d, 'schedules'), orderByChild('employeeId'), equalTo('one'))));
  require('node:assert/strict').deepEqual(Object.keys(result.val()), ['a']);
  for (const path of ['/', 'employees', 'employees/one/code', 'employeeProfiles', 'employeeProfiles/two', 'schedules', 'schedules/b', 'employeeRules/two', 'scheduleHistory/two']) await assertFails(get(ref(d,path)));
  await assertFails(get(query(ref(d, 'schedules'), orderByChild('employeeId'), equalTo('two'))));
});
test('worker can submit and update only their own valid schedule', async () => {
  const d = db('worker');
  await assertSucceeds(set(ref(d, 'schedules/new'), schedule('one')));
  await assertSucceeds(update(ref(d, 'schedules/new'), { preferences: 'Please assign mornings' }));
  await assertFails(set(ref(d, 'schedules/b'), schedule('one')));
  await assertFails(set(ref(d, 'schedules/new'), schedule('two')));
  await assertFails(update(ref(d, 'schedules/new'), { name: 'Second Employee' }));
  await assertFails(update(ref(d, 'schedules/new'), { unexpected: true }));
  await assertFails(remove(ref(d, 'schedules/new')));
  await assertSucceeds(set(ref(d, 'scheduleHistory/one'), { 100: schedule('one') }));
  await assertFails(set(ref(d, 'scheduleHistory/two'), { 100: schedule('two') }));
});
test('workers cannot change settings, credentials, privileges or delete all schedules', async () => {
  const d = db('worker');
  for (const path of ['settings', 'settings/allowScheduleSubmission', 'employees/one', 'access/employees/worker', 'access/managers/worker', 'employeeProfiles/one', 'rules/staff', 'employeeRules/one']) await assertFails(set(ref(d,path), true));
  await assertFails(remove(ref(d, 'schedules')));
  await assertFails(runTransaction(ref(d, 'settings'), current => ({ ...current, allowScheduleSubmission: 'כן' })));
});
test('server deadline and manual closure both block employee submission', async () => {
  for (const settings of [{ allowScheduleSubmission: 'לא' }, { weeklyNextCloseAt: Date.now() - 1000 }, { weeklyNextCloseAt: null }]) {
    await env.withSecurityRulesDisabled(async c => update(ref(c.database(), 'settings'), settings));
    await assertFails(set(ref(db('worker'), 'schedules/new'), schedule('one')));
  }
});
test('manager can manage employees, settings, schedules and membership', async () => {
  const d = db('manager');
  for (const path of ['employees', 'settings', 'schedules', 'access']) await assertSucceeds(get(ref(d,path)));
  await assertSucceeds(update(ref(d, 'settings'), { allowScheduleSubmission: 'לא' }));
  await assertSucceeds(set(ref(d, 'access/employees/new-worker'), 'one'));
  await assertSucceeds(remove(ref(d, 'schedules')));
});
test('removing or replacing membership immediately blocks an already-issued worker session', async () => {
  const d = db('worker');
  await assertSucceeds(get(ref(d, 'settings')));
  await env.withSecurityRulesDisabled(async c => update(ref(c.database()), { 'employees/one/authUid': 'replacement' }));
  await assertFails(get(ref(d, 'settings')));
  await assertFails(set(ref(d, 'schedules/new'), schedule('one')));
});
test('code reservations have a single winner under concurrent manager assignments', async () => {
  const codeRef1 = ref(db('manager'), 'employeeCodeClaims/test-code');
  const codeRef2 = ref(db('manager'), 'employeeCodeClaims/test-code');
  const attempts = await Promise.all([
    runTransaction(codeRef1, current => current === null ? { employeeId: 'one', operationId: 'first' } : undefined, { applyLocally: false }),
    runTransaction(codeRef2, current => current === null ? { employeeId: 'two', operationId: 'second' } : undefined, { applyLocally: false })
  ]);
  require('node:assert/strict').equal(attempts.filter(result => result.committed).length, 1);
  await assertFails(get(ref(db('worker'), 'employeeCodeClaims/test-code')));
  await assertFails(set(ref(db('worker'), 'employeeCodeClaims/test-code'), null));
  await assertFails(set(ref(db('worker'), 'employeeOperations/one'), 'intrusion'));
});
test('automation cannot reopen employee writes before the server-defined weekly window', async () => {
  await env.withSecurityRulesDisabled(async c => update(ref(c.database(), 'settings'), { allowScheduleSubmission: 'כן', weeklyWindowOpensAt: Date.now() + 60000 }));
  await assertFails(set(ref(db('worker'), 'schedules/new'), schedule('one')));
});
test('manager atomic employee edits retain schedules/history and satisfy production validators', async () => {
  const { reserveEmployeeChange, commitEmployeeChange } = await import('../employee-management-state.mjs');
  const d = db('manager');
  let stop;
  const state = await new Promise(resolve => { stop = onValue(ref(d), snapshot => resolve(snapshot.val())); });
  const o = { id: 'one', previous: state.employees.one, employee: { code: '12345', firstName: 'Updated', lastName: 'Employee', type: 'staff', student: 'לא' }, operationId: 'rename', codeChanged: false };
  const reserved = await assertSucceeds(runTransaction(ref(d), current => reserveEmployeeChange(current, o, Date.now()), { applyLocally: false }));
  require('node:assert/strict').equal(reserved.committed, true);
  const committed = await assertSucceeds(runTransaction(ref(d), current => commitEmployeeChange(current, o, 'worker', Date.now()), { applyLocally: false }));
  require('node:assert/strict').equal(committed.committed, true);
  const next = (await get(ref(d))).val();
  require('node:assert/strict').equal(next.schedules.a.name, 'Updated Employee');
  require('node:assert/strict').equal(next.schedules.a.schedule, state.schedules.a.schedule);
  require('node:assert/strict').deepEqual(next.scheduleHistory, state.scheduleHistory);
  await assertSucceeds(set(ref(db('worker'), 'scheduleHistory/one'), state.scheduleHistory.one));
  stop();
});
test('retained manager credentials cannot submit or overwrite employee shift content', async () => {
  const d = db('manager');
  await assertFails(set(ref(d, 'schedules/manager-submission'), schedule('two')));
  await assertFails(update(ref(d, 'schedules/a'), { schedule: 'שני-ערב' }));
  await assertFails(update(ref(d, 'schedules/a'), { preferences: 'submitted without employee code' }));
  await assertFails(update(ref(d, 'schedules/a'), { name: 'Second Employee' }));
  await assertSucceeds(remove(ref(d, 'schedules/a')));
});
test('public name directory exposes only names and roles, with no codes or private data', async () => {
  await env.withSecurityRulesDisabled(async c => set(ref(c.database(), 'publicEmployees'), { one: { firstName: 'First', lastName: 'Employee', type: 'staff' } }));
  await assertSucceeds(get(ref(db(), 'publicEmployees')));
  await assertFails(set(ref(db(), 'publicEmployees/one/code'), '12345'));
  await assertFails(set(ref(db('manager'), 'publicEmployees/one/code'), '12345'));
  await assertFails(get(ref(db(), 'employees/one/code')));
});
test('anyone can read only the public submission status flags', async () => {
  for (const path of ['settings/allowScheduleSubmission', 'settings/weeklyAutomationEnabled']) {
    await assertSucceeds(get(ref(db(), path)));
    await assertFails(set(ref(db(), path), 'כן'));
    await assertFails(set(ref(db('worker'), path), 'כן'));
  }
  for (const path of ['settings', 'settings/weeklyNextCloseAt', 'settings/weeklyWindowOpensAt']) await assertFails(get(ref(db(), path)));
});
