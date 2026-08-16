/**
 * Storage for judging scores.
 *
 * Zero dependencies on purpose: this project has no package.json, because
 * adding one makes Vercel auto-detect a Node project and start running a build
 * on what is otherwise a pure static deploy. Every backend below is driven
 * over plain fetch against a REST API.
 *
 * Backends, in the order they are chosen:
 *
 *   1. GitHub Gist  — JUDGING_GITHUB_TOKEN + JUDGING_GIST_ID   (recommended)
 *   2. GitHub repo  — JUDGING_GITHUB_TOKEN (+ JUDGING_BRANCH)
 *   3. Upstash / KV — KV_REST_API_URL + KV_REST_API_TOKEN
 *
 * Why a Gist rather than a file on main: every score would otherwise be a
 * commit to the deployed branch, and Vercel builds on every push. Five judges
 * scoring thirty teams is ~150 commits in two hours, so the site would redeploy
 * ~150 times mid-event, thrashing the CDN cache during the one window where the
 * showcase actually matters. A Gist is still GitHub — same token, same history,
 * same audit trail of who scored what and when — but it is not the deployed
 * repo, so it cannot trigger a build. The repo backend is kept as an
 * alternative and writes to a non-deployed branch for the same reason.
 *
 * Neither GitHub surface is a database. Concurrent writes collide, so both
 * paths do a read-modify-write with a bounded retry rather than blind
 * overwrite: the loser of a race re-reads and reapplies instead of clobbering
 * another judge's score.
 */

const KEY = 'judging:scores:v1';
const GIST_FILE = 'judging-scores.json';
const REPO_PATH = 'data/judging-scores.json';
const MAX_ATTEMPTS = 4;

function backend() {
  if (process.env.JUDGING_GITHUB_TOKEN && process.env.JUDGING_GIST_ID) return 'gist';
  if (process.env.JUDGING_GITHUB_TOKEN) return 'repo';
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) return 'kv';
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Replace this judge's row for this team; everything else is untouched. */
function merge(rows, row) {
  const next = rows.filter((r) => !(r.judge === row.judge && String(r.team) === String(row.team)));
  next.push(row);
  return next;
}

function parseRows(text) {
  try {
    const d = JSON.parse(text);
    return Array.isArray(d) ? d : (d.rows || []);
  } catch { return []; }
}

/* ------------------------------------------------------------------ GitHub */

async function gh(url, init) {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.JUDGING_GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'physical-ai-sprint-judging',
      ...(init && init.headers),
    },
  });
}

/* ---- gist ---- */

async function gistRead() {
  // cache-bust: the gist API is CDN-cached and a stale read loses a score
  const res = await gh(`https://api.github.com/gists/${process.env.JUDGING_GIST_ID}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`Gist read ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const file = body.files && body.files[GIST_FILE];
  if (!file) return [];
  // Large gists come back truncated with a raw_url to fetch instead.
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url);
    return parseRows(await raw.text());
  }
  return parseRows(file.content || '');
}

async function gistWrite(row) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rows = await gistRead();
    const next = merge(rows, row);
    const res = await gh(`https://api.github.com/gists/${process.env.JUDGING_GIST_ID}`, {
      method: 'PATCH',
      body: JSON.stringify({
        files: { [GIST_FILE]: { content: JSON.stringify({ rows: next }, null, 2) } },
      }),
    });
    if (res.ok) return row;
    if (res.status < 500 && res.status !== 409) throw new Error(`Gist write ${res.status}: ${await res.text()}`);
    await sleep(150 * (attempt + 1));
  }
  throw new Error('Gist write failed after retries');
}

/* ---- repo file on a non-deployed branch ---- */

function repoSlug() { return process.env.JUDGING_REPO || 'buildspacetv/sprint'; }
function repoBranch() { return process.env.JUDGING_BRANCH || 'judging-data'; }

async function repoRead() {
  const res = await gh(`https://api.github.com/repos/${repoSlug()}/contents/${REPO_PATH}?ref=${repoBranch()}&t=${Date.now()}`);
  if (res.status === 404) return { rows: [], sha: null };
  if (!res.ok) throw new Error(`Repo read ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return { rows: parseRows(Buffer.from(body.content, 'base64').toString('utf8')), sha: body.sha };
}

async function repoWrite(row) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { rows, sha } = await repoRead();
    const next = merge(rows, row);
    const res = await gh(`https://api.github.com/repos/${repoSlug()}/contents/${REPO_PATH}`, {
      method: 'PUT',
      body: JSON.stringify({
        message: `Judging: ${row.judge} scored ${row.teamName || row.team}`,
        content: Buffer.from(JSON.stringify({ rows: next }, null, 2)).toString('base64'),
        branch: repoBranch(),
        ...(sha ? { sha } : {}),
      }),
    });
    if (res.ok) return row;
    // 409/422 is the sha race: re-read and reapply.
    if (res.status !== 409 && res.status !== 422 && res.status < 500) {
      throw new Error(`Repo write ${res.status}: ${await res.text()}`);
    }
    await sleep(150 * (attempt + 1));
  }
  throw new Error('Repo write conflicted after retries');
}

/* ----------------------------------------------------------------- Upstash */

async function kvCommand(command) {
  const res = await fetch(process.env.KV_REST_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`KV ${res.status}: ${await res.text()}`);
  return (await res.json()).result;
}

async function kvReadAll() {
  const raw = await kvCommand(['HGETALL', KEY]);
  const rows = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) {
      try { rows.push(JSON.parse(raw[i + 1])); } catch { /* skip a corrupt row */ }
    }
  }
  return rows;
}

const kvWrite = (row) =>
  kvCommand(['HSET', KEY, `${row.judge}::${row.team}`, JSON.stringify(row)]).then(() => row);

/* ------------------------------------------------------------------ shared */

async function readAll() {
  switch (backend()) {
    case 'gist': return gistRead();
    case 'repo': return (await repoRead()).rows;
    case 'kv': return kvReadAll();
    default: throw Object.assign(new Error('no storage backend configured'), { code: 'not_configured' });
  }
}

async function writeOne(row) {
  switch (backend()) {
    case 'gist': return gistWrite(row);
    case 'repo': return repoWrite(row);
    case 'kv': return kvWrite(row);
    default: throw Object.assign(new Error('no storage backend configured'), { code: 'not_configured' });
  }
}

module.exports = { readAll, writeOne, backend };
