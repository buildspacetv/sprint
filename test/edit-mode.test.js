/**
 * Tests for edit mode.
 *
 * The risk this feature carries is not a broken button — it is a button that
 * works and sends someone to the wrong file. Three of the site's page types are
 * build output, so an edit made there is silently discarded on the next build.
 * These tests pin the targeting.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { editModeScript, editAttrs, editMeta, resolveEditUrl, viewSourceUrl, REPO_SLUG } = require('../src/edit-mode.js');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* --------------------------------------------------------- URL resolution */

test('a file with a known line opens github.dev at that line', () => {
  const u = resolveEditUrl(REPO_SLUG, 'main', 'file', 'handbook.html', 867);
  assert.equal(u, `https://github.dev/${REPO_SLUG}/blob/main/handbook.html#L867`);
});

test('a file without a line opens the plain GitHub editor', () => {
  const u = resolveEditUrl(REPO_SLUG, 'main', 'file', 'src/pages-extra.js');
  assert.equal(u, `https://github.com/${REPO_SLUG}/edit/main/src/pages-extra.js`);
});

test('an issue-backed page opens the issue, never a file', () => {
  const u = resolveEditUrl(REPO_SLUG, 'main', 'issue', 12);
  assert.equal(u, `https://github.com/${REPO_SLUG}/issues/12`);
  assert.ok(!u.includes('/edit/'), 'must not offer to edit build output');
  assert.ok(!u.includes('.html'));
});

test('view-source links resolve for both kinds', () => {
  assert.equal(viewSourceUrl(REPO_SLUG, 'main', 'file', 'handbook.html', 5),
    `https://github.com/${REPO_SLUG}/blob/main/handbook.html#L5`);
  assert.equal(viewSourceUrl(REPO_SLUG, 'main', 'issue', 3),
    `https://github.com/${REPO_SLUG}/issues/3`);
});

/* ------------------------------------------------------------- attributes */

test('editAttrs escapes values into safe attributes', () => {
  const a = editAttrs({ kind: 'file', target: 'a"b.js', label: '<script>' });
  assert.ok(a.includes('data-edit-kind="file"'));
  assert.ok(a.includes('&quot;'), 'quotes must not break out of the attribute');
  assert.ok(!a.includes('<script>'));
});

test('editAttrs omits optional fields it was not given', () => {
  const a = editAttrs({ kind: 'issue', target: 4 });
  assert.ok(!a.includes('data-edit-label'));
  assert.ok(!a.includes('data-edit-line'));
});

test('editMeta emits all three declaration tags', () => {
  const m = editMeta({ kind: 'generator', target: 'build.js', label: 'x' });
  assert.ok(m.includes('name="edit-kind" content="generator"'));
  assert.ok(m.includes('name="edit-target" content="build.js"'));
  assert.ok(m.includes('name="edit-label"'));
});

/* ------------------------------------------------------------ the script */

test('the script is inert unless the host or query says otherwise', () => {
  const js = editModeScript();
  assert.ok(/\/\^edit\\\./.test(js) || js.includes('^edit\\.'), 'checks for an edit. host');
  assert.ok(js.includes('edit=1'), 'supports the local override');
  assert.ok(js.includes('return;'), 'bails out early on the public site');
});

