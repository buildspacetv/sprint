# The Physical AI Sprint — event site

Static site for the hackathon: the handbook, the project showcase, and the
submission flow. Deployed to Vercel from `main`; no build step runs on Vercel,
because generated pages are committed to the repo.

**Live:** https://www.buildspace.tv

## Pages

| Path | Source | Notes |
| --- | --- | --- |
| `/` | `index.html` | The handbook. Hand-maintained, self-contained. |
| `/teams.html` | generated | Team directory: post a team, find one with room, search by skill or person. |
| `/showcase.html` | generated | Grid of all submitted projects, with search and track filter. |
| `/submit.html` | generated | How to submit; links to the GitHub issue form. |
| `/teams/<slug>.html` | generated | One page per team: roster, skills, and the projects they submitted. |
| `/projects/<slug>.html` | generated | One page per project. |

`index.html` deliberately keeps its own copy of the design tokens rather than
using `src/styles.css`. It is also published as a standalone Claude Artifact,
which cannot load external stylesheets, so it has to stay self-contained.

## How submissions work

There is no database. Both submissions and teams are GitHub issues, distinguished
by label: `submission` for projects, `team` for the directory.

```
team files an issue  ->  GitHub Action  ->  data/projects.json  ->  build.js
  (issue form)           (sync-issues)      (source of truth)      (static pages)
                                                                        |
                                                    commit -> Vercel deploys
```

1. A team opens [the submission form](../../issues/new?template=project-submission.yml&labels=submission).
   It is a GitHub issue form, so they get auth, structured fields, and
   drag-and-drop upload for photos and video that GitHub hosts.
2. `.github/workflows/submissions.yml` fires on any issue event.
3. `scripts/sync-issues.js` reads every **open** issue labelled `submission` or
   `team`, parses the form fields out of the issue body, and writes
   `data/projects.json` and `data/teams.json`.
4. `build.js` regenerates the showcase, the team directory, and the project pages.
5. The workflow commits the result, which triggers the Vercel deploy.

Editing an issue updates its project page. To pull a project from the showcase,
close the issue or remove its `submission` label — the next build drops it.

## Running it locally

```bash
node build.js                       # regenerate from data/projects.json

GITHUB_REPOSITORY=opencolin/physical-ai-sprint-handbook \
GITHUB_TOKEN=$(gh auth token) \
  node scripts/sync-issues.js       # pull live submissions first
```

```bash
node --test                         # run the test suite
```

No dependencies and no `package.json` — plain Node 18+. The absence of a
`package.json` is deliberate: Vercel auto-detects one and would start running a
build step on a project that currently deploys as pure static files.

The suite covers the escaping and parsing helpers, because every value they
touch comes from a public GitHub issue and lands in HTML on our own origin.
CI runs it before every build, so a regression fails the workflow instead of
publishing.

## Media handling

- **Photos** — any `https://` image URL. GitHub's uploads work as-is. The first
  photo becomes the showcase cover and the `og:image` for link previews.
- **Video** — YouTube, Vimeo, and Loom links are turned into embeds; `.mp4`,
  `.webm`, and `.mov` URLs render in a native `<video>` player.
- Non-`https://` URLs are dropped rather than rendered.

## Security note

Issue content is attacker-controllable: anyone with a GitHub account can file an
issue on a public repo, and that text is rendered into HTML. `build.js` treats
every field as hostile:

- all interpolated text goes through `esc()`
- values embedded in `<script>` go through `jsonForScript()`, which escapes
  `<`, `>`, `&`, and U+2028/9 — `JSON.stringify` alone does **not** prevent a
  `</script>` breakout
- URLs must be `https://` (`safeUrl`), GitHub handles must match GitHub's own
  username grammar (`ghUser`), slugs are reduced to `[a-z0-9-]` (`safeSlug`),
  and the issue number must parse as an integer

If you add a field, run it through those same helpers.

## Layout

```
index.html                                  handbook (hand-maintained)
showcase.html  teams.html  submit.html  projects/*.html    generated — do not edit
build.js                                    the generator
src/styles.css                              design system for generated pages
data/projects.json  data/teams.json         source of truth
scripts/sync-issues.js                      issues -> projects.json + teams.json
.github/ISSUE_TEMPLATE/project-submission.yml
.github/ISSUE_TEMPLATE/team.yml
.github/workflows/submissions.yml
```

## Team directory

A team is an open issue labelled `team`. People join by **commenting on it** —
the conversation stays in one place and the roster is edited into the issue body.
Marking a team full drops it out of the "has room" filter. Closing the issue
removes the team from the directory.

### How teams and projects link

The submission form has a **Team** field taking a team name or issue number.
`resolveTeam()` matches it at build time and links both directions: the project
page gets a Team row pointing at that team's page, and the team page lists every
project that references it (the directory card shows them too). If the project's members field is
blank, the roster is **inherited** from the team entry, so nobody types the same
people twice and the two rosters cannot drift.

Matching is explicit — name or issue number — never inferred from overlapping
GitHub handles. People help on more than one team, and a wrong auto-join on a
public showcase page is worse than an unlinked one. An unmatched reference is
still displayed as plain text rather than dropped.

### Labels must exist

An issue template's `labels:` are **silently dropped** if the label does not
already exist in the repo. That failed once here: a team form arrived unlabelled,
the sync found nothing, and the site looked broken while every workflow run
reported success. The workflow now recreates `team` and `submission` on every
run (idempotent), so this cannot recur.

## Judging

