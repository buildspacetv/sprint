/**
 * The judging tool — an unlisted page for the five judges, built from the
 * Hackathon Judging workbook (Rubric / Teams / Leaderboard / one tab per judge).
 *
 * Self-contained on purpose: it does not use the site shell, carries no link
 * back into the public nav, is excluded from the sitemap and llms.txt, and is
 * served noindex. It lives at judge.buildspace.tv via a host rewrite.
 *
 * There is no backend, so scores are stored in the judge's own browser and
 * exported as CSV or JSON at the end. That constraint is stated on the page
 * itself in the strongest terms available — a judge who assumes their scores
 * were submitted, and closes the tab, loses an afternoon of judging.
 */

const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const jsonForScript = (v) => JSON.stringify(v == null ? '' : v)
  .replace(/</g, '\\u003C').replace(/>/g, '\\u003E').replace(/&/g, '\\u0026')
  .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// Straight from the workbook's Rubric tab.
const CRITERIA = [
  { id: 'ambition', label: 'Ambition', hint: 'How hard the problem is and how much of the loop you take on.' },
  { id: 'functionality', label: 'Functionality', hint: 'Does it work end-to-end when demonstrated.' },
  { id: 'creativity', label: 'Creativity', hint: 'Originality in the task, approach, or demo.' },
  { id: 'architecture', label: 'Architectural quality', hint: 'How well the system is put together: clean boundaries between perception, planning, and control.' },
];

// The workbook's judge tabs, in order.
const JUDGES = [
  { name: 'Harry Mellsop', role: 'Co-founder, Antioch' },
  { name: 'Alex Langshur', role: 'Co-founder, Antioch' },
  { name: 'Dhruv Diddi', role: 'Principal, Physical AI Builder Ecosystem, Nebius' },
  { name: 'Edith Llontop', role: 'Robotics Technical Marketing Engineer, NVIDIA' },
  { name: 'Irina Mira', role: 'VP of Physical AI, Toloka' },
];

const TEAM_SLOTS = 30; // matches the workbook's Teams tab

