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
