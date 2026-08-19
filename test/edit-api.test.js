/**
 * Tests for the edit API's pure logic — the issue-body round trip and the
 * write allowlist. These are the parts where a bug corrupts content.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const src = fs.readFileSync(require('node:path').join(__dirname, '..', 'api/edit/content.js'), 'utf8');
// The module reads env at call time, so its helpers are exercised via a shim.
const sandbox = { module: { exports: {} }, process: { env: {} }, Buffer, fetch: async () => ({}) };
new Function('module', 'process', 'Buffer', 'fetch', src)(sandbox.module, sandbox.process, Buffer, sandbox.fetch);

// parseSections / rebuild are internal; re-derive them from the same source so
// the behaviour under test is the shipped behaviour.
const parseSections = new Function(`${src.match(/function parseSections[\s\S]*?\n}/)[0]}; return parseSections;`)();
const rebuild = new Function(`${src.match(/function rebuild[\s\S]*?\n}/)[0]}; return rebuild;`)();

const BODY = [
  '### What you want to build', '', 'Natural-language tasking for the SO-101.', '',
  '### Are you looking for teammates?', '', 'Yes — we have room', '',
  '### Skills you are looking for', '', '_No response_', '',
  '### Members', '', 'Ada @ada\nGrace @ghopper', '',
].join('\n');

test('an issue body splits into its form fields', () => {
  const s = parseSections(BODY);
  assert.equal(s.length, 4);
  assert.equal(s[0].label, 'What you want to build');
  assert.equal(s[0].value, 'Natural-language tasking for the SO-101.');
  assert.equal(s[3].value, 'Ada @ada\nGrace @ghopper', 'multi-line fields survive');
});

test('editing one field leaves every other field byte-identical', () => {
  const s = parseSections(BODY);
  s.find((x) => x.label === 'What you want to build').value = 'Something else entirely.';
  const out = parseSections(rebuild(s));
  assert.equal(out.find((x) => x.label === 'What you want to build').value, 'Something else entirely.');
  assert.equal(out.find((x) => x.label === 'Members').value, 'Ada @ada\nGrace @ghopper');
  assert.equal(out.find((x) => x.label === 'Are you looking for teammates?').value, 'Yes — we have room');
});

test('a round trip with no edit is stable', () => {
  const once = rebuild(parseSections(BODY));
  const twice = rebuild(parseSections(once));
  assert.equal(once, twice, 'rebuilding must converge, not drift on every save');
});

test('an emptied field becomes _No response_ rather than a blank heading', () => {
  const s = parseSections(BODY);
  s[0].value = '';
  assert.ok(rebuild(s).includes('_No response_'));
});

test('the write allowlist covers content and excludes infrastructure', () => {
  const WRITABLE = new Function(`${src.match(/const WRITABLE = \[[\s\S]*?\];/)[0]}; return WRITABLE;`)();
  const allowed = (p) => WRITABLE.some((re) => re.test(p));
  assert.ok(allowed('handbook.html'));
  assert.ok(allowed('src/pages-extra.js'));
  assert.ok(!allowed('.github/workflows/submissions.yml'), 'the deploy workflow must not be writable');
  assert.ok(!allowed('api/edit/content.js'), 'the edit API must not rewrite itself');
  assert.ok(!allowed('api/judging/scores.js'));
  assert.ok(!allowed('vercel.json'));
  assert.ok(!allowed('../../etc/passwd'));
});

/* ------------------------------------------- source-injection guard */

const unsafeReason = new Function(
  `${src.match(/const UNSAFE_IN_SOURCE = \[[\s\S]*?\];/)[0]}
   ${src.match(/function unsafeReason[\s\S]*?\n}/)[0]}
   return unsafeReason;`)();

test('a prose edit cannot break out of the template literal it lives in', () => {
  // The workflow runs `node build.js`, which requires this file — so a value
  // that closes the literal is arbitrary code execution in CI, not a typo.
  assert.ok(unsafeReason('hello `; require("child_process").execSync("id"); `', 'src/pages-extra.js'));
  assert.ok(unsafeReason('hello ${process.env.EDIT_GITHUB_TOKEN}', 'src/pages-extra.js'));
  assert.ok(unsafeReason('back\\slash', 'src/pages-extra.js'));
  assert.ok(unsafeReason('oops </script>', 'src/pages-extra.js'));
});

test('ordinary prose is allowed through', () => {
  assert.equal(unsafeReason('A one-day hackathon, free to attend — apply on Luma.', 'src/pages-extra.js'), null);
  assert.equal(unsafeReason("Teams of 1 to 5. You don't need to arrive with a team.", 'src/pages-extra.js'), null);
  assert.equal(unsafeReason('Cost: $0 USD (100% free)', 'src/pages-extra.js'), null,
    'a bare $ is fine — only ${ is a placeholder');
});

test('markup is refused in the handbook, which is served as written', () => {
  assert.ok(unsafeReason('<b>bold</b>', 'handbook.html'));
  assert.equal(unsafeReason('plain sentence', 'handbook.html'), null);
});

test('the allowlist no longer includes anything the workflow executes', () => {
  const WRITABLE = new Function(`${src.match(/const WRITABLE = \[[\s\S]*?\];/)[0]}; return WRITABLE;`)();
  const allowed = (p) => WRITABLE.some((re) => re.test(p));
  assert.ok(!allowed('build.js'), 'the workflow runs `node build.js`');
  assert.ok(!allowed('src/agent-files.js'));
  assert.ok(allowed('src/pages-extra.js'), 'the one file the site actually edits');
  assert.ok(allowed('handbook.html'));
});
