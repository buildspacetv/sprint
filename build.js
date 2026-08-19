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
const SITE = 'https://www.buildspace.tv';
const REPO = 'https://github.com/buildspacetv/sprint';
const APPLY = 'https://luma.com/nkknxvrz';
const DISCORD = 'https://discord.com/invite/nN58zxSTFR';
const SUBMIT_URL = `${REPO}/issues/new?template=project-submission.yml&labels=submission`;

const css = fs.readFileSync(path.join(ROOT, 'src', 'styles.css'), 'utf8');
const agentFiles = require('./src/agent-files.js');
const extraPages = require('./src/pages-extra.js');
const { judgePage } = require('./src/judge.js');
const editMode = require('./src/edit-mode.js');

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
  if (/^\/[^/]/.test(s)) return s;
  if (!/^https:\/\//i.test(s)) return null;
  try { new URL(s); } catch { return null; }
  return s;
}

/** og:image must be absolute; a site-relative path means nothing to a crawler. */
const absolute = (u) => (u && u.startsWith('/') ? `${SITE}${u}` : u);

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

/**
 * Format a form submission's timestamp. The stamps carry the event's own UTC
 * offset, so they are read off the string rather than through Date(), which
 * would re-interpret them in whatever zone the build machine happens to run in.
 */
function submittedAt(stamp) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(stamp || ''));
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const h24 = Number(hh);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${months[Number(mo) - 1]} ${Number(d)}, ${y} at ${h12}:${mm}${h24 < 12 ? 'am' : 'pm'}`;
}

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
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/))) {
    const portrait = /youtube\.com\/shorts\//.test(u) ? ' portrait' : '';
    return `<div class="videowrap${portrait}"><iframe src="https://www.youtube.com/embed/${esc(m[1])}" title="Project video" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  }
  if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/))) {
    return `<div class="videowrap"><iframe src="https://player.vimeo.com/video/${esc(m[1])}" title="Project video" allow="fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
  }
  if ((m = u.match(/loom\.com\/share\/([A-Za-z0-9]+)/))) {
    return `<div class="videowrap"><iframe src="https://www.loom.com/embed/${esc(m[1])}" title="Project video" allowfullscreen loading="lazy"></iframe></div>`;
  }
  if ((m = u.match(/docs\.google\.com\/presentation\/d\/([A-Za-z0-9_-]+)/))) {
    return `<div class="videowrap"><iframe src="https://docs.google.com/presentation/d/${esc(m[1])}/embed" title="Project slides" allowfullscreen loading="lazy"></iframe></div>`;
  }
  if ((m = u.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/))) {
    return `<div class="videowrap"><iframe src="https://drive.google.com/file/d/${esc(m[1])}/preview" title="Project video" allow="autoplay" allowfullscreen loading="lazy"></iframe></div>`;
  }
  // Google Photos serves a 720p MP4 transcode of any clip at =m22, which is
  // what a share link resolves to once the media URL is known.
  if (/\.(mp4|webm|mov)(\?|$)/i.test(u) || /googleusercontent\.com\/.+=m\d+$/.test(u)) {
    return `<div class="videowrap"><video src="${esc(u)}" controls playsinline preload="metadata"></video></div>`;
  }
  const host = new URL(u).hostname.replace(/^www\./, '');
  const label =
    /docs\.google\.com\/presentation/.test(u) ? 'Open the slide deck' :
    /drive\.google\.com\/drive\/folders/.test(u) ? 'Open the demo folder on Google Drive' :
    /drive\.google\.com/.test(u) ? 'Watch the demo on Google Drive' :
    /photos\.app\.goo\.gl|photos\.google\.com/.test(u) ? 'See the photo album' :
    /github\.com/.test(u) ? 'See the demo on GitHub' :
    `Open the demo on ${host}`;
  return `<p><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a></p>`;
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

/* ------------------------------------------------------- structured data */

const ORG = {
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: 'The Physical AI Sprint',
  url: SITE,
  description: 'A one-day Physical AI hackathon alongside Actuate SF, hosted by Nebius with NVIDIA, Antioch, and Toloka.',
  sameAs: [REPO, APPLY, DISCORD, 'https://nebius.com'],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'organizer',
    url: `${SITE}/contact.html`,
    email: 'hello@dabl.club',
    availableLanguage: ['en'],
  },
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'San Francisco',
    addressRegion: 'CA',
    addressCountry: 'US',
  },
};

// The JSON API is a real entity worth describing: schema.org/WebAPI is the
// accurate type for it. Deliberately not labelled SoftwareApplication or
// Product — a hackathon handbook is neither, and mislabelling it to satisfy a
// checker would be exactly the sort of thing agents get burned by.
const WEBAPI = {
  '@type': 'WebAPI',
  '@id': `${SITE}/#api`,
  name: 'Physical AI Sprint API',
  description: 'Read-only JSON API over the hackathon teams and projects. No authentication, no rate limit.',
  url: `${SITE}/developers.html`,
  documentation: `${SITE}/developers.html`,
  provider: { '@id': `${SITE}/#organization` },
  termsOfService: `${SITE}/privacy.html`,
  potentialAction: {
    '@type': 'ConsumeAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/api/teams.json`, httpMethod: 'GET', contentType: 'application/json' },
  },
};

