/**
 * Unit tests for the issue-form parser.
 *
 * This is the rawest input in the system: whatever a participant types (or
 * later edits) into a public GitHub issue. The dropdown and "required" flags
 * only constrain the form at creation time — the author can edit the markdown
 * body afterwards — so the parser must not assume any field is well-formed.
 */

const test = require('node:test');
const assert = require('node:assert');

const { parseIssueForm, extractUrls, parseTeam, slugify, TRACKS } = require('../scripts/sync-issues.js');

/* -------------------------------------------------------- parseIssueForm */

const REAL_BODY = [
  '### Team name', '', 'Practice Makes Perfect', '',
  '### What you want to build', '', 'Practice Makes Perfect', '',
  '### Are you looking for teammates?', '', 'Yes — we have room', '',
  '### Skills you are looking for', '', '_No response_', '',
  '### Members', '', 'Colin Lowenberg @opencolin ', '',
].join('\n');

test('parseIssueForm reads the real issue body shape GitHub produces', () => {
  const f = parseIssueForm(REAL_BODY);
  assert.equal(f['team name'], 'Practice Makes Perfect');
  assert.equal(f['are you looking for teammates?'], 'Yes — we have room');
  assert.equal(f['members'], 'Colin Lowenberg @opencolin');
});

test('parseIssueForm turns _No response_ into an empty string', () => {
  assert.equal(parseIssueForm(REAL_BODY)['skills you are looking for'], '');
});

test('parseIssueForm lowercases labels so lookups are stable', () => {
  const f = parseIssueForm('### Project Name\n\nx');
  assert.equal(f['project name'], 'x');
});

test('parseIssueForm survives CRLF line endings', () => {
  const f = parseIssueForm('### Team name\r\n\r\nWindows Team\r\n');
  assert.equal(f['team name'], 'Windows Team');
});

test('parseIssueForm keeps multi-line values intact', () => {
  const f = parseIssueForm('### Members\n\nAda @ada\nGrace @ghopper\n\n### Code\n\nhttps://x.example');
  assert.equal(f['members'], 'Ada @ada\nGrace @ghopper');
  assert.equal(f['code'], 'https://x.example');
});

test('parseIssueForm does not split on ### inside a fenced code block', { skip: 'known limitation — see README' }, () => {
  const f = parseIssueForm('### Description\n\n```\n### not a heading\n```\n');
  assert.ok(f['description'].includes('### not a heading'));
});

test('parseIssueForm returns an empty map for empty or missing bodies', () => {
  assert.deepEqual(parseIssueForm(''), {});
  assert.deepEqual(parseIssueForm(null), {});
  assert.deepEqual(parseIssueForm(undefined), {});
});

/* ------------------------------------------------------------ parseTeam */

test('parseTeam reads the documented "Name @handle" form', () => {
  const t = parseTeam('Ada Lovelace @ada\nGrace Hopper @ghopper');
  assert.deepEqual(t, [
    { name: 'Ada Lovelace', github: 'ada' },
    { name: 'Grace Hopper', github: 'ghopper' },
  ]);
});

test('parseTeam tolerates the formats people actually paste', () => {
  assert.deepEqual(parseTeam('- Ada @ada'), [{ name: 'Ada', github: 'ada' }]);
  assert.deepEqual(parseTeam('* Ada @ada'), [{ name: 'Ada', github: 'ada' }]);
  assert.deepEqual(parseTeam('Ada — https://github.com/ada'), [{ name: 'Ada', github: 'ada' }]);
  assert.deepEqual(parseTeam('@ada'), [{ name: 'ada', github: 'ada' }]);
});

test('parseTeam keeps a member who gave no handle', () => {
  assert.deepEqual(parseTeam('Just A Name'), [{ name: 'Just A Name', github: null }]);
});

test('parseTeam ignores blank lines', () => {
  assert.equal(parseTeam('Ada @ada\n\n\nGrace @ghopper').length, 2);
  assert.deepEqual(parseTeam(''), []);
  assert.deepEqual(parseTeam(null), []);
});

/* ----------------------------------------------------------- extractUrls */

test('extractUrls finds markdown, HTML, and bare URLs', () => {
  const urls = extractUrls('![shot](https://example.com/a.png) <img src="https://example.com/b.png"> https://example.com/c.png',
    ['png']);
  assert.ok(urls.includes('https://example.com/a.png'));
  assert.ok(urls.includes('https://example.com/b.png'));
  assert.ok(urls.includes('https://example.com/c.png'));
});

test('extractUrls keeps GitHub attachment URLs that carry no file extension', () => {
  const gh = 'https://github.com/user-attachments/assets/6b1e0a34-1111-2222-3333-444455556666';
  assert.ok(extractUrls(gh, ['png', 'jpg']).includes(gh),
    'GitHub uploads are extensionless and must not be filtered out');
});

test('extractUrls rejects non-https', () => {
  const urls = extractUrls('http://example.com/a.png javascript:alert(1)', ['png']);
  assert.deepEqual(urls, []);
});

test('extractUrls strips trailing punctuation from bare URLs', () => {
  assert.ok(extractUrls('see https://example.com/a.png.', ['png']).includes('https://example.com/a.png'));
});

test('extractUrls de-duplicates repeats', () => {
  const u = 'https://example.com/a.png';
  assert.equal(extractUrls(`${u} ${u}`, ['png']).length, 1);
});

/* --------------------------------------------------------------- slugify */

test('slugify produces URL-safe slugs', () => {
  assert.equal(slugify('Vial Sorter 9000', new Set()), 'vial-sorter-9000');
  assert.equal(slugify('Ünïcödé & symbols!', new Set()), 'n-c-d-symbols');
  assert.equal(slugify('../../etc/passwd', new Set()), 'etc-passwd');
});

test('slugify de-duplicates collisions instead of overwriting a page', () => {
  const taken = new Set();
  assert.equal(slugify('Same Name', taken), 'same-name');
  assert.equal(slugify('Same Name', taken), 'same-name-2');
  assert.equal(slugify('Same Name', taken), 'same-name-3');
});

test('slugify falls back to a usable slug when nothing survives', () => {
  assert.equal(slugify('!!!', new Set()), 'project');
});

/* ---------------------------------------------------------------- TRACKS */

test('TRACKS maps the dropdown labels and resists prototype keys', () => {
  assert.equal(TRACKS['sim only'], 'sim');
  assert.equal(TRACKS['hardware only'], 'hardware');
  assert.equal(TRACKS['sim and real'], 'both');
  assert.equal(TRACKS['__proto__'], undefined,
    'a plain object literal would return Object.prototype here');
});

/* ------------------------------------- name comes from the issue title ---- */

test('a team name falls back to the issue title once the duplicate field is gone', () => {
  const f = parseIssueForm('### What you want to build\n\nRobots.');
  assert.equal(f['team name'], undefined, 'the field no longer exists on the form');
  // build path: (f['team name'] || issue.title.replace(/^\[team\]\s*/i, '')).trim()
  const name = (f['team name'] || '[Team] The Gripper Gang'.replace(/^\[team\]\s*/i, '')).trim();
  assert.equal(name, 'The Gripper Gang');
});

test('a project name falls back to the issue title', () => {
  const f = parseIssueForm('### One-line summary\n\nSorts vials.');
  assert.equal(f['project name'], undefined);
  const title = (f['project name'] || '[Project] Vial Sorter 9000'.replace(/^\[project\]\s*/i, '')).trim();
  assert.equal(title, 'Vial Sorter 9000');
});
