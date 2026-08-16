#!/usr/bin/env node
/**
 * Generates the showcase, the submission page, and one page per project
 * from data/projects.json. Zero dependencies — plain Node, no build tooling.
 *
 *   node build.js
 *
 * Output is committed to the repo and served statically by Vercel, so no
 * Vercel build step is involved. The GitHub Action runs this after syncing
 * issues into data/projects.json.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SITE = 'https://physical-ai-sprint.vercel.app';
const REPO = 'https://github.com/opencolin/physical-ai-sprint-handbook';
const APPLY = 'https://luma.com/nkknxvrz';
const DISCORD = 'https://discord.com/invite/nN58zxSTFR';
const SUBMIT_URL = `${REPO}/issues/new?template=project-submission.yml&labels=submission`;

const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');

/* ---------------------------------------------------------------- helpers */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Serialize a value for embedding inside a <script> block.
 * JSON.stringify alone is NOT safe here: a string containing "</script>"
 * closes the element early and everything after it is parsed as HTML.
 */
function jsonForScript(value) {
  return JSON.stringify(value == null ? '' : value)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Slugs become filenames and URLs, so allow nothing that could escape either. */
function safeSlug(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 60);
}

/** Only allow URLs we are willing to put in href/src. */
function safeUrl(u) {
  if (!u) return null;
  const s = String(u).trim();
  if (!/^https:\/\//i.test(s)) return null;
  try { new URL(s); } catch { return null; }
  return s;
}

// Null-prototype: a plain object literal would return Object.prototype for the
// key "__proto__", which is truthy, so the `||` fallback below never fires and
// the page renders `class="chip undefined">undefined`. Issue bodies are
// user-editable after creation, so this key is reachable.
const TRACKS = Object.assign(Object.create(null), {
  'sim': { label: 'Sim only', cls: 'track-sim' },
  'hardware': { label: 'Hardware only', cls: 'track-hardware' },
  'both': { label: 'Sim and real', cls: 'track-both' },
});
const track = (t) => TRACKS[t] || { label: 'Unspecified', cls: '' };

/** Turn plain text into paragraphs. Input is untrusted, so escape first. */
function prose(text) {
  if (!text) return '';
  return String(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');
}

/** Resolve a video URL into an embeddable player. */
function videoEmbed(url) {
  const u = safeUrl(url);
  if (!u) return '';
  let m;
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/))) {
    return `<div class="videowrap"><iframe src="https://www.youtube.com/embed/${esc(m[1])}" title="Project video" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  }
  if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/))) {
    return `<div class="videowrap"><iframe src="https://player.vimeo.com/video/${esc(m[1])}" title="Project video" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  }
  if ((m = u.match(/loom\.com\/share\/([A-Za-z0-9]+)/))) {
    return `<div class="videowrap"><iframe src="https://www.loom.com/embed/${esc(m[1])}" title="Project video" allowfullscreen loading="lazy"></iframe></div>`;
  }
  if (/\.(mp4|webm|mov)(\?|$)/i.test(u)) {
    return `<div class="videowrap"><video src="${esc(u)}" controls playsinline preload="metadata"></video></div>`;
  }
  return `<p><a href="${esc(u)}">Watch the demo video</a></p>`;
}

function ghUser(handle) {
  if (!handle) return null;
  const h = String(handle).trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/.*$/, '');
  return /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(h) ? h : null;
}

function avatar(handle, size) {
  const u = ghUser(handle);
  return u ? `https://github.com/${u}.png?size=${size}` : null;
}

/**
 * Resolve a project's free-text team reference to a directory entry.
 * Matching is explicit (name or issue number) rather than inferred from
 * overlapping GitHub handles: people help on more than one team, and a wrong
 * auto-join on a public showcase page is worse than an unlinked one.
 */