const SERVICE = {
  '@type': 'Service',
  '@id': `${SITE}/#service`,
  name: 'The Physical AI Sprint hackathon',
  serviceType: 'Hackathon',
  description: 'A one-day Physical AI hackathon: robot hardware, cloud simulation, workshops, and judging, free to attend.',
  provider: { '@id': `${SITE}/#organization` },
  areaServed: { '@type': 'City', name: 'San Francisco' },
  offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD', url: APPLY },
};

const WEBSITE = {
  '@type': 'WebSite',
  '@id': `${SITE}/#website`,
  url: SITE,
  name: 'The Physical AI Sprint',
  publisher: { '@id': `${SITE}/#organization` },
  inLanguage: 'en',
};

function breadcrumbs(trail) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, url], i) => ({
      '@type': 'ListItem', position: i + 1, name, item: `${SITE}${url}`,
    })),
  };
}

// JSON-LD is injected into a <script> block and carries user-supplied names,
// so it needs the same treatment as any other script payload: JSON.stringify
// does not escape "</script>", and a team called "</script><img onerror=...>"
// would break straight out of the element.
const BASE = () => [ORG, WEBSITE, WEBAPI, SERVICE];
const graph = (...nodes) => jsonForScript({ '@context': 'https://schema.org', '@graph': nodes });

/* ------------------------------------------------------------ page shell */

/**
 * The bottom-left corner's one piece of behaviour: ask /api/redeploy for a
 * rebuild. The passcode is the editor's, read from the same sessionStorage key,
 * so an organizer who has already published an edit is not asked twice. A 401
 * clears the stored key, because the common cause is a typo the first time.
 *
 * index.html carries its own copy of this — it is a standalone artifact that
 * cannot load site scripts — so the two must be changed together.
 */
const CORNER_SCRIPT = `
(function () {
  var KEY = 'pais-edit-key';
  var btn = document.querySelector('[data-refresh]');
  var out = document.querySelector('.corner-msg');
  if (!btn) return;
  function say(t) { if (out) out.textContent = t || ''; }
  btn.addEventListener('click', function () {
    var k = '';
    try { k = sessionStorage.getItem(KEY) || ''; } catch (e) {}
    if (!k) {
      k = window.prompt('Edit passcode (an organizer has it):') || '';
      if (!k) { say('Cancelled — nothing was triggered.'); return; }
      try { sessionStorage.setItem(KEY, k); } catch (e) {}
    }
    btn.disabled = true;
    say('Asking Vercel to rebuild…');
    fetch('/api/redeploy', { method: 'POST', headers: { 'x-edit-key': k } })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (d) {
          return { ok: res.ok, status: res.status, data: d };
        });
      })
      .then(function (r) {
        if (r.ok) { say((r.data && r.data.message) || 'Queued — the new build is usually live in a couple of minutes.'); return; }
        if (r.status === 401) { try { sessionStorage.removeItem(KEY); } catch (e) {} }
        say((r.data.error && r.data.error.message) || 'Could not start a redeploy.');
      })
      .catch(function () { say('Network error — nothing was triggered.'); })
      .then(function () {
        btn.disabled = false;
        setTimeout(function () { say(''); }, 8000);
      });
  });
})();
`;

