import { strict as assert } from 'node:assert';
import { describe, it, afterEach } from 'node:test';
import dotenv from 'dotenv';

dotenv.config();

let customHandler = null;

// Mock global fetch to capture GitHub API requests.
globalThis.fetch = async (url, opts = {}) => {
  if (customHandler) {
    return customHandler(url, opts);
  }
  return new Response(JSON.stringify({ content: '', sha: 'abc123' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};

afterEach(() => {
  customHandler = null;
});

// Set env before importing so githubConfigured() returns true.
process.env.GITHUB_TOKEN = 'ghp_test_token_1234567890abcdef';
process.env.GITHUB_OWNER = 'test-owner';
process.env.GITHUB_REPO = 'test-repo';
process.env.GITHUB_BRANCH = 'main';

const { setFileJson } = await import('../server/github.js');

function httpMethod(opts) {
  return opts.method || 'GET';
}

describe('GitHub setFileJson', () => {
  it('creates a new file without sha when the file does not exist', async () => {
    const captured = {};
    customHandler = async (url, opts) => {
      const method = httpMethod(opts);
      if (method === 'GET') {
        // File does not exist: 404
        return new Response(JSON.stringify({ message: 'Not Found', documentation_url: 'https://docs.github.com' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        });
      }
      // PUT: create without sha
      captured.body = opts.body ? JSON.parse(opts.body) : null;
      captured.method = method;
      captured.url = String(url);
      return new Response(JSON.stringify({ content: '', sha: 'new-sha-123' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    };

    await setFileJson('data/products.json', { version: 1, products: [] }, 'Add products');

    assert.strictEqual(captured.method, 'PUT');
    assert.ok(captured.url.includes('/contents/data/products.json'));
    assert.ok(!('sha' in captured.body), 'sha must be omitted when creating a new file');
    assert.strictEqual(captured.body.message, 'Add products');
    assert.strictEqual(captured.body.branch, 'main');
    assert.ok(typeof captured.body.content === 'string');
    customHandler = null;
  });

  it('updates an existing file with its current SHA', async () => {
    const captured = { puts: [], gets: [] };
    customHandler = async (url, opts) => {
      const method = httpMethod(opts);
      if (method === 'GET') {
        captured.gets.push(url);
        return new Response(
          JSON.stringify({ content: 'eyJ2ZXJzaW9uIjoxfQ==', sha: 'current-sha-999', type: 'file', encoding: 'base64' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      captured.puts.push(opts.body ? JSON.parse(opts.body) : null);
      return new Response(JSON.stringify({ content: '', sha: 'updated-sha' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    await setFileJson('data/products.json', { version: 1, products: [] }, 'Update existing products');

    assert.strictEqual(captured.gets.length, 1, 'Should fetch current file before updating');
    assert.strictEqual(captured.puts.length, 1, 'Should make exactly one PUT');
    assert.strictEqual(captured.puts[0].sha, 'current-sha-999', 'PUT must include current SHA as string');
    assert.strictEqual(captured.puts[0].message, 'Update existing products');
    assert.strictEqual(captured.puts[0].branch, 'main');
    customHandler = null;
  });

  it('retries on 409 conflict with the latest SHA', async () => {
    const captured = { puts: [], gets: [] };
    customHandler = async (url, opts) => {
      const method = httpMethod(opts);
      if (method === 'GET') {
        captured.gets.push(url);
        return new Response(
          JSON.stringify({ content: 'eyJ2ZXJzaW9uIjoxfQ==', sha: 'retry-sha-789', type: 'file', encoding: 'base64' }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      captured.puts.push(opts.body ? JSON.parse(opts.body) : null);
      if (captured.puts.length === 1) {
        // First PUT: 409 conflict
        return new Response(JSON.stringify({ message: 'sha mismatch' }), {
          status: 409,
          headers: { 'content-type': 'application/json' },
        });
      }
      // Second PUT: success
      return new Response(JSON.stringify({ content: '', sha: 'final-sha' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    await setFileJson('data/products.json', { version: 1, products: [] }, 'Retry on conflict');

    assert.strictEqual(captured.puts.length, 2, 'Should make 2 PUT attempts');
    assert.strictEqual(captured.gets.length, 2, 'Should fetch current SHA twice (initial + retry)');
    assert.strictEqual(captured.puts[0].sha, 'retry-sha-789', 'First PUT uses existing SHA');
    assert.strictEqual(captured.puts[1].sha, 'retry-sha-789', 'Retry PUT must include latest SHA as string');
    customHandler = null;
  });

  it('does not send null or empty string as sha', async () => {
    const captured = {};
    customHandler = async (url, opts) => {
      const method = httpMethod(opts);
      if (method === 'GET') {
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404, headers: { 'content-type': 'application/json' } });
      }
      captured.body = opts.body ? JSON.parse(opts.body) : null;
      return new Response(JSON.stringify({ content: '', sha: 'new-sha' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    };

    await setFileJson('data/products.json', { version: 1, products: [] }, 'No null sha');

    const bodyStr = JSON.stringify(captured.body);
    assert.ok(!bodyStr.includes('"sha":null'), 'Body must not contain sha:null');
    assert.ok(!bodyStr.includes('"sha":""'), 'Body must not contain sha:""');
    assert.ok(!('sha' in captured.body), 'sha key must be absent for new files');
    customHandler = null;
  });
});