function resolveTeam(project, teams) {
  const ref = String(project.teamRef || '').trim();
  if (!ref) return null;
  const num = ref.match(/^#?(\d+)$/);
  if (num) return teams.find((t) => t.issue === Number(num[1])) || null;
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const key = norm(ref);
  return teams.find((t) => norm(t.name) === key) || null;
}

/* ------------------------------------------------------------ page shell */

function page({ title, description, body, current, ogImage, canonical }) {
  const desc = description || 'The Physical AI Sprint — a one-day hackathon at the intersection of AI and the physical world.';
  const img = safeUrl(ogImage);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${esc(desc)}">
<meta name="color-scheme" content="light dark">
<title>${esc(title)}</title>
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
${img ? `<meta property="og:image" content="${esc(img)}">` : ''}
<meta name="twitter:card" content="${img ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${img ? `<meta name="twitter:image" content="${esc(img)}">` : ''}
<style>
${css}
</style>
</head>
<body>

<a class="skip" href="#content">Skip to content</a>

<header class="bar">
  <a class="mark" href="/">
    <b>The Physical AI Sprint</b>
    <span>Monday, August 17, 2026</span>
  </a>
  <nav>
    <a href="/"${current === 'handbook' ? ' aria-current="page"' : ''}>Handbook</a>
    <a href="/teams.html"${current === 'teams' ? ' aria-current="page"' : ''}>Teams</a>
    <a href="/showcase.html"${current === 'showcase' ? ' aria-current="page"' : ''}>Showcase</a>
    <a href="/submit.html"${current === 'submit' ? ' aria-current="page"' : ''}>Submit</a>
  </nav>
</header>

<main id="content">
${body}
</main>

<div class="wrap">
  <footer class="foot">
    <div class="foot-links">
      <a href="${APPLY}">Apply</a>
      <a href="${DISCORD}">Discord</a>
      <a href="/teams.html">Teams</a>
      <a href="/showcase.html">Showcase</a>
      <a href="/submit.html">Submit a project</a>
      <a href="${REPO}">Repo</a>
    </div>
    <p class="foot-fine">© 2026 The Physical AI Sprint Hackathon. All rights reserved.</p>
  </footer>
</div>

</body>
</html>
`;
}

/* --------------------------------------------------------------- showcase */

function coverFor(p) {
  const img = (p.images || []).map(safeUrl).filter(Boolean)[0];
  if (img) return `<img src="${esc(img)}" alt="" loading="lazy">`;
  const v = safeUrl(p.video);
  const m = v && v.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (m) return `<img src="https://i.ytimg.com/vi/${esc(m[1])}/hqdefault.jpg" alt="" loading="lazy">`;
  return `<span class="ph">No media yet</span>`;
}

function card(p) {
  const t = track(p.track);
  const people = (p.team || []).map((m) => avatar(m.github, 52)).filter(Boolean).slice(0, 5);
  return `      <a class="pcard" href="/projects/${esc(p.slug)}.html" data-track="${esc(p.track || '')}" data-search="${esc([p.title, p.tagline, (p.robots || []).join(' '), (p.team || []).map((m) => `${m.name} ${m.github}`).join(' ')].join(' ').toLowerCase())}">
        <div class="cover">${coverFor(p)}</div>
        <div class="body">
          <h3>${esc(p.title)}</h3>
          <p class="tag">${esc(p.tagline || '')}</p>
          <div class="meta">
            <span class="chip ${t.cls}">${esc(t.label)}</span>
            ${people.length ? `<span class="avatars">${people.map((a) => `<img src="${esc(a)}" alt="" loading="lazy">`).join('')}</span>` : ''}
            ${(p.team || []).length ? `<span class="badge">${p.team.length} member${p.team.length === 1 ? '' : 's'}</span>` : ''}
          </div>
        </div>
      </a>`;
}

function showcase(projects) {
  const body = `
<header class="pagehead">
  <div class="pagehead-in">
    <p class="eyebrow">Project showcase</p>
    <h1>What teams built</h1>
    <p class="lede">Every project submitted to the Physical AI Sprint. Judging is science-fair style — the top 6 teams demo to the full group at 4:30pm.</p>
  </div>
</header>

<div class="wrap">
${projects.length === 0 ? `  <div class="empty">
    <h3>No submissions yet</h3>
    <p>Projects appear here as teams submit them. The deadline is 3:30pm on event day.</p>
    <div class="actions" style="justify-content:center">
      <a class="btn" href="/submit.html">Submit your project</a>
    </div>
  </div>` : `  <div class="controls">
    <input type="search" id="q" placeholder="Search projects, teams, robots…" aria-label="Search projects">
    <div class="filters" role="group" aria-label="Filter by track">
      <button data-filter="all" aria-pressed="true">All</button>
      <button data-filter="sim" aria-pressed="false">Sim</button>
      <button data-filter="hardware" aria-pressed="false">Hardware</button>
      <button data-filter="both" aria-pressed="false">Sim + real</button>
    </div>
    <span class="count"><b id="shown">${projects.length}</b> of ${projects.length}</span>
  </div>

  <div class="grid" id="grid">
${projects.map(card).join('\n')}
  </div>

  <div class="empty" id="noresults" hidden>
    <h3>Nothing matches</h3>
    <p>Try a different search term or clear the track filter.</p>
  </div>

  <script>
  (function () {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.pcard'));
    var q = document.getElementById('q');
    var shown = document.getElementById('shown');
    var none = document.getElementById('noresults');
    var grid = document.getElementById('grid');
    var filter = 'all';

    function apply() {
      var term = q.value.trim().toLowerCase();
      var n = 0;
      cards.forEach(function (c) {
        var okTrack = filter === 'all' || c.getAttribute('data-track') === filter;
        var okTerm = !term || c.getAttribute('data-search').indexOf(term) !== -1;
        var on = okTrack && okTerm;
        c.hidden = !on;
        if (on) n++;
      });
      shown.textContent = n;
      none.hidden = n !== 0;
      grid.hidden = n === 0;
    }

    q.addEventListener('input', apply);
    Array.prototype.forEach.call(document.querySelectorAll('.filters button'), function (b) {
      b.addEventListener('click', function () {
        filter = b.getAttribute('data-filter');
        Array.prototype.forEach.call(document.querySelectorAll('.filters button'), function (o) {
          o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
        });
        apply();
      });
    });
  })();
  </script>`}
</div>`;

  return page({
    title: 'Project Showcase',
    description: `Projects built at the Physical AI Sprint hackathon${projects.length ? ` — ${projects.length} submitted` : ''}.`,
    body,
    current: 'showcase',
    canonical: `${SITE}/showcase.html`,
  });
}

/* ----------------------------------------------------------- project page */

function shareBlock({ title, text, url }) {
  const x = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  const li = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  const bs = `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url}`)}`;
  return `  <div class="share">
    <span class="share-label">Share</span>
    <a href="${esc(x)}" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.9 2H22l-7.4 8.5L23 22h-6.8l-5.3-7-6.1 7H1.7l7.9-9L1 2h7l4.8 6.4L18.9 2Zm-1.1 18h1.9L7.3 4H5.3l12.5 16Z"/></svg>
      X
    </a>
    <a href="${esc(bs)}" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 10.8C10.9 8.6 7.9 4.6 5.1 2.6 2.4.7 1.4 1 .8 1.3.1 1.7 0 2.8 0 3.4c0 .6.3 5.1.6 5.9.7 2.4 3.3 3.2 5.6 3-2.3.3-4.4 1.2-1.7 4.2 3 3.2 4.1-.7 4.7-2.7l.8-2.4.8 2.4c.6 2 1.7 5.9 4.7 2.7 2.7-3 .6-3.9-1.7-4.2 2.3.2 4.9-.6 5.6-3 .3-.8.6-5.3.6-5.9 0-.6-.1-1.7-.8-2.1-.6-.3-1.6-.6-4.3 1.3-2.8 2-5.8 6-6.9 8.2Z"/></svg>
      Bluesky
    </a>
    <a href="${esc(li)}" target="_blank" rel="noopener noreferrer">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.76-2.05C21.4 8.65 22 11.1 22 14.2V21h-4v-6c0-1.4-.03-3.2-2-3.2-2 0-2.3 1.5-2.3 3.1V21h-4V9Z"/></svg>
      LinkedIn
    </a>
    <button type="button" id="copyLink">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1.1l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7 1.4 1.4 1.7-1.7a3 3 0 0 1 4.3 4.3l-3 3a3 3 0 0 1-4.3 0L10 13Zm4-2a5 5 0 0 0-7.1-.1l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7-1.4-1.4-1.7 1.7a3 3 0 1 1-4.3-4.3l3-3a3 3 0 0 1 4.3 0L14 11Z"/></svg>
      Copy link
    </button>
    <button type="button" id="nativeShare" hidden>Share…</button>
  </div>

  <script>
  (function () {
    var url = ${jsonForScript(url)};
    var title = ${jsonForScript(title || '')};
    var text = ${jsonForScript(text)};
    var copy = document.getElementById('copyLink');
    copy.addEventListener('click', function () {
      var done = function () {
        var was = copy.innerHTML;
        copy.textContent = 'Copied';
        copy.classList.add('done');
        setTimeout(function () { copy.innerHTML = was; copy.classList.remove('done'); }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () {});
      } else {
        var ta = document.createElement('textarea');
        ta.value = url; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
    });
    if (navigator.share) {
      var nat = document.getElementById('nativeShare');
      nat.hidden = false;
      nat.addEventListener('click', function () {
        navigator.share({ title: title, text: text, url: url }).catch(function () {});
      });
    }
  })();
  </script>`;
}

