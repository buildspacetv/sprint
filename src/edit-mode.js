/**
 * Edit mode — the same site, served from edit.buildspace.tv, with an editing
 * layer switched on.
 *
 * The whole feature is one static script plus a few data attributes. There is
 * no second build, no CMS, and no copy of the content: edit.buildspace.tv and
 * www.buildspace.tv serve byte-identical files, and the script simply does
 * nothing unless the hostname says otherwise. That means edit mode can never
 * drift from the live site, and can never leak editing chrome onto it.
 *
 * The hard part is not the UI, it is pointing at the right source. Three of the
 * site's page types are generated, so "edit this page" must never open the
 * rendered HTML — the next build would silently discard the change. Every page
 * therefore declares where its content actually lives:
 *
 *   file      hand-maintained in the repo   -> GitHub editor, deep-linked to the line
 *   issue     a team or project submission  -> the GitHub issue that produced it
 *   generator emitted by build.js/src/*.js  -> the generator, with a warning
 *
 * v2 (WYSIWYG in place) is designed around the same declarations; see
 * docs/PRD-edit-mode.md.
 */

const REPO_SLUG = 'buildspacetv/sprint';

/** Attributes a page or region uses to declare its source. */
function editAttrs({ kind, target, label, line }) {
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  return [
    `data-edit-kind="${esc(kind)}"`,
    `data-edit-target="${esc(target)}"`,
    label ? `data-edit-label="${esc(label)}"` : '',
    line ? `data-edit-line="${esc(line)}"` : '',
  ].filter(Boolean).join(' ');
}

