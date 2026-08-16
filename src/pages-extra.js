/**
 * Trust-anchor pages (/about, /contact, /privacy) and the developer portal.
 *
 * Ora checks these because they are what an agent reads to decide whether a
 * site is a real thing before recommending it. Each carries real content —
 * a stub with a heading is worse than nothing, because it looks answered.
 */

const { SITE, REPO, APPLY, DISCORD, EVENT_DATE } = require('./agent-files.js');

function aboutPage(page) {
  const body = `
<header class="pagehead narrow">
  <div class="pagehead-in">
    <p class="eyebrow">About</p>
    <h1>About the Sprint</h1>
    <p class="lede">A one-day hackathon at the intersection of AI and the physical world, held ${EVENT_DATE} alongside Actuate SF.</p>
  </div>
</header>

<div class="wrap narrow">
  <h2>What it is</h2>
  <p>The Physical AI Sprint gathers 100 to 125 engineers into teams of 1 to 5 for a single day of building. The brief is deliberately open-ended: we provide the robots, the simulation platform, and the building blocks, and each team decides what their system does and how it thinks.</p>
  <p>The framing is the perception–reasoning–action loop. Modern AI is very good at generating text and pixels; Physical AI requires closing the loop between a digital mind and a physical embodiment. A project has to interpret sensor data into an understanding of a scene, turn a goal into multi-step behavior that adapts when the world changes, and translate that plan into motion that actually works on hardware or in physics.</p>

  <h2>Who runs it</h2>
  <p>The event is hosted by <strong>Nebius</strong>, with <strong>NVIDIA</strong>, <strong>Antioch</strong>, and <strong>Toloka</strong>. Engineers from each are on site for the full day answering platform, hardware, and training questions — the guides in the handbook exist so that those conversations can be about robotics rather than about environment setup.</p>

  <h2>What teams work with</h2>
  <p>Ten LeRobot SO-101 leader/follower arm pairs, two Unitree Go2-W wheeled quadrupeds, and one Unitree G1 humanoid, shared between teams and staffed by the hosts. Alongside the hardware, the Antioch cloud simulation platform runs the NVIDIA Isaac stack on GPU machines, so a team with no local GPU can still build and test a full loop. Because hardware is limited and shared, simulation is the dependable path, and the strongest projects usually run most of their loop in sim even when they touch a real robot.</p>

  <h2>How judging works</h2>
  <p>Judging runs science-fair style: judges circulate and view projects at team stations, then the top six demo to the full group before winners are announced. Projects are scored on ambition, functionality, creativity, and architectural quality, unweighted — how hard the problem is, whether it works end-to-end when demonstrated, how original the approach is, and how cleanly the system separates perception, reasoning, and action.</p>

  <h2>This site</h2>
  <p>The handbook, team directory, and project showcase are a static site with no database. Teams and submissions are GitHub issues, synced into JSON and rendered into pages by a build script, so everything published here has a traceable source. The whole thing is open source at <a href="${REPO}">${REPO.replace('https://', '')}</a>, and the same data is available as a <a href="/developers.html">read-only JSON API</a>.</p>

  <div class="actions">
    <a class="btn" href="${APPLY}">Apply to attend</a>
    <a class="btn ghost" href="/contact.html">Contact</a>
  </div>
</div>`;
  return page({
    edit: { kind: 'file', target: 'src/pages-extra.js', label: 'src/pages-extra.js — aboutPage()' },
    title: 'About', description: 'What The Physical AI Sprint is, who runs it, what teams work with, and how judging works.',
    body, current: 'about', canonical: `${SITE}/about.html`,
  });
}

function contactPage(page) {
  const body = `
<header class="pagehead narrow">
  <div class="pagehead-in">
    <p class="eyebrow">Contact</p>
    <h1>Get in touch</h1>
    <p class="lede">The fastest route depends on what you need — here is where each kind of question actually gets answered.</p>
  </div>
</header>

<div class="wrap narrow">
  <h2>During the event</h2>
  <p>The <a href="${DISCORD}">event Discord</a> is where coordination happens on the day: team formation, hardware station queues, and questions for the host engineers. If you are at the venue, host engineers from Nebius, NVIDIA, Antioch, and Toloka are on the floor all day and are the fastest answer for anything involving a robot that is not behaving.</p>

  <h2>Registration</h2>
  <p>Applications are handled on <a href="${APPLY}">Luma</a>. Space is limited and every attendee is approved, so register individually even if you plan to attend as a team. Questions about an application status belong there rather than on GitHub.</p>

  <h2>Finding a team</h2>
  <p>Post in the <a href="/teams.html">team directory</a> — even solo. Each team is a GitHub issue thread, and joining is a comment on it, so the conversation stays in one place and the roster stays current. You do not need to arrive with a team.</p>

  <h2>Something wrong on this site</h2>
  <p>Open an issue on <a href="${REPO}/issues">the repository</a>. Broken links, a guide step that no longer matches the tooling, or a project page rendering incorrectly are all worth reporting — the handbook is pinned to specific versions and does drift.</p>

  <h2>For agents and developers</h2>
  <p>If you are building against this site's data, the <a href="/developers.html">developer portal</a> documents the read-only JSON API, and <a href="/auth.md">auth.md</a> explains why no credential is required. The API needs no key and has no rate limit, so there is nobody to email for access.</p>
</div>`;
  return page({
    edit: { kind: 'file', target: 'src/pages-extra.js', label: 'src/pages-extra.js — contactPage()' },
    title: 'Contact', description: 'How to reach the Physical AI Sprint organizers, find a team, or report a problem with the site.',
    body, current: 'contact', canonical: `${SITE}/contact.html`,
  });
}

