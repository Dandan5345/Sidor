const { test } = require('node:test');
const assert = require('node:assert/strict');
test('existing five digit codes produce stable Firebase credentials without exposing the code in the email', async () => {
  const { employeeCredentials } = await import('../employee-credentials.mjs');
  const a = await employeeCredentials(' 12345 ');
  const b = await employeeCredentials('12345');
  assert.deepEqual(a, b);
  assert.match(a.email, /^[a-f0-9]{64}@employees\.sidor\.invalid$/);
  assert.equal(a.email.includes('12345@'), false);
  assert.equal(a.password.length, 64);
  assert.notDeepEqual(a, await employeeCredentials('23456'));
  await assert.rejects(employeeCredentials(''));
});
test('rendered employee content escapes scriptable markup', async () => {
  const { escapeHtml } = await import('../employee-credentials.mjs');
  assert.equal(escapeHtml('<img src=x onerror="alert(1)"> &'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp;');
});
