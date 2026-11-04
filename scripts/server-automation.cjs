const { dueEvents, applyAutomationEvent, submissionWindow } = require('../functions/automation.js');
function nextAutomationState(state, now) {
  if (state?.settings?.weeklyAutomationEnabled !== true) return null;
  const since = Math.max(Number(state.settings.weeklyAutomationEnabledAt || 0), Number(state.settings.weeklyAutomationLastEventAt || 0), Number(state.settings.weeklyAutomationCutoverAt || 0));
  let next = state;
  for (const { action, scheduledAt } of dueEvents(now, since)) next = applyAutomationEvent(next, action, scheduledAt) || next;
  const window = submissionWindow(now);
  if (next.settings.weeklyNextCloseAt !== window.closesAt || next.settings.weeklyWindowOpensAt !== window.opensAt) {
    next = { ...next, settings: { ...next.settings, weeklyNextCloseAt: window.closesAt, weeklyWindowOpensAt: window.opensAt } };
  }
  return next === state ? null : next;
}
async function run(token, databaseUrl, now = Date.now()) {
  if (!token || !databaseUrl) throw new Error('Missing automation credentials or database URL');
  const url = databaseUrl.replace(/\/$/, '') + '/.json';
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, 'X-Firebase-ETag': 'true' } });
    if (!response.ok) throw new Error(`Database read failed (${response.status})`);
    const state = await response.json();
    if (state?.settings?.authMigrationComplete !== true) return console.log('Authentication migration is not complete; no automation writes performed.');
    const next = nextAutomationState(state, now);
    if (!next) return console.log('No weekly event is due.');
    const etag = response.headers.get('etag');
    if (!etag) throw new Error('Database did not return a concurrency token');
    const written = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'if-match': etag }, body: JSON.stringify(next) });
    if (written.status === 412) continue;
    if (!written.ok) throw new Error(`Automation update failed (${written.status})`);
    console.log('Weekly automation completed atomically.');
    return;
  }
  throw new Error('Database kept changing; automation will retry on the next run');
}
module.exports = { nextAutomationState, run };
if (require.main === module) run(process.env.FIREBASE_ACCESS_TOKEN, process.env.FIREBASE_DATABASE_URL).catch(error => { console.error(error.message); process.exitCode = 1; });
