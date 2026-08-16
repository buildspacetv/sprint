/**
 * GET  /api/judging/scores  -> every stored score row
 * POST /api/judging/scores  -> upsert one judge's scores for one team
 *
 * Auth: a shared passcode in the `x-judge-key` header, matched against the
 * JUDGE_KEY env var. This is a public URL during a public event — without a
 * key anyone who finds the endpoint can write to the leaderboard.
 *
 * Every response is JSON, including errors, so the client can act on a failure
 * instead of parsing an HTML error page.
 */

const { readAll, writeOne, backend } = require('./_store.js');

const CRITERIA = ['ambition', 'functionality', 'creativity', 'architecture'];

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body, null, 2));
}

function fail(res, status, code, message, resolution) {
  return send(res, status, { error: { code, message, ...(resolution ? { resolution } : {}) } });
}

function authorized(req) {
  const expected = process.env.JUDGE_KEY;
  if (!expected) return false;
  const got = req.headers['x-judge-key'];
  return typeof got === 'string' && got.length === expected.length && got === expected;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!backend()) {
    return fail(res, 503, 'not_configured',
      'No storage backend is configured for judging.',
      'Set KV_REST_API_URL and KV_REST_API_TOKEN, or JUDGING_GITHUB_TOKEN, in the Vercel project environment variables.');
  }
  if (!process.env.JUDGE_KEY) {
    return fail(res, 503, 'not_configured',
      'JUDGE_KEY is not set, so the judging API refuses to accept writes.',
      'Set JUDGE_KEY in the Vercel project environment variables and share it with the judges.');
  }
  if (!authorized(req)) {
    return fail(res, 401, 'unauthorized',
      'Missing or incorrect judge key.',
      'Send the shared judging passcode in the x-judge-key header.');
  }

  try {
    if (req.method === 'GET') {
      const rows = await readAll();
      return send(res, 200, { object: 'list', count: rows.length, data: rows });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return fail(res, 400, 'invalid_json', 'Request body is not valid JSON.'); }
      }
      if (!body || typeof body !== 'object') return fail(res, 400, 'invalid_body', 'Expected a JSON object.');

      const judge = String(body.judge || '').trim().slice(0, 80);
      const team = String(body.team == null ? '' : body.team).trim().slice(0, 80);
      if (!judge) return fail(res, 400, 'missing_judge', 'A judge name is required.');
      if (!team) return fail(res, 400, 'missing_team', 'A team identifier is required.');

      // Scores are optional per criterion: a blank means "did not see this
      // team", which must stay distinct from a zero when averaging.
      const scores = {};
      const raw = body.scores && typeof body.scores === 'object' ? body.scores : {};
      for (const c of CRITERIA) {
        if (raw[c] === null || raw[c] === undefined || raw[c] === '') continue;
        const n = Number(raw[c]);
        if (!Number.isInteger(n) || n < 1 || n > 10) {
          return fail(res, 400, 'invalid_score', `Score for "${c}" must be an integer from 1 to 10, or omitted.`);
        }
        scores[c] = n;
      }

      const row = {
        judge,
        team,
        teamName: String(body.teamName || '').slice(0, 200) || undefined,
        scores,
        notes: String(body.notes || '').slice(0, 4000),
        updatedAt: new Date().toISOString(),
      };
      await writeOne(row);
      return send(res, 200, { ok: true, saved: row });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return fail(res, 405, 'method_not_allowed', `${req.method} is not supported here.`, 'Use GET to read scores or POST to save one.');
  } catch (err) {
    const code = err && err.code === 'not_configured' ? 'not_configured' : 'storage_error';
    return fail(res, code === 'not_configured' ? 503 : 502, code,
      'The judging store could not be reached.',
      'Scores are still saved in the judge\'s browser — export them if this persists.');
  }
};
