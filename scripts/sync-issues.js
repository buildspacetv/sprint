#!/usr/bin/env node
/**
 * Reads every open issue labelled `submission` and writes data/projects.json.
 *
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/name node scripts/sync-issues.js
 *
 * Zero dependencies — uses the REST API over global fetch (Node 18+).
 * Closed issues and issues whose `submission` label was removed drop out
 * automatically, which is how organizers pull a project from the showcase.
 */

const fs = require('fs');
const path = require('path');

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPOSITORY;
if (!REPO) {
  console.error('GITHUB_REPOSITORY is required (owner/name)');
  process.exit(1);
}

/* ------------------------------------------------------------- issue body */

/**
 * GitHub issue forms render as:
 *   ### Field label
 *
 *   value
 *
 * Returns a map of lowercased label -> value. "_No response_" becomes ''.
 */
function parseIssueForm(body) {
  const out = {};
  if (!body) return out;
  const parts = String(body).replace(/\r\n/g, '\n').split(/^### +/m);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    if (nl === -1) continue;
    const label = part.slice(0, nl).trim().toLowerCase();
    let value = part.slice(nl + 1).trim();
    if (/^_no response_$/i.test(value)) value = '';
    if (label) out[label] = value;
  }
  return out;
}

/** Pull every image/video URL out of a field: markdown, HTML, or bare. */
function extractUrls(text, exts) {
  if (!text) return [];
  const urls = new Set();
  const push = (u) => {
    if (!u) return;
    const clean = u.trim().replace(/[)\]},.]+$/, '');
    if (/^https:\/\//i.test(clean)) urls.add(clean);
  };
  // markdown image / link
  for (const m of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)/g)) push(m[1]);
  // html src=""
  for (const m of text.matchAll(/<(?:img|video|source)[^>]*src=["']([^"']+)["']/gi)) push(m[1]);
  // bare urls
  for (const m of text.matchAll(/https:\/\/[^\s<>"')\]]+/g)) push(m[0]);

  let list = Array.from(urls);
  if (exts) {
    const re = new RegExp(`\\.(${exts.join('|')})(\\?|$)`, 'i');
    // GitHub's asset CDN serves media from paths without extensions, so keep
    // those too rather than dropping a legitimate upload.
    list = list.filter((u) => re.test(u) || /githubusercontent\.com|github\.com\/user-attachments/i.test(u));
  }
  return list;
}

const TRACKS = {
  'sim only': 'sim',
  'hardware only': 'hardware',
  'sim and real': 'both',
};

function slugify(s, taken) {
  let base = String(s).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'project';
  let slug = base;
  let n = 2;
  while (taken.has(slug)) slug = `${base}-${n++}`;
  taken.add(slug);
  return slug;
}

function parseTeam(text) {
  if (!text) return [];
  return String(text).split('\n').map((line) => {
    const raw = line.replace(/^[-*\s]+/, '').trim();
    if (!raw) return null;
    const m = raw.match(/@([A-Za-z0-9-]{1,39})|github\.com\/([A-Za-z0-9-]{1,39})/);
    const handle = m ? (m[1] || m[2]) : null;
    let name = raw.replace(/\(?https?:\/\/\S+\)?/g, '').replace(/@[A-Za-z0-9-]+/g, '').replace(/[-–—,|]+$/, '').trim();
    if (!name) name = handle || raw;
    return { name, github: handle };
  }).filter(Boolean);
}

/* ----------------------------------------------------------------- github */

async function api(url) {
  const headers = { 'Accept': 'application/vnd.github+json', 'User-Agent': 'physical-ai-sprint-build' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${url}: ${await res.text()}`);
  return res.json();
}

async function issuesLabelled(label) {
  const issues = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await api(`https://api.github.com/repos/${REPO}/issues?labels=${label}&state=open&per_page=100&page=${page}`);
    issues.push(...batch.filter((i) => !i.pull_request));
    if (batch.length < 100) break;
  }
  return issues;
}

function writeJson(name, value) {
  const outPath = path.join(__dirname, '..', 'data', name);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(value, null, 2) + '\n');
}

async function syncTeams() {
  const issues = await issuesLabelled('team');
  const taken = new Set();
  const teams = issues
    .sort((a, b) => a.number - b.number)
    .map((issue) => {
      const f = parseIssueForm(issue.body);
      const name = (f['team name'] || issue.title.replace(/^\[team\]\s*/i, '')).trim();
      if (!name) return null;
      const list = (s) => (f[s] || '').split(',').map((x) => x.trim()).filter(Boolean);
      return {
        slug: slugify(name, taken),
        name,
        pitch: f['what you want to build'] || '',
        open: /^yes/i.test((f['are you looking for teammates?'] || '').trim()),
        looking: list('skills you are looking for'),
        have: list('skills already on the team'),
        members: parseTeam(f['members']),
        contact: (f['where to reach you'] || '').split('\n')[0].trim(),
        issue: issue.number,
        comments: issue.comments,
        updated: issue.updated_at,
      };
    })
    .filter(Boolean);

  writeJson('teams.json', { teams });
  console.log(`${teams.length} team(s) synced`);
}

async function main() {
  await syncTeams();

  const issues = await issuesLabelled('submission');

  const taken = new Set();
  const projects = issues
    .sort((a, b) => a.number - b.number)
    .map((issue) => {
      const f = parseIssueForm(issue.body);
      const title = (f['project name'] || issue.title.replace(/^\[project\]\s*/i, '')).trim();
      if (!title) return null;

      const videoField = f['demo video'] || '';
      const video = extractUrls(videoField, ['mp4', 'webm', 'mov'])[0]
        || (videoField.match(/https:\/\/\S*(?:youtu\.be|youtube\.com|vimeo\.com|loom\.com)\S*/i) || [])[0]
        || null;

      return {
        slug: slugify(title, taken),
        title,
        tagline: (f['one-line summary'] || '').split('\n')[0].trim(),
        track: TRACKS[(f['track'] || '').trim().toLowerCase()] || null,
        robots: (f['robots used'] || '').split(',').map((s) => s.trim()).filter(Boolean),
        description: f['description'] || '',
        video,
        images: extractUrls(f['photos'] || '', ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif']),
        repo: (f['code'] || '').trim().match(/https:\/\/\S+/)?.[0] || null,
        teamRef: (f['team'] || '').split('\n')[0].trim(),
        team: parseTeam(f['team members']),
        issue: issue.number,
        submitted: issue.created_at,
        updated: issue.updated_at,
      };
    })
    .filter(Boolean);

  writeJson('projects.json', { projects });
  console.log(`${projects.length} submission(s) synced`);
}

main().catch((err) => { console.error(err); process.exit(1); });
