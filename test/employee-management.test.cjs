const { test } = require('node:test');
const assert = require('node:assert/strict');
const employee = (code = '12345') => ({ firstName: 'First', lastName: 'Employee', type: 'staff', student: 'לא', code });
const options = (id, operationId, code = '12345') => ({ id, operationId, codeKey: code, codeChanged: true, previous: null, employee: employee(code) });
test('concurrent code assignment cannot bind the same code to different employees', async () => {
  const { reserveEmployeeChange, commitEmployeeChange } = await import('../employee-management-state.mjs');
  const a = options('one', 'first'); const b = options('two', 'second');
  const state = reserveEmployeeChange({ employees: {} }, a, 1000);
  assert.equal(reserveEmployeeChange(structuredClone(state), b, 1001), undefined);
  const committed = commitEmployeeChange(state, a, 'new-uid', 1002);
  assert.equal(committed.access.employees['new-uid'], 'one');
  assert.equal(reserveEmployeeChange(committed, b, 1003), undefined);
});
test('an expired operation cannot commit or remove a replacement lease', async () => {
  const { reserveEmployeeChange, commitEmployeeChange, releaseEmployeeChange } = await import('../employee-management-state.mjs');
  const a = options('one', 'first'); const b = options('one', 'second');
  const state = reserveEmployeeChange({ employees: {} }, a, 1000, 100);
  const recovered = reserveEmployeeChange(state, b, 1101, 100);
  assert.equal(commitEmployeeChange(structuredClone(recovered), a, 'stale-uid', 1102), undefined);
  assert.equal(releaseEmployeeChange(structuredClone(recovered), a), undefined);
  assert.equal(commitEmployeeChange(recovered, b, 'current-uid', 1102).employees.one.authUid, 'current-uid');
});
test('rotation atomically revokes old sessions and preserves all submitted schedule content', async () => {
  const { reserveEmployeeChange, commitEmployeeChange } = await import('../employee-management-state.mjs');
  const previous = { ...employee(), authUid: 'old-uid' };
  const history = { one: { 100: { schedule: 'first', preferences: 'keep' } } };
  const schedules = { a: { employeeId: 'one', name: 'First Employee', role: 'staff', schedule: 'first', preferences: 'keep', submissionTime: 42 }, b: { employeeId: 'two', name: 'Other', schedule: 'other', preferences: 'retain', submissionTime: 43 } };
  const state = { employees: { one: previous }, access: { employees: { 'old-uid': 'one', 'other-uid': 'two' } }, schedules: structuredClone(schedules), scheduleHistory: structuredClone(history) };
  const o = { ...options('one', 'rotation', '23456'), previous };
  const next = commitEmployeeChange(reserveEmployeeChange(state, o, 1000), o, 'fresh-uid', 1001);
  assert.equal(next.access.employees['old-uid'], undefined);
  assert.equal(next.access.employees['fresh-uid'], 'one');
  assert.deepEqual(next.schedules, schedules);
  assert.deepEqual(next.scheduleHistory, history);
});
test('profile edits synchronize current schedule identity, retaining shifts, notes and history', async () => {
  const { reserveEmployeeChange, commitEmployeeChange } = await import('../employee-management-state.mjs');
  const previous = { ...employee(), authUid: 'uid' };
  const state = { employees: { one: previous }, schedules: { a: { employeeId: 'one', name: 'First Employee', role: 'staff', schedule: 'shift', preferences: 'note', submissionTime: 123 } }, scheduleHistory: { retained: true } };
  const o = { ...options('one', 'rename'), previous, employee: { ...employee(), firstName: 'New' }, codeChanged: false };
  const next = commitEmployeeChange(reserveEmployeeChange(state, o, 1000), o, 'uid', 1001);
  assert.deepEqual(next.schedules.a, { employeeId: 'one', name: 'New Employee', role: 'staff', schedule: 'shift', preferences: 'note', submissionTime: 123 });
  assert.deepEqual(next.scheduleHistory, { retained: true });
});
