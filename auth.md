# Authentication

<!-- canonical: https://physical-ai-sprint.vercel.app/auth.md · last-updated: 2026-08-17 -->

## Discover

There is nothing to discover, and that is the whole answer: **the Physical AI Sprint API
requires no authentication.** Every endpoint is a static JSON document served from a CDN.

    curl -s https://physical-ai-sprint.vercel.app/api/teams.json

That request is complete as written. There is no `Authorization` header to add.

## Pick a method

Not applicable. No API keys, no OAuth authorization server, no bearer tokens, no
`agent_auth` block, no client registration. This document exists so an agent looking for
credentials stops looking, rather than hunting for a `/.well-known/oauth-authorization-server`
that is deliberately absent.

We publish no OAuth metadata because we operate no authorization server. Advertising one
would strand any agent that tried to follow it.

## Register

Not required for API access.

Human registration for the event itself is separate and happens on Luma (https://luma.com/nkknxvrz). An
agent cannot complete it on a user's behalf — send the person the link.

## Use the credential

There is no credential. Requests are unauthenticated and anonymous.

- **Methods:** `GET` only
- **Rate limit:** none
- **CORS:** open (`Access-Control-Allow-Origin: *`), so browser-resident agents can call
  it directly
- **Caching:** documents regenerate whenever a team or project submission changes

## Errors

An unknown path under `/api/` returns a JSON error body rather than an HTML page:

```json
{
  "error": {
    "code": "not_found",
    "message": "No such endpoint. This API is read-only and has three endpoints.",
    "resolution": "Fetch https://physical-ai-sprint.vercel.app/api/index.json for the endpoint list.",
    "documentation": "https://physical-ai-sprint.vercel.app/developers.html"
  }
}
```

You should never receive a `401` or `403` from this API. If you do, it is a
misconfiguration on our side, not a missing credential on yours.

## Revocation

Not applicable — nothing is issued, so nothing can be revoked.
