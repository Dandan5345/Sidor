// A deterministic encoding lets existing employee codes use Firebase's password provider.
// Hashing is an encoding here: the strength of the login is still the strength of the code.
export async function employeeCredentials(value) {
  const code = String(value ?? '').trim();
  if (!code) throw new Error('יש להזין מספר עובד');
  const digest = async text => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
  return {
    email: `${await digest('sidor-employee-email-v1:' + code)}@employees.sidor.invalid`,
    password: await digest('sidor-employee-password-v1:' + code)
  };
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
export function employeeSelectionSession(selectedEmployeeId, access, user) {
  if (!selectedEmployeeId || !user?.uid || access?.manager !== false || access.employeeId !== selectedEmployeeId || !access.profile) {
    throw new Error('מספר העובד אינו תואם לשם שנבחר');
  }
  return Object.freeze({ employeeId: selectedEmployeeId, uid: user.uid, profile: Object.freeze({ ...access.profile }) });
}
export function assertSubmissionIdentity(session, user, employeeId) {
  if (!session?.employeeId || !user?.uid || user.uid !== session.uid || employeeId !== session.employeeId) {
    throw new Error('יש לבחור את השם ולהזין את מספר העובד התואם לפני שליחה');
  }
}
