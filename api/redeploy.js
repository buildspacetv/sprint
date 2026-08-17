/**
 * POST /api/redeploy -> ask Vercel to rebuild and redeploy the site.
 *
 * The site is static and rebuilds itself on every issue event, so this exists
 * for the case the automation cannot cover: something changed that no webhook
 * saw (an env var, a Vercel setting, a build that failed on a flake) and the
 * live pages are stale.
 *
 * Auth is the same shared passcode as the editor, in `x-edit-key`, for the
 * same reason the editor has one: this is a public URL during a public event,
 * and a build trigger anyone can POST to is a way to burn an account's build
 * minutes from a browser tab. The deploy hook URL itself is a bearer secret —
 * whoever holds it can deploy — so it stays in an env var and is never sent to
 * the client.
 *
 * A cooldown rejects a second trigger inside the window. It is per-instance and
 * therefore not a hard guarantee, but it turns an impatient double-click into
 * one build rather than two, which is what it is actually for.
 *
 * Returns 503 until VERCEL_DEPLOY_HOOK_URL and EDIT_KEY are both set, so an
 * unconfigured deployment says what is missing instead of failing obscurely.
 */

const COOLDOWN_MS = 60_000;

// Module scope survives between invocations on a warm instance; a cold start
// resets it. See the note above on what this is and is not.
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

function authorized(req) {
  const sent = req.headers['x-edit-key'];
  return Boolean(sent) && String(sent) === process.env.EDIT_KEY;
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
  if (!hookUrl()) {
    return fail(res, 503, 'not_configured',
      'No Vercel deploy hook is configured.',
      'Create a deploy hook on the Vercel project (Settings -> Git -> Deploy Hooks) and set its URL as VERCEL_DEPLOY_HOOK_URL.');
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
    const upstream = await fetch(hookUrl(), { method: 'POST' });
    const body = await upstream.text();
    if (!upstream.ok) {
      // The hook's own body can name the reason (a deleted hook, a paused
      // project), and it is more useful than a generic failure.
      return fail(res, 502, 'hook_failed',
        `Vercel refused the deploy hook (${upstream.status}).`,
        body.slice(0, 300) || 'Check that the deploy hook still exists on the project.');
    }
    lastFiredAt = Date.now();
    let job = null;
    try { job = JSON.parse(body).job || null; } catch (e) { /* hook returned no JSON */ }
    return send(res, 202, {
      status: 'queued',
      message: 'Vercel is rebuilding the site. It is usually live within a couple of minutes.',
      ...(job && job.id ? { jobId: job.id } : {}),
    });
  } catch (e) {
    return fail(res, 502, 'hook_unreachable', 'Could not reach the Vercel deploy hook.', String(e && e.message || e));
  }
};