/** The <meta> tags that declare a page's own source. */
function editMeta({ kind, target, label }) {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<meta name="edit-kind" content="${esc(kind)}">
<meta name="edit-target" content="${esc(target)}">
<meta name="edit-label" content="${esc(label || '')}">`;
}

/**
 * Where an edit actually goes. Shared by the browser script (embedded via
 * toString below) and the test suite, so the two cannot drift.
 *
 * GitHub's plain editor cannot open at a line; github.dev (VS Code in the
 * browser) can, so a known line number upgrades the destination.
 */
function resolveEditUrl(repo, branch, kind, target, line) {
  if (kind === 'issue') return 'https://github.com/' + repo + '/issues/' + target;
  if (line) return 'https://github.dev/' + repo + '/blob/' + branch + '/' + target + '#L' + line;
  return 'https://github.com/' + repo + '/edit/' + branch + '/' + target;
}

function viewSourceUrl(repo, branch, kind, target, line) {
  if (kind === 'issue') return 'https://github.com/' + repo + '/issues/' + target;
  return 'https://github.com/' + repo + '/blob/' + branch + '/' + target + (line ? '#L' + line : '');
}

/* ------------------------------------------------------------- the asset */

function editModeScript() {
  return `/**
 * Edit mode. Inert unless served from an "edit." host (or ?edit=1 for local
 * testing), so this file is safe to include on every page of the live site.
 */
(function () {
  "use strict";

  var host = location.hostname;
  var forced = /[?&]edit=1\\b/.test(location.search);
  if (!/^edit\\./i.test(host) && !forced) return;

  var REPO = ${JSON.stringify(REPO_SLUG)};
  var BRANCH = 'main';

  /* ---------------------------------------------------------- targeting */

  function meta(name) {
    var m = document.querySelector('meta[name="' + name + '"]');
    return m ? m.getAttribute('content') : '';
  }

  ${resolveEditUrl.toString()}
  ${viewSourceUrl.toString()}

  function resolve(kind, target, line) { return resolveEditUrl(REPO, BRANCH, kind, target, line); }
  function viewUrl(path, line) { return viewSourceUrl(REPO, BRANCH, 'file', path, line); }
  function issueUrl(n) { return resolveEditUrl(REPO, BRANCH, 'issue', n); }

  /* ------------------------------------------------------------ styling */

  var css = document.createElement('style');
  css.textContent = [
    ':root { --edit-accent: #7C4DFF; }',
    '.em-bar { position: sticky; top: 0; z-index: 90; display: flex; align-items: center; gap: 12px;',
    '  flex-wrap: wrap; padding: 9px 18px; background: var(--edit-accent); color: #fff;',
    '  font-family: var(--f-display), system-ui, sans-serif; font-size: .95rem; }',
    '.em-bar b { text-transform: uppercase; letter-spacing: .08em; font-size: .78rem; }',
    '.em-bar .em-src { font-family: var(--f-mono), monospace; font-size: .72rem; opacity: .9; }',
    '.em-bar .em-spacer { margin-left: auto; }',
    '.em-bar a, .em-bar button { font: inherit; font-size: .88rem; color: #fff; background: rgba(255,255,255,.16);',
    '  border: 1px solid rgba(255,255,255,.4); border-radius: 6px; padding: 5px 12px;',
    '  text-decoration: none; cursor: pointer; }',
    '.em-bar a:hover, .em-bar button:hover { background: rgba(255,255,255,.28); }',
    '.em-bar button[aria-pressed="true"] { background: #fff; color: var(--edit-accent); }',
    '.em-note { padding: 9px 18px; background: rgba(124,77,255,.10); border-bottom: 1px solid rgba(124,77,255,.35);',
    '  font-size: .9rem; }',
    '[data-edit-kind] { position: relative; }',
    'body.em-on [data-edit-kind]:hover { outline: 2px dashed var(--edit-accent); outline-offset: 4px; }',
    '.em-pill { position: absolute; top: -11px; right: 6px; z-index: 20; display: none;',
    '  align-items: center; gap: 5px; padding: 3px 9px; border-radius: 99px;',
    '  background: var(--edit-accent); color: #fff; text-decoration: none;',
    '  font-family: var(--f-mono), monospace; font-size: .62rem; letter-spacing: .1em;',
    '  text-transform: uppercase; box-shadow: 0 2px 8px rgba(0,0,0,.25); }',
    'body.em-on [data-edit-kind]:hover > .em-pill, .em-pill:focus { display: inline-flex; }',
    '@media print { .em-bar, .em-note, .em-pill { display: none !important; } }'
  ].join('\\n');
  document.head.appendChild(css);

  /* ---------------------------------------------------------------- bar */

  var kind = meta('edit-kind') || 'file';
  var target = meta('edit-target') || 'index.html';
  var label = meta('edit-label') || target;

  var bar = document.createElement('div');
  bar.className = 'em-bar';
  bar.innerHTML =
    '<b>Edit mode</b>' +
    '<span class="em-src">' + label.replace(/[<>&]/g, '') + '</span>' +
    '<span class="em-spacer"></span>' +
    '<button type="button" id="emToggle" aria-pressed="true">Highlight editable</button>' +
    '<a id="emView" target="_blank" rel="noopener">View source</a>' +
    '<a id="emEdit" target="_blank" rel="noopener">Edit this page</a>' +
    '<a href="https://www.buildspace.tv' + location.pathname + '">Leave edit mode</a>';
  document.body.insertBefore(bar, document.body.firstChild);

  document.getElementById('emEdit').href = resolve(kind, target);
  var viewEl = document.getElementById('emView');
  if (kind === 'issue') viewEl.href = issueUrl(target); else viewEl.href = viewUrl(target);

  // A generated page is the trap this feature exists to avoid: editing the
  // rendered HTML looks like it works and is thrown away by the next build.
  if (kind === 'generator' || kind === 'issue') {
    var note = document.createElement('div');
    note.className = 'em-note';
    note.innerHTML = kind === 'issue'
      ? '<b>This page is generated from a GitHub issue.</b> Edit the issue and the page rebuilds itself — editing the HTML would be overwritten on the next build.'
      : '<b>This page is generated.</b> Its wording lives in <code>' + target.replace(/[<>&]/g, '') + '</code>; the HTML file is build output and is overwritten on every build.';
    bar.insertAdjacentElement('afterend', note);
  }

  document.body.classList.add('em-on');
  document.getElementById('emToggle').addEventListener('click', function () {
    var on = document.body.classList.toggle('em-on');
    this.setAttribute('aria-pressed', on ? 'true' : 'false');
  });

  /* ------------------------------------------------------- region pills */

  function addPills() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit-kind]'), function (el) {
      if (el.querySelector(':scope > .em-pill')) return;
      var k = el.getAttribute('data-edit-kind');
      var t = el.getAttribute('data-edit-target');
      var l = el.getAttribute('data-edit-label') || 'edit';
      var line = el.getAttribute('data-edit-line');
      var a = document.createElement('a');
      a.className = 'em-pill';
      a.target = '_blank';
      a.rel = 'noopener';
      a.href = resolve(k, t, line);
      a.textContent = l;
      el.appendChild(a);
    });
  }
  addPills();

  /* ------------------------------------------ handbook section deep links */

  // build.js records the line number of every section id in index.html, so a
  // handbook section can open github.dev at the exact line rather than the top
  // of a 3,000-line file.
  if (kind === 'file' && /(^|\\/)index\\.html$/.test(target)) {
    fetch('/edit-map.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (map) {
      if (!map || !map.sections) return;
      Array.prototype.forEach.call(document.querySelectorAll('section[id], h2[id], h3[id]'), function (el) {
        var line = map.sections[el.id];
        if (!line || el.hasAttribute('data-edit-kind')) return;
        el.setAttribute('data-edit-kind', 'file');
        el.setAttribute('data-edit-target', target);
        el.setAttribute('data-edit-line', line);
        el.setAttribute('data-edit-label', 'edit section');
      });
      addPills();
    }).catch(function () {});
  }
})();
`;
}

module.exports = { editModeScript, editAttrs, editMeta, resolveEditUrl, viewSourceUrl, REPO_SLUG };
