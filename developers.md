---
title: Developers
description: Read-only JSON API for the Physical AI Sprint.
canonical: https://physical-ai-sprint.vercel.app/developers.html
last-updated: 2026-08-17
---

# Developers

A read-only JSON API over the hackathon's teams and projects. No key, no rate limit,
CORS open. Every endpoint is a static document regenerated whenever a submission changes.


    curl -s https://physical-ai-sprint.vercel.app/api/teams.json


| Endpoint | Returns |
| --- | --- |
| [/api/index.json](https://physical-ai-sprint.vercel.app/api/index.json) | Endpoint index |
| [/api/event.json](https://physical-ai-sprint.vercel.app/api/event.json) | Date, hosts, tracks, robots, judging |
| [/api/teams.json](https://physical-ai-sprint.vercel.app/api/teams.json) | Teams, rosters, skills wanted |
| [/api/projects.json](https://physical-ai-sprint.vercel.app/api/projects.json) | Submitted projects |

Specification: [https://physical-ai-sprint.vercel.app/openapi.json](https://physical-ai-sprint.vercel.app/openapi.json).
Authentication: none — see [https://physical-ai-sprint.vercel.app/auth.md](https://physical-ai-sprint.vercel.app/auth.md).
