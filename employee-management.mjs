import { ref, get, runTransaction, onValue } from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-database.js';
import { provisionEmployee } from './auth-session.mjs';
import { employeeCredentials } from './employee-credentials.mjs';

import { reserveEmployeeChange, commitEmployeeChange, releaseEmployeeChange } from './employee-management-state.mjs?v=20261104-name-code';

// Managers reserve an employee and a code in one transaction. Expired reservations
// can be recovered; the final transaction checks the operation ID and lease again,
// so an interrupted/stale browser can never commit after another manager takes over.
export async function saveEmployeeRecord({ db, config, id, previous = null, employee = null }) {
  const offset = await new Promise((resolve, reject) => onValue(ref(db, '.info/serverTimeOffset'), snapshot => resolve(snapshot.val() || 0), reject, { onlyOnce: true }));
  const now = () => Date.now() + offset;
  const operationId = crypto.randomUUID();
  const codeChanged = !!employee && (!previous || String(employee.code).trim() !== String(previous.code).trim());
  const credentials = codeChanged ? await employeeCredentials(employee.code) : null;
  const codeKey = credentials?.email.split('@')[0];
  const rootRef = ref(db);
  let unsubscribe;
  await new Promise((resolve, reject) => { unsubscribe = onValue(rootRef, resolve, reject); });
  try {
    const options = { id, previous, employee, operationId, codeKey, codeChanged };
    const reserved = await runTransaction(rootRef, state => reserveEmployeeChange(state, options, now()), { applyLocally: false });
    if (!reserved.committed) throw new Error('הנתונים השתנו, מספר העובד כבר בשימוש, או שמתבצע עדכון אחר. יש לרענן ולנסות שוב.');
    async function assertOwnership() {
      // Check after obtaining an existing Auth UID and before deleting that exact UID.
      // A competing operation always creates a fresh UID and the commit is fenced.
      const lock = (await get(ref(db, `employeeOperations/${id}`))).val();
      if (lock?.operationId !== operationId || lock.expiresAt <= now()) throw new Error('פג תוקף הפעולה. יש לנסות שוב.');
      if (codeChanged) {
        const claim = (await get(ref(db, `employeeCodeClaims/${codeKey}`))).val();
        if (claim?.operationId !== operationId || claim.expiresAt <= now()) throw new Error('פג תוקף הקצאת מספר העובד.');
      }
    }
    try {
      const authUid = !employee ? null : codeChanged ? await provisionEmployee(config, employee.code, assertOwnership) : previous.authUid;
      const committed = await runTransaction(rootRef, state => commitEmployeeChange(state, options, authUid, now()), { applyLocally: false });
      if (!committed.committed) throw new Error('הפעולה פגה או שהנתונים השתנו. לא נשמר שינוי בהרשאות; יש לרענן ולנסות שוב.');
      return id;
    } finally {
      // Also safe after a successful commit or after another browser recovers a lease.
      await runTransaction(rootRef, state => releaseEmployeeChange(state, options), { applyLocally: false });
    }
  } finally { unsubscribe(); }
}
