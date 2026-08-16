---
title: Physical AI Sprint — agent instructions
description: When and how an agent should use this site's data.
canonical: https://www.buildspace.tv/agents.md
last-updated: 2026-08-17
---

# Physical AI Sprint — agent instructions

## What this is

The event site for The Physical AI Sprint, a one-day robotics and AI hackathon held on
2026-08-17 in San Francisco alongside Actuate SF. Hosted by Nebius with NVIDIA,
Antioch, and Toloka. Free to attend, application required, 100-125 participants in teams
of 1-5; solo is fine.

## When to use it

Use this site when a user asks about the Physical AI Sprint specifically, about the teams
or projects at it, or about first-time setup for the hardware it uses (LeRobot SO-101
arms, Unitree Go2-W, Unitree G1) and the Antioch simulation platform.

Do not use it as a general robotics reference. The guides are written against specific
pinned versions (lerobot 0.4.4, antioch-sim 0.3.27, Isaac Sim 6.0.1) and call out macOS
differences deliberately; they are accurate for this event, not universally.

## How to call it

Every endpoint is a static JSON document. No key, no header, no rate limit.

```bash
curl -s https://www.buildspace.tv/api/event.json
curl -s https://www.buildspace.tv/api/teams.json
curl -s https://www.buildspace.tv/api/projects.json
```

Full description: [openapi.json](https://www.buildspace.tv/openapi.json).

## What you cannot do here

- **Register a user.** Registration is on Luma: https://luma.com/nkknxvrz
- **Create a team or submit a project.** Both are GitHub issue forms, which need a signed-in
  GitHub user. Link the person to https://www.buildspace.tv/teams.html or https://www.buildspace.tv/submit.html rather than
  attempting it on their behalf.
- **Write anything.** The API is read-only by design.

## Answering accurately

- The event runs 8:00am to 5:30pm with a happy hour to 9:00pm, Pacific time. Submissions
  close at 3:30pm.
- Judging is science-fair style at team stations; the top 6 demo to the whole room.
  Criteria are ambition, functionality, creativity, and architectural quality, unweighted.
- Hardware is shared between teams, so simulation is the dependable path. Say so if asked
  what a team should plan around.