function projectPage(p, teamEntry) {
  const t = track(p.track);
  const url = `${SITE}/projects/${p.slug}.html`;
  const repo = safeUrl(p.repo);
  const images = (p.images || []).map(safeUrl).filter(Boolean);
  const team = (p.team || []).map((m) => ({ name: m.name || ghUser(m.github) || 'Unnamed', user: ghUser(m.github) }));
  const cover = images[0] || null;

  const body = `
<header class="pagehead narrow">
  <div class="pagehead-in">
    <p class="eyebrow"><a class="back" href="/showcase.html">← All projects</a></p>
    <h1>${esc(p.title)}</h1>
    <p class="lede">${esc(p.tagline || '')}</p>
    <div class="actions">
      <span class="chip ${t.cls}">${esc(t.label)}</span>
      ${(p.robots || []).map((r) => `<span class="chip">${esc(r)}</span>`).join('\n      ')}
    </div>
  </div>
</header>

<div class="wrap narrow">
${videoEmbed(p.video)}

${p.description ? `  <div class="prose">\n${prose(p.description)}\n  </div>` : ''}

${images.length ? `  <h2>Photos</h2>
  <div class="gallery">
${images.map((src) => `    <a href="${esc(src)}" target="_blank" rel="noopener noreferrer"><img src="${esc(src)}" alt="" loading="lazy"></a>`).join('\n')}
  </div>` : ''}

${team.length ? `  <h2>Team</h2>
${roster(p.team)}` : ''}

  <dl class="facts">
    <div><dt>Track</dt><dd>${esc(t.label)}</dd></div>
    ${teamEntry ? `<div><dt>Team</dt><dd><a href="/teams/${esc(teamEntry.slug)}.html">${esc(teamEntry.name)}</a></dd></div>`
           : (p.teamRef ? `<div><dt>Team</dt><dd>${esc(p.teamRef)}</dd></div>` : '')}
    ${(p.robots || []).length ? `<div><dt>Robots</dt><dd>${esc(p.robots.join(', '))}</dd></div>` : ''}
    ${repo ? `<div><dt>Code</dt><dd><a href="${esc(repo)}" target="_blank" rel="noopener noreferrer">${esc(repo.replace(/^https:\/\//, ''))}</a></dd></div>` : ''}
    ${p.issue ? `<div><dt>Submission</dt><dd><a href="${REPO}/issues/${esc(p.issue)}" target="_blank" rel="noopener noreferrer">Issue #${esc(p.issue)}</a></dd></div>` : ''}
  </dl>

${shareBlock({ title: p.title, text: `${p.title} — ${p.tagline || 'built at The Physical AI Sprint'}`, url })}
</div>`;

  return page({
    title: `${p.title} — Physical AI Sprint`,
    description: p.tagline || `A project built at The Physical AI Sprint hackathon.`,
    body,
    current: 'showcase',
    ogImage: cover,
    canonical: url,
  });
}

/* --------------------------------------------------------- team directory */

const TEAM_URL = `${REPO}/issues/new?template=team.yml&labels=team`;

function teamCard(t, built) {
  const members = (t.members || []).map((m) => ({ name: m.name || ghUser(m.github) || 'Unnamed', user: ghUser(m.github) }));
  return `      <article class="tcard" id="team-${esc(t.slug)}" data-open="${t.open ? 'yes' : 'no'}" data-search="${esc([t.name, t.pitch, (t.looking || []).join(' '), (t.have || []).join(' '), members.map((m) => `${m.name} ${m.user || ''}`).join(' ')].join(' ').toLowerCase())}">
        <div class="tcard-top">
          <h3><a href="/teams/${esc(t.slug)}.html">${esc(t.name)}</a></h3>
          <span class="chip ${t.open ? 'track-both' : ''}">${t.open ? 'Looking for teammates' : 'Full'}</span>
        </div>
        <p class="tag">${esc(t.pitch)}</p>
        ${(t.looking || []).length ? `<div class="skills"><span class="skills-label">Looking for</span>${t.looking.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>` : ''}
        ${(t.have || []).length ? `<div class="skills"><span class="skills-label">On the team</span>${t.have.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}</div>` : ''}
        <ul class="roster">
${members.map((m) => (m.user
    ? `          <li><a href="https://github.com/${esc(m.user)}" target="_blank" rel="noopener noreferrer"><img src="https://github.com/${esc(m.user)}.png?size=44" alt="" loading="lazy">${esc(m.name)}</a></li>`
    : `          <li><span>${esc(m.name)}</span></li>`)).join('\n')}
        </ul>
        ${(built || []).length ? `<p class="built"><span class="skills-label">Built</span>${built.map((b) => `<a href="/projects/${esc(b.slug)}.html">${esc(b.title)}</a>`).join(', ')}</p>` : ''}
        <div class="tcard-foot">
          <a class="btn ghost" href="/teams/${esc(t.slug)}.html">View team</a>
          ${t.open ? `<a class="btn ghost" href="${REPO}/issues/${esc(t.issue)}" target="_blank" rel="noopener noreferrer">Ask to join</a>` : ''}
          ${t.contact ? `<span class="badge">${esc(t.contact)}</span>` : ''}
          ${t.comments ? `<span class="badge">${esc(t.comments)} comment${t.comments === 1 ? '' : 's'}</span>` : ''}
        </div>
      </article>`;
}

function teamsPage(teams, builtBy) {
  const open = teams.filter((t) => t.open).length;
  const people = teams.reduce((n, t) => n + (t.members || []).length, 0);

  const body = `
<header class="pagehead">
  <div class="pagehead-in">
    <p class="eyebrow">Team directory</p>
    <h1>Find a team</h1>
    <p class="lede">You do not need to arrive with a team. Post what you want to build, or find a team with room and ask to join. Teams are 4 or 5 people.</p>
    <div class="actions">
      <a class="btn" href="${TEAM_URL}" target="_blank" rel="noopener noreferrer">Create a team</a>
      <a class="btn ghost" href="${DISCORD}" target="_blank" rel="noopener noreferrer">Join the Discord</a>
    </div>
  </div>
</header>

<div class="wrap">
${teams.length === 0 ? `  <div class="empty">
    <h3>No teams posted yet</h3>
    <p>Be the first. Post what you want to build and let people come to you — a team of one looking for three others is exactly what this is for.</p>
    <div class="actions" style="justify-content:center">
      <a class="btn" href="${TEAM_URL}" target="_blank" rel="noopener noreferrer">Create a team</a>
    </div>
  </div>` : `  <div class="controls">
    <input type="search" id="q" placeholder="Search teams, skills, people…" aria-label="Search teams">
    <div class="filters" role="group" aria-label="Filter teams">
      <button data-filter="all" aria-pressed="true">All</button>
      <button data-filter="yes" aria-pressed="false">Has room</button>
    </div>
    <span class="count"><b id="shown">${teams.length}</b> teams · ${open} with room · ${people} people</span>
  </div>

  <div class="grid teams" id="grid">
${teams.map((t) => teamCard(t, builtBy.get(t.slug))).join('\n')}
  </div>

  <div class="empty" id="noresults" hidden>
    <h3>Nothing matches</h3>
    <p>Try a different skill or clear the filter — or post your own team.</p>
  </div>

  <script>
  (function () {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.tcard'));
    var q = document.getElementById('q');
    var shown = document.getElementById('shown');
    var none = document.getElementById('noresults');
    var grid = document.getElementById('grid');
    var filter = 'all';

    function apply() {
      var term = q.value.trim().toLowerCase();
      var n = 0;
      cards.forEach(function (c) {
        var okOpen = filter === 'all' || c.getAttribute('data-open') === filter;
        var okTerm = !term || c.getAttribute('data-search').indexOf(term) !== -1;
        var on = okOpen && okTerm;
        c.hidden = !on;
        if (on) n++;
      });
      shown.textContent = n;
      none.hidden = n !== 0;
      grid.hidden = n === 0;
    }

    q.addEventListener('input', apply);
    Array.prototype.forEach.call(document.querySelectorAll('.filters button'), function (b) {
      b.addEventListener('click', function () {
        filter = b.getAttribute('data-filter');
        Array.prototype.forEach.call(document.querySelectorAll('.filters button'), function (o) {
          o.setAttribute('aria-pressed', o === b ? 'true' : 'false');
        });
        apply();
      });
    });
  })();
  </script>`}

  <h2>How it works</h2>
  <ol class="steps">
    <li>
      <h3>Post your team</h3>
      <p>Even solo. Say what you want to build and which skills you are missing.</p>
    </li>
    <li>
      <h3>People ask to join</h3>
      <p>Joining is a comment on your team's issue, so the conversation stays in one place.</p>
    </li>
    <li>
      <h3>Add them to the list</h3>
      <p>Edit the issue to add members. Mark the team full when you hit 4 or 5 and it stops showing under "has room".</p>
    </li>
  </ol>
</div>`;

  return page({
    title: 'Team Directory',
    description: `Find a team for the Physical AI Sprint${teams.length ? ` — ${teams.length} teams, ${open} looking for members` : ''}.`,
    body,
    current: 'teams',
    canonical: `${SITE}/teams.html`,
  });
}

/* -------------------------------------------------------------- team page */

function roster(members) {
  const people = (members || []).map((m) => ({ name: m.name || ghUser(m.github) || 'Unnamed', user: ghUser(m.github) }));
  if (!people.length) return '';
  return `  <ul class="team">
${people.map((m) => {
    const av = m.user ? `https://github.com/${m.user}.png?size=68` : null;
    const inner = `${av ? `<img src="${esc(av)}" alt="" loading="lazy">` : ''}<span class="who"><span class="nm">${esc(m.name)}</span>${m.user ? `<span class="gh">@${esc(m.user)}</span>` : ''}</span>`;
    return m.user
      ? `    <li><a href="https://github.com/${esc(m.user)}" target="_blank" rel="noopener noreferrer">${inner}</a></li>`
      : `    <li><span class="nolink">${inner}</span></li>`;
  }).join('\n')}
  </ul>`;
}

function teamPage(t, built) {
  const url = `${SITE}/teams/${t.slug}.html`;
  const projects = built || [];
  const cover = projects.map((p) => (p.images || []).map(safeUrl).filter(Boolean)[0]).filter(Boolean)[0] || null;

  const body = `
<header class="pagehead narrow">
  <div class="pagehead-in">
    <p class="eyebrow"><a class="back" href="/teams.html">← All teams</a></p>
    <h1>${esc(t.name)}</h1>
    <p class="lede">${esc(t.pitch || '')}</p>
    <div class="actions">
      <span class="chip ${t.open ? 'track-both' : ''}">${t.open ? 'Looking for teammates' : 'Full'}</span>
      ${(t.looking || []).map((s) => `<span class="chip">${esc(s)}</span>`).join('\n      ')}
    </div>
  </div>
</header>

<div class="wrap narrow">
  <h2>Team</h2>
${roster(t.members)}

  <h2>Projects</h2>
${projects.length ? `  <div class="grid">
${projects.map(card).join('\n')}
  </div>` : `  <div class="empty">
    <h3>No project submitted yet</h3>
    <p>${t.open ? 'This team is still forming.' : 'Projects appear here as soon as the team submits one.'} The deadline is 3:30pm on event day.</p>
    <div class="actions" style="justify-content:center">
      <a class="btn" href="/submit.html">Submit a project</a>
    </div>
  </div>`}

  <dl class="facts">
    <div><dt>Status</dt><dd>${t.open ? 'Looking for teammates' : 'Full'}</dd></div>
    <div><dt>Members</dt><dd>${(t.members || []).length}</dd></div>
    ${(t.have || []).length ? `<div><dt>Skills</dt><dd>${esc(t.have.join(', '))}</dd></div>` : ''}
    ${(t.looking || []).length ? `<div><dt>Looking for</dt><dd>${esc(t.looking.join(', '))}</dd></div>` : ''}
    ${t.contact ? `<div><dt>Contact</dt><dd>${esc(t.contact)}</dd></div>` : ''}
    ${t.issue ? `<div><dt>Team thread</dt><dd><a href="${REPO}/issues/${esc(t.issue)}" target="_blank" rel="noopener noreferrer">Issue #${esc(t.issue)}</a> — comment to ask to join</dd></div>` : ''}
  </dl>

  ${t.open && t.issue ? `<div class="actions">
    <a class="btn" href="${REPO}/issues/${esc(t.issue)}" target="_blank" rel="noopener noreferrer">Ask to join this team</a>
  </div>` : ''}

${shareBlock({
    title: t.name,
    text: `${t.name}${t.open ? ' is looking for teammates' : ''} at The Physical AI Sprint`,
    url,
  })}
</div>`;

  return page({
    title: `${t.name} — Physical AI Sprint`,
    description: t.pitch || `A team at The Physical AI Sprint hackathon.`,
    body,
    current: 'teams',
    ogImage: cover,
    canonical: url,
  });
}

/* ------------------------------------------------------------ submit page */

function submitPage() {
  const body = `
<header class="pagehead narrow">
  <div class="pagehead-in">
    <p class="eyebrow">Submissions close 3:30pm</p>
    <h1>Submit your project</h1>
    <p class="lede">Submissions run through GitHub, so there is no account to create and no form to lose. Fill in the issue form, drag in your photos and video, and your project page goes live automatically.</p>
    <div class="actions">
      <a class="btn" href="${SUBMIT_URL}" target="_blank" rel="noopener noreferrer">Open the submission form</a>
      <a class="btn ghost" href="/showcase.html">See the showcase</a>
    </div>
  </div>
</header>

<div class="wrap narrow">
  <div class="note info">
    <div class="note-head">You need a GitHub account</div>
    <div class="note-body">Signing in is what lets you upload media and what links your project to your profile. If someone on your team does not have one, <a href="https://github.com/signup" target="_blank" rel="noopener noreferrer">signing up</a> takes about a minute.</div>
  </div>

  <h2>How it works</h2>
  <ol class="steps">
    <li>
      <h3>Open the form</h3>
      <p>It is a GitHub issue form on this site's repo. One person submits on behalf of the team.</p>
    </li>
    <li>
      <h3>Add your media</h3>
      <p>Drag photos and video files straight into the photo and video fields. GitHub uploads and hosts them for you — no Drive links, no file size wrangling. A YouTube, Vimeo, or Loom link works too.</p>
    </li>
    <li>
      <h3>Link your team</h3>
      <p>Name your team from the <a href="/teams.html">team directory</a> and the roster comes across automatically — no retyping, and the two can't drift apart. No directory entry? List members one per line as <code>Name @githubhandle</code>.</p>
    </li>
    <li>
      <h3>Submit</h3>
      <p>Your project page builds and appears in the showcase within a couple of minutes. Edit the issue any time before judging and the page updates itself.</p>
    </li>
  </ol>

  <h2>What the form asks for</h2>
  <div class="tablewrap">
    <table class="fields">
      <thead><tr><th>Field</th><th>Notes</th></tr></thead>
      <tbody>
        <tr><td>Project name</td><td>Required. Also becomes your page's URL.</td></tr>
        <tr><td>One-line summary</td><td>Required. What it does, in a sentence — this is the card text in the showcase.</td></tr>
        <tr><td>Track</td><td>Required. Sim only, hardware only, or sim and real.</td></tr>
        <tr><td>Robots used</td><td>SO-101, Go2-W, G1, or whatever you drove.</td></tr>
        <tr><td>Description</td><td>What you built, how it works, what you would do next. Judges read this.</td></tr>
        <tr><td>Demo video</td><td>Upload a file or paste a YouTube, Vimeo, or Loom link. Embeds on your page.</td></tr>
        <tr><td>Photos</td><td>Drag in as many as you like. The first becomes your showcase cover and link preview.</td></tr>
        <tr><td>Code</td><td>Optional repo link.</td></tr>
        <tr><td>Team</td><td>Your team's name from the <a href="/teams.html">directory</a>, or its issue number. Links the two together.</td></tr>
        <tr><td>Team members</td><td>One per line, <code>Name @handle</code>. Leave blank to reuse the roster from your team entry.</td></tr>
      </tbody>
    </table>
  </div>

  <div class="note warn">
    <div class="note-head">Judged on what is demonstrated</div>
    <div class="note-body">Judging is science-fair style at your station, so the video matters less than the live walkthrough — but a recorded demo is your insurance if the robot misbehaves at the wrong moment. Criteria are ambition, functionality, creativity, and architectural quality, unweighted. See <a href="/#judging">judging</a> in the handbook.</div>
  </div>

  <h2>Changing or removing a submission</h2>
  <p>Edit your issue and the page rebuilds. To pull a project down, close the issue or remove its <code>submission</code> label — it disappears from the showcase on the next build.</p>
</div>`;

  return page({
    title: 'Submit a Project',
    description: 'Submit your Physical AI Sprint project — a GitHub issue form with photo and video upload. Deadline 3:30pm.',
    body,
    current: 'submit',
    canonical: `${SITE}/submit.html`,
  });
}

/* -------------------------------------------------------------------- run */

function main() {
  const dataPath = path.join(ROOT, 'data', 'projects.json');
  let projects = [];
  if (fs.existsSync(dataPath)) {
    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    projects = Array.isArray(raw) ? raw : (raw.projects || []);
  }

  // Normalize before rendering: slugs become file paths, and the issue number
  // is interpolated into a URL, so neither may carry arbitrary text.
  projects = projects
    .filter((p) => p && p.title)
    .map((p) => ({ ...p, slug: safeSlug(p.slug), issue: Number.isInteger(Number(p.issue)) ? Number(p.issue) : null }))
    .filter((p) => p.slug)
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));

  const outDir = path.join(ROOT, 'projects');
  fs.mkdirSync(outDir, { recursive: true });

  // Drop pages for projects that no longer exist.
  const keep = new Set(projects.map((p) => `${p.slug}.html`));
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith('.html') && !keep.has(f)) {
      fs.unlinkSync(path.join(outDir, f));
      console.log(`removed projects/${f}`);
    }
  }

  let teams = [];
  const teamsPath = path.join(ROOT, 'data', 'teams.json');
  if (fs.existsSync(teamsPath)) {
    const rawT = JSON.parse(fs.readFileSync(teamsPath, 'utf8'));
    teams = (Array.isArray(rawT) ? rawT : (rawT.teams || []))
      .filter((t) => t && t.name)
      .map((t) => ({ ...t, slug: safeSlug(t.slug), issue: Number.isInteger(Number(t.issue)) ? Number(t.issue) : null }))
      .sort((a, b) => (b.open ? 1 : 0) - (a.open ? 1 : 0) || String(a.name).localeCompare(String(b.name)));
  }

  // Link the two directions, and let a project inherit its roster from the
  // team entry so nobody types the same people twice (and the two cannot drift).
  const teamOf = new Map();
  const builtBy = new Map();
  for (const p of projects) {
    const t = resolveTeam(p, teams);
    if (!t) continue;
    teamOf.set(p.slug, t);
    builtBy.set(t.slug, [...(builtBy.get(t.slug) || []), p]);
    if (!(p.team || []).length && (t.members || []).length) p.team = t.members;
  }

  // One page per team, with the same stale-page sweep the projects get.
  const teamDir = path.join(ROOT, 'teams');
  fs.mkdirSync(teamDir, { recursive: true });
  const keepTeams = new Set(teams.map((t) => `${t.slug}.html`));
  for (const f of fs.readdirSync(teamDir)) {
    if (f.endsWith('.html') && !keepTeams.has(f)) {
      fs.unlinkSync(path.join(teamDir, f));
      console.log(`removed teams/${f}`);
    }
  }
  for (const t of teams) {
    fs.writeFileSync(path.join(teamDir, `${t.slug}.html`), teamPage(t, builtBy.get(t.slug)));
  }

  fs.writeFileSync(path.join(ROOT, 'teams.html'), teamsPage(teams, builtBy));
  fs.writeFileSync(path.join(ROOT, 'showcase.html'), showcase(projects));
  fs.writeFileSync(path.join(ROOT, 'submit.html'), submitPage());
  for (const p of projects) {
    fs.writeFileSync(path.join(outDir, `${p.slug}.html`), projectPage(p, teamOf.get(p.slug)));
  }

  console.log(`built ${teams.length} team page(s), ${projects.length} project page(s), ${teamOf.size} linked`);
}

// Only build when run directly, so the helpers above can be unit tested.
if (require.main === module) main();

module.exports = {
  esc, jsonForScript, safeSlug, safeUrl, prose, videoEmbed, ghUser, avatar,
  track, resolveTeam, coverFor, roster, teamPage, projectPage,
};