function privacyPage(page) {
  const body = `
<header class="pagehead narrow">
  <div class="pagehead-in">
    <p class="eyebrow">Privacy</p>
    <h1>Privacy</h1>
    <p class="lede">This is a static site with no accounts, no analytics, and no tracking. Here is exactly what data exists and where it comes from.</p>
  </div>
</header>

<div class="wrap narrow">
  <h2>What this site collects</h2>
  <p><strong>Nothing.</strong> There is no database, no login, no cookie banner, and no analytics script. The site is a set of static HTML files on a CDN. We do not set cookies, we do not run third-party trackers, and we do not build a profile of anyone who visits.</p>
  <p>One thing is stored locally in your own browser: the checkpoint progress in the handbook guides uses <code>localStorage</code> so your place survives a refresh. It never leaves your device and is not readable by us. Clearing site data removes it.</p>

  <h2>What data is published, and who supplied it</h2>
  <p>The team directory and project showcase display information that people submitted themselves through public GitHub issue forms. That means a name, a GitHub handle, an optional contact handle, and whatever a team wrote about their project. It was public on GitHub the moment it was filed; this site renders it, it does not originate it.</p>
  <p>Member avatars are loaded directly from GitHub's own avatar URLs, so GitHub sees those image requests.</p>

  <h2>Removing your information</h2>
  <p>Because every entry maps to a GitHub issue, removal is under your control: edit the issue to remove a detail, or close the issue to drop the entry entirely. The next build removes the corresponding page — including deleting a stale team or project page, not just unlinking it. If you would rather not do it yourself, open an issue on <a href="${REPO}/issues">the repository</a> and an organizer will.</p>

  <h2>Third parties</h2>
  <p>Registration happens on <a href="${APPLY}">Luma</a> and chat happens on <a href="${DISCORD}">Discord</a>; both are outside this site and have their own privacy policies. Project pages may embed a video from YouTube, Vimeo, or Loom when a team submitted one, and those embeds are subject to the host's policies. Photos submitted by teams are hosted by GitHub.</p>

  <h2>Hosting</h2>
  <p>The site is served by Vercel, which processes standard request logs (IP address, user agent) as part of delivering it. See <a href="https://vercel.com/legal/privacy-policy">Vercel's privacy policy</a>.</p>

  <h2>Content licensing</h2>
  <p>The handbook and event content are available under CC BY 4.0, and the source is public at <a href="${REPO}">${REPO.replace('https://', '')}</a>. Project and team content belongs to the people who submitted it.</p>
</div>`;
  return page({
    edit: { kind: 'file', target: 'src/pages-extra.js', label: 'src/pages-extra.js — privacyPage()' },
    title: 'Privacy', description: 'What data the Physical AI Sprint site holds, where it comes from, and how to remove yours.',
    body, current: 'privacy', canonical: `${SITE}/privacy.html`,
  });
}

