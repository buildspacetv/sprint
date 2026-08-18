/**
 * POST /api/redeploy -> rebuild and redeploy the site.
 *
 * The site rebuilds itself on every issue event, so this exists for the case
 * the automation cannot cover: something changed that no webhook saw (an env
 * var, a Vercel setting, a build that failed on a flake) and the live pages
 * are stale.
 *
 * Two ways to get there, in order of preference:
 *
 *   deploy hook   VERCEL_DEPLOY_HOOK_URL redeploys the current commit as-is.
 *                 The right tool when the content is fine and the deployment
 *                 is not — a changed env var, a failed build.
 *
 *   workflow      Failing that, dispatch the build workflow with the GitHub
 *                 token the editor already uses. That re-runs sync + build, so
 *                 it also picks up issue edits, and the commit it pushes is
 *                 what deploys. It cannot redeploy an unchanged tree: if
 *                 nothing changed there is nothing to commit, so the reply
 *                 says "if anything changed" rather than promising a deploy.
 *
 * The fallback is the point. A deploy hook is a dashboard round-trip nobody
 * makes at 3am during an event, and the token is already configured for
 * /api/edit, so the button works out of the box and gets strictly better if a
 * hook is ever added.
 *
 * Auth is the editor's passcode in `x-edit-key`, for the same reason the
 * editor has one: this is a public URL during a public event, and a build
 * trigger anyone can POST to is a way to burn an account's build minutes from
 * a browser tab. Both the hook URL and the token are bearer secrets and stay
 * server-side.
 */

const COOLDOWN_MS = 60_000;
const REPO = process.env.EDIT_REPO || 'buildspacetv/sprint';
const BRANCH = process.env.EDIT_BRANCH || 'main';
const WORKFLOW = process.env.REDEPLOY_WORKFLOW || 'submissions.yml';

// Module scope survives between invocations on a warm instance; a cold start
// resets it. It turns an impatient double-click into one build rather than
// two, which is what it is for — not a guarantee.
let lastFiredAt = 0;

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body, null, 2));
}

function fail(res, status, code, message, resolution) {
  return send(res, status, { error: { code, message, ...(resolution ? { resolution } : {}) } });
}

function hookUrl() {
  const raw = process.env.VERCEL_DEPLOY_HOOK_URL || process.env.DEPLOY_HOOK_URL || '';
  // A malformed value would otherwise surface as an opaque fetch failure.
  return /^https:\/\/api\.vercel\.com\/v1\/integrations\/deploy\//.test(raw) ? raw : '';
}

function ghToken() {
  return process.env.EDIT_GITHUB_TOKEN || process.env.JUDGING_GITHUB_TOKEN || '';
}

function authorized(req) {
  const sent = req.headers['x-edit-key'];
  return Boolean(sent) && String(sent) === process.env.EDIT_KEY;
}

async function fireHook() {
  const upstream = await fetch(hookUrl(), { method: 'POST' });
  const body = await upstream.text();
  if (!upstream.ok) {
    // The hook's own body names the reason — a deleted hook, a paused project
    // — and that is more useful than a generic failure.
    return { ok: false, status: upstream.status, detail: body.slice(0, 300) };
  }
  let job = null;
  try { job = JSON.parse(body).job || null; } catch (e) { /* hook returned no JSON */ }
  return {
    ok: true,
    via: 'deploy-hook',
    message: 'Vercel is rebuilding the site. It is usually live within a couple of minutes.',
    ...(job && job.id ? { jobId: job.id } : {}),
  };
}

async function fireWorkflow() {
  const url = `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${ghToken()}`,
      'User-Agent': 'physical-ai-sprint-redeploy',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ ref: BRANCH }),
  });
  if (upstream.status !== 204) {
    return { ok: false, status: upstream.status, detail: (await upstream.text()).slice(0, 300) };
  }
  return {
    ok: true,
    via: 'workflow',
    message: 'Rebuild started. The site redeploys within a couple of minutes if anything changed.',
  };
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return fail(res, 405, 'method_not_allowed', 'Use POST to trigger a redeploy.');
  }

  if (!process.env.EDIT_KEY) {
    return fail(res, 503, 'not_configured',
      'EDIT_KEY is not set, so the redeploy endpoint refuses to trigger builds.',
      'Set EDIT_KEY in the Vercel project environment variables and share it with the organizers.');
  }
  if (!hookUrl() && !ghToken()) {
    return fail(res, 503, 'not_configured',
      'Neither a Vercel deploy hook nor a GitHub token is configured, so there is no way to start a build.',
      'Set EDIT_GITHUB_TOKEN (used by /api/edit too), or add a deploy hook URL as VERCEL_DEPLOY_HOOK_URL.');
  }
  if (!authorized(req)) {
    return fail(res, 401, 'unauthorized', 'Missing or incorrect edit key.',
      'Send the shared edit passcode in the x-edit-key header.');
  }

  const since = Date.now() - lastFiredAt;
  if (lastFiredAt && since < COOLDOWN_MS) {
    return fail(res, 429, 'too_soon',
      `A redeploy was triggered ${Math.round(since / 1000)}s ago.`,
      `Wait ${Math.ceil((COOLDOWN_MS - since) / 1000)}s — a build already in flight will pick up the same content.`);
  }

  try {
    const result = hookUrl() ? await fireHook() : await fireWorkflow();
    if (!result.ok) {
      return fail(res, 502, 'trigger_failed',
        `${hookUrl() ? 'Vercel' : 'GitHub'} refused the build request (${result.status}).`,
        result.detail || 'Check that the deploy hook or the token is still valid.');
    }
    lastFiredAt = Date.now();
    return send(res, 202, { status: 'queued', via: result.via, message: result.message, ...(result.jobId ? { jobId: result.jobId } : {}) });
  } catch (e) {
    return fail(res, 502, 'trigger_unreachable', 'Could not reach the build trigger.', String((e && e.message) || e));
  }
};
