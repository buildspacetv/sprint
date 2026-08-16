---
title: Developers
description: Read-only JSON API for the Physical AI Sprint.
canonical: https://www.buildspace.tv/developers.html
last-updated: 2026-08-17
---

# Developers

A read-only JSON API over the hackathon's teams and projects. No key, no rate limit,
CORS open. Every endpoint is a static document regenerated whenever a submission changes.


    curl -s https://www.buildspace.tv/api/teams.json


| Endpoint | Returns |
| --- | --- |
| [/api/index.json](https://www.buildspace.tv/api/index.json) | Endpoint index |
| [/api/event.json](https://www.buildspace.tv/api/event.json) | Date, hosts, tracks, robots, judging |
| [/api/teams.json](https://www.buildspace.tv/api/teams.json) | Teams, rosters, skills wanted |
| [/api/projects.json](https://www.buildspace.tv/api/projects.json) | Submitted projects |

Specification: [https://www.buildspace.tv/openapi.json](https://www.buildspace.tv/openapi.json).
Authentication: none — see [https://www.buildspace.tv/auth.md](https://www.buildspace.tv/auth.md).