function developersPage(page, teams, projects) {
  const body = `
<header class="pagehead narrow">
  <div class="pagehead-in">
    <p class="eyebrow">Developers</p>
    <h1>API</h1>
    <p class="lede">A read-only JSON API over the hackathon's teams and projects. No key, no rate limit, CORS open — every endpoint is a static document regenerated whenever a submission changes.</p>
    <div class="actions">
      <a class="btn" href="/openapi.json">OpenAPI 3.1 spec</a>
      <a class="btn ghost" href="/llms.txt">llms.txt</a>
    </div>
  </div>
</header>

<div class="wrap narrow">
  <h2>Endpoints</h2>
  <div class="tablewrap">
    <table class="fields">
      <thead><tr><th>Endpoint</th><th>Returns</th></tr></thead>
      <tbody>
        <tr><td><a href="/api/index.json">/api/index.json</a></td><td>The endpoint index, with links to the spec and docs.</td></tr>
        <tr><td><a href="/api/event.json">/api/event.json</a></td><td>Date, timings, hosts, tracks, robots available, judging criteria, registration link.</td></tr>
        <tr><td><a href="/api/teams.json">/api/teams.json</a></td><td>Every team (${teams.length}), with roster, skills present, and skills wanted.</td></tr>
        <tr><td><a href="/api/projects.json">/api/projects.json</a></td><td>Every submitted project (${projects.length}), with track, robots, media, and team.</td></tr>
      </tbody>
    </table>
  </div>

  <h2>Quickstart</h2>
  <p>No authentication step — this is the entire integration:</p>
  <div class="term"><pre><code>curl -s ${SITE}/api/teams.json</code></pre></div>

  <p>Which teams still have room, and what are they looking for?</p>
  <div class="term" data-tag="jq"><pre><code>curl -s ${SITE}/api/teams.json \\
  | jq -r '.data[] | select(.lookingForMembers) | "\\(.name): \\(.skillsWanted | join(", "))"'</code></pre></div>

  <p>Every project that touched real hardware:</p>
  <div class="term" data-tag="jq"><pre><code>curl -s ${SITE}/api/projects.json \\
  | jq -r '.data[] | select(.track == "hardware" or .track == "both") | .title'</code></pre></div>

  <div class="term" data-tag="python"><pre><code>import urllib.request, json

with urllib.request.urlopen("${SITE}/api/projects.json") as r:
    projects = json.load(r)["data"]

for p in projects:
    print(p["title"], "—", ", ".join(p["robots"]) or "no robots listed")</code></pre></div>

  <h2>Authentication</h2>
  <p>There is none, deliberately. See <a href="/auth.md">auth.md</a> — it exists so an agent looking for a credential stops looking rather than hunting for an authorization server we do not run.</p>

  <h2>Errors</h2>
  <p>An unknown path under <code>/api/</code> returns a JSON error body with a machine-readable <code>code</code>, a human-readable <code>message</code>, and a <code>resolution</code> — not an HTML page.</p>
  <div class="term"><pre><code>curl -s ${SITE}/api/nope.json</code></pre></div>

  <h2>Freshness and stability</h2>
  <p>Documents regenerate whenever a team or project issue changes, so the API is as current as the site. Slugs are stable identifiers and match the page paths, so <code>/api/teams.json</code> entry <code>slug</code> maps to <code>/teams/&lt;slug&gt;.html</code>. Fields are additive: new keys may appear, existing ones will not change meaning.</p>

  <h2>Machine-readable discovery</h2>
  <div class="tablewrap">
    <table class="fields">
      <thead><tr><th>Document</th><th>Purpose</th></tr></thead>
      <tbody>
        <tr><td><a href="/openapi.json">/openapi.json</a></td><td>OpenAPI 3.1 description of every endpoint.</td></tr>
        <tr><td><a href="/.well-known/api-catalog">/.well-known/api-catalog</a></td><td>RFC 9727 API catalog linkset.</td></tr>
        <tr><td><a href="/.well-known/ai-catalog.json">/.well-known/ai-catalog.json</a></td><td>Agentic Resource Discovery catalog.</td></tr>
        <tr><td><a href="/.well-known/agent-card.json">/.well-known/agent-card.json</a></td><td>A2A agent card.</td></tr>
        <tr><td><a href="/.well-known/agent-skills/index.json">/.well-known/agent-skills/index.json</a></td><td>Agent Skills index.</td></tr>
        <tr><td><a href="/llms.txt">/llms.txt</a></td><td>Navigation index with when-to-use guidance.</td></tr>
        <tr><td><a href="/llms-full.txt">/llms-full.txt</a></td><td>The whole handbook as one markdown document.</td></tr>
        <tr><td><a href="/agents.md">/agents.md</a></td><td>Agent instructions: when to use this site, and what it cannot do.</td></tr>
      </tbody>
    </table>
  </div>

  <h2>Licence</h2>
  <p>Event and handbook content is CC BY 4.0. Team and project content belongs to the people who submitted it. Source: <a href="${REPO}">${REPO.replace('https://', '')}</a>.</p>
</div>`;
  return page({
    edit: { kind: 'file', target: 'src/pages-extra.js', label: 'src/pages-extra.js — developersPage()' },
    title: 'Developers', description: 'Read-only JSON API over the Physical AI Sprint teams and projects. No authentication, no rate limit, OpenAPI 3.1 spec.',
    body, current: 'developers', canonical: `${SITE}/developers.html`,
  });
}