test('the script embeds the shared URL resolver rather than a copy', () => {
  const js = editModeScript();
  assert.ok(js.includes('function resolveEditUrl'), 'resolver is embedded via toString');
  assert.equal((js.match(/https:\/\/github\.dev\//g) || []).length, 1,
    'exactly one definition — a second would be a drifting duplicate');
});

/* --------------------------------------------- generated pages target right */

test('every generated page declares an edit source', () => {
  for (const p of ['index.html', 'teams.html', 'submit.html', 'about.html', 'contact.html', 'privacy.html', 'developers.html']) {
    const html = read(p);
    assert.ok(html.includes('name="edit-kind"'), `${p} declares a kind`);
    assert.ok(html.includes('/edit-mode.js'), `${p} loads the script`);
  }
});

test('trust anchors point at their generator source, not their HTML', () => {
  const html = read('about.html');
  assert.ok(html.includes('content="src/pages-extra.js"'));
  assert.ok(!html.includes('content="about.html"'), 'editing build output would be discarded');
});

test('the directory and showcase point at build.js', () => {
  assert.ok(read('teams.html').includes('content="build.js"'));
  assert.ok(read('index.html').includes('content="build.js"'));
});

test('the handbook points at handbook.html, which is hand-maintained', () => {
  const html = read('handbook.html');
  assert.ok(html.includes('name="edit-target" content="handbook.html"'));
  assert.ok(html.includes('name="edit-kind" content="file"'));
});

/* ------------------------------------------------------------- line map */

test('the handbook line map resolves real section ids to line numbers', () => {
  const map = JSON.parse(read('edit-map.json'));
  assert.equal(map.file, 'handbook.html');
  const lines = read('handbook.html').split('\n');
  for (const id of ['challenge', 'judging', 'g1', 'g4']) {
    const n = map.sections[id];
    assert.ok(typeof n === 'number', `${id} has a line number`);
    assert.ok(lines[n - 1].includes(`id="${id}"`), `line ${n} really contains id="${id}"`);
  }
});

/* ------------------------------------- edit chrome never ships to the public */

test('no page renders edit chrome without the script deciding to', () => {
  for (const p of ['handbook.html', 'index.html', 'teams.html']) {
    const html = read(p);
    assert.ok(!html.includes('class="em-bar"'), `${p} has no pre-rendered edit bar`);
    assert.ok(!html.includes('em-pill'), `${p} has no pre-rendered edit pills`);
  }
});

/* ------------------------------------------------- executing the script */

/**
 * A DOM small enough to run the script against. The browser preview was not
 * usable in this environment, so activation is verified by execution rather
 * than by reading the source.
 */
function fakeDom(hostname, search, metas) {
  const made = [];
  const el = (tag) => {
    const e = {
      tagName: tag, children: [], attrs: {}, style: {}, classList: {
        _s: new Set(),
        add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); },
        toggle(c) { if (this._s.has(c)) { this._s.delete(c); return false; } this._s.add(c); return true; },
      },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
      hasAttribute(k) { return this.attrs[k] !== undefined; },
      appendChild(c) { this.children.push(c); return c; },
      insertBefore(c) { this.children.unshift(c); return c; },
      insertAdjacentElement(_, c) { made.push(c); return c; },
      addEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      set innerHTML(v) { this._html = v; },
      get innerHTML() { return this._html || ''; },
      set textContent(v) { this._text = v; },
      get textContent() { return this._text || ''; },
    };
    made.push(e);
    return e;
  };
  const byId = {};
  const doc = {
    head: el('head'),
    body: Object.assign(el('body'), { firstChild: null }),
    createElement: el,
    querySelector(sel) {
      const m = /meta\[name="([^"]+)"\]/.exec(sel);
      if (m) return metas[m[1]] === undefined ? null : { getAttribute: () => metas[m[1]] };
      return null;
    },
    querySelectorAll() { return []; },
    getElementById(id) { return byId[id] || (byId[id] = el('a')); },
  };
  return { doc, made, byId };
}

function runScript(hostname, metas, search = '') {
  const { doc, byId } = fakeDom(hostname, search, metas);
  const fn = new Function('document', 'location', 'fetch', 'window', editModeScript());
  fn(doc, { hostname, search, pathname: '/teams.html' }, () => ({ then: () => ({ then: () => ({ catch() {} }), catch() {} }) }), {});
  return { doc, byId, activated: doc.body.children.length > 0 };
}

test('the script does nothing on the public host', () => {
  const r = runScript('www.buildspace.tv', { 'edit-kind': 'file', 'edit-target': 'index.html' });
  assert.equal(r.activated, false, 'no edit bar may appear on the live site');
});

test('the script activates on the edit host and targets the declared source', () => {
  const r = runScript('edit.buildspace.tv', {
    'edit-kind': 'generator', 'edit-target': 'build.js', 'edit-label': 'build.js — teamsPage()',
  });
  assert.equal(r.activated, true);
  assert.equal(r.byId.emEdit.href, `https://github.com/${REPO_SLUG}/edit/main/build.js`);
});

test('an issue-backed page sends the editor to the issue', () => {
  const r = runScript('edit.buildspace.tv', { 'edit-kind': 'issue', 'edit-target': '7' });
  assert.equal(r.byId.emEdit.href, `https://github.com/${REPO_SLUG}/issues/7`);
  assert.equal(r.byId.emView.href, `https://github.com/${REPO_SLUG}/issues/7`, 'view source also goes to the issue');
});

test('the ?edit=1 override works for local testing', () => {
  const r = runScript('localhost', { 'edit-kind': 'file', 'edit-target': 'index.html' }, '?edit=1');
  assert.equal(r.activated, true);
});
