// Run once with a privileged OAuth token and an explicit list of existing manager UIDs.
// Never place database backups or credentials inside the public repository/hosting directory.
const fs = require('node:fs');
const { submissionWindow } = require('../functions/automation.js');
async function migrate({ token, managerUids, backupPath, apply = false, prepareOnly = false }) {
  if (!token || !Array.isArray(managerUids) || !managerUids.length || !backupPath) throw new Error('Token, explicit manager UID allowlist and private backup path are required');
  const { employeeCredentials } = await import('../employee-credentials.mjs');
  const database = 'https://sidoravoda111-default-rtdb.europe-west1.firebasedatabase.app';
  const project = 'sidoravoda111';
  const apiKey = 'AIzaSyCeYVNOdp8N9BJdsO9eLeATX1_PX5LRG_A';
  async function request(url, method = 'GET', body, privileged = true) {
    const response = await fetch(url, { method, headers: { ...(privileged ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw new Error(`Migration request failed (${response.status}): ${data.error?.message || 'database error'}`);
    return data;
  }
  async function snapshot() {
    const response = await fetch(`${database}/.json`, { headers: { Authorization: `Bearer ${token}`, 'X-Firebase-ETag': 'true' } });
    if (!response.ok) throw new Error(`Migration snapshot failed (${response.status})`);
    const etag = response.headers.get('etag');
    if (!etag) throw new Error('Missing database concurrency token');
    return { state: await response.json(), etag };
  }
  const { state } = await snapshot();
  fs.writeFileSync(backupPath, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
  const employees = Object.entries(state.employees || {});
  const codes = new Set(); const names = new Map();
  for (const [id, employee] of employees) {
    const code = String(employee.code ?? '').trim();
    const name = `${employee.firstName} ${employee.lastName}`;
    if (!code || codes.has(code) || names.has(name)) throw new Error('Employee codes and full names must be present and unique');
    codes.add(code); names.set(name, id);
  }
  for (const schedule of Object.values(state.schedules || {})) if (!names.has(schedule.name)) throw new Error('A current schedule cannot be matched to an employee');
  console.log(`Validated ${employees.length} employee records and ${Object.keys(state.schedules || {}).length} current schedules.`);
  if (!apply) return;
  const updates = {}; const employeeAccess = {}; const profiles = {};
  for (const [id, employee] of employees) {
    const { email, password } = await employeeCredentials(employee.code);
    const lookup = await request(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:lookup`, 'POST', { email: [email] });
    let uid = lookup.users?.[0]?.localId;
    if (!uid) {
      const account = await request(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, 'POST', { email, password, returnSecureToken: true }, false);
      uid = account.localId;
    }
    if (!uid) throw new Error('Authentication did not return an employee UID');
    // Verify the exact existing code works before granting database membership.
    const login = await request(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, 'POST', { email, password, returnSecureToken: true }, false);
    if (JSON.parse(Buffer.from(login.idToken.split('.')[1], 'base64url')).aud !== project) throw new Error('Authentication project mismatch');
    if (login.localId !== uid) throw new Error('Employee credential verification failed');
    employeeAccess[uid] = id;
    updates[`employees/${id}/authUid`] = uid;
    profiles[id] = { firstName: employee.firstName, lastName: employee.lastName, type: employee.type, student: employee.student || 'לא' };
  }
  if (prepareOnly) { console.log(`Prepared and verified ${employees.length} logins; database content is unchanged.`); return; }
  updates.access = { managers: Object.fromEntries(managerUids.map(uid => [uid, true])), employees: employeeAccess };
  updates.employeeProfiles = profiles;
  updates.publicEmployees = Object.fromEntries(Object.entries(profiles).map(([id, {firstName,lastName,type}]) => [id,{firstName,lastName,type}]));
  for (const [key, schedule] of Object.entries(state.schedules || {})) updates[`schedules/${key}/employeeId`] = names.get(schedule.name);
  for (const [id, history] of Object.entries(state.scheduleHistory || {})) for (const timestamp of Object.keys(history || {})) updates[`scheduleHistory/${id}/${timestamp}/employeeId`] = id;
  const window = submissionWindow(Date.now());
  updates['settings/authMigrationComplete'] = true;
  updates['settings/weeklyAutomationCutoverAt'] = Date.now();
  updates['settings/weeklyNextCloseAt'] = window.closesAt;
  updates['settings/weeklyWindowOpensAt'] = window.opensAt;
  const { state: current, etag } = await snapshot();
  for (const path of ['employees', 'schedules', 'scheduleHistory']) if (JSON.stringify(current[path]) !== JSON.stringify(state[path])) throw new Error('Data changed during migration; rerun against a fresh backup');
  const next = structuredClone(current);
  for (const [path, value] of Object.entries(updates)) {
    const segments = path.split('/'); const last = segments.pop();
    let node = next;
    for (const key of segments) node = node[key] ||= {};
    node[last] = value;
  }
  const written = await fetch(`${database}/.json`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'if-match': etag }, body: JSON.stringify(next) });
  if (written.status === 412) throw new Error('Concurrent database change detected. No migration data was written; rerun safely.');
  if (!written.ok) throw new Error(`Atomic migration write failed (${written.status})`);
  const verified = await request(`${database}/.json`);
  const stripIds = data => JSON.parse(JSON.stringify(data || {}), (key, value) => key === 'employeeId' ? undefined : value);
  for (const path of ['schedules', 'scheduleHistory']) {
    if (JSON.stringify(stripIds(verified[path])) !== JSON.stringify(stripIds(state[path]))) throw new Error('Post-migration schedule preservation check failed; preserve the backup and investigate.');
  }
  console.log('Verified every existing schedule and historical record is unchanged apart from its employee ID.');
  console.log(`Migrated and verified ${employees.length} employee logins. Existing schedules and history retained.`);
}
module.exports = { migrate };
if (require.main === module) migrate({ token: process.env.FIREBASE_ACCESS_TOKEN, managerUids: JSON.parse(process.env.SIDOR_MANAGER_UIDS || '[]'), backupPath: process.env.SIDOR_BACKUP_PATH, apply: process.argv.includes('--apply') }).catch(error => { console.error(error.message); process.exitCode = 1; });
