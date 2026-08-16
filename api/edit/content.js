/**
 * GET  /api/edit/content?target=issue:12            -> the editable fields of an issue
 * POST /api/edit/content                            -> write one field
 *
 * Two write targets, because the site has two kinds of content:
 *
 *   issue:<n>#<Field label>   a team or project submission. The issue body is
 *                             already a list of "### Field" sections, so one
 *                             section is replaced and the rest is untouched.
 *
 *   file:<path>               hand-written prose in the repo. The client sends
 *                             the exact text it is replacing; the server rewrites
 *                             it only if that text occurs EXACTLY ONCE in the
 *                             file. Zero matches means the page interpolates a
 *                             value and is not editable this way; more than one
 *                             means the edit is ambiguous. Both are refused with
 *                             an explanation rather than guessed at.
 *
 * Auth: a shared passcode in `x-edit-key`, matched against EDIT_KEY — the same
 * shape as the judging API. Commits are made by the server's token, so the
 * editor's name is recorded in the commit message and the issue edit instead:
 * this is a small trusted set of organizers, not public authorship.
 *
 * Writes are restricted to an allowlist. Nothing under .github/ or api/ can be
 * touched from a browser, so a leaked passcode cannot rewrite the workflow that
 * deploys the site or the function that authorizes edits.
 */

const REPO = process.env.EDIT_REPO || 'buildspacetv/sprint';
const BRANCH = process.env.EDIT_BRANCH || 'main';

// Only the two files the site actually marks as editable. build.js and
// agent-files.js were here and should not have been: the workflow runs
// `node build.js`, so write access to them is write access to CI.
const WRITABLE = [
  /^index\.html$/,
  /^src\/pages-extra\.js$/,
];

/**
 * The prose being replaced lives inside JavaScript template literals, so a
 * value containing a backtick or "${" would close the literal and everything
 * after it becomes code — which the deploy workflow then executes. Editing a
 * paragraph must not be a way to run something in CI, so these characters are
 * refused outright rather than escaped: no legitimate sentence on this site
 * needs them, and escaping is the kind of thing that gets subtly wrong.
 */
const UNSAFE_IN_SOURCE = [
  ['`', 'a backtick'],
  ['${', 'a ${ ... } placeholder'],
  ['\\', 'a backslash'],
  ['</script', 'a closing script tag'],
];

function unsafeReason(value, filePath) {
  for (const [needle, human] of UNSAFE_IN_SOURCE) {
    if (value.includes(needle)) return human;
  }
  // index.html is served as-is, so markup in a prose edit is markup on the page.
  if (/^index\.html$/.test(filePath) && /[<>]/.test(value)) return 'an angle bracket';
  return null;
}

const MAX_FIELD = 20000;

function send(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).send(JSON.stringify(body, null, 2));
}

function fail(res, status, code, message, resolution) {
  return send(res, status, { error: { code, message, ...(resolution ? { resolution } : {}) } });
}

function authorized(req) {
  const expected = process.env.EDIT_KEY;
  if (!expected) return false;
  const got = req.headers['x-edit-key'];
  return typeof got === 'string' && got.length === expected.length && got === expected;
}

function token() { return process.env.EDIT_GITHUB_TOKEN || process.env.JUDGING_GITHUB_TOKEN; }

async function gh(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token()}`,
      'User-Agent': 'physical-ai-sprint-edit',
      ...(init && init.headers),
    },
  });
  return res;
}

/* ------------------------------------------------------------------ issue */

/** Split an issue-form body into ordered { label, value } sections. */
function parseSections(body) {
  const out = [];
  const text = String(body || '').replace(/\r\n/g, '\n');
  const re = /^### +(.+)$/gm;
  let m; const marks = [];
  while ((m = re.exec(text))) marks.push({ label: m[1].trim(), start: m.index, after: m.index + m[0].length });
  marks.forEach((mk, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
    out.push({ label: mk.label, value: text.slice(mk.after, end).replace(/^\n+/, '').replace(/\n+$/, '') });
  });
  return out;
}

function rebuild(sections) {
  return sections.map((s) => `### ${s.label}\n\n${s.value || '_No response_'}`).join('\n\n') + '\n';
}

async function readIssue(res, n) {
  const r = await gh(`https://api.github.com/repos/${REPO}/issues/${n}`);
  if (r.status === 404) return fail(res, 404, 'not_found', `Issue #${n} does not exist.`);
  if (!r.ok) return fail(res, 502, 'github_error', `GitHub returned ${r.status} reading issue #${n}.`);
  const issue = await r.json();

  const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  if (!labels.includes('team') && !labels.includes('submission')) {
    return fail(res, 403, 'not_editable',
      `Issue #${n} is not a team or project submission.`,
      'Only issues labelled `team` or `submission` back a page on this site.');
  }
  return send(res, 200, {
    object: 'issue',
    number: issue.number,
    title: issue.title,
    labels,
    url: issue.html_url,
    fields: parseSections(issue.body),
  });
}

async function writeIssue(res, n, field, value, editor) {
  const r = await gh(`https://api.github.com/repos/${REPO}/issues/${n}`);
  if (!r.ok) return fail(res, 502, 'github_error', `GitHub returned ${r.status} reading issue #${n}.`);
  const issue = await r.json();

  const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
  if (!labels.includes('team') && !labels.includes('submission')) {
    return fail(res, 403, 'not_editable', `Issue #${n} is not a team or project submission.`);
  }

  const sections = parseSections(issue.body);
  const target = sections.find((s) => s.label.toLowerCase() === String(field).toLowerCase());
  if (!target) {
    return fail(res, 404, 'no_such_field',
      `Issue #${n} has no field called "${field}".`,
      `Fields present: ${sections.map((s) => s.label).join(', ') || 'none'}.`);
  }
  if (target.value === value) return send(res, 200, { ok: true, unchanged: true });

  target.value = value;
  const patch = await gh(`https://api.github.com/repos/${REPO}/issues/${n}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body: rebuild(sections) }),
  });
  if (!patch.ok) {
    return fail(res, 502, 'github_error', `GitHub returned ${patch.status} updating issue #${n}.`,
      'Nothing was changed. Try again, or edit the issue directly on GitHub.');
  }
  return send(res, 200, {
    ok: true, kind: 'issue', issue: n, field: target.label, editor: editor || null,
    note: 'The site rebuilds from this issue within a couple of minutes.',
  });
}

