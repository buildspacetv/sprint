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
  const u = resolveEditUrl(REPO_SLUG, 'main', 'file', 'index.html', 867);
  assert.equal(u, `https://github.dev/${REPO_SLUG}/blob/main/index.html#L867`);
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
  assert.equal(viewSourceUrl(REPO_SLUG, 'main', 'file', 'index.html', 5),
    `https://github.com/${REPO_SLUG}/blob/main/index.html#L5`);
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
  for (const p of ['teams.html', 'showcase.html', 'submit.html', 'about.html', 'contact.html', 'privacy.html', 'developers.html']) {
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
  assert.ok(read('showcase.html').includes('content="build.js"'));
});

test('the handbook points at index.html, which is hand-maintained', () => {
  const html = read('index.html');
  assert.ok(html.includes('name="edit-target" content="index.html"'));
  assert.ok(html.includes('name="edit-kind" content="file"'));
});

/* ------------------------------------------------------------- line map */

test('the handbook line map resolves real section ids to line numbers', () => {
  const map = JSON.parse(read('edit-map.json'));
  assert.equal(map.file, 'index.html');
  const lines = read('index.html').split('\n');
  for (const id of ['challenge', 'judging', 'g1', 'g4']) {
    const n = map.sections[id];
    assert.ok(typeof n === 'number', `${id} has a line number`);
    assert.ok(lines[n - 1].includes(`id="${id}"`), `line ${n} really contains id="${id}"`);
  }
});

/* ------------------------------------- edit chrome never ships to the public */

test('no page renders edit chrome without the script deciding to', () => {
  for (const p of ['index.html', 'teams.html', 'showcase.html']) {
    const html = read(p);
    assert.ok(!html.includes('class="em-bar"'), `${p} has no pre-rendered edit bar`);
    assert.ok(!html.includes('em-pill'), `${p} has no pre-rendered edit pills`);
  }
});
