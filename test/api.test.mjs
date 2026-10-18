import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

// Load .env first, then set deterministic test-only credentials so the test is
// independent of the developer's personal .env settings. NODE_ENV=development
// keeps session cookies non-secure so they work over plain HTTP in tests.
dotenv.config();

const TEST_EMAIL = 'varnam-admin-test@example.com';
const TEST_PASSWORD = 'VarnamAdminTest2026!';
const TEST_SECRET = 'test-secret-do-not-use-in-production';

process.env.NODE_ENV = 'development';
process.env.SESSION_SECRET = TEST_SECRET;
process.env.SESSION_NAME = 'varnam_admin_test';
process.env.ADMIN_EMAIL = TEST_EMAIL;
process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash(TEST_PASSWORD, 12);

// Import the app AFTER env vars are set so server modules read them at load time.
const appModule = await import('../server/index.js');
const app = appModule.default;

function cookieJar() {
  const jar = {};
  return {
    get() {
      return Object.keys(jar).map((k) => `${k}=${jar[k]}`).join('; ');
    },
    xsrf() {
      return jar['XSRF-TOKEN'] || null;
    },
    set(headers) {
      const sc = headers.getSetCookie ? headers.getSetCookie() : [];
      for (const h of sc) {
        const m = h.match(/([^=]+)=([^;]*);/);
        if (m) {jar[m[1].trim()] = m[2];}
      }
    },
  };
}

async function req(jar, port, path, opts = {}) {
  const headers = { ...opts.headers, Connection: 'close' };
  const c = jar.get();
  if (c) {headers.Cookie = c;}
  if (jar.xsrf()) {headers['X-XSRF-TOKEN'] = jar.xsrf();}
  const res = await fetch(`http://localhost:${port}${path}`, { ...opts, headers, redirect: 'manual' });
  jar.set(res.headers);
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text();
  return { status: res.status, body };
}

it('Varnam admin API flow', async () => {
  let srv;
  const server = await new Promise((resolve) => {
    srv = app.listen(0, () => resolve(srv));
  });
  server.unref();
  const port = server.address().port;
  const jar = cookieJar();

  // Public read
  let r = await req(jar, port, '/api/products');
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.body.products) && r.body.count >= 1);

  // Unauthenticated write rejected
  r = await req(jar, port, '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 't1', name: 'Test', price: 10 }),
  });
  assert.strictEqual(r.status, 401);

  // Wrong credentials rejected
  r = await req(jar, port, '/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: 'wrong-password' }),
  });
  assert.strictEqual(r.status, 401);
  assert.strictEqual(r.body.error, 'invalid_credentials');

  // Login with correct credentials
  r = await req(jar, port, '/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ok, true);
  assert.ok(jar.get().includes('varnam_admin_test='), 'session cookie set');

  // Session
  r = await req(jar, port, '/admin/session');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.authenticated, true);

  // Validation: missing field
  r = await req(jar, port, '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': jar.xsrf() },
    body: JSON.stringify({ id: 't1', price: 10 }),
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, 'validation_failed');

  // Validation: invalid id
  r = await req(jar, port, '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': jar.xsrf() },
    body: JSON.stringify({ id: 'Bad ID!', name: 'Test', price: 10 }),
  });
  assert.strictEqual(r.status, 400);

  // Admin HTML pages require auth when not logged in (fresh jar)
  const fresh = cookieJar();
  r = await req(fresh, port, '/admin');
  assert.strictEqual(r.status, 302);

  // Categories public
  r = await req(jar, port, '/api/categories');
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.body.categories));
});