/**
 * /edit — the way into edit mode without a subdomain.
 *
 * Every link here carries ?edit=1, which the edit script turns into a sticky
 * session flag, so clicking through the site keeps edit mode on until the tab
 * closes or "Leave edit mode" is pressed.
 */
function editPage(page, teams, projects) {
  const row = (href, name, source, note) => `        <tr>
          <td class="team"><a href="${href}?edit=1">${name}</a></td>
          <td><code>${source}</code></td>
          <td>${note}</td>
        </tr>`;

  const body = `
<header class="pagehead narrow">
  <div class="pagehead-in">
    <p class="eyebrow">Edit mode</p>
    <h1>Edit the site</h1>
    <p class="lede">Open any page in edit mode and every editable region gets a link to the thing that actually produces it — a file, or the GitHub issue behind it. Edit mode stays on as you click around, and ends when you close the tab.</p>
    <div class="actions">
      <a class="btn" href="/?edit=1">Start with the handbook</a>
      <a class="btn ghost" href="${REPO}">Open the repo</a>
    </div>
  </div>
</header>

<div class="wrap narrow">
  <div class="note warn">
    <div class="note-head">Never edit the HTML of a generated page</div>
    <div class="note-body">Most pages here are build output committed to the repo. GitHub will let you edit them and the page will look right — then the next build regenerates the file and your change is gone, silently. Edit mode exists to stop that: it points every page at its real source and says so on the page.</div>
  </div>

  <h2>Pages</h2>
  <div class="tablewrap">
    <table class="fields">
      <thead><tr><th>Page</th><th>Real source</th><th>How to edit</th></tr></thead>
      <tbody>
${row('/', 'Handbook', 'index.html', 'Hand-written. Sections deep-link to the exact line in the browser editor.')}
${row('/about.html', 'About', 'src/pages-extra.js', 'Prose lives in the generator.')}
${row('/contact.html', 'Contact', 'src/pages-extra.js', 'Prose lives in the generator.')}
${row('/privacy.html', 'Privacy', 'src/pages-extra.js', 'Prose lives in the generator.')}
${row('/developers.html', 'Developers', 'src/pages-extra.js', 'Prose lives in the generator.')}
${row('/teams.html', 'Team directory', 'build.js', 'Page furniture only — each team comes from its own issue.')}
${row('/showcase.html', 'Project showcase', 'build.js', 'Page furniture only — each project comes from its own issue.')}
${row('/submit.html', 'Submit', 'build.js', 'Prose lives in the generator.')}
      </tbody>
    </table>
  </div>

  <h2>Teams and projects</h2>
  <p>These are not files. Each one is a GitHub issue, rendered at build time — so editing the issue is editing the page, and the site rebuilds itself within a couple of minutes.</p>
${teams.length || projects.length ? `  <div class="tablewrap">
    <table class="fields">
      <thead><tr><th>Page</th><th>Issue</th></tr></thead>
      <tbody>
${teams.map((t) => `        <tr><td class="team"><a href="/teams/${t.slug}.html?edit=1">${t.name}</a></td><td><a href="${REPO}/issues/${t.issue}">#${t.issue}</a></td></tr>`).join('\n')}
${projects.map((p) => `        <tr><td class="team"><a href="/projects/${p.slug}.html?edit=1">${p.title}</a></td><td><a href="${REPO}/issues/${p.issue}">#${p.issue}</a></td></tr>`).join('\n')}
      </tbody>
    </table>
  </div>` : `  <div class="empty"><h3>Nothing submitted yet</h3><p>Teams and projects appear here as they are created.</p></div>`}

  <h2>What you need</h2>
  <ul class="list">
    <li>A GitHub account with push access to <a href="${REPO}">the repo</a>. Without it GitHub offers you a fork and a pull request, which is the right outcome for an outside contributor.</li>
    <li>Nothing else — there is no CMS, no password, and no separate login.</li>
  </ul>

  <h2>How a change goes live</h2>
  <ol class="list">
    <li>Edit the file or the issue on GitHub and commit.</li>
    <li>The build regenerates the affected pages and commits the result.</li>
    <li>Vercel deploys. Roughly a minute or two end to end.</li>
  </ol>
</div>`;

  return page({
    edit: { kind: 'file', target: 'src/pages-extra.js', label: 'src/pages-extra.js — editPage()' },
    title: 'Edit', description: 'Open any page of the Physical AI Sprint site in edit mode.',
    body, current: 'edit', canonical: `${SITE}/edit.html`,
  });
}

module.exports = { aboutPage, contactPage, privacyPage, developersPage, editPage };
