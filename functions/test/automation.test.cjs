const test = require('node:test');
const assert = require('node:assert/strict');
const { isSubmissionWindowClosed, applyAutomationEvent } = require('../automation.js');
test('Israel summer and winter deadlines and Friday reopening', () => {
  for (const [date, closed] of [
    ['2026-10-06T10:59:59Z', false], ['2026-10-06T11:00:00Z', true],
    ['2026-10-09T20:49:59Z', true], ['2026-10-09T20:50:00Z', false],
    ['2026-12-01T11:59:59Z', false], ['2026-12-01T12:00:00Z', true],
    ['2026-12-04T21:49:59Z', true], ['2026-12-04T21:50:00Z', false],
    ['2026-10-10T09:00:00Z', false]
  ]) assert.equal(isSubmissionWindowClosed(new Date(date)), closed, date);
});
test('close retains schedules; reset clears only current schedules and opens', () => {
  const state = { schedules: { a: {name:'A'} }, employees: { a:{} }, scheduleHistory:{ a:{} }, settings:{weeklyAutomationEnabled:true} };
  const closed = applyAutomationEvent(state, 'close', 100);
  assert.equal(closed.settings.allowScheduleSubmission, 'לא');
  assert.ok(closed.schedules.a);
  const opened = applyAutomationEvent(closed, 'reset', 200);
  assert.equal(opened.schedules, null);
  assert.equal(opened.settings.allowScheduleSubmission, 'כן');
  assert.deepEqual(opened.employees, state.employees);
  assert.deepEqual(opened.scheduleHistory, state.scheduleHistory);
});
test('disabled, duplicate, stale and pre-enable events cannot delete new submissions', () => {
  for (const settings of [
    {weeklyAutomationEnabled:false}, {weeklyAutomationEnabled:'לא'},
    {weeklyAutomationEnabled:true,weeklyAutomationLastEventAt:200}, {weeklyAutomationEnabled:true,weeklyAutomationEnabledAt:201}
  ]) assert.equal(applyAutomationEvent({settings,schedules:{a:{}}}, 'reset', 200), undefined);
  const opened=applyAutomationEvent({settings:{weeklyAutomationEnabled:true}}, 'reset', 200);
  opened.schedules={new:{}};
  assert.equal(applyAutomationEvent(opened, 'reset', 200), undefined);
  assert.equal(applyAutomationEvent(opened, 'close', 100), undefined);
});
test('dueEvents finds missed Tuesday close and Friday reset in Israel time', () => {
  const { dueEvents, runCatchUp } = require('../automation.js');
  const at = s => Date.parse(s);
  // Summer: Tue 14:00 IDT = 11:00Z, Fri 23:50 IDT = 20:50Z
  assert.deepEqual(dueEvents(at('2026-10-07T00:00:00Z'), at('2026-10-05T00:00:00Z')).map(e => e.scheduledAt), [at('2026-10-06T11:00:00Z')]);
  assert.deepEqual(dueEvents(at('2026-10-10T00:00:00Z'), at('2026-10-06T11:00:00Z')).map(e => e.action), ['reset']);
  assert.equal(dueEvents(at('2026-10-10T00:00:00Z'), at('2026-10-09T20:50:00Z')).length, 0);
  // Winter: Tue 14:00 IST = 12:00Z
  assert.deepEqual(dueEvents(at('2026-12-02T00:00:00Z'), at('2026-11-30T00:00:00Z')).map(e => e.scheduledAt), [at('2026-12-01T12:00:00Z')]);
  assert.equal(dueEvents(at('2026-12-01T11:59:00Z'), at('2026-11-28T00:00:00Z')).length, 0);
  // Missed both events -> close then reset, in order
  assert.deepEqual(dueEvents(at('2026-10-10T10:00:00Z'), at('2026-10-05T00:00:00Z')).map(e => e.action), ['close', 'reset']);
  // runCatchUp: disabled does nothing; enabled claims once and clears on reset
  const calls = [];
  const io = settings => ({ getSettings: async () => settings, claim: async (a) => (calls.push('claim:' + a), true),
    clearSchedules: async () => calls.push('clear'), release: async () => calls.push('release') });
  return runCatchUp(io({ weeklyAutomationEnabled: false }), at('2026-10-10T10:00:00Z')).then(() => {
    assert.deepEqual(calls, []);
    return runCatchUp(io({ weeklyAutomationEnabled: true, weeklyAutomationEnabledAt: at('2026-10-05T00:00:00Z') }), at('2026-10-10T10:00:00Z'));
  }).then(() => assert.deepEqual(calls, ['claim:close', 'claim:reset', 'clear']));
});