/* ------------------------------------------------------------------- file */

async function writeFile(res, filePath, oldText, newText, editor) {
  if (!WRITABLE.some((re) => re.test(filePath))) {
    return fail(res, 403, 'path_not_writable',
      `${filePath} cannot be edited from the browser.`,
      'Only content files are writable here. Use the GitHub editor for anything else.');
  }
  const unsafe = unsafeReason(newText, filePath);
  if (unsafe) {
    return fail(res, 400, 'unsafe_content',
      `Text edited here cannot contain ${unsafe}.`,
      'Use "Edit this page" to open the file on GitHub, where the change can be reviewed before it goes live.');
  }
  if (!oldText) {
    return fail(res, 400, 'missing_old_text',
      'A file edit must say exactly which text it replaces.',
      'Send oldText with the text currently on the page.');
  }

  const r = await gh(`https://api.github.com/repos/${REPO}/contents/${filePath}?ref=${BRANCH}`);
  if (!r.ok) return fail(res, 502, 'github_error', `GitHub returned ${r.status} reading ${filePath}.`);
  const meta = await r.json();
  const content = Buffer.from(meta.content || '', 'base64').toString('utf8');

  // Exactly one match, or refuse. A guess here silently corrupts the page.
  let count = 0; let idx = content.indexOf(oldText);
  while (idx !== -1) { count++; idx = content.indexOf(oldText, idx + 1); }

  if (count === 0) {
    return fail(res, 409, 'text_not_found',
      'This text cannot be changed here.',
      'The site puts it together from other information rather than storing these exact words. Use "Edit this page" to open the file on GitHub.');
  }
  if (count > 1) {
    return fail(res, 409, 'text_ambiguous',
      `These exact words appear ${count} times on the site, so it is not clear which one you meant.`,
      'Use "Edit this page" to open the file on GitHub and change the right one.');
  }

  const updated = content.replace(oldText, newText);
  const put = await gh(`https://api.github.com/repos/${REPO}/contents/${filePath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `Edit ${filePath} from the site${editor ? ` (${editor})` : ''}`,
      content: Buffer.from(updated, 'utf8').toString('base64'),
      sha: meta.sha, // a concurrent edit makes this 409 instead of silently winning
      branch: BRANCH,
    }),
  });
  if (put.status === 409) {
    return fail(res, 409, 'conflict',
      'Someone else changed this page while you were editing.',
      'Reload to see their version, then make your change again.');
  }
  if (!put.ok) {
    return fail(res, 502, 'github_error', `GitHub returned ${put.status} writing ${filePath}.`,
      'Nothing was committed.');
  }
  return send(res, 200, {
    ok: true, kind: 'file', path: filePath, editor: editor || null,
    note: 'The site rebuilds and redeploys within a couple of minutes.',
  });
}

/* ---------------------------------------------------------------- handler */

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!token()) {
    return fail(res, 503, 'not_configured',
      'No GitHub token is configured for editing.',
      'Set EDIT_GITHUB_TOKEN in the Vercel project environment variables.');
  }
  if (!process.env.EDIT_KEY) {
    return fail(res, 503, 'not_configured',
      'EDIT_KEY is not set, so the edit API refuses to accept writes.',
      'Set EDIT_KEY in the Vercel project environment variables and share it with the editors.');
  }
  if (!authorized(req)) {
    return fail(res, 401, 'unauthorized', 'Missing or incorrect edit key.',
      'Send the shared edit passcode in the x-edit-key header.');
  }

  try {
    if (req.method === 'GET') {
      const target = String((req.query && req.query.target) || '');
      const m = /^issue:(\d+)$/.exec(target);
      if (!m) {
        return fail(res, 400, 'bad_target', 'Expected ?target=issue:<number>.');
      }
      return await readIssue(res, Number(m[1]));
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return fail(res, 400, 'invalid_json', 'Request body is not valid JSON.'); }
      }
      if (!body || typeof body !== 'object') return fail(res, 400, 'invalid_body', 'Expected a JSON object.');

      const target = String(body.target || '');
      const value = String(body.value == null ? '' : body.value);
      const editor = String(body.editor || '').slice(0, 80);
      if (value.length > MAX_FIELD) {
        return fail(res, 413, 'too_long', `Content is longer than the ${MAX_FIELD} character limit.`);
      }

      const issueMatch = /^issue:(\d+)#(.+)$/.exec(target);
      if (issueMatch) return await writeIssue(res, Number(issueMatch[1]), issueMatch[2], value, editor);

      const fileMatch = /^file:(.+)$/.exec(target);
      if (fileMatch) return await writeFile(res, fileMatch[1], String(body.oldText || ''), value, editor);

      return fail(res, 400, 'bad_target',
        'Expected target of "issue:<number>#<Field>" or "file:<path>".');
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return fail(res, 405, 'method_not_allowed', `${req.method} is not supported here.`);
  } catch (err) {
    return fail(res, 502, 'edit_failed', 'The edit could not be completed.',
      'Nothing was changed. Use "Edit this page" to make the change on GitHub directly.');
  }
};
