# The Physical AI Sprint — event site

Static site for the hackathon: the handbook, the project showcase, and the
submission flow. Deployed to Vercel from `main`; no build step runs on Vercel,
because generated pages are committed to the repo.

**Live:** https://physical-ai-sprint.vercel.app

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

