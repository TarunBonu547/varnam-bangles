'use strict';

// GitHub Contents API client. All GitHub writes happen server-side so the
// personal access token never reaches the browser.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GITHUB_API = 'https://api.github.com';

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  // Degraded mode: the server can still start, but GitHub-backed writes fail
  // gracefully until the operator configures the environment.
  console.warn(
    '[varnam] GITHUB_TOKEN/GITHUB_OWNER/GITHUB_REPO not configured. GitHub data store is unavailable.'
  );
}

function repoPath(path) {
  return path.replace(/^\/+/, '');
}

function githubHeaders(extra = {}) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `token ${GITHUB_TOKEN}`,
    'User-Agent': 'varnam-bangles-admin',
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  };
}

async function githubRequest(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...githubHeaders(), ...options.headers } });
  const text = await res.text();
  let body = null;
  if (text.length) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!res.ok) {
    const err = new Error(`GitHub API ${res.status}: ${typeof body === 'string' ? body : (body && body.message) || res.statusText}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export function githubConfigured() {
  return Boolean(GITHUB_TOKEN && GITHUB_OWNER && GITHUB_REPO);
}

// Get the parsed JSON content of a file plus its current SHA (required before any write).
export async function getFileJson(path) {
  if (!githubConfigured()) {throw new Error('GitHub is not configured on the server.');}
  const url = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath(path)}`;
  const body = await githubRequest(url);
  if (body.type !== 'file') {throw new Error(`"${path}" is not a file`);}
  if (body.encoding !== 'base64') {throw new Error(`Unexpected encoding for "${path}": ${body.encoding}`);}
  const content = Buffer.from(body.content, 'base64').toString('utf8');
  return { content, sha: body.sha, path: body.path };
}

// Create or update a JSON file. Re-fetches the SHA and retries once on a 409
// conflict to handle concurrent modifications.
export async function setFileJson(path, value, message) {
  if (!githubConfigured()) {throw new Error('GitHub is not configured on the server.');}
  const url = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath(path)}`;
  const content = Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8').toString('base64');

  const attempt = async (sha) =>
    githubRequest(url, {
      method: 'PUT',
      body: JSON.stringify({ message, content, sha, branch: GITHUB_BRANCH }),
    });

  try {
    return await attempt(null);
  } catch (err) {
    if (err.status !== 409) {throw err;}
    // Concurrent modification: reload current SHA and retry once.
    const current = await getFileJson(path);
    return await attempt(current.sha);
  }
}

export async function deleteFileJson(path, message) {
  if (!githubConfigured()) {throw new Error('GitHub is not configured on the server.');}
  const url = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${repoPath(path)}`;
  const current = await getFileJson(path);
  const body = await githubRequest(url, {
    method: 'DELETE',
    body: JSON.stringify({ message, sha: current.sha, branch: GITHUB_BRANCH }),
  });
  return body;
}

export { GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH };
