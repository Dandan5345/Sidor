const { test } = require('node:test');
const assert = require('node:assert/strict');
test('trusted catch-up atomically resets schedules and advances the next enforced deadline', async () => {
  const { nextAutomationState } = require('../scripts/server-automation.cjs');
  const state = { schedules: { old: {} }, employees: { one: {} }, scheduleHistory: { one: {} }, settings: { weeklyAutomationEnabled: true, weeklyAutomationEnabledAt: Date.parse('2026-11-01T00:00Z') } };
  const now = Date.parse('2026-11-07T00:00Z');
  const next = nextAutomationState(state, now);
  assert.equal(next.schedules, null);
  assert.equal(next.settings.allowScheduleSubmission, 'כן');
  assert.equal(next.settings.weeklyNextCloseAt, Date.parse('2026-11-10T12:00Z'));
  assert.deepEqual(next.employees, state.employees);
  assert.deepEqual(next.scheduleHistory, state.scheduleHistory);
  assert.equal(nextAutomationState(next, now), null);
});
test('disabled automation does not modify the database', () => {
  const { nextAutomationState } = require('../scripts/server-automation.cjs');
  assert.equal(nextAutomationState({ settings: { weeklyAutomationEnabled: false } }, Date.now()), null);
});
test('migration watermark retains all already submitted schedules even when an old reset was missed', () => {
  const { nextAutomationState } = require('../scripts/server-automation.cjs');
  const cutover = Date.parse('2026-11-07T08:00Z');
  const state = { schedules: { retained: { schedule: 'keep every shift', preferences: 'keep notes' } }, scheduleHistory: { retained: true }, settings: { weeklyAutomationEnabled: true, weeklyAutomationEnabledAt: Date.parse('2026-11-01T00:00Z'), weeklyAutomationCutoverAt: cutover } };
  const next = nextAutomationState(state, cutover + 1000);
  assert.deepEqual(next.schedules, state.schedules);
  assert.deepEqual(next.scheduleHistory, state.scheduleHistory);
  assert.equal(next.settings.weeklyAutomationLastEvent, undefined);
});
