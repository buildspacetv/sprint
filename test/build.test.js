/**
 * Unit tests for the generator's helpers.
 *
 *   node --test
 *
 * These matter more than usual: every value they handle comes from a public
 * GitHub issue that anyone can file, and the output is HTML served from our
 * own origin. A regression here is a stored XSS, not a cosmetic bug.
 */

const test = require('node:test');
const assert = require('node:assert');

const {
  esc, jsonForScript, safeSlug, safeUrl, prose, videoEmbed, ghUser, track,
  resolveTeam, coverFor,
} = require('../build.js');

/* ------------------------------------------------------------------ esc */

test('esc neutralizes every HTML-significant character', () => {
  assert.equal(esc('<script>'), '&lt;script&gt;');
  assert.equal(esc('a & b'), 'a &amp; b');
  assert.equal(esc('" onmouseover="x'), '&quot; onmouseover=&quot;x');
  assert.equal(esc("it's"), 'it&#39;s');
  // & must be escaped first or the other replacements get double-encoded
  assert.equal(esc('&lt;'), '&amp;lt;');
});

test('esc handles null and undefined without throwing', () => {
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
});

/* --------------------------------------------------------- jsonForScript */

test('jsonForScript prevents a </script> breakout', () => {
  const out = jsonForScript('</script><img src=x onerror=alert(1)>');
  assert.ok(!out.includes('</script>'), 'must not contain a literal closing tag');
  assert.ok(!out.includes('<'), 'all angle brackets must be escaped');
  assert.equal(JSON.parse(out), '</script><img src=x onerror=alert(1)>',
    'value must survive the round trip unchanged');
});

test('jsonForScript escapes line separators that would break JS parsing', () => {
  const out = jsonForScript('a b c');
  assert.ok(!out.includes(' '));
  assert.ok(!out.includes(' '));
  assert.equal(JSON.parse(out), 'a b c');
});

test('jsonForScript escapes ampersands and keeps quotes safe', () => {
  assert.ok(!jsonForScript('a & b').includes('&'));
  assert.equal(JSON.parse(jsonForScript('say "hi"')), 'say "hi"');
});

/* ------------------------------------------------------------- safeSlug */

test('safeSlug strips anything that could escape a path or URL', () => {
  assert.equal(safeSlug('../../etc/passwd'), 'etcpasswd');
  assert.equal(safeSlug('a/b'), 'ab');
  assert.equal(safeSlug('Hello World'), 'helloworld');
  assert.equal(safeSlug('good-slug-1'), 'good-slug-1');
  assert.equal(safeSlug('%2e%2e'), '2e2e');
});

test('safeSlug trims leading and trailing dashes and bounds length', () => {
  assert.equal(safeSlug('---x---'), 'x');
  assert.ok(safeSlug('a'.repeat(200)).length <= 60);
  assert.equal(safeSlug(null), '');
});

/* -------------------------------------------------------------- safeUrl */

