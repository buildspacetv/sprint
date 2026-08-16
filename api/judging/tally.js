/**
 * GET /api/judging/tally -> combined leaderboard across every judge.
 *
 * This is the workbook's Leaderboard tab: each team's score per category is
 * the mean of the judges who scored it, and OVERALL is the mean of those four
 * category means, so the categories stay equally weighted even when a judge
 * skipped one.
 *
 * Blanks are excluded rather than counted as zero — the workbook's own rule,
 * and the difference between "did not see this team" and "saw it and it was
 * terrible". A team seen by two judges is not penalised against one seen by
 * five, but `judgeCount` is returned so an organizer can see the difference.
 */

const { readAll, backend } = require('./_store.js');

const CRITERIA = ['ambition', 'functionality', 'creativity', 'architecture'];

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body, null, 2));
}

function authorized(req) {
  const expected = process.env.JUDGE_KEY;
  if (!expected) return false;
  const got = req.headers['x-judge-key'];
  return typeof got === 'string' && got.length === expected.length && got === expected;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round2 = (n) => (n === null ? null : Math.round(n * 100) / 100);

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return send(res, 405, { error: { code: 'method_not_allowed', message: 'Use GET.' } });
  }
  if (!backend()) {
    return send(res, 503, { error: { code: 'not_configured', message: 'No judging storage backend is configured.' } });
  }
  if (!authorized(req)) {
    return send(res, 401, {
      error: {
        code: 'unauthorized',
        message: 'Missing or incorrect judge key.',
        resolution: 'Send the shared judging passcode in the x-judge-key header.',
      },
    });
  }

  try {
    const rows = await readAll();

    const byTeam = new Map();
    for (const r of rows) {
      const k = String(r.team);
      if (!byTeam.has(k)) byTeam.set(k, { team: k, teamName: r.teamName || k, rows: [] });
      const t = byTeam.get(k);
      if (r.teamName) t.teamName = r.teamName;
      t.rows.push(r);
    }

    const teams = [...byTeam.values()].map((t) => {
      const categories = {};
      for (const c of CRITERIA) {
        const vals = t.rows.map((r) => r.scores && r.scores[c]).filter((v) => typeof v === 'number');
        categories[c] = { mean: round2(mean(vals)), count: vals.length };
      }
      const present = CRITERIA.map((c) => categories[c].mean).filter((v) => v !== null);
      return {
        team: t.team,
        teamName: t.teamName,
        categories,
        overall: round2(mean(present)),
        judgeCount: new Set(t.rows.filter((r) => Object.keys(r.scores || {}).length).map((r) => r.judge)).size,
        notes: t.rows.filter((r) => r.notes).map((r) => ({ judge: r.judge, notes: r.notes })),
      };
    });

    teams.sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1) || a.teamName.localeCompare(b.teamName));
    teams.forEach((t, i) => { t.rank = i + 1; });

    const judges = [...new Set(rows.map((r) => r.judge))].sort().map((name) => ({
      judge: name,
      teamsScored: rows.filter((r) => r.judge === name && Object.keys(r.scores || {}).length).length,
      lastUpdated: rows.filter((r) => r.judge === name).map((r) => r.updatedAt).sort().pop() || null,
    }));

    return send(res, 200, {
      object: 'tally',
      generatedAt: new Date().toISOString(),
      criteria: CRITERIA,
      note: 'Category means exclude blanks; OVERALL is the mean of the category means, so categories stay equally weighted.',
      judges,
      teamCount: teams.length,
      topSix: teams.slice(0, 6).map((t) => ({ rank: t.rank, teamName: t.teamName, overall: t.overall })),
      teams,
    });
  } catch (err) {
    return send(res, 502, {
      error: {
        code: 'storage_error',
        message: 'The judging store could not be reached.',
        resolution: 'Judges still hold their scores locally — ask them to export.',
      },
    });
  }
};