function judgePage(teams, projects) {
  // Prefer the real directory; fall back to the workbook's numbered slots so
  // the tool still works if judging starts before teams have registered.
  const roster = teams.length
    ? teams.map((t, i) => ({
      n: i + 1,
      name: t.name,
      detail: t.pitch || '',
      url: `/teams/${t.slug}.html`,
      project: (projects.find((p) => p.teamSlug === t.slug) || {}).title || '',
    }))
    : Array.from({ length: TEAM_SLOTS }, (_, i) => ({
      n: i + 1, name: `Team ${String(i + 1).padStart(2, '0')}`, detail: '', url: '', project: '',
    }));

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="color-scheme" content="light dark">
<title>Judging — Physical AI Sprint</title>
<style>
${css}

  /* ---------- judging tool ---------- */
  .jbar {
    position: sticky; top: 0; z-index: 40;
    display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    padding: 10px 20px; background: var(--surface); border-bottom: 1px solid var(--line);
  }
  .jbar .who { display: flex; flex-direction: column; gap: 1px; margin-right: auto; }
  .jbar .who b { font-family: var(--f-display); font-size: 1.05rem; text-transform: uppercase; letter-spacing: .01em; }
  .jbar .who span { font-family: var(--f-mono); font-size: .6rem; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-3); }
  .jbar select {
    font-family: var(--f-body); font-size: .95rem; color: var(--ink);
    padding: 7px 11px; border: 1px solid var(--line-2); border-radius: 6px; background: var(--paper);
  }
  .jbar .prog { font-family: var(--f-mono); font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); }
  .jbar .saved { color: var(--ok); }

  .tabs { display: flex; gap: 3px; padding: 3px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
  .tabs button {
    font-family: var(--f-mono); font-size: .68rem; letter-spacing: .08em; text-transform: uppercase;
    padding: 6px 13px; border: 0; border-radius: 5px; background: transparent; color: var(--ink-3); cursor: pointer;
  }
  .tabs button[aria-selected="true"] { background: var(--accent); color: #fff; }
  :root[data-theme="dark"] .tabs button[aria-selected="true"] { color: #0C1115; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .tabs button[aria-selected="true"] { color: #0C1115; } }

  .jwrap { max-width: 1100px; margin: 0 auto; padding: 26px 20px 120px; }

  .tcard-j {
    border: 1px solid var(--line); border-radius: 10px; background: var(--surface);
    padding: 15px 17px 16px; margin-bottom: 14px;
  }
  .tcard-j.done { border-left: 3px solid var(--ok); }
  .tcard-j header { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 4px; }
  .tcard-j h2 { font-size: 1.2rem; margin: 0; text-transform: none; }
  .tcard-j .num { font-family: var(--f-mono); font-size: .68rem; color: var(--ink-3); }
  .tcard-j .avg { margin-left: auto; font-family: var(--f-mono); font-size: .78rem; color: var(--ink-2); font-variant-numeric: tabular-nums; }
  .tcard-j .detail { margin: 0 0 10px; font-size: .92rem; color: var(--ink-2); }

  .crit { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); margin-top: 10px; }
  .crit > div { display: flex; flex-direction: column; gap: 5px; }
  .crit label { font-family: var(--f-mono); font-size: .62rem; letter-spacing: .13em; text-transform: uppercase; color: var(--ink-3); }
  .crit .hint { font-size: .8rem; color: var(--ink-3); line-height: 1.35; }
  .scale { display: flex; flex-wrap: wrap; gap: 3px; }
  .scale button {
    width: 30px; height: 30px; padding: 0; cursor: pointer;
    font-family: var(--f-mono); font-size: .76rem; font-variant-numeric: tabular-nums;
    border: 1px solid var(--line-2); border-radius: 5px; background: var(--paper); color: var(--ink-2);
  }
  .scale button:hover { border-color: var(--accent); color: var(--accent-ink); }
  .scale button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
  :root[data-theme="dark"] .scale button[aria-pressed="true"] { color: #0C1115; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .scale button[aria-pressed="true"] { color: #0C1115; } }
  .scale button.clear { width: auto; padding: 0 9px; font-size: .64rem; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }

  .notes { margin-top: 12px; display: flex; flex-direction: column; gap: 5px; }
  .notes label { font-family: var(--f-mono); font-size: .62rem; letter-spacing: .13em; text-transform: uppercase; color: var(--ink-3); }
  .notes textarea {
    font-family: var(--f-body); font-size: .94rem; color: var(--ink); line-height: 1.5;
    padding: 9px 11px; border: 1px solid var(--line); border-radius: 7px; background: var(--paper);
    resize: vertical; min-height: 52px;
  }

  table.lb { width: 100%; border-collapse: collapse; font-size: .93rem; }
  table.lb th {
    text-align: left; font-family: var(--f-mono); font-weight: 500; font-size: .6rem;
    letter-spacing: .14em; text-transform: uppercase; color: var(--ink-3);
    padding: 9px 10px; border-bottom: 1px solid var(--line); white-space: nowrap;
  }
  table.lb td { padding: 9px 10px; border-bottom: 1px solid var(--line); color: var(--ink-2); }
  table.lb td.n { font-family: var(--f-mono); font-variant-numeric: tabular-nums; text-align: right; }
  table.lb td.team { color: var(--ink); font-family: var(--f-display); font-size: 1.02rem; }
  table.lb tr.top td { background: var(--ok-soft); }
  table.lb td.overall { font-family: var(--f-mono); font-variant-numeric: tabular-nums; color: var(--ink); font-weight: 600; }
  .rank { font-family: var(--f-mono); color: var(--ink-3); }

  .panel-j[hidden] { display: none; }
  @media print {
    .jbar, .tabs, .actions, .scale button.clear { display: none !important; }
    .tcard-j { break-inside: avoid; }
  }
</style>
</head>
<body>

<header class="jbar">
  <div class="who">
    <b>Physical AI Sprint — Judging</b>
    <span>Monday, August 17, 2026</span>
  </div>
  <label class="prog" for="judge">Judge</label>
  <select id="judge" aria-label="Which judge are you?">
    <option value="">Select your name…</option>
${JUDGES.map((j) => `    <option value="${esc(j.name)}">${esc(j.name)} — ${esc(j.role)}</option>`).join('\n')}
    <option value="Other">Other / guest judge</option>
  </select>
  <div class="tabs" role="tablist">
    <button role="tab" data-panel="score" aria-selected="true">Score</button>
    <button role="tab" data-panel="board" aria-selected="false">Leaderboard</button>
    <button role="tab" data-panel="rubric" aria-selected="false">Rubric</button>
  </div>
  <span class="prog" id="prog">—</span>
</header>

<main class="jwrap">

  <div class="note alert" id="localWarning">
    <div class="note-head">Your scores are saved in this browser only</div>
    <div class="note-body">
      There is no server behind this page. Nothing is submitted, and no one else can see
      what you enter. Scores persist in <b>this browser on this device</b>, so use the same
      one all afternoon, and <b>press Export before you finish</b> — hand the file to an
      organizer to be combined with the other judges' scores.
      <div class="actions">
        <button class="btn" id="exportCsv" type="button">Export CSV</button>
        <button class="btn ghost" id="exportJson" type="button">Export JSON</button>
        <button class="btn ghost" id="printBtn" type="button">Print / PDF</button>
      </div>
    </div>
  </div>

  <section class="panel-j" id="panel-score">
    <div id="cards"></div>
  </section>

  <section class="panel-j" id="panel-board" hidden>
    <h2>Your leaderboard</h2>
    <p class="lede">Averages of the scores you personally entered, ranked by overall. This is your own tab only — the organizers combine all five judges after the fact.</p>
    <div class="tablewrap" style="margin-top:18px">
      <table class="lb">
        <thead><tr>
          <th>Rank</th><th>Team</th>
${CRITERIA.map((c) => `          <th>${esc(c.label)}</th>`).join('\n')}
          <th>Overall</th><th>Scored</th>
        </tr></thead>
        <tbody id="lbBody"></tbody>
      </table>
    </div>
  </section>

  <section class="panel-j" id="panel-rubric" hidden>
    <h2>Rubric</h2>
    <p class="lede">Every category is scored 1–10 and weighted equally.</p>
    <div class="tablewrap" style="margin-top:18px">
      <table class="lb">
        <thead><tr><th>Category</th><th>What judges look for</th></tr></thead>
        <tbody>
${CRITERIA.map((c) => `          <tr><td class="team">${esc(c.label)}</td><td>${esc(c.hint)}</td></tr>`).join('\n')}
        </tbody>
      </table>
    </div>

    <h2>How to score</h2>
    <ul class="list">
      <li>Score every team you see on all four categories, 1–10.</li>
      <li><b>Leave a category blank rather than scoring 0</b> if you did not see that team — a blank is excluded from the average, a 0 drags it down.</li>
      <li>Notes are for you: they are exported alongside your scores and are useful when the room argues about the top six.</li>
      <li>Judging is science-fair style at team stations. The top six then demo to the full group.</li>
    </ul>

    <h2>Judges</h2>
    <div class="tablewrap">
      <table class="lb">
        <thead><tr><th>Name</th><th>Role</th></tr></thead>
        <tbody>
${JUDGES.map((j) => `          <tr><td class="team">${esc(j.name)}</td><td>${esc(j.role)}</td></tr>`).join('\n')}
        </tbody>
      </table>
    </div>
  </section>
</main>

<script>
(function () {
  "use strict";
  var CRITERIA = ${jsonForScript(CRITERIA)};
  var TEAMS = ${jsonForScript(roster)};
  var LIVE_TEAMS = ${teams.length ? 'true' : 'false'};

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  var judgeSel = document.getElementById('judge');
  var judge = store.get('pais-judge') || '';
  if (judge) judgeSel.value = judge;

  var data = {};
  function key() { return 'pais-scores-' + (judge || 'unset'); }
  function load() {
    try { data = JSON.parse(store.get(key()) || '{}'); } catch (e) { data = {}; }
    if (!data || typeof data !== 'object') data = {};
  }
  function save() { store.set(key(), JSON.stringify(data)); flashSaved(); }

  var progEl = document.getElementById('prog');
  var savedTimer;
  function flashSaved() {
    progEl.classList.add('saved');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(function () { progEl.classList.remove('saved'); renderProgress(); }, 900);
    progEl.textContent = 'saved';
  }
  function entry(n) { return data[n] || (data[n] = { scores: {}, notes: '' }); }
  function scoredCount(n) {
    var e = data[n]; if (!e) return 0;
    return CRITERIA.filter(function (c) { return typeof e.scores[c.id] === 'number'; }).length;
  }
  function avg(n) {
    var e = data[n]; if (!e) return null;
    var vals = CRITERIA.map(function (c) { return e.scores[c.id]; }).filter(function (v) { return typeof v === 'number'; });
    if (!vals.length) return null;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }
  function renderProgress() {
    if (!judge) { progEl.textContent = 'select a judge'; return; }
    var done = TEAMS.filter(function (t) { return scoredCount(t.n) === CRITERIA.length; }).length;
    var started = TEAMS.filter(function (t) { return scoredCount(t.n) > 0; }).length;
    progEl.textContent = done + ' complete · ' + started + ' started · ' + TEAMS.length + ' teams';
  }

  /* ---- score cards ---- */
  var cards = document.getElementById('cards');
  function renderCards() {
    cards.innerHTML = '';
    if (!judge) {
      cards.innerHTML = '<div class="empty"><h3>Select your name to begin</h3>' +
        '<p>Your scores are kept separately per judge, so pick the same name each time you come back.</p></div>';
      return;
    }
    if (!LIVE_TEAMS) {
      var n = document.createElement('div');
      n.className = 'note warn';
      n.innerHTML = '<div class="note-head">Placeholder team list</div><div class="note-body">' +
        'No teams have registered in the directory yet, so these are the workbook\\'s numbered slots. ' +
        'Once teams register, this page lists them by name automatically.</div>';
      cards.appendChild(n);
    }
    TEAMS.forEach(function (t) {
      var e = entry(t.n);
      var card = document.createElement('article');
      card.className = 'tcard-j' + (scoredCount(t.n) === CRITERIA.length ? ' done' : '');

      var head = document.createElement('header');
      head.innerHTML = '<span class="num">' + String(t.n).padStart(2, '0') + '</span>' +
        '<h2>' + (t.url ? '<a href="' + t.url + '" target="_blank" rel="noopener">' + escapeHtml(t.name) + '</a>' : escapeHtml(t.name)) + '</h2>' +
        (t.project ? '<span class="num">' + escapeHtml(t.project) + '</span>' : '') +
        '<span class="avg" data-avg="' + t.n + '"></span>';
      card.appendChild(head);

      if (t.detail) {
        var d = document.createElement('p');
        d.className = 'detail';
        d.textContent = t.detail;
        card.appendChild(d);
      }

      var grid = document.createElement('div');
      grid.className = 'crit';
      CRITERIA.forEach(function (c) {
        var wrap = document.createElement('div');
        var lab = document.createElement('label');
        lab.textContent = c.label;
        var hint = document.createElement('span');
        hint.className = 'hint';
        hint.textContent = c.hint;
        var scale = document.createElement('div');
        scale.className = 'scale';
        scale.setAttribute('role', 'group');
        scale.setAttribute('aria-label', c.label + ' score for ' + t.name);
        for (var i = 1; i <= 10; i++) {
          (function (v) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = v;
            b.setAttribute('aria-label', c.label + ' ' + v + ' out of 10 for ' + t.name);
            b.setAttribute('aria-pressed', e.scores[c.id] === v ? 'true' : 'false');
            b.addEventListener('click', function () {
              var cur = entry(t.n);
              cur.scores[c.id] = cur.scores[c.id] === v ? undefined : v;
              if (cur.scores[c.id] === undefined) delete cur.scores[c.id];
              save(); refreshCard(card, t);
            });
            scale.appendChild(b);
          })(i);
        }
        var clr = document.createElement('button');
        clr.type = 'button';
        clr.className = 'clear';
        clr.textContent = 'not seen';
        clr.setAttribute('aria-label', 'Clear ' + c.label + ' for ' + t.name);
        clr.addEventListener('click', function () {
          delete entry(t.n).scores[c.id];
          save(); refreshCard(card, t);
        });
        scale.appendChild(clr);
        wrap.appendChild(lab); wrap.appendChild(hint); wrap.appendChild(scale);
        grid.appendChild(wrap);
      });
      card.appendChild(grid);

      var nw = document.createElement('div');
      nw.className = 'notes';
      var nl = document.createElement('label');
      nl.textContent = 'Notes';
      nl.setAttribute('for', 'notes-' + t.n);
      var ta = document.createElement('textarea');
      ta.id = 'notes-' + t.n;
      ta.value = e.notes || '';
      ta.placeholder = 'What stood out, what you would ask them, anything for the top-six discussion.';
      ta.addEventListener('input', function () { entry(t.n).notes = ta.value; save(); });
      nw.appendChild(nl); nw.appendChild(ta);
      card.appendChild(nw);

      cards.appendChild(card);
      refreshCard(card, t);
    });
    renderProgress();
  }

  function refreshCard(card, t) {
    var a = avg(t.n);
    var el = card.querySelector('[data-avg]');
    if (el) el.textContent = a === null ? '' : a.toFixed(2) + ' avg · ' + scoredCount(t.n) + '/' + CRITERIA.length;
    card.classList.toggle('done', scoredCount(t.n) === CRITERIA.length);
    Array.prototype.forEach.call(card.querySelectorAll('.scale'), function (scale, ci) {
      var c = CRITERIA[ci]; if (!c) return;
      var val = (data[t.n] || { scores: {} }).scores[c.id];
      Array.prototype.forEach.call(scale.querySelectorAll('button:not(.clear)'), function (b, bi) {
        b.setAttribute('aria-pressed', val === bi + 1 ? 'true' : 'false');
      });
    });
    renderProgress();
    renderBoard();
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /* ---- leaderboard ---- */
  var lbBody = document.getElementById('lbBody');
  function renderBoard() {
    var rows = TEAMS.map(function (t) {
      var e = data[t.n] || { scores: {} };
      return { t: t, e: e, overall: avg(t.n), n: scoredCount(t.n) };
    }).filter(function (r) { return r.n > 0; })
      .sort(function (a, b) { return (b.overall || 0) - (a.overall || 0); });

    if (!rows.length) {
      lbBody.innerHTML = '<tr><td colspan="' + (CRITERIA.length + 4) + '">No scores yet.</td></tr>';
      return;
    }
    lbBody.innerHTML = rows.map(function (r, i) {
      return '<tr' + (i < 6 ? ' class="top"' : '') + '>' +
        '<td class="rank">' + (i + 1) + '</td>' +
        '<td class="team">' + escapeHtml(r.t.name) + '</td>' +
        CRITERIA.map(function (c) {
          var v = r.e.scores[c.id];
          return '<td class="n">' + (typeof v === 'number' ? v : '—') + '</td>';
        }).join('') +
        '<td class="overall">' + (r.overall === null ? '—' : r.overall.toFixed(2)) + '</td>' +
        '<td class="n">' + r.n + '/' + CRITERIA.length + '</td>' +
        '</tr>';
    }).join('');
  }

  /* ---- export ---- */
  function download(name, mime, text) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function stamp() { return (judge || 'judge').toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

  document.getElementById('exportCsv').addEventListener('click', function () {
    var q = function (s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; };
    var head = ['Judge', '#', 'Team'].concat(CRITERIA.map(function (c) { return c.label; })).concat(['Overall', 'Notes']);
    var lines = [head.map(q).join(',')];
    TEAMS.forEach(function (t) {
      var e = data[t.n]; if (!e || (!scoredCount(t.n) && !e.notes)) return;
      var a = avg(t.n);
      lines.push([q(judge), q(t.n), q(t.name)]
        .concat(CRITERIA.map(function (c) { var v = e.scores[c.id]; return q(typeof v === 'number' ? v : ''); }))
        .concat([q(a === null ? '' : a.toFixed(2)), q(e.notes || '')]).join(','));
    });
    download('judging-' + stamp() + '.csv', 'text/csv;charset=utf-8', lines.join('\\n'));
  });

  document.getElementById('exportJson').addEventListener('click', function () {
    var out = { judge: judge, criteria: CRITERIA.map(function (c) { return c.id; }), teams: [] };
    TEAMS.forEach(function (t) {
      var e = data[t.n]; if (!e || (!scoredCount(t.n) && !e.notes)) return;
      out.teams.push({ number: t.n, team: t.name, scores: e.scores, overall: avg(t.n), notes: e.notes || '' });
    });
    download('judging-' + stamp() + '.json', 'application/json', JSON.stringify(out, null, 2));
  });

  document.getElementById('printBtn').addEventListener('click', function () { window.print(); });

  /* ---- tabs ---- */
  Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (b) {
    b.addEventListener('click', function () {
      Array.prototype.forEach.call(document.querySelectorAll('.tabs button'), function (o) {
        var on = o === b;
        o.setAttribute('aria-selected', on ? 'true' : 'false');
        document.getElementById('panel-' + o.getAttribute('data-panel')).hidden = !on;
      });
    });
  });

  judgeSel.addEventListener('change', function () {
    judge = judgeSel.value;
    store.set('pais-judge', judge);
    load(); renderCards(); renderBoard();
  });

  // Last line of defence for the local-only storage model.
  window.addEventListener('beforeunload', function (e) {
    var any = TEAMS.some(function (t) { return scoredCount(t.n) > 0; });
    if (any && !sessionStorage.getItem('pais-exported')) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  ['exportCsv', 'exportJson'].forEach(function (id) {
    document.getElementById(id).addEventListener('click', function () {
      try { sessionStorage.setItem('pais-exported', '1'); } catch (err) {}
    });
  });

  load(); renderCards(); renderBoard();
})();
</script>
</body>
</html>
`;
}

module.exports = { judgePage, CRITERIA, JUDGES };
