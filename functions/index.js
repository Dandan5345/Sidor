const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { applyAutomationEvent } = require('./automation');

initializeApp({ databaseURL: 'https://sidoravoda111-default-rtdb.europe-west1.firebasedatabase.app' });
const options = {
  timeZone: 'Asia/Jerusalem', region: 'europe-west1',
  retryCount: 3, maxRetrySeconds: 3600, maxInstances: 1
};
async function runEvent(action, event) {
  const scheduledAt = Date.parse(event.scheduleTime);
  if (!Number.isFinite(scheduledAt)) throw new Error('Missing scheduler event time');
  // One atomic transaction: reset, reopening and the retry marker cannot diverge.
  // Retried/stale events never delete submissions from the new week.
  await getDatabase().ref('/').transaction(current => applyAutomationEvent(current, action, scheduledAt));
}
exports.closeWeeklySubmissions = onSchedule({ ...options, schedule: '0 14 * * 2' }, event => runEvent('close', event));
exports.resetWeeklySubmissions = onSchedule({ ...options, schedule: '50 23 * * 5' }, event => runEvent('reset', event));