function page({ title, description, body, current, ogImage, canonical, jsonLd, edit }) {
  // /teams.html advertises /teams.html.md, which is generated alongside it.
  const mdTwin = canonical && /\.html$/.test(canonical) ? new URL(canonical).pathname + '.md' : null;
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
${mdTwin ? `<link rel="alternate" type="text/markdown" href="${mdTwin}" title="Markdown version">` : ''}
${edit ? editMode.editMeta(edit) : ''}
<link rel="alternate" type="application/json" href="/api/index.json" title="JSON API">
<link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt">
${jsonLd ? `<script type="application/ld+json">\n${jsonLd}\n</script>` : ''}
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
    <a href="/"${current === 'showcase' ? ' aria-current="page"' : ''}>Showcase</a>
    <a href="/handbook.html"${current === 'handbook' ? ' aria-current="page"' : ''}>Handbook</a>
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
      <a href="/">Showcase</a>
      <a href="/handbook.html">Handbook</a>
      <a href="/developers.html">API</a>
      <a href="/about.html">About</a>
      <a href="/contact.html">Contact</a>
      <a href="/privacy.html">Privacy</a>
      <a href="${REPO}">GitHub</a>
    </div>
    <p class="foot-fine">© 2026 The Physical AI Sprint Hackathon. All rights reserved.</p>
  </footer>
</div>

<div class="corner">
  <a href="/developers.html">API</a>
  <a href="${REPO}">GitHub</a>
  <button type="button" data-refresh>Refresh</button>
  <span class="corner-msg" role="status"></span>
</div>

<script src="/edit-mode.js" defer></script>
<script>${CORNER_SCRIPT}</script>
</body>
</html>
`;
}

/* --------------------------------------------------------------- showcase */

/**
 * A cover committed for one project, by slug: img/projects/<slug>.jpg (or
 * .jpeg/.png/.webp). Photos of a demo in the room beat any thumbnail we can
 * derive from a link, and some links — a Drive folder — yield nothing at all.
 */
function projectImage(slug) {
  const dir = path.join(ROOT, 'img', 'projects');
  if (!fs.existsSync(dir)) return null;
  const hit = fs.readdirSync(dir).find((f) => f.replace(/\.[^.]+$/, '') === slug && /\.(jpe?g|png|webp)$/i.test(f));
  return hit ? `/img/projects/${hit}` : null;
}

function thumbFor(p) {
  const own = projectImage(p.slug);
  if (own) return own;
  const img = (p.images || []).map(safeUrl).filter(Boolean)[0];
  if (img) return img;
  const v = safeUrl(p.video) || '';
  let m;
  if ((m = v.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/))) {
    return `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`;
  }
  // Drive serves a thumbnail for any shared file, decks included.
  if ((m = v.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/)) ||
      (m = v.match(/docs\.google\.com\/presentation\/d\/([A-Za-z0-9_-]+)/))) {
    return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w1000`;
  }
  // A repo has a rendered OpenGraph card, which beats an empty tile.
  if ((m = (safeUrl(p.repo) || '').match(/github\.com\/([^/]+)\/([^/#?]+)/))) {
    return `https://opengraph.githubassets.com/1/${m[1]}/${m[2].replace(/\.git$/, '')}`;
  }
  return null;
}

function coverFor(p) {
  const t = thumbFor(p);
  // A thumbnail we derived from someone else's host can 404 later; fall back to
  // the lettered tile in the browser rather than showing a broken image.
  if (t) return `<img src="${esc(t)}" alt="" loading="lazy" onerror="this.parentNode.innerHTML='${esc(initialsTile(p).replace(/'/g, "\\'"))}'">`;
  return initialsTile(p);
}

/** No derivable image: a lettered tile reads better than an empty grey box. */
function initialsTile(p) {
  const words = String(p.title || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  return `<span class="ph tile" aria-hidden="true">${esc(initials)}</span>`;
}

function card(p) {
  const t = track(p.track);
  const people = (p.team || []).map((m) => avatar(m.github, 52)).filter(Boolean).slice(0, 5);
  return `      <a class="pcard" href="/projects/${esc(p.slug)}.html" ${p.issue ? editMode.editAttrs({ kind: 'issue', target: p.issue, label: `edit project #${p.issue}` }) : ''} data-track="${esc(p.track || '')}" data-search="${esc([p.title, p.tagline, (p.robots || []).join(' '), (p.team || []).map((m) => `${m.name} ${m.github}`).join(' ')].join(' ').toLowerCase())}">
        <div class="cover">${coverFor(p)}</div>
        <div class="body">
          <h3>${esc(p.title)}</h3>
          <p class="tag">${esc(p.tagline || '')}</p>
          <div class="meta">
            ${p.track ? `<span class="chip ${t.cls}">${esc(t.label)}</span>` : ''}
            ${people.length ? `<span class="avatars">${people.map((a) => `<img src="${esc(a)}" alt="" loading="lazy">`).join('')}</span>` : ''}
            ${(p.team || []).length ? `<span class="badge">${p.team.length} member${p.team.length === 1 ? '' : 's'}</span>` : ''}
          </div>
        </div>
      </a>`;
}

/** Event photos for the showcase header, in filename order. */
function headerPhotos() {
  const dir = path.join(ROOT, 'img', 'header');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
}

function showcase(projects) {
  const photos = headerPhotos();
  const body = `
<header class="pagehead">
  <div class="pagehead-in">
    <p class="eyebrow">Project showcase</p>
    <h1>What teams built</h1>
    <p class="lede">Every project built at the Physical AI Sprint — a one-day hackathon alongside Actuate SF, hosted by Nebius with NVIDIA, Antioch, and Toloka.</p>
${photos.length ? `    <div class="pagehead-photos">
${photos.map((f) => `      <img src="/img/header/${esc(f)}" alt="" loading="lazy">`).join('\n')}
    </div>` : ''}
  </div>
</header>

<div class="wrap">
${projects.length === 0 ? `  <div class="empty">
    <h3>No submissions yet</h3>
    <p>Projects appear here as teams submit them. The deadline is 3:30pm on event day.</p>
  </div>` : `  <div class="controls">
    <input type="search" id="q" placeholder="Search projects and teams…" aria-label="Search projects"
      toolname="search_projects"
      tooldescription="Filter the submitted hackathon projects by title, tagline, robot used, or team member name.">
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
    var TOOL_NAME = 'search_projects';
    var TOOL_DESC = 'Filter the submitted hackathon projects by title, tagline, robot used, or team member name.';
    var cards = Array.prototype.slice.call(document.querySelectorAll('.pcard'));
    var q = document.getElementById('q');
    var shown = document.getElementById('shown');
    var none = document.getElementById('noresults');
    var grid = document.getElementById('grid');

    function apply() {
      var term = q.value.trim().toLowerCase();
      var n = 0;
      cards.forEach(function (c) {
        var on = !term || c.getAttribute('data-search').indexOf(term) !== -1;
        c.hidden = !on;
        if (on) n++;
      });
      shown.textContent = n;
      none.hidden = n !== 0;
      grid.hidden = n === 0;
    }

    q.addEventListener('input', apply);

    // WebMCP: expose the same filter as a callable tool for browser-resident
    // agents. Guarded because the API only exists in recent Chrome.
    var mc = window.document.modelContext || window.navigator.modelContext;
    if (mc && typeof mc.registerTool === 'function') {
      mc.registerTool({
        name: TOOL_NAME,
        description: TOOL_DESC,
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Text to filter by.' } },
          required: ['query'],
        },
        async execute(args) {
          q.value = (args && args.query) || '';
          apply();
          var hits = cards.filter(function (c) { return !c.hidden; })
            .map(function (c) { return { name: c.querySelector('h3').textContent.trim(), url: (c.getAttribute('href') || (c.querySelector('a') || {}).getAttribute && c.querySelector('a').getAttribute('href')) || null }; });
          return { content: [{ type: 'text', text: JSON.stringify({ count: hits.length, results: hits }) }] };
        },
      });
    }
  })();
  </script>`}
</div>`;

  return page({
    jsonLd: graph(...BASE(), breadcrumbs([['Showcase', '/']]), {
      '@type': 'CollectionPage',
      name: 'Project Showcase',
      url: `${SITE}/`,
      isPartOf: { '@id': `${SITE}/#website` },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: projects.length,
        itemListElement: projects.map((p, i) => ({
          '@type': 'ListItem', position: i + 1, name: p.title, url: `${SITE}/projects/${p.slug}.html`,
        })),
      },
    }),
    edit: { kind: 'generator', target: 'build.js', label: 'build.js — showcase()' },
    title: 'Project Showcase',
    description: `Projects built at the Physical AI Sprint hackathon${projects.length ? ` — ${projects.length} submitted` : ''}.`,
    body,
    current: 'showcase',
    canonical: `${SITE}/`,
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

// Names the host behind a project's videoSource so the fallback line points at
// the right place: a Photos album, a Drive folder, or whatever else turns up.
function videoSourceHost(u) {
  const s = String(u || '');
  if (/photos\.(app\.goo\.gl|google\.com)/.test(s)) return { host: 'Google Photos', cta: 'open the original album' };
  if (/drive\.google\.com/.test(s)) return { host: 'Google Drive', cta: 'open the original folder' };
  return { host: 'their original host', cta: 'open the original' };
}

function projectPage(p, teamEntry, others = []) {
  const t = track(p.track);
  const url = `${SITE}/projects/${p.slug}.html`;
  const repo = safeUrl(p.repo);
  const own = projectImage(p.slug);
  const images = [...(own ? [own] : []), ...(p.images || []).map(safeUrl).filter(Boolean)];
  const team = (p.team || []).map((m) => ({ name: m.name || ghUser(m.github) || 'Unnamed', user: ghUser(m.github) }));
  const cover = images[0] || null;

  const body = `
<div class="wrap watchwrap">
  <p class="eyebrow"><a class="back" href="/">← All projects</a></p>
  <div class="watch">
  <main class="watch-main">
${(p.videos && p.videos.length
    ? p.videos.map((v, i) => `${p.videos.length > 1 ? `  <h3 class="cliphead">Clip ${i + 1} of ${p.videos.length}</h3>` : ''}\n${videoEmbed(v)}`).join('\n')
    : videoEmbed(p.video))}
${p.videoSource ? (() => {
    const h = videoSourceHost(p.videoSource);
    const many = (p.videos || []).length > 1;
    return `  <p class="srcline">${many ? 'Clips' : 'Video'} hosted on ${esc(h.host)} — <a href="${esc(safeUrl(p.videoSource) || '#')}" target="_blank" rel="noopener noreferrer">${esc(h.cta)}</a> if ${many ? 'a player fails' : 'the player fails'} to load.</p>`;
  })() : ''}
${p.video && !p.repo && p.linkNote ? `  <p class="srcline">${esc(p.linkNote)}</p>` : ''}

  <h1 class="watch-title">${esc(p.title)}</h1>
  <p class="lede"${p.issue ? ` data-edit-field="issue:${p.issue}#One-line summary"` : ''}>${esc(p.tagline || '')}</p>
  ${(p.track || (p.robots || []).length) ? `<div class="actions">
      ${p.track ? `<span class="chip ${t.cls}">${esc(t.label)}</span>` : ''}
      ${(p.robots || []).map((r) => `<span class="chip">${esc(r)}</span>`).join('\n      ')}
    </div>` : ''}

${p.description ? `  <div class="prose"${p.issue ? ` data-edit-field="issue:${p.issue}#Description" data-edit-multiline="1"` : ''}>\n${prose(p.description)}\n  </div>` : ''}

${images.length ? `  <h2>Photos</h2>
  <div class="gallery">
${images.map((src) => `    <a href="${esc(src)}" target="_blank" rel="noopener noreferrer"><img src="${esc(src)}" alt="" loading="lazy"></a>`).join('\n')}
  </div>` : ''}

${team.length ? `  <h2>Team</h2>
${roster(p.team)}` : ''}

  <dl class="facts">
    ${p.track ? `<div><dt>Track</dt><dd>${esc(t.label)}</dd></div>` : ''}
    ${teamEntry ? `<div><dt>Team</dt><dd><a href="/teams/${esc(teamEntry.slug)}.html">${esc(teamEntry.name)}</a></dd></div>`
           : (p.teamRef ? `<div><dt>Team</dt><dd>${esc(p.teamRef)}</dd></div>` : '')}
    ${(p.robots || []).length ? `<div><dt>Robots</dt><dd>${esc(p.robots.join(', '))}</dd></div>` : ''}
    ${repo ? `<div><dt>Code</dt><dd><a href="${esc(repo)}" target="_blank" rel="noopener noreferrer">${esc(repo.replace(/^https:\/\//, ''))}</a></dd></div>` : ''}
    ${p.issue ? `<div><dt>Submission</dt><dd><a href="${REPO}/issues/${esc(p.issue)}" target="_blank" rel="noopener noreferrer">Issue #${esc(p.issue)}</a></dd></div>`
           : (p.source === 'form' ? `<div><dt>Submission</dt><dd>Demo-day form${p.resubmissions ? ` · revised ${p.resubmissions === 1 ? 'once' : `${p.resubmissions} times`}` : ''}</dd></div>` : '')}
    ${submittedAt(p.submittedAt) ? `<div><dt>Submitted</dt><dd>${esc(submittedAt(p.submittedAt))}</dd></div>` : ''}
  </dl>

${shareBlock({ title: p.title, text: `${p.title} — ${p.tagline || 'built at The Physical AI Sprint'}`, url })}
  </main>

  <aside class="watch-side" aria-label="Other projects">
    <h2 class="side-head">More from the sprint</h2>
${others.map((o) => `    <a class="side-item" href="/projects/${esc(o.slug)}.html">
      <span class="side-thumb">${coverFor(o)}</span>
      <span class="side-meta">
        <span class="side-title">${esc(o.title)}</span>
        <span class="side-sub">${esc((o.team || []).length ? `${o.team.length} member${o.team.length === 1 ? '' : 's'}` : 'Physical AI Sprint')}</span>
      </span>
    </a>`).join('\n')}
  </aside>
  </div>
</div>`;

  return page({
    jsonLd: graph(...BASE(), breadcrumbs([['Showcase', '/'], [p.title, `/projects/${p.slug}.html`]]), {
      '@type': 'CreativeWork',
      name: p.title,
      url,
      abstract: p.tagline || undefined,
      description: p.description || p.tagline || undefined,
      ...(cover ? { image: cover } : {}),
      ...(repo ? { codeRepository: repo } : {}),
      keywords: (p.robots || []).join(', ') || undefined,
      isPartOf: { '@id': `${SITE}/#website` },
      author: team.map((m) => ({
        '@type': 'Person', name: m.name,
        ...(m.user ? { sameAs: `https://github.com/${m.user}` } : {}),
      })),
    }),
    edit: p.issue ? { kind: 'issue', target: p.issue, label: `project issue #${p.issue}` } : { kind: 'generator', target: 'build.js', label: 'build.js — projectPage()' },
    title: `${p.title} — Physical AI Sprint`,
    description: p.tagline || `A project built at The Physical AI Sprint hackathon.`,
    body,
    current: 'showcase',
    ogImage: absolute(cover),
    canonical: url,
  });
}

/* --------------------------------------------------------- team directory */

const TEAM_URL = `${REPO}/issues/new?template=team.yml&labels=team`;

function teamCard(t, built) {
  const members = (t.members || []).map((m) => ({ name: m.name || ghUser(m.github) || 'Unnamed', user: ghUser(m.github) }));
  return `      <article class="tcard" id="team-${esc(t.slug)}" ${t.issue ? editMode.editAttrs({ kind: 'issue', target: t.issue, label: `edit team #${t.issue}` }) : ''} data-open="${t.open ? 'yes' : 'no'}" data-search="${esc([t.name, t.pitch, (t.looking || []).join(' '), (t.have || []).join(' '), members.map((m) => `${m.name} ${m.user || ''}`).join(' ')].join(' ').toLowerCase())}">
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
    <p class="lede">You do not need to arrive with a team. Post what you want to build, or find a team with room and ask to join. Teams are 1 to 5 people, so hacking solo is fine.</p>
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
    <input type="search" id="q" placeholder="Search teams, skills, people…" aria-label="Search teams"
      toolname="search_teams"
      tooldescription="Filter hackathon teams by name, what they are building, the skills they want, or a member's name.">
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
    var TOOL_NAME = 'search_teams';
    var TOOL_DESC = 'Filter hackathon teams by name, what they are building, the skills they want, or a member name.';
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

    // WebMCP: expose the same filter as a callable tool for browser-resident
    // agents. Guarded because the API only exists in recent Chrome.
    var mc = window.document.modelContext || window.navigator.modelContext;
    if (mc && typeof mc.registerTool === 'function') {
      mc.registerTool({
        name: TOOL_NAME,
        description: TOOL_DESC,
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Text to filter by.' } },
          required: ['query'],
        },
        async execute(args) {
          q.value = (args && args.query) || '';
          apply();
          var hits = cards.filter(function (c) { return !c.hidden; })
            .map(function (c) { return { name: c.querySelector('h3').textContent.trim(), url: (c.getAttribute('href') || (c.querySelector('a') || {}).getAttribute && c.querySelector('a').getAttribute('href')) || null }; });
          return { content: [{ type: 'text', text: JSON.stringify({ count: hits.length, results: hits }) }] };
        },
      });
    }
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
      <p>Edit the issue to add members. Teams cap at 5 — mark yours full once you have the people you want and it stops showing under "has room".</p>
    </li>
  </ol>
</div>`;

  return page({
    jsonLd: graph(...BASE(), breadcrumbs([['Showcase', '/'], ['Teams', '/teams.html']]), {
      '@type': 'CollectionPage',
      name: 'Team Directory',
      url: `${SITE}/teams.html`,
      isPartOf: { '@id': `${SITE}/#website` },
      mainEntity: {
        '@type': 'ItemList',
        numberOfItems: teams.length,
        itemListElement: teams.map((t, i) => ({
          '@type': 'ListItem', position: i + 1, name: t.name, url: `${SITE}/teams/${t.slug}.html`,
        })),
      },
    }),
    edit: { kind: 'generator', target: 'build.js', label: 'build.js — teamsPage()' },
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
    <p class="lede"${t.issue ? ` data-edit-field="issue:${t.issue}#What you want to build"` : ''}>${esc(t.pitch || '')}</p>
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
    jsonLd: graph(...BASE(), breadcrumbs([['Showcase', '/'], ['Teams', '/teams.html'], [t.name, `/teams/${t.slug}.html`]]), {
      '@type': 'Organization',
      name: t.name,
      url,
      description: t.pitch || undefined,
      subOrganizationOf: { '@id': `${SITE}/#organization` },
      member: (t.members || []).map((m) => ({
        '@type': 'Person', name: m.name,
        ...(ghUser(m.github) ? { sameAs: `https://github.com/${ghUser(m.github)}` } : {}),
      })),
    }),
    edit: t.issue ? { kind: 'issue', target: t.issue, label: `team issue #${t.issue}` } : { kind: 'generator', target: 'build.js', label: 'build.js — teamPage()' },
    title: `${t.name} — Physical AI Sprint`,
    description: t.pitch || `A team at The Physical AI Sprint hackathon.`,
    body,
    current: 'teams',
    ogImage: absolute(cover),
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
      <a class="btn ghost" href="/">See the showcase</a>
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
      <p>Name your team and the roster comes across automatically if it is already on file — no retyping. Otherwise List members one per line as <code>Name @githubhandle</code>.</p>
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
        <tr><td>Team</td><td>Your team's name, or its issue number. Links the two together.</td></tr>
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
    jsonLd: graph(...BASE(), breadcrumbs([['Showcase', '/'], ['Submit', '/submit.html']]), {
      '@type': 'FAQPage',
      mainEntity: [
        ['How do I submit a project?', 'Open the GitHub issue form linked from the submit page, fill in the fields, and drag your photos and video straight into the form. Your project page builds and appears in the showcase within a couple of minutes.'],
        ['When is the submission deadline?', 'Submissions close at 3:30pm on event day, Monday August 17 2026. Demos and judging follow at 4:30pm.'],
        ['Do I need a GitHub account?', 'Yes. Signing in is what lets you upload media and what links your project to your profile. Signing up takes about a minute.'],
        ['Can I edit my submission after sending it?', 'Yes. Edit the issue at any time before judging and the project page updates itself. To withdraw a project, close the issue or remove its submission label.'],
        ['How is my project judged?', 'Science-fair style at your team station, on four unweighted criteria: ambition, functionality, creativity, and architectural quality. The top six teams then demo to the whole room.'],
      ].map(([q, a]) => ({
        '@type': 'Question', name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    }),
    edit: { kind: 'generator', target: 'build.js', label: 'build.js — submitPage()' },
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

  // The showcase has two sources. Issues are the live one, rewritten by the
  // sync workflow on every issue event; data/submissions.json is the demo-day
  // form export, which no workflow touches. They are kept in separate files
  // for exactly that reason: a sync run would otherwise wipe the form entries.
  const subsPath = path.join(ROOT, 'data', 'submissions.json');
  if (fs.existsSync(subsPath)) {
    const rawS = JSON.parse(fs.readFileSync(subsPath, 'utf8'));
    projects = projects.concat(Array.isArray(rawS) ? rawS : (rawS.projects || []));
  }

  // Normalize before rendering: slugs become file paths, and the issue number
  // is interpolated into a URL, so neither may carry arbitrary text.
  projects = projects
    .filter((p) => p && p.title)
    .map((p) => ({ ...p, slug: safeSlug(p.slug), issue: Number.isInteger(Number(p.issue)) ? Number(p.issue) : null }))
    .filter((p) => p.slug)
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));

  // A project can arrive from both sources. The issue is the editable one, so
  // it wins the slug and the form entry is dropped rather than shadowing it.
  const bySlug = new Map();
  for (const p of projects) {
    const seen = bySlug.get(p.slug);
    if (!seen || (!seen.issue && p.issue)) bySlug.set(p.slug, p);
  }
  projects = [...bySlug.values()].sort((a, b) => String(a.title).localeCompare(String(b.title)));

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
  fs.writeFileSync(path.join(ROOT, 'index.html'), showcase(projects));
  fs.writeFileSync(path.join(ROOT, 'submit.html'), submitPage());
  for (const p of projects) {
    fs.writeFileSync(path.join(outDir, `${p.slug}.html`),
      projectPage(p, teamOf.get(p.slug), projects.filter((o) => o.slug !== p.slug)));
  }

  // Trust anchors + developer portal.
  const anchors = {
    about: extraPages.aboutPage(page),
    contact: extraPages.contactPage(page),
    privacy: extraPages.privacyPage(page),
    developers: extraPages.developersPage(page, teams, projects),
  };
  for (const [name, html] of Object.entries(anchors)) {
    fs.writeFileSync(path.join(ROOT, `${name}.html`), html);
    // Also serve the extensionless path — agents (and Ora) probe /about, not
    // /about.html, and a static host will not rewrite one to the other.
    fs.mkdirSync(path.join(ROOT, name), { recursive: true });
    fs.writeFileSync(path.join(ROOT, name, 'index.html'), html);
  }

  // Machine-readable surface. Projects carry their resolved team slug so the
  // API expresses the same link the pages do.
  const apiProjects = projects.map((p) => ({ ...p, teamSlug: (teamOf.get(p.slug) || {}).slug || null }));

  // Unlisted judging tool. Deliberately not in the nav, the sitemap, or
  // llms.txt, and served noindex — it is for the five judges, not the public.
  fs.writeFileSync(path.join(ROOT, 'judge.html'), judgePage(teams, apiProjects));
  // /edit — the entry point into edit mode. Unlisted like /judge: reachable if
  // you know it, not advertised in the nav.
  fs.writeFileSync(path.join(ROOT, 'edit.html'), extraPages.editPage(page, teams, apiProjects));
  const mdTwins = agentFiles.markdownTwins(teams, projects);
  // Edit mode: one inert script served everywhere, plus a map of index.html's
  // section ids to line numbers so handbook sections deep-link to the line.
  const indexLines = fs.readFileSync(path.join(ROOT, 'handbook.html'), 'utf8').split('\n');
  const sections = {};
  indexLines.forEach((ln, i) => {
    const m = ln.match(/id="([a-z0-9-]+)"/i);
    if (m && !sections[m[1]]) sections[m[1]] = i + 1;
  });

  const generated = {
    'edit-mode.js': editMode.editModeScript(),
    'edit-map.json': JSON.stringify({ file: 'handbook.html', sections }, null, 2) + '\n',
    ...mdTwins,
    'robots.txt': agentFiles.robots(),
    'sitemap.xml': agentFiles.sitemap(teams, projects),
    'openapi.json': agentFiles.openapi(),
    ...agentFiles.apiFiles(teams, apiProjects),
    ...agentFiles.discoveryFiles(teams, projects),
    ...agentFiles.textFiles(teams, projects),
  };
  for (const [rel, content] of Object.entries(generated)) {
    const out = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, content);
  }

  console.log(`built ${teams.length} team page(s), ${projects.length} project page(s), ${teamOf.size} linked, ${Object.keys(generated).length} agent file(s)`);
}

// Only build when run directly, so the helpers above can be unit tested.
if (require.main === module) main();

module.exports = {
  esc, jsonForScript, safeSlug, safeUrl, prose, videoEmbed, ghUser, avatar,
  track, resolveTeam, coverFor, roster, teamPage, projectPage,
};
