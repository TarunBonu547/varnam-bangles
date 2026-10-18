import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { verifyPassword, hashPassword } from '../server/auth.js';

describe('admin auth', () => {
  const hash = '$2a$12$kj9cA4bBwp7EAHwkUitMIukD.VMmKJZI9wWvmDJzdZWwHMO6p.eJ2'; // bcrypt of "VarnamAdmin2026!"

  it('verifyPassword returns true for the correct password', async () => {
    assert.strictEqual(await verifyPassword('VarnamAdmin2026!', hash), true);
  });

  it('verifyPassword returns false for the wrong password', async () => {
    assert.strictEqual(await verifyPassword('wrong-password', hash), false);
  });

  it('verifyPassword returns false for a null/undefined hash', async () => {
    assert.strictEqual(await verifyPassword('anything', null), false);
    assert.strictEqual(await verifyPassword('anything', undefined), false);
  });

  it('hashPassword produces a bcrypt hash that verifyPassword accepts', async () => {
    const h = await hashPassword('test-password-123');
    assert.strictEqual(typeof h, 'string');
    assert.ok(h.startsWith('$2a$'));
    assert.strictEqual(await verifyPassword('test-password-123', h), true);
    assert.strictEqual(await verifyPassword('other-password', h), false);
  });
});