test('safeUrl accepts only https', () => {
  assert.equal(safeUrl('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(safeUrl('http://example.com/a.png'), null);
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,<script>'), null);
  assert.equal(safeUrl('//evil.example.com'), null);
  assert.equal(safeUrl(''), null);
  assert.equal(safeUrl(null), null);
});

test('safeUrl rejects malformed URLs that pass the prefix check', () => {
  assert.equal(safeUrl('https://'), null);
});

test('safeUrl is not fooled by leading whitespace or case', () => {
  assert.equal(safeUrl('  https://example.com/x  '), 'https://example.com/x');
  assert.ok(safeUrl('HTTPS://example.com/x'));
});

/* ---------------------------------------------------------------- prose */

test('prose escapes untrusted text and splits paragraphs', () => {
  const out = prose('one\n\n<script>alert(1)</script>');
  assert.ok(out.includes('<p>one</p>'));
  assert.ok(out.includes('&lt;script&gt;'));
  assert.ok(!out.includes('<script>'));
});

test('prose converts single newlines to breaks, not new paragraphs', () => {
  const out = prose('a\nb');
  assert.equal((out.match(/<p>/g) || []).length, 1);
  assert.ok(out.includes('<br>'));
});

test('prose returns empty string for empty input', () => {
  assert.equal(prose(''), '');
  assert.equal(prose(null), '');
});

/* ----------------------------------------------------------- videoEmbed */

test('videoEmbed builds embeds for the supported hosts', () => {
  assert.ok(videoEmbed('https://youtu.be/dQw4w9WgXcQ').includes('youtube.com/embed/dQw4w9WgXcQ'));
  assert.ok(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ').includes('/embed/dQw4w9WgXcQ'));
  assert.ok(videoEmbed('https://vimeo.com/123456789').includes('player.vimeo.com/video/123456789'));
  assert.ok(videoEmbed('https://www.loom.com/share/abc123').includes('loom.com/embed/abc123'));
});

test('videoEmbed plays direct media files in a native player', () => {
  const out = videoEmbed('https://example.com/demo.mp4');
  assert.ok(out.includes('<video'));
  assert.ok(out.includes('controls'));
});

test('videoEmbed refuses non-https and unknown schemes', () => {
  assert.equal(videoEmbed('javascript:alert(1)'), '');
  assert.equal(videoEmbed('http://youtu.be/abc123'), '');
  assert.equal(videoEmbed(null), '');
});

test('videoEmbed falls back to a plain link for unknown https hosts', () => {
  const out = videoEmbed('https://example.com/watch/thing');
  assert.ok(out.includes('<a href='));
  assert.ok(!out.includes('<iframe'));
});

/* --------------------------------------------------------------- ghUser */

test('ghUser accepts valid handles in the forms people actually type', () => {
  assert.equal(ghUser('ada'), 'ada');
  assert.equal(ghUser('@ada'), 'ada');
  assert.equal(ghUser('https://github.com/ada'), 'ada');
  assert.equal(ghUser('https://github.com/ada/repo'), 'ada');
  assert.equal(ghUser('a-b-c'), 'a-b-c');
});

test('ghUser rejects anything that is not a GitHub username', () => {
  assert.equal(ghUser('../../etc/passwd'), null);
  assert.equal(ghUser('evil" onload="alert(1)'), null);
  assert.equal(ghUser('-leading'), null);
  assert.equal(ghUser('trailing-'), null);
  assert.equal(ghUser('a--b'), null, 'consecutive dashes are not valid');
  assert.equal(ghUser('a'.repeat(40)), null, 'max length is 39');
  assert.equal(ghUser(''), null);
  assert.equal(ghUser(null), null);
});

/* ---------------------------------------------------------------- track */

test('track maps known values and degrades safely', () => {
  assert.equal(track('sim').label, 'Sim only');
  assert.equal(track('hardware').label, 'Hardware only');
  assert.equal(track('both').label, 'Sim and real');
  assert.equal(track('nonsense').label, 'Unspecified');
  assert.equal(track(null).label, 'Unspecified');
  assert.equal(track('__proto__').label, 'Unspecified', 'prototype keys must not leak a track');
});

/* ---------------------------------------------------------- resolveTeam */

const TEAMS = [
  { slug: 'practice-makes-perfect', name: 'Practice Makes Perfect', issue: 1 },
  { slug: 'gripper-gang', name: 'The Gripper Gang', issue: 7 },
];

test('resolveTeam matches by name, case and punctuation insensitively', () => {
  assert.equal(resolveTeam({ teamRef: 'Practice Makes Perfect' }, TEAMS).issue, 1);
  assert.equal(resolveTeam({ teamRef: 'practice makes PERFECT' }, TEAMS).issue, 1);
  assert.equal(resolveTeam({ teamRef: 'practice-makes-perfect' }, TEAMS).issue, 1);
  assert.equal(resolveTeam({ teamRef: '  The Gripper Gang  ' }, TEAMS).issue, 7);
});

test('resolveTeam matches by issue number with or without a hash', () => {
  assert.equal(resolveTeam({ teamRef: '1' }, TEAMS).slug, 'practice-makes-perfect');
  assert.equal(resolveTeam({ teamRef: '#7' }, TEAMS).slug, 'gripper-gang');
});

test('resolveTeam returns null rather than guessing', () => {
  assert.equal(resolveTeam({ teamRef: 'No Such Team' }, TEAMS), null);
  assert.equal(resolveTeam({ teamRef: '#999' }, TEAMS), null);
  assert.equal(resolveTeam({ teamRef: '' }, TEAMS), null);
  assert.equal(resolveTeam({}, TEAMS), null);
  assert.equal(resolveTeam({ teamRef: 'x' }, []), null);
});

/* -------------------------------------------------------------- coverFor */

test('coverFor prefers a photo, then a video thumbnail, then a placeholder', () => {
  assert.ok(coverFor({ images: ['https://example.com/a.png'] }).includes('example.com/a.png'));
  assert.ok(coverFor({ images: [], video: 'https://youtu.be/dQw4w9WgXcQ' }).includes('i.ytimg.com'));
  assert.ok(coverFor({ images: [], video: null, title: 'Desk Duster' }).includes('DD'),
    'with nothing to derive, the card falls back to a lettered tile');
});

test('coverFor drops unsafe image URLs instead of rendering them', () => {
  const out = coverFor({ images: ['javascript:alert(1)', 'https://example.com/ok.png'] });
  assert.ok(!out.includes('javascript:'));
  assert.ok(out.includes('example.com/ok.png'));
});

/* --------------------------------------------------------------- roster */

const { roster, teamPage, projectPage } = require('../build.js');

test('roster links each member to their GitHub profile', () => {
  const out = roster([{ name: 'Ada Lovelace', github: 'ada' }]);
  assert.ok(out.includes('href="https://github.com/ada"'));
  assert.ok(out.includes('github.com/ada.png'), 'avatar comes from the handle');
  assert.ok(out.includes('Ada Lovelace'));
  assert.ok(out.includes('@ada'));
});

test('roster renders a member with no handle without a dead link', () => {
  const out = roster([{ name: 'No Handle', github: null }]);
  assert.ok(out.includes('No Handle'));
  assert.ok(!out.includes('<a '), 'must not emit an anchor with nowhere to go');
});

test('roster returns nothing for an empty team', () => {
  assert.equal(roster([]), '');
  assert.equal(roster(null), '');
});

/* ---------------------------------------------------- team <-> project */

const TEAM = {
  slug: 'gripper-gang', name: 'The Gripper Gang', pitch: 'Vials.', open: true,
  looking: ['CV'], have: ['RL'], members: [{ name: 'Ada', github: 'ada' }],
  contact: '@ada', issue: 7,
};
const PROJ = {
  slug: 'vial-sorter', title: 'Vial Sorter', tagline: 'Sorts vials.', track: 'both',
  robots: ['SO-101'], description: 'x', images: [], team: [], issue: 30,
};

test('a team page lists the projects that reference it', () => {
  const out = teamPage(TEAM, [PROJ]);
  assert.ok(out.includes('href="/projects/vial-sorter.html"'));
  assert.ok(out.includes('Vial Sorter'));
  assert.ok(!out.includes('No project submitted yet'));
});

test('a team page shows an empty state before the team submits', () => {
  const out = teamPage(TEAM, []);
  assert.ok(out.includes('No project submitted yet'));
});

test('a team page links back to the directory and the join thread', () => {
  const out = teamPage(TEAM, []);
  assert.ok(out.includes('href="/teams.html"'));
  assert.ok(out.includes('/issues/7'));
});

test('a project page links to its team page, not an anchor', () => {
  const out = projectPage(PROJ, TEAM);
  assert.ok(out.includes('href="/teams/gripper-gang.html"'));
  assert.ok(!out.includes('teams.html#team-'), 'the old anchor form should be gone');
});

test('a project page with no team omits the row rather than linking nowhere', () => {
  const out = projectPage(PROJ, null);
  assert.ok(!out.includes('<dt>Team</dt>'));
});

test('team and project pages escape a hostile team name identically', () => {
  const evil = { ...TEAM, name: '</script><img src=x onerror=alert(1)>' };
  for (const out of [teamPage(evil, []), projectPage(PROJ, evil)]) {
    assert.ok(!out.includes('<img src=x onerror'), 'must never emit the raw payload');
    assert.equal((out.match(/<script/g) || []).length, (out.match(/<\/script>/g) || []).length,
      'script tags must stay balanced');
  }
});
