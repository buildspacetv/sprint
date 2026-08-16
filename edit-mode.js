/**
 * Edit mode. Inert unless served from an "edit." host (or ?edit=1 for local
 * testing), so this file is safe to include on every page of the live site.
 */
(function () {
  "use strict";

  var host = location.hostname;
  var forced = /[?&]edit=1\b/.test(location.search);

  // Three ways in, so edit mode works without a dedicated subdomain:
  //   1. an edit. host          (edit.buildspace.tv, if that is ever attached)
  //   2. ?edit=1 on any page    (how /edit hands off, and how you test locally)
  //   3. a sticky session flag  (so it survives clicking through the site)
  // The flag lives in sessionStorage, not localStorage: edit mode should end
  // when the tab does, rather than surprising someone days later.
  var STICKY = 'pais-edit-mode';
  function sticky(v) {
    try {
      if (v === undefined) return sessionStorage.getItem(STICKY) === '1';
      if (v) sessionStorage.setItem(STICKY, '1'); else sessionStorage.removeItem(STICKY);
    } catch (e) { return false; }
  }
  if (forced) sticky(true);
  if (!/^edit\./i.test(host) && !forced && !sticky()) return;

  var REPO = "buildspacetv/sprint";
  var BRANCH = 'main';

  /* ---------------------------------------------------------- targeting */

  function meta(name) {
    var m = document.querySelector('meta[name="' + name + '"]');
    return m ? m.getAttribute('content') : '';
  }

  function resolveEditUrl(repo, branch, kind, target, line) {
  if (kind === 'issue') return 'https://github.com/' + repo + '/issues/' + target;
  if (line) return 'https://github.dev/' + repo + '/blob/' + branch + '/' + target + '#L' + line;
  return 'https://github.com/' + repo + '/edit/' + branch + '/' + target;
}
  function viewSourceUrl(repo, branch, kind, target, line) {
  if (kind === 'issue') return 'https://github.com/' + repo + '/issues/' + target;
  return 'https://github.com/' + repo + '/blob/' + branch + '/' + target + (line ? '#L' + line : '');
}

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
    '@media print { .em-bar, .em-note, .em-pill, .em-save { display: none !important; } }',
    'body.em-on [data-edit-field], body.em-on [data-edit-file] { outline: 1px dashed rgba(124,77,255,.5); outline-offset: 4px; border-radius: 3px; }',
    '[data-edit-field][contenteditable], [data-edit-file][contenteditable] { outline: 2px solid var(--edit-accent) !important; background: rgba(124,77,255,.06); }',
    '.em-save { position: fixed; right: 18px; bottom: 18px; z-index: 95; display: none; gap: 8px;',
    '  padding: 10px 12px; border-radius: 10px; background: var(--edit-accent); color: #fff;',
    '  font-family: var(--f-display), system-ui, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.3); }',
    '.em-save.on { display: flex; align-items: center; }',
    '.em-save button { font: inherit; font-size: .9rem; padding: 6px 12px; border-radius: 6px; cursor: pointer;',
    '  border: 1px solid rgba(255,255,255,.5); background: rgba(255,255,255,.18); color: #fff; }',
    '.em-save button.primary { background: #fff; color: var(--edit-accent); border-color: #fff; }',
    '.em-save .em-msg { font-size: .82rem; max-width: 40ch; }'
  ].join('\n');
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
    '<button type="button" id="emLeave">Leave edit mode</button>';
  document.body.insertBefore(bar, document.body.firstChild);

  document.getElementById('emLeave').addEventListener('click', function () {
    sticky(false);
    location.href = location.pathname;
  });

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

  /* --------------------------------------------------- inline editing (v2) */

  // Only regions the build marked as round-trippable are editable. Everything
  // else stays read-only and keeps the "edit the source on GitHub" path, which
  // is the honest answer for text the generator computes rather than stores.
  var KEY = 'pais-edit-key';
  var NAME = 'pais-edit-name';
  function key() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function editorName() { try { return localStorage.getItem(NAME) || ''; } catch (e) { return ''; } }

  var savebar = document.createElement('div');
  savebar.className = 'em-save';
  savebar.innerHTML =
    '<span class="em-msg" id="emMsg">Edited</span>' +
    '<button type="button" id="emCancel">Discard</button>' +
    '<button type="button" class="primary" id="emPublish">Publish</button>';
  document.body.appendChild(savebar);

  var active = null;      // the element being edited
  var original = '';      // its text when editing started

  function msg(text) { document.getElementById('emMsg').textContent = text; }
  function showBar(on) { savebar.classList.toggle('on', !!on); }

  function fieldsOf(el) {
    return { issue: el.getAttribute('data-edit-field'), file: el.getAttribute('data-edit-file') };
  }

  function beginEdit(el) {
    if (active && active !== el) return;
    active = el;
    original = el.innerText.trim();
    el.setAttribute('contenteditable', 'plaintext-only');
    el.focus();
    msg('Editing — publish when you are done');
    showBar(true);
  }

  function endEdit(restore) {
    if (!active) return;
    if (restore) active.innerText = original;
    active.removeAttribute('contenteditable');
    active = null;
    showBar(false);
  }

  async function publish() {
    if (!active) return;
    var el = active;
    var next = el.innerText.trim();
    if (next === original) { endEdit(false); return; }

    var f = fieldsOf(el);
    var k = key();
    if (!k) {
      k = window.prompt('Edit passcode (an organizer has it):') || '';
      if (!k) { msg('Cancelled — nothing published.'); return; }
      try { sessionStorage.setItem(KEY, k); } catch (e) {}
    }
    var who = editorName();
    if (!who) {
      who = window.prompt('Your name, for the edit history:') || '';
      try { if (who) localStorage.setItem(NAME, who); } catch (e) {}
    }

    msg('Publishing…');
    var payload = f.issue
      ? { target: f.issue, value: next, editor: who }
      : { target: 'file:' + f.file, value: next, oldText: original, editor: who };

    try {
      var res = await fetch('/api/edit/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-edit-key': k },
        body: JSON.stringify(payload),
      });
      var data = await res.json().catch(function () { return {}; });

      if (res.ok) {
        original = next;
        endEdit(false);
        showBar(true);
        msg('Published — the site rebuilds in a couple of minutes.');
        setTimeout(function () { showBar(false); }, 6000);
        return;
      }

      if (res.status === 401) { try { sessionStorage.removeItem(KEY); } catch (e) {} }
      var err = (data && data.error) || {};
      // Failures are shown verbatim rather than softened: "text_not_found"
      // means this text is computed, not stored, and the editor needs to know
      // that rather than retrying the same edit.
      msg((err.message || 'That did not save.') + (err.resolution ? ' ' + err.resolution : ''));
    } catch (e) {
      msg('Could not reach the edit API. Your text is still on screen — copy it before reloading.');
    }
  }

  document.getElementById('emPublish').addEventListener('click', publish);
  document.getElementById('emCancel').addEventListener('click', function () {
    endEdit(true);
  });

  function wireEditables() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-edit-field], [data-edit-file]'), function (el) {
      if (el.getAttribute('data-em-wired')) return;
      el.setAttribute('data-em-wired', '1');
      el.setAttribute('title', 'Click to edit');
      el.addEventListener('click', function (ev) {
        if (el.getAttribute('contenteditable')) return;
        ev.preventDefault();
        beginEdit(el);
      });
      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') { ev.preventDefault(); endEdit(true); }
        if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); publish(); }
      });
    });
  }
  wireEditables();

  /* ------------------------------------------ handbook section deep links */

  // build.js records the line number of every section id in index.html, so a
  // handbook section can open github.dev at the exact line rather than the top
  // of a 3,000-line file.
  if (kind === 'file' && /(^|\/)index\.html$/.test(target)) {
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
