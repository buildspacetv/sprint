#!/usr/bin/env node
/**
 * Pulls a published Google Doc into data/doc.json for build.js to render.
 *
 *   DOC_URL=https://docs.google.com/document/d/e/2PACX-.../pub node scripts/sync-doc.js
 *
 * Zero dependencies, same as everything else here — plain fetch and a small
 * HTML reader, so the project stays a static deploy with no package.json.
 *
 * Two things this deliberately does NOT do:
 *
 *   1. It does not authenticate. The doc must be published to web, which makes
 *      it readable without a credential. That removes a secret from the repo,
 *      a key to rotate, and a whole class of "it worked until the token
 *      expired at 3pm on event day" failures. A private doc would need a
 *      service account instead — see the README.
 *
 *   2. It does not write unless the content actually changed. A 15-minute cron
 *      that commits every run would push ~96 commits a day, and Vercel builds
 *      on every push. The content hash in data/doc.json is what stops that.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUT = path.join(__dirname, '..', 'data', 'doc.json');
const DOC_URL = process.env.DOC_URL || '';

/* ------------------------------------------------------------------ parse */

const decode = (s) => String(s)
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

const strip = (html) => decode(String(html).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/**
 * Read a published Doc's HTML into an ordered list of blocks.
 *
 * Google's published HTML is deeply nested and class-driven, so this reads the
 * few structures that carry meaning — headings, paragraphs, list items — and
 * throws the rest away. Anything richer (tables, images, formatting) is
 * deliberately not carried across: a doc is a content source here, not a
 * layout source.
 */
function parseDoc(html) {
  // The body is all that matters; the head is Google's own styling.
  const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [, html])[1];

  const blocks = [];
  const re = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    const tag = m[1].toLowerCase();
    const text = strip(m[2]);
    if (!text) continue;
    if (tag === 'li') blocks.push({ type: 'item', text });
    else if (tag === 'p') blocks.push({ type: 'text', text });
    else blocks.push({ type: 'heading', level: Number(tag[1]), text });
  }

  // Google wraps the title in the first heading; keep it separately so the
  // renderer can choose whether to show it.
  const title = (blocks.find((b) => b.type === 'heading') || {}).text || '';
  return { title, blocks };
}

/* -------------------------------------------------------------------- run */

async function main() {
  if (!DOC_URL) {
    console.error('DOC_URL is not set. Publish the doc to the web (File > Share > Publish to web)');
    console.error('and pass the resulting /d/e/2PACX-.../pub URL as DOC_URL.');
    process.exit(1);
  }

  const res = await fetch(DOC_URL, {
    redirect: 'follow',
    headers: { 'User-Agent': 'physical-ai-sprint-doc-sync' },
  });

  if (!res.ok) {
    console.error(`Fetch failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const html = await res.text();

  // A doc that is not actually published returns Google's sign-in page with a
  // 200 in some flows, so check the body rather than trusting the status.
  if (/accounts\.google\.com|Sign in|ServiceLogin/i.test(html) && !/<h[1-6]/i.test(html)) {
    console.error('Got a Google sign-in page, not a document.');
    console.error('The doc is probably not published to web, or DOC_URL is the /edit link.');
    process.exit(1);
  }

  const parsed = parseDoc(html);
  if (!parsed.blocks.length) {
    console.error('Fetched the page but found no readable content — refusing to overwrite with nothing.');
    process.exit(1);
  }

  const hash = crypto.createHash('sha256')
    .update(parsed.blocks.map((b) => `${b.type}:${b.level || ''}:${b.text}`).join('\n'))
    .digest('hex');

  let previous = null;
  if (fs.existsSync(OUT)) {
    try { previous = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { previous = null; }
  }

  if (previous && previous.hash === hash) {
    console.log(`No change (${parsed.blocks.length} blocks, ${hash.slice(0, 12)}). Nothing written.`);
    return;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    source: DOC_URL,
    hash,
    // Deliberately not a timestamp: a fetchedAt that changes every run would
    // make the file differ on every cron tick and defeat the whole point.
    title: parsed.title,
    blocks: parsed.blocks,
  }, null, 2) + '\n');

  console.log(`Updated: ${parsed.blocks.length} blocks, ${hash.slice(0, 12)}${previous ? ` (was ${previous.hash.slice(0, 12)})` : ' (first sync)'}`);
}

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { parseDoc };
