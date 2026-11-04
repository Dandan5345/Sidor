import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, inMemoryPersistence, setPersistence, deleteUser } from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-auth.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-app.js';
import { get, ref } from 'https://www.gstatic.com/firebasejs/11.5.0/firebase-database.js';
import { employeeCredentials } from './employee-credentials.mjs';
export async function waitForAuth(auth) {
  await auth.authStateReady();
  return auth.currentUser;
}
export async function accessForUser(db, user) {
  if (!user) return null;
  const manager = await get(ref(db, `access/managers/${user.uid}`));
  if (manager.val() === true) return { manager: true };
  const membership = await get(ref(db, `access/employees/${user.uid}`));
  const employeeId = membership.val();
  if (typeof employeeId !== 'string') return null;
  // This read is also checked against the live employee/authUid binding by Database Rules.
  const profile = await get(ref(db, `employeeProfiles/${employeeId}`));
  return profile.exists() ? { manager: false, employeeId, profile: profile.val() } : null;
}
export async function requireManager(app, db) {
  const auth = getAuth(app);
  const user = await waitForAuth(auth);
  let access;
  try { access = await accessForUser(db, user); } catch { /* fail closed */ }
  if (!access?.manager) {
    location.replace('index.html?manager=1');
    return new Promise(() => {});
  }
  document.documentElement.style.visibility = '';
  onAuthStateChanged(auth, current => { if (!current || current.uid !== user.uid) location.replace('index.html?manager=1'); });
  window.logoutSidor = async () => { await signOut(auth); location.replace('index.html'); };
  return access;
}
let provisioningAuth;
async function secondaryAuth(config) {
  if (!provisioningAuth) {
    provisioningAuth = getAuth(initializeApp(config, 'employee-provisioning'));
    await setPersistence(provisioningAuth, inMemoryPersistence);
  }
  return provisioningAuth;
}
export async function provisionEmployee(config, code, assertOwnership) {
  const auth = await secondaryAuth(config);
  const credentials = await employeeCredentials(code);
  try {
    await assertOwnership();
    let result;
    try { result = await createUserWithEmailAndPassword(auth, credentials.email, credentials.password); }
    catch (error) {
      if (error.code !== 'auth/email-already-in-use') throw error;
      const retired = await signInWithEmailAndPassword(auth, credentials.email, credentials.password);
      await assertOwnership();
      await deleteUser(retired.user);
      await assertOwnership();
      result = await createUserWithEmailAndPassword(auth, credentials.email, credentials.password);
    }
    await assertOwnership();
    return result.user.uid;
  } finally { await signOut(auth); }
}
