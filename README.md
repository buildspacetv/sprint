# The Physical AI Sprint — event site

Static site for the hackathon: the handbook, the project showcase, and the
submission flow. Deployed to Vercel from `main`; no build step runs on Vercel,
because generated pages are committed to the repo.

**Live:** https://physical-ai-sprint.vercel.app

## Pages

| Path | Source | Notes |
| --- | --- | --- |
| `/` | `index.html` | The handbook. Hand-maintained, self-contained. |
| `/showcase.html` | generated | Grid of all submitted projects, with search and track filter. |
| `/submit.html` | generated | How to submit; links to the GitHub issue form. |
| `/projects/<slug>.html` | generated | One page per project. |

`index.html` deliberately keeps its own copy of the design tokens rather than
using `src/styles.css`. It is also published as a standalone Claude Artifact,
which cannot load external stylesheets, so it has to stay self-contained.

## How submissions work

There is no database. Submissions are GitHub issues.

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
3. `scripts/sync-issues.js` reads every **open** issue labelled `submission`,
   parses the form fields out of the issue body, and writes `data/projects.json`.
4. `build.js` regenerates the showcase and project pages.
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

No dependencies, no package.json — plain Node 18+.

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
showcase.html  submit.html  projects/*.html generated — do not edit by hand
build.js                                    the generator
src/styles.css                              design system for generated pages
data/projects.json                          source of truth
scripts/sync-issues.js                      issues -> projects.json
.github/ISSUE_TEMPLATE/project-submission.yml
.github/workflows/submissions.yml
```
