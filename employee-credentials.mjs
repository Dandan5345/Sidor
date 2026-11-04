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
