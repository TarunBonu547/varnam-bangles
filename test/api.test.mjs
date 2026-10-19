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

  // Valid product creation: empty ID is rejected by backend validation (defense in depth)
  // Frontend generates ID from name so blank IDs do not reach the API in normal usage.
  r = await req(jar, port, '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': jar.xsrf() },
    body: JSON.stringify({
      id: '',
      name: 'Blank ID Product',
      slug: 'blank-id-product',
      description: 'A product with blank ID',
      price: 100,
      category: 'Bridal',
    }),
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, 'validation_failed');

  // Valid product creation: empty slug should not fail validation
  // (backend derives slug from id when slug is omitted/empty)
  r = await req(jar, port, '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': jar.xsrf() },
    body: JSON.stringify({
      id: 'valid-test-slug-empty',
      name: 'Valid Test Product',
      slug: '',
      description: 'A valid product',
      price: 999,
      category: 'Bridal',
    }),
  });
  assert.notStrictEqual(r.status, 400, 'Empty slug should not fail validation');
  assert.ok(r.status === 201 || r.status === 502 || r.status === 409, 'Expected 201 (created), 502 (GitHub unavailable), or 409 (conflict), got ' + r.status);

  // Valid product creation: explicit valid ID
  r = await req(jar, port, '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': jar.xsrf() },
    body: JSON.stringify({
      id: 'valid-explicit-id',
      name: 'Valid Explicit ID Product',
      slug: 'valid-explicit-id',
      description: 'A product with explicit ID',
      price: 999,
      category: 'Bridal',
    }),
  });
  assert.notStrictEqual(r.status, 400, 'Valid explicit ID should not fail validation');
  assert.ok(r.status === 201 || r.status === 502 || r.status === 409, 'Expected 201 (created), 502 (GitHub unavailable), or 409 (conflict), got ' + r.status);

  // Duplicate ID: create same ID again → 409
  r = await req(jar, port, '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': jar.xsrf() },
    body: JSON.stringify({
      id: 'valid-explicit-id',
      name: 'Duplicate ID Product',
      slug: 'duplicate-id-product',
      description: 'A product with duplicate ID',
      price: 200,
      category: 'Glass',
    }),
  });
  if (r.status === 409) {
    assert.strictEqual(r.body.error, 'duplicate_id');
  } else if (r.status === 502) {
    // GitHub unavailable, duplicate check may not be reached if loadProducts fails
  } else {
    assert.ok(false, 'Expected 409 (duplicate) or 502 (GitHub unavailable), got ' + r.status);
  }

  // Valid product creation: all required fields present
  r = await req(jar, port, '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': jar.xsrf() },
    body: JSON.stringify({
      id: 'another-valid-id',
      name: 'Another Valid Product',
      slug: 'another-valid-product',
      description: 'Another valid product',
      price: 1499,
      category: 'Glass',
    }),
  });
  assert.notStrictEqual(r.status, 400, 'Valid product should not fail validation');
  assert.ok(r.status === 201 || r.status === 502 || r.status === 409, 'Expected 201 (created), 502 (GitHub unavailable), or 409 (conflict), got ' + r.status);

  // Invalid price: empty string should fail validation
  r = await req(jar, port, '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': jar.xsrf() },
    body: JSON.stringify({
      id: 'invalid-price-test',
      name: 'Invalid Price Product',
      slug: 'invalid-price-test',
      description: 'A product with bad price',
      price: '',
      category: 'Bridal',
    }),
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, 'validation_failed');
  assert.ok(r.body.fields.some((f) => f.field === 'price'), 'Price field error expected');

  // Invalid slug: uppercase characters should fail validation
  r = await req(jar, port, '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': jar.xsrf() },
    body: JSON.stringify({
      id: 'invalid-slug-test',
      name: 'Invalid Slug Product',
      slug: 'Invalid Slug!',
      description: 'A product with bad slug',
      price: 100,
      category: 'Bridal',
    }),
  });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.error, 'validation_failed');
  assert.ok(r.body.fields.some((f) => f.field === 'slug'), 'Slug field error expected');

  // Regression: published/unpublished visibility in admin vs public listings
  // Create a published product.
  r = await req(jar, port, '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': jar.xsrf() },
    body: JSON.stringify({
      id: 'pub-test-product',
      name: 'Published Test Product',
      slug: 'pub-test-product',
      description: 'A published product',
      price: 100,
      category: 'Bridal',
      published: true,
    }),
  });
  const createdPublished = r.status === 201;

  // Create an unpublished product.
  r = await req(jar, port, '/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': jar.xsrf() },
    body: JSON.stringify({
      id: 'draft-test-product',
      name: 'Draft Test Product',
      slug: 'draft-test-product',
      description: 'A draft product',
      price: 200,
      category: 'Glass',
      published: false,
    }),
  });
  const createdDraft = r.status === 201;

  if (createdPublished || createdDraft) {
    // Admin listing: both published and draft products must appear.
    r = await req(jar, port, '/admin/products');
    assert.strictEqual(r.status, 200);
    const adminHtml = r.body;
    if (createdPublished) {
      assert.ok(adminHtml.includes('Published Test Product'), 'Admin must list published product');
    }
    if (createdDraft) {
      assert.ok(adminHtml.includes('Draft Test Product'), 'Admin must list draft product');
    }

    // Public listing (default): only published products.
    r = await req(jar, port, '/api/products');
    assert.strictEqual(r.status, 200);
    const publicIds = r.body.products.map((p) => p.id);
    if (createdPublished) {
      assert.ok(publicIds.includes('pub-test-product'), 'Public must list published product');
    }
    if (createdDraft) {
      assert.ok(!publicIds.includes('draft-test-product'), 'Public must NOT list draft product');
    }

    // Public listing with ?published=false: all products.
    r = await req(jar, port, '/api/products?published=false');
    assert.strictEqual(r.status, 200);
    const allIds = r.body.products.map((p) => p.id);
    if (createdPublished) {
      assert.ok(allIds.includes('pub-test-product'), 'Public ?published=false must include published product');
    }
    if (createdDraft) {
      assert.ok(allIds.includes('draft-test-product'), 'Public ?published=false must include draft product');
    }

    // Republish the draft via PUT.
    if (createdDraft) {
      r = await req(jar, port, '/api/products/draft-test-product', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': jar.xsrf() },
        body: JSON.stringify({
          id: 'draft-test-product',
          name: 'Draft Test Product',
          slug: 'draft-test-product',
          description: 'A draft product republished',
          price: 200,
          category: 'Glass',
          published: true,
        }),
      });
      assert.ok(r.status === 200 || r.status === 502, 'PUT republish should succeed or fail on GitHub, got ' + r.status);

      if (r.status === 200) {
        // Verify republished product now appears in public listing.
        r = await req(jar, port, '/api/products');
        assert.strictEqual(r.status, 200);
        const republishedIds = r.body.products.map((p) => p.id);
        assert.ok(republishedIds.includes('draft-test-product'), 'Republished product must appear in public listing');
      }
    }
  }

  // Admin HTML pages require auth when not logged in (fresh jar)
  const fresh = cookieJar();
  r = await req(fresh, port, '/admin');
  assert.strictEqual(r.status, 302);

  // Categories public
  r = await req(jar, port, '/api/categories');
  assert.strictEqual(r.status, 200);
  assert.ok(Array.isArray(r.body.categories));
});