Unlisted tool at `/judge` (and `judge.buildspace.tv` once that DNS exists),
built from the Hackathon Judging workbook: four criteria scored 1-10 and
weighted equally, five judges, and the workbook's rule that a category left
blank means "did not see this team" and is excluded from the average rather
than counted as zero.

### Backend

Scores are stored in a **secret GitHub Gist**, not a file on `main`. Every score
would otherwise be a commit to the deployed branch, and Vercel builds on every
push — five judges scoring thirty teams is ~150 commits and ~150 redeploys in
the two hours when the showcase matters most. A Gist is the same GitHub, same
token, same audit trail, but cannot trigger a build.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/judging/scores` | GET, POST | Read all rows; upsert one judge's scores for one team |
| `/api/judging/tally` | GET | Combined leaderboard across all judges |

Auth is a shared passcode in the `x-judge-key` header — this is a public URL
during a public event. Every response is JSON, including errors.

### Environment variables

Set these on the Vercel project, then redeploy:

| Variable | Value |
| --- | --- |
| `JUDGING_GITHUB_TOKEN` | A GitHub token with the `gist` scope |
| `JUDGING_GIST_ID` | The secret gist's id |
| `JUDGE_KEY` | A passcode you give the judges |

Alternatives, picked automatically if present instead: `JUDGING_BRANCH` (repo
file on a non-deployed branch) or `KV_REST_API_URL` + `KV_REST_API_TOKEN`
(Upstash / Vercel KV). Until one storage backend and `JUDGE_KEY` are set, both
endpoints return `503 not_configured` and say what is missing.

### Local-first by design

The client writes every score to `localStorage` before sending it, queues
failed sends, and retries. Nothing about scoring depends on the network — a
judging tool that stops working because the connection did is worse than one
that never had a backend. Judges can still export CSV/JSON at any point.

## Two sources feed the showcase

`data/projects.json` is the live one: GitHub issues, rewritten by the sync
workflow on every issue event. `data/submissions.json` is the demo-day Google
Form export, and no workflow touches it — which is exactly why it is a separate
file. A sync run rewrites `projects.json` wholesale, so form entries living
there would vanish on the next issue edit.

`build.js` concatenates the two before rendering, so the showcase, the project
pages, and the JSON API all see one merged set. When both sources carry the same
slug, the issue wins: it is the one an organizer can still edit.

What is deliberately **not** imported from the form export:

- **Team email addresses.** The form collects them; the site does not publish them.
- **The two unlabelled scratch columns** holding judging notes (`8, 8, 8, 7`,
  `alr reviewed`). They are internal, inconsistent, and present for only some rows.

Re-submissions are folded together: same project title from a team whose roster
overlaps the earlier entry keeps the latest row, and the count is recorded in
`resubmissions` (shown on the project page as "revised twice"). Form entries have
no track — the form never asked — so the track chip is omitted rather than
rendered as "Unspecified" on every card.

## The bottom-left corner

Every page carries the same three items in the bottom-left: **API**, **GitHub**,
and **Refresh**. On the handbook they are the last row of the sticky rail; on
the generated pages they are a fixed pill, because those pages have no rail. The
API link used to live in the top-right nav, where it competed with the four
links people actually navigate by.

**Refresh** POSTs to `/api/redeploy`. The site rebuilds itself on every issue
event, so this is for the case automation cannot see: a changed env var, a
Vercel setting, a build that failed on a flake.

It has two ways to get there. A Vercel deploy hook (`VERCEL_DEPLOY_HOOK_URL`)
redeploys the current commit as-is, which is the right tool when the content is
fine and the deployment is not. Without one it dispatches the build workflow
using the same GitHub token `/api/edit` already uses, which re-runs sync +
build, so it also picks up issue edits — but it cannot redeploy an unchanged
tree, since there would be nothing to commit. The reply says which path ran.

The fallback is deliberate: a deploy hook is a dashboard round-trip nobody makes
at 3am during an event, and the token is already configured, so the button works
with no setup and gets strictly better if a hook is added later.

It is authorized with the editor's passcode (`x-edit-key`, the same
`sessionStorage` key edit mode uses) for the reason every other write endpoint
here is: this is a public URL during a public event, and an open build trigger
is a way to burn build minutes from a browser tab. The hook URL is a bearer
secret — anyone holding it can deploy — so it stays server-side and is never
sent to the client. A 60-second cooldown turns an impatient double-click into
one build; it is per-instance, so treat it as courtesy rather than a guarantee.

| Variable | Value |
| --- | --- |
| `EDIT_KEY` | The organizer passcode, shared with edit mode. Required. |
| `EDIT_GITHUB_TOKEN` | Already set for `/api/edit`; doubles as the build trigger. |
| `VERCEL_DEPLOY_HOOK_URL` | Optional. Vercel → Settings → Git → Deploy Hooks. Takes precedence when present. |

The endpoint returns `503 not_configured` naming what is missing — `EDIT_KEY`,
or both trigger paths at once — and the button reports it in place.

Note that `index.html` carries its own copy of the corner markup, styles, and
script: it is published as a standalone Artifact and cannot load site CSS or JS.
Change `build.js`'s `CORNER_SCRIPT` and the handbook's copy together.

### The static JSON API lives in `apidata/`

Adding functions under `api/` makes Vercel treat that directory as the
functions root and stop serving static files from it. The public
`/api/*.json` documents are therefore generated into `apidata/` and rewritten
onto their `/api/*` paths in `vercel.json`. Vercel matches the filesystem
before rewrites, so `/api/judging/*` still resolves to the function.
