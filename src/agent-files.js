/**
 * Machine-readable surface: discovery files, a read-only JSON API over the
 * event data, and its OpenAPI description.
 *
 * Everything here is generated from the same data/*.json the HTML pages use,
 * so the API can never drift from the site. Returns a { path: content } map;
 * build.js writes it.
 *
 * Scope note: the API is genuinely public and read-only, so there is no OAuth
 * server, no scopes, and no MCP server. Those are left unimplemented rather
 * than stubbed — advertising an auth flow that does not exist would strand any
 * agent that tried to follow it.
 */

const SITE = 'https://www.buildspace.tv';
const REPO = 'https://github.com/buildspacetv/sprint';
const APPLY = 'https://luma.com/nkknxvrz';
const DISCORD = 'https://discord.com/invite/nN58zxSTFR';
const EVENT_DATE = '2026-08-17';

const HTML_PAGES = [
  ['/', 'Handbook', 'The full hackathon guide: challenge, schedule, judging, and four setup guides for the SO-101, Antioch, and Unitree robots.'],
  ['/showcase.html', 'Project showcase', 'Every project submitted, searchable and filterable by track.'],
  ['/submit.html', 'Submit a project', 'How to submit a project to the showcase.'],
  ['/developers.html', 'Developers', 'The read-only JSON API over teams and projects.'],
  ['/about.html', 'About', 'What the Physical AI Sprint is, who runs it, and how it works.'],
  ['/contact.html', 'Contact', 'How to reach the organizers.'],
  ['/privacy.html', 'Privacy', 'What data the site holds and where it comes from.'],
];

const json = (o) => JSON.stringify(o, null, 2) + '\n';

/* ------------------------------------------------------------------ API */

function apiFiles(teams, projects) {
  const stamp = `${EVENT_DATE}T00:00:00-07:00`;
  const publicTeam = (t) => ({
    slug: t.slug,
    name: t.name,
    pitch: t.pitch || null,
    lookingForMembers: !!t.open,
    skillsWanted: t.looking || [],
    skillsPresent: t.have || [],
    members: (t.members || []).map((m) => ({ name: m.name, github: m.github || null })),
    url: `${SITE}/teams/${t.slug}.html`,
    threadUrl: t.issue ? `${REPO}/issues/${t.issue}` : null,
  });
  const publicProject = (p) => ({
    slug: p.slug,
    title: p.title,
    tagline: p.tagline || null,
    track: p.track || null,
    robots: p.robots || [],
    description: p.description || null,
    video: p.video || null,
    images: p.images || [],
    repo: p.repo || null,
    team: (p.team || []).map((m) => ({ name: m.name, github: m.github || null })),
    teamSlug: p.teamSlug || null,
    url: `${SITE}/projects/${p.slug}.html`,
  });

  return {
    'apidata/event.json': json({
      name: 'The Physical AI Sprint',
      tagline: 'A one-day hackathon at the intersection of AI and the physical world, alongside Actuate SF.',
      date: EVENT_DATE,
      startTime: '08:00',
      endTime: '21:00',
      timezone: 'America/Los_Angeles',
      free: true,
      registrationUrl: APPLY,
      discordUrl: DISCORD,
      hosts: ['Nebius', 'NVIDIA', 'Antioch', 'Toloka'],
      teamSize: '1-5',
      capacity: '100-125 participants',
      tracks: [
        { id: 'sim', label: 'Sim only', description: 'Built entirely on the Antioch simulation platform.' },
        { id: 'hardware', label: 'Hardware only', description: 'Built directly on the physical robots.' },
        { id: 'both', label: 'Sim and real', description: 'A trajectory between the two: sim-to-real or real-to-sim.' },
      ],
      robots: ['LeRobot SO-101 leader/follower arms', 'Unitree Go2-W wheeled quadruped', 'Unitree G1 humanoid'],
      judging: ['Ambition', 'Functionality', 'Creativity', 'Architectural quality'],
      submissionDeadline: '15:30',
      links: { handbook: SITE, teams: `${SITE}/api/teams.json`, projects: `${SITE}/api/projects.json` },
    }),

    'apidata/teams.json': json({
      object: 'list',
      count: teams.length,
      generatedAt: stamp,
      docs: `${SITE}/developers.html`,
      data: teams.map(publicTeam),
    }),

    'apidata/projects.json': json({
      object: 'list',
      count: projects.length,
      generatedAt: stamp,
      docs: `${SITE}/developers.html`,
      data: projects.map(publicProject),
    }),

    'apidata/index.json': json({
      object: 'index',
      description: 'Read-only JSON API for The Physical AI Sprint. No authentication, no rate limit, CORS open.',
      openapi: `${SITE}/openapi.json`,
      docs: `${SITE}/developers.html`,
      endpoints: [
        { method: 'GET', path: '/api/event.json', description: 'Event details: date, hosts, tracks, robots, judging criteria.' },
        { method: 'GET', path: '/api/teams.json', description: 'Every registered team with roster and the skills they are seeking.' },
        { method: 'GET', path: '/api/projects.json', description: 'Every submitted project with track, media, and team.' },
      ],
    }),

    // A static host cannot branch on path, so this is the documented JSON body
    // agents get for an unknown /api/ path via the vercel.json rewrite.
    'apidata/404.json': json({
      error: {
        code: 'not_found',
        message: 'No such endpoint. This API is read-only and has three endpoints.',
        resolution: `Fetch ${SITE}/api/index.json for the endpoint list, or ${SITE}/openapi.json for the full specification.`,
        documentation: `${SITE}/developers.html`,
      },
    }),
  };
}

/* -------------------------------------------------------------- OpenAPI */

function openapi() {
  const errorSchema = {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'string', description: 'Machine-readable error code.', example: 'not_found' },
          message: { type: 'string', description: 'Human-readable explanation.' },
          resolution: { type: 'string', description: 'What to do about it.' },
          documentation: { type: 'string', format: 'uri' },
        },
      },
    },
  };
  const person = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Display name as the team wrote it.' },
      github: { type: ['string', 'null'], description: 'GitHub handle, or null if none was given.' },
    },
  };
  const notFound = {
    description: 'No such endpoint.',
    content: { 'application/json': { schema: errorSchema } },
  };

  const personSchema = person;
  const teamSchema = {
    type: 'object', required: ['slug', 'name'],
    properties: {
      slug: { type: 'string', description: 'Stable identifier, also the page path segment.' },
      name: { type: 'string', description: 'Team name.' },
      pitch: { type: ['string', 'null'], description: 'What the team wants to build.' },
      lookingForMembers: { type: 'boolean', description: 'True when the team still has room.' },
      skillsWanted: { type: 'array', items: { type: 'string' }, description: 'Skills the team is looking for.' },
      skillsPresent: { type: 'array', items: { type: 'string' }, description: 'Skills already on the team.' },
      members: { type: 'array', items: personSchema, description: 'Team roster.' },
      url: { type: 'string', format: 'uri', description: 'The team page.' },
      threadUrl: { type: ['string', 'null'], format: 'uri', description: 'GitHub issue where people ask to join.' },
    },
  };
  const projectSchema = {
    type: 'object', required: ['slug', 'title'],
    properties: {
      slug: { type: 'string', description: 'Stable identifier, also the page path segment.' },
      title: { type: 'string', description: 'Project name.' },
      tagline: { type: ['string', 'null'], description: 'One-line summary.' },
      track: { type: ['string', 'null'], enum: ['sim', 'hardware', 'both', null], description: 'Which track the project ran in.' },
      robots: { type: 'array', items: { type: 'string' }, description: 'Robots used.' },
      description: { type: ['string', 'null'], description: 'Full project write-up.' },
      video: { type: ['string', 'null'], format: 'uri', description: 'Demo video URL.' },
      images: { type: 'array', items: { type: 'string', format: 'uri' }, description: 'Photo URLs.' },
      repo: { type: ['string', 'null'], format: 'uri', description: 'Source repository.' },
      team: { type: 'array', items: personSchema, description: 'Who built it.' },
      teamSlug: { type: ['string', 'null'], description: 'Slug of the team that built it, when linked.' },
      url: { type: 'string', format: 'uri', description: 'The project page.' },
    },
  };
  const listOf = (item, what) => ({
    type: 'object',
    required: ['object', 'count', 'data'],
    properties: {
      object: { type: 'string', const: 'list', description: 'Always "list".' },
      count: { type: 'integer', description: `Number of ${what} returned.` },
      generatedAt: { type: 'string', format: 'date-time', description: 'When this document was generated.' },
      docs: { type: 'string', format: 'uri', description: 'Human documentation.' },
      data: { type: 'array', items: item, description: `The ${what}.` },
    },
  });
  const teamListSchema = listOf(teamSchema, 'teams');
  const projectListSchema = listOf(projectSchema, 'projects');
  const eventSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Event name.' },
      tagline: { type: 'string', description: 'One-line description.' },
      date: { type: 'string', format: 'date', description: 'Event date.', example: EVENT_DATE },
      startTime: { type: 'string', description: 'Doors open, local time.', example: '08:00' },
      endTime: { type: 'string', description: 'End of happy hour, local time.', example: '21:00' },
      timezone: { type: 'string', description: 'IANA timezone.', example: 'America/Los_Angeles' },
      free: { type: 'boolean', description: 'Whether attendance is free.' },
      registrationUrl: { type: 'string', format: 'uri', description: 'Where to register.' },
      discordUrl: { type: 'string', format: 'uri', description: 'Event chat.' },
      hosts: { type: 'array', items: { type: 'string' }, description: 'Hosting organizations.' },
      teamSize: { type: 'string', description: 'Allowed team size.', example: '1-5' },
      capacity: { type: 'string', description: 'Expected attendance.' },
      tracks: { type: 'array', description: 'Project tracks.', items: {
        type: 'object', properties: {
          id: { type: 'string', enum: ['sim', 'hardware', 'both'], description: 'Track identifier.' },
          label: { type: 'string', description: 'Display name.' },
          description: { type: 'string', description: 'What the track means.' },
        } } },
      robots: { type: 'array', items: { type: 'string' }, description: 'Robot hardware available.' },
      judging: { type: 'array', items: { type: 'string' }, description: 'Judging criteria.' },
      submissionDeadline: { type: 'string', description: 'Local time submissions close.', example: '15:30' },
    },
  };
  const apiIndexSchema = {
    type: 'object',
    properties: {
      object: { type: 'string', const: 'index', description: 'Always "index".' },
      description: { type: 'string', description: 'What this API is.' },
      openapi: { type: 'string', format: 'uri', description: 'This specification.' },
      docs: { type: 'string', format: 'uri', description: 'Human documentation.' },
      endpoints: { type: 'array', description: 'Available endpoints.', items: {
        type: 'object', properties: {
          method: { type: 'string', enum: ['GET'], description: 'HTTP method.' },
          path: { type: 'string', description: 'Path relative to the server.' },
          description: { type: 'string', description: 'What it returns.' },
        } } },
    },
  };

  return json({
    openapi: '3.1.0',
    info: {
      title: 'Physical AI Sprint API',
      version: '1.0.0',
      summary: 'Read-only access to the teams and projects of The Physical AI Sprint hackathon.',
      description: [
        'A public, read-only JSON API over the hackathon\'s teams and projects.',
        '',
        'No authentication is required and there is no rate limit: every endpoint is a static',
        'JSON document served from a CDN, regenerated whenever a team or project submission',
        'changes. CORS is open, so browser agents can call it directly.',
        '',
        'Use it to list the teams at the event, see which are still looking for members, or',
        'enumerate submitted projects with their tracks, media, and rosters.',
      ].join('\n'),
      contact: { name: 'The Physical AI Sprint', url: `${SITE}/contact.html` },
      license: { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
    },
    servers: [{ url: SITE, description: 'Production' }],
    'x-api-versioning': {
      policy: 'Additive only. New fields may appear; existing fields will not change meaning or type. A breaking change would ship at a new path (/api/v2/...) and the current paths would keep working until a Sunset header announced their retirement at least 90 days ahead.',
      currentVersion: '1.0.0',
      deprecationSignal: 'HTTP Sunset and Deprecation response headers, plus a note in /developers.html.',
    },
    externalDocs: { description: 'Developer portal', url: `${SITE}/developers.html` },
    tags: [
      { name: 'event', description: 'Event-level facts.' },
      { name: 'teams', description: 'Teams taking part.' },
      { name: 'projects', description: 'Projects submitted to the showcase.' },
    ],
    paths: {
      '/api/index.json': {
        get: {
          operationId: 'getApiIndex',
          summary: 'List the available endpoints',
          description: 'Returns the endpoint index, including the OpenAPI URL and documentation link.',
          tags: ['event'],
          responses: {
            200: { description: 'The endpoint index.', content: { 'application/json': { schema: apiIndexSchema } } },
            404: notFound,
          },
        },
      },
      '/api/event.json': {
        get: {
          operationId: 'getEvent',
          summary: 'Get event details',
          description: 'Date, timings, hosts, tracks, robots available, judging criteria, and registration links.',
          tags: ['event'],
          responses: {
            200: { description: 'Event details.', content: { 'application/json': { schema: eventSchema } } },
            404: notFound,
          },
        },
      },
      '/api/teams.json': {
        get: {
          operationId: 'listTeams',
          summary: 'List all teams',
          description: 'Every registered team, with its roster, the skills it has, and the skills it is looking for. `lookingForMembers` is true when the team still has room.',
          tags: ['teams'],
          responses: {
            200: { description: 'A list of teams.', content: { 'application/json': { schema: teamListSchema } } },
            404: notFound,
          },
        },
      },
      '/api/projects.json': {
        get: {
          operationId: 'listProjects',
          summary: 'List all submitted projects',
          description: 'Every project submitted to the showcase, with its track, robots used, media, repository, and team.',
          tags: ['projects'],
          responses: {
            200: { description: 'A list of projects.', content: { 'application/json': { schema: projectListSchema } } },
            404: notFound,
          },
        },
      },
    },
    components: {
      schemas: {
        Error: errorSchema,
        Person: person,
        ApiIndex: {
          type: 'object',
          mediaType: 'object',
          properties: {
            object: { type: 'string', const: 'index' },
            description: { type: 'string' },
            openapi: { type: 'string', format: 'uri' },
            docs: { type: 'string', format: 'uri' },
            endpoints: {
              type: 'array',
          mediaType: 'array',
              items: {
                type: 'object',
          mediaType: 'object',
                properties: {
                  method: { type: 'string', enum: ['GET'] },
                  path: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
          },
        },
        Event: {
          type: 'object',
          mediaType: 'object',
          properties: {
            name: { type: 'string' },
            tagline: { type: 'string' },
            date: { type: 'string', format: 'date', example: EVENT_DATE },
            startTime: { type: 'string', example: '08:00' },
            endTime: { type: 'string', example: '21:00' },
            timezone: { type: 'string', example: 'America/Los_Angeles' },
            free: { type: 'boolean' },
            registrationUrl: { type: 'string', format: 'uri' },
            discordUrl: { type: 'string', format: 'uri' },
            hosts: { type: 'array', items: { type: 'string' } },
            teamSize: { type: 'string', example: '1-5' },
            capacity: { type: 'string' },
            tracks: {
              type: 'array',
          mediaType: 'array',
              items: {
                type: 'object',
          mediaType: 'object',
                properties: {
                  id: { type: 'string', enum: ['sim', 'hardware', 'both'] },
                  label: { type: 'string' },
                  description: { type: 'string' },
                },
              },
            },
            robots: { type: 'array', items: { type: 'string' } },
            judging: { type: 'array', items: { type: 'string' } },
            submissionDeadline: { type: 'string', example: '15:30' },
          },
        },
        Team: {
          type: 'object',
          mediaType: 'object',
          required: ['slug', 'name'],
          properties: {
            slug: { type: 'string', description: 'Stable identifier, also the page path segment.' },
            name: { type: 'string' },
            pitch: { type: ['string', 'null'], description: 'What the team wants to build.' },
            lookingForMembers: { type: 'boolean', description: 'True when the team still has room.' },
            skillsWanted: { type: 'array', items: { type: 'string' } },
            skillsPresent: { type: 'array', items: { type: 'string' } },
            members: { type: 'array', items: { $ref: '#/components/schemas/Person' } },
            url: { type: 'string', format: 'uri', description: 'The team page.' },
            threadUrl: { type: ['string', 'null'], format: 'uri', description: 'GitHub issue where people ask to join.' },
          },
        },
        Project: {
          type: 'object',
          mediaType: 'object',
          required: ['slug', 'title'],
          properties: {
            slug: { type: 'string' },
            title: { type: 'string' },
            tagline: { type: ['string', 'null'] },
            track: { type: ['string', 'null'], enum: ['sim', 'hardware', 'both', null] },
            robots: { type: 'array', items: { type: 'string' } },
            description: { type: ['string', 'null'] },
            video: { type: ['string', 'null'], format: 'uri' },
            images: { type: 'array', items: { type: 'string', format: 'uri' } },
            repo: { type: ['string', 'null'], format: 'uri' },
            team: { type: 'array', items: { $ref: '#/components/schemas/Person' } },
            teamSlug: { type: ['string', 'null'], description: 'Slug of the team that built it, when linked.' },
            url: { type: 'string', format: 'uri' },
          },
        },
        TeamList: {
          type: 'object',
          mediaType: 'object',
          properties: {
            object: { type: 'string', const: 'list' },
            count: { type: 'integer' },
            generatedAt: { type: 'string', format: 'date-time' },
            docs: { type: 'string', format: 'uri' },
            data: { type: 'array', items: { $ref: '#/components/schemas/Team' } },
          },
        },
        ProjectList: {
          type: 'object',
          mediaType: 'object',
          properties: {
            object: { type: 'string', const: 'list' },
            count: { type: 'integer' },
            generatedAt: { type: 'string', format: 'date-time' },
            docs: { type: 'string', format: 'uri' },
            data: { type: 'array', items: { $ref: '#/components/schemas/Project' } },
          },
        },
      },
    },
  });
}

/* ------------------------------------------------------ discovery files */

function discoveryFiles(teams, projects) {
  return {
    '.well-known/ai-catalog.json': json({
      $schema: 'https://agenticresourcediscovery.org/schema/v1/catalog.json',
      specVersion: '1.0',
      version: '1.0',
      updated: EVENT_DATE,
      provider: {
        name: 'The Physical AI Sprint',
        url: SITE,
        description: 'A one-day Physical AI hackathon alongside Actuate SF, hosted by Nebius with NVIDIA, Antioch, and Toloka.',
      },
      entries: [
        {
          identifier: 'urn:air:www.buildspace.tv:mcp:server',
          displayName: 'Physical AI Sprint MCP server',
          description: 'Read-only MCP server exposing the hackathon teams, projects, and event details as callable tools over Streamable HTTP.',
          type: 'application/mcp',
          mediaType: 'application/mcp',
          url: `${SITE}/api/mcp`,
          trustManifest: {
            verifiableIdentity: { domain: 'www.buildspace.tv', method: 'dns-origin' },
            source: { repository: REPO, license: 'CC BY 4.0' },
          },
        },
        {
          identifier: 'urn:air:buildspace.tv:api:openapi',
          displayName: 'Physical AI Sprint API',
          description: 'Read-only JSON API over the hackathon teams and projects. No authentication required.',
          type: 'application/vnd.oai.openapi+json',
          mediaType: 'application/vnd.oai.openapi+json',
          url: `${SITE}/openapi.json`,
          trustManifest: {
            verifiableIdentity: { domain: 'buildspace.tv', method: 'dns-origin' },
            source: { repository: REPO, license: 'CC BY 4.0' },
          },
        },
        {
          identifier: 'urn:air:buildspace.tv:doc:handbook',
          displayName: 'Physical AI Sprint Handbook',
          description: 'Full participant handbook: challenge brief, schedule, judging criteria, and four hardware and simulation setup guides.',
          type: 'text/markdown',
          mediaType: 'text/markdown',
          url: `${SITE}/llms-full.txt`,
          trustManifest: {
            verifiableIdentity: { domain: 'buildspace.tv', method: 'dns-origin' },
            source: { repository: REPO, license: 'CC BY 4.0' },
          },
        },
        {
          identifier: 'urn:air:buildspace.tv:data:teams',
          displayName: 'Team directory data',
          description: 'Every team at the event, which teams still have room, and the skills they are looking for.',
          type: 'application/json',
          mediaType: 'application/json',
          url: `${SITE}/api/teams.json`,
          trustManifest: {
            verifiableIdentity: { domain: 'buildspace.tv', method: 'dns-origin' },
            source: { repository: REPO, license: 'CC BY 4.0' },
          },
        },
        {
          identifier: 'urn:air:buildspace.tv:data:projects',
          displayName: 'Project showcase data',
          description: 'Every project submitted to the showcase with track, robots used, media, and team roster.',
          type: 'application/json',
          mediaType: 'application/json',
          url: `${SITE}/api/projects.json`,
          trustManifest: {
            verifiableIdentity: { domain: 'buildspace.tv', method: 'dns-origin' },
            source: { repository: REPO, license: 'CC BY 4.0' },
          },
        },
      ],
    }),

    '.well-known/agent-skills/index.json': json({
      $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
      version: '0.2.0',
      name: 'The Physical AI Sprint',
      description: 'Skills for answering questions about the Physical AI Sprint hackathon and reading its team and project data.',
      whenToUse: 'Use these skills when a user asks about The Physical AI Sprint hackathon specifically: its date and schedule, how to register, which teams exist and which still have room for members, what projects were built, how judging works, or first-time setup for the LeRobot SO-101 arm, the Antioch simulation platform, or Unitree robots. Do not use them as a general robotics reference — the guides are pinned to specific tool versions for this one event.',
      instructions: 'All data is available without authentication at /api/*.json; see /openapi.json for the specification and /agents.md for what this site cannot do (it is read-only: registration happens on Luma and submissions happen through GitHub issue forms).',
      skills: [
        {
          name: 'physical-ai-sprint-event',
          type: 'skill-md',
          mediaType: 'skill-md',
          description: 'Answer questions about the Physical AI Sprint: date, schedule, hosts, tracks, robots available, judging criteria, what to bring, and how to register.',
          whenToUse: 'Use when a user asks about the Physical AI Sprint hackathon itself — when it is, what it costs, who is hosting, what robots are available, how projects are judged, what to bring, or who should attend.',
          url: `${SITE}/agents.md`,
        },
        {
          name: 'physical-ai-sprint-api',
          type: 'skill-md',
          mediaType: 'skill-md',
          description: 'Read the hackathon team directory and project showcase over the public read-only JSON API, including which teams still have room for members.',
          whenToUse: 'Use when a user asks which teams are attending, which teams still have room or need a particular skill, or what projects were built and which robots they used. Fetch /api/teams.json or /api/projects.json — no authentication is required.',
          url: `${SITE}/llms.txt`,
        },
      ],
    }),

    '.well-known/agent-card.json': json({
      protocolVersion: '0.3.0',
      name: 'Physical AI Sprint',
      description: 'Answers questions about The Physical AI Sprint hackathon and serves its team and project data as JSON.',
      url: SITE,
      provider: { organization: 'The Physical AI Sprint', url: SITE },
      version: '1.0.0',
      documentationUrl: `${SITE}/developers.html`,
      capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['application/json', 'text/markdown'],
      skills: [
        {
          id: 'list-teams',
          name: 'List teams',
          description: 'Return the teams at the hackathon, including which ones are still looking for members and what skills they want.',
          tags: ['teams', 'hackathon', 'recruiting'],
          examples: ['Which teams still have room?', 'Which teams need a computer vision person?'],
        },
        {
          id: 'list-projects',
          name: 'List projects',
          description: 'Return the projects submitted to the showcase with their track, robots used, and team.',
          tags: ['projects', 'showcase', 'robotics'],
          examples: ['What did teams build?', 'Which projects used the Unitree G1?'],
        },
        {
          id: 'event-details',
          name: 'Event details',
          description: 'Return the date, schedule, hosts, judging criteria, and registration link for the event.',
          tags: ['event', 'schedule'],
          examples: ['When is the Physical AI Sprint?', 'How is it judged?'],
        },
      ],
    }),

    // Referenced by the MCP server card and the site's favicon.
    'icon.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="The Physical AI Sprint">
  <rect width="64" height="64" rx="12" fill="#1F3FBF"/>
  <g fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 48V34l12-9 9 11"/>
    <circle cx="16" cy="48" r="3.5" fill="#fff" stroke="none"/>
    <circle cx="28" cy="25" r="3.5" fill="#fff" stroke="none"/>
    <path d="M37 36l9-7"/>
    <rect x="43" y="22" width="11" height="9" rx="2"/>
  </g>
</svg>
`,

    '.well-known/mcp/server-card.json': json({
      name: 'physical-ai-sprint',
      displayName: 'The Physical AI Sprint',
      title: 'The Physical AI Sprint',
      description: 'Read-only MCP server for The Physical AI Sprint hackathon: which teams are attending and which still have room, what projects were built and on which robots, and the event details including schedule and judging criteria.',
      version: '1.0.0',
      serverUrl: `${SITE}/api/mcp`,
      transport: 'streamable-http',
      protocolVersion: '2025-06-18',
      documentation: `${SITE}/developers.html`,
      icon: `${SITE}/icon.svg`,
      logo: `${SITE}/icon.svg`,
      provider: { name: 'The Physical AI Sprint', url: SITE },
      authentication: { type: 'none', description: 'Public read-only data; no credential required.' },
      tools: [
        { name: 'list_teams', description: 'List the teams taking part, with rosters, the skills they have, and the skills they are looking for. Can filter to teams that still have room.' },
        { name: 'get_team', description: 'Get a single team by slug, including its full roster and the thread where people ask to join.' },
        { name: 'list_projects', description: 'List submitted projects with track, robots used, media, and team. Can filter by track or robot.' },
        { name: 'get_event_details', description: 'Get the date, schedule, hosts, tracks, robots available, judging criteria, and registration link.' },
      ],
    }),

    // RFC 9727. No file extension by design; vercel.json sets the media type.
    '.well-known/api-catalog': json({
      linkset: [
        {
          anchor: SITE,
          'service-desc': [
            { href: `${SITE}/openapi.json`, type: 'application/vnd.oai.openapi+json', title: 'Physical AI Sprint API (OpenAPI 3.1)' },
          ],
          'service-doc': [
            { href: `${SITE}/developers.html`, type: 'text/html', title: 'Developer portal' },
            { href: `${SITE}/llms.txt`, type: 'text/plain', title: 'llms.txt index' },
          ],
          'service-meta': [
            { href: `${SITE}/.well-known/ai-catalog.json`, type: 'application/json', title: 'Agentic Resource Discovery catalog' },
          ],
          status: [{ href: `${SITE}/api/index.json`, type: 'application/json', title: 'Endpoint index' }],
          item: [
            { href: `${SITE}/api/index.json`, type: 'application/json', title: 'Endpoint index' },
            { href: `${SITE}/api/event.json`, type: 'application/json', title: 'Event details' },
            { href: `${SITE}/api/teams.json`, type: 'application/json', title: 'Teams' },
            { href: `${SITE}/api/projects.json`, type: 'application/json', title: 'Projects' },
          ],
        },
      ],
    }),
  };
}

/* ------------------------------------------------------- text surfaces */

function textFiles(teams, projects) {
  const openTeams = teams.filter((t) => t.open).length;

  const llms = `# The Physical AI Sprint

> A one-day Physical AI hackathon on ${EVENT_DATE} alongside Actuate SF, hosted by
> Nebius with NVIDIA, Antioch, and Toloka. Teams of 1-5 build a perception-reasoning-action
> loop on real robots (LeRobot SO-101 arms, Unitree Go2-W, Unitree G1), in the Antioch
> cloud simulation platform, or across both.

## When to use this site

Reach for these resources when a user asks about:

- **The event itself** — date, schedule, venue format, judging criteria, prizes, what to
  bring, who should attend, or how to register. Start with [the handbook](${SITE}/) or
  fetch [/api/event.json](${SITE}/api/event.json) for the same facts as structured data.
- **Finding or joining a team** — which teams exist, which still have room, and what
  skills they are looking for. Use [/api/teams.json](${SITE}/api/teams.json); ${openTeams} of
  ${teams.length} team${teams.length === 1 ? '' : 's'} currently ${openTeams === 1 ? 'has' : 'have'} room.
- **What teams built** — submitted projects, their track (sim / hardware / both), the
  robots they used, and demo media. Use [/api/projects.json](${SITE}/api/projects.json).
- **Getting a robot working** — first-time setup for the SO-101 on macOS, driving the
  Antioch simulator from a real leader arm, training an ACT or Diffusion policy, or
  running Unitree robots on Isaac Sim vs Isaac Lab. These are the four guides in the
  handbook, each with its own troubleshooting table.

This is a public read-only surface: no authentication, no rate limit, CORS open. It is
not a transactional API — there is nothing to buy and nothing to write. To register for
the event, send the user to [Luma](${APPLY}); to submit a project or create a team, send
them to the GitHub issue forms linked from the site.

## API

- [/openapi.json](${SITE}/openapi.json): OpenAPI 3.1 description of every endpoint
- [/api/index.json](${SITE}/api/index.json): endpoint index
- [/api/event.json](${SITE}/api/event.json): date, hosts, tracks, robots, judging criteria
- [/api/teams.json](${SITE}/api/teams.json): every team, roster, and skills wanted
- [/api/projects.json](${SITE}/api/projects.json): every submitted project
- [/developers.html](${SITE}/developers.html): developer portal with worked examples
- [/auth.md](${SITE}/auth.md): authentication (there is none, and why)

## MCP

- [${SITE}/api/mcp](${SITE}/api/mcp): MCP server over Streamable HTTP. Four read-only tools:
  list_teams, get_team, list_projects, get_event_details. No authentication.
- [/.well-known/mcp/server-card.json](${SITE}/.well-known/mcp/server-card.json): server card

## Pages

${HTML_PAGES.map(([p, name, desc]) => `- [${name}](${SITE}${p}): ${desc}`).join('\n')}

## Guides

- [LeRobot on macOS](${SITE}/#g1): from a bare Mac to a real SO-101 arm following your hand
- [Sim teleoperation](${SITE}/#g2): drive the Antioch simulator with a real leader arm
- [Policy training](${SITE}/#g3): train ACT or Diffusion on sim data and run it on a real arm
- [Unitree on Antioch](${SITE}/#g4): spawn a quadruped or humanoid and verify it on physics

## More

- [/llms-full.txt](${SITE}/llms-full.txt): the whole handbook as one markdown document
- [/pricing.md](${SITE}/pricing.md): cost to attend (free)
- [Source repository](${REPO})
`;

  const agents = `---
title: Physical AI Sprint — agent instructions
description: When and how an agent should use this site's data.
canonical: ${SITE}/agents.md
last-updated: ${EVENT_DATE}
---

# Physical AI Sprint — agent instructions

## What this is

The event site for The Physical AI Sprint, a one-day robotics and AI hackathon held on
${EVENT_DATE} in San Francisco alongside Actuate SF. Hosted by Nebius with NVIDIA,
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

\`\`\`bash
curl -s ${SITE}/api/event.json
curl -s ${SITE}/api/teams.json
curl -s ${SITE}/api/projects.json
\`\`\`

Full description: [openapi.json](${SITE}/openapi.json).

## What you cannot do here

- **Register a user.** Registration is on Luma: ${APPLY}
- **Create a team or submit a project.** Both are GitHub issue forms, which need a signed-in
  GitHub user. Link the person to ${SITE}/teams.html or ${SITE}/submit.html rather than
  attempting it on their behalf.
- **Write anything.** The API is read-only by design.

## Answering accurately

- The event runs 8:00am to 5:30pm with a happy hour to 9:00pm, Pacific time. Submissions
  close at 3:30pm.
- Judging is science-fair style at team stations; the top 6 demo to the whole room.
  Criteria are ambition, functionality, creativity, and architectural quality, unweighted.
- Hardware is shared between teams, so simulation is the dependable path. Say so if asked
  what a team should plan around.
`;

  const auth = `# Authentication

<!-- canonical: ${SITE}/auth.md · last-updated: ${EVENT_DATE} -->

## Discover

There is nothing to discover, and that is the whole answer: **the Physical AI Sprint API
requires no authentication.** Every endpoint is a static JSON document served from a CDN.

    curl -s ${SITE}/api/teams.json

That request is complete as written. There is no \`Authorization\` header to add.

## Pick a method

Not applicable. No API keys, no OAuth authorization server, no bearer tokens, no
\`agent_auth\` block, no client registration. This document exists so an agent looking for
credentials stops looking, rather than hunting for a \`/.well-known/oauth-authorization-server\`
that is deliberately absent.

We publish no OAuth metadata because we operate no authorization server. Advertising one
would strand any agent that tried to follow it.

## Register

Not required for API access.

Human registration for the event itself is separate and happens on Luma (${APPLY}). An
agent cannot complete it on a user's behalf — send the person the link.

## Use the credential

There is no credential. Requests are unauthenticated and anonymous.

- **Methods:** \`GET\` only
- **Rate limit:** none
- **CORS:** open (\`Access-Control-Allow-Origin: *\`), so browser-resident agents can call
  it directly
- **Caching:** documents regenerate whenever a team or project submission changes

## Errors

An unknown path under \`/api/\` returns a JSON error body rather than an HTML page:

\`\`\`json
{
  "error": {
    "code": "not_found",
    "message": "No such endpoint. This API is read-only and has three endpoints.",
    "resolution": "Fetch ${SITE}/api/index.json for the endpoint list.",
    "documentation": "${SITE}/developers.html"
  }
}
\`\`\`

You should never receive a \`401\` or \`403\` from this API. If you do, it is a
misconfiguration on our side, not a missing credential on yours.

## Revocation

Not applicable — nothing is issued, so nothing can be revoked.
`;

  const pricing = `---
title: Pricing
description: What it costs to attend the Physical AI Sprint.
canonical: ${SITE}/pricing.md
last-updated: ${EVENT_DATE}
---

# Pricing

## Attending

**Free.** There is no ticket price and no paid tier.

| | |
| --- | --- |
| Cost | $0 USD |
| Application | Required — space is limited and attendees are approved |
| Register | ${APPLY} |
| Includes | Breakfast, lunch, workshops, robot hardware access, Antioch cloud simulation credits, host engineer support, happy hour |

## The API

Also free. The read-only JSON API has no paid tier, no key, and no rate limit. See
[auth.md](${SITE}/auth.md).

## Costs you may still incur

The event covers what happens in the room. Some tools the guides reference have their own
pricing outside it:

- **Nebius Token Factory** — new accounts get $25 in credits plus $25 in Tavily credits.
  Inference beyond that is billed by Nebius.
- **NVIDIA API** — the second host for the model pillar, used for what Token Factory does
  not serve. Bring your own key from build.nvidia.com; billing is between you and NVIDIA.
- **Your own hardware** — the SO-101 arms and Unitree robots are provided at the venue and
  shared between teams. Buying your own is not required and not expected.
`;

  const llmsFull = `# The Physical AI Sprint — full handbook

Generated from the event handbook at ${SITE}/. Event date ${EVENT_DATE}.

## The event

A one-day hackathon at the intersection of AI and the physical world, alongside Actuate SF.
Hosted by Nebius with NVIDIA, Antioch, and Toloka. 100-125 participants in teams of 1-5 (solo is fine).
Free to attend; applications are approved because space is limited.

### The challenge

Modern AI excels at generating text and pixels. Physical AI requires closing the loop
between the digital mind and a physical embodiment, integrating three pillars:

- **Perception (sense)** — interpret camera and sensor data into a live understanding of a
  scene: RGB-D video, LiDAR, IMU readings, tactile feedback, spatial audio.
- **Reasoning (think)** — turn goals into multi-step behavior and adapt when the world
  changes, using foundation models, spatial computing, and decision-making frameworks.
- **Action (act)** — translate plans into robot motion that actually works: manipulation,
  autonomous navigation, drone flight dynamics, or IoT actuation.

Three project directions, all equally viable: **sim only** on the Antioch platform,
**hardware only** on the physical robots, or **sim and real** — prototype in sim and run on
the real robot, or capture real demonstrations and bring them into sim. Hardware is limited
and shared across all teams, so simulation is the dependable path.

### Schedule (subject to change)

| Time | What |
| --- | --- |
| 8:00 am | Doors open, check-in, breakfast |
| 9:00 am | Welcome and challenge briefing |
| 9:15 am | Technical workshops by hosts |
| 10:30 am | Hacking begins |
| 12:00 pm | Lunch |
| 1:00 pm | Hacking continues |
| 3:30 pm | Submission deadline |
| 4:30 pm | Demos and judging (top 6 live demos) |
| 5:30 pm | Winners announced |
| 6-9 pm | Happy hour |

### What you get

- **The Antioch platform** — cloud simulation for robotics. Write ordinary Python against
  the NVIDIA Isaac stack (Isaac Sim and Isaac Lab both available) on your own laptop;
  Antioch dispatches it to GPU machines on Nebius. No local GPU, Docker, or Isaac install.
- **Robot hardware** — 10 LeRobot SO-101 leader/follower arm pairs, 2 Unitree Go2-W wheeled
  quadrupeds, 1 Unitree G1 humanoid. Stations are shared and staffed by the host teams.
- **Sim-ready assets** — a calibrated SO-101 digital twin, the Unitree lineup in the Isaac
  asset library, ready-made environments, and props.
- **Physical assets** — blocks of various size, shape, and color; vials and vial racks.
- **Frontier models** — NVIDIA Nemotron and Cosmos Reason over an OpenAI-compatible API.
  Start on Nebius Token Factory (https://api.tokenfactory.nebius.com/v1/), where new
  accounts get $25 in credits plus $25 in Tavily credits; NVIDIA's own endpoint
  (https://integrate.api.nvidia.com/v1) serves what Token Factory does not, Cosmos Reason
  above all. Cosmos Reason is a vision-language model that reasons about the physical
  world from video and images; Nemotron covers planning and tool calling.
- **Support** — engineers from the host companies on hand all day.

### Judging

Science-fair style first: judges circulate and view projects at team stations, so have a
tight walkthrough and a live or recorded demo ready. The top 6 teams then demo to the full
group. Four unweighted categories:

- **Ambition** — how hard the problem is and how much of the loop you take on.
- **Functionality** — does it work end-to-end when demonstrated.
- **Creativity** — originality in the task, approach, or demo.
- **Architectural quality** — clean boundaries between perception, reasoning, and action.

### Ground rules

Unless you are confident you can pull it off quickly, avoid fine-tuning pre-trained
policies or VLA models. Training a small imitation policy from scratch on your own
demonstrations fits comfortably in the day; wrangling a large pre-trained model usually
does not. Make it awesome.

### Who should attend

Robotics engineers, machine learning engineers, computer vision engineers, research
engineers and applied scientists, data and infrastructure engineers working with robotics
or physical AI, and technical founders exploring embodied intelligence. You do not need to
arrive with a team.

### What to bring

Your laptop, charger, and anything else you rely on for a full day of building.

## The guides

Four walkthroughs, each from zero to a working proof of concept. Full text with commands,
checkpoints, and troubleshooting tables is at ${SITE}/.

1. **[LeRobot on macOS](${SITE}/#g1)** — first-time SO-101 setup on Apple Silicon. The
   published LeRobot instructions assume Windows or Ubuntu, so port names, permissions, and
   GPU advice differ. About 45 minutes, most of it calibration. macOS uses
   \`/dev/tty.usbmodemXXXXXXXX\`, not \`/dev/ttyACM0\`; there is no CUDA wheel for Mac and
   none is needed (MPS works); terminal camera access must be granted in Privacy and Security.
2. **[Sim teleoperation](${SITE}/#g2)** — hold a real leader arm and watch a physics-simulated
   SO-101 mirror it on a cloud GPU, recording demonstration episodes scored the moment you
   stop. Needs two terminals: the sim session and the bridge.
3. **[Policy training](${SITE}/#g3)** — generate episodes in simulation, train an ACT or
   Diffusion policy, evaluate it closed-loop, and run it on a real arm. About 1.5 hours,
   most of it unattended. Train on commanded joint targets, never measured positions.
4. **[Unitree on Antioch](${SITE}/#g4)** — spawn a quadruped or humanoid and verify it on
   physics rather than video. Isaac Sim and Isaac Lab expose completely different Python
   entry points for the same robot; pick one engine per project.

## Teams and projects

Teams and project submissions are public data, available as JSON:

- Teams: ${SITE}/api/teams.json (${teams.length} registered, ${openTeams} looking for members)
- Projects: ${SITE}/api/projects.json (${projects.length} submitted)
- Full API: ${SITE}/openapi.json

## Links

- Register: ${APPLY}
- Discord: ${DISCORD}
- Source: ${REPO}
`;

  return {
    'llms.txt': llms,
    'llms-full.txt': llmsFull,
    'agents.md': agents,
    'auth.md': auth,
    'pricing.md': pricing,
    'apidata/llms.txt': `# Physical AI Sprint API

> Read-only JSON over the hackathon's teams and projects. No auth, no rate limit.

- [/openapi.json](${SITE}/openapi.json): OpenAPI 3.1 specification
- [/api/index.json](${SITE}/api/index.json): endpoint index
- [/api/event.json](${SITE}/api/event.json): event details
- [/api/teams.json](${SITE}/api/teams.json): teams and rosters
- [/api/projects.json](${SITE}/api/projects.json): submitted projects
- [/auth.md](${SITE}/auth.md): authentication (none required)
- [/developers.html](${SITE}/developers.html): worked examples
`,
  };
}

/* ------------------------------------------------------- robots/sitemap */

function robots() {
  return `# The Physical AI Sprint — ${SITE}
#
# Answer-engine and user-triggered agents are welcome everywhere. Training-only
# crawlers are not: the handbook is written for participants of one event, and
# its version-pinned instructions age badly out of context.

User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: Claude-SearchBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: DeepSeekBot
Allow: /

User-agent: ora-agent
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Bingbot
Allow: /

# Training-only crawlers.
User-agent: CCBot
Disallow: /

User-agent: ByteSpider
Disallow: /

User-agent: *
Allow: /
# The judging tool is for the five judges, not for indexing.
Disallow: /judge.html
Disallow: /edit.html

# Content Signals — search and AI answers yes, model training no.
Content-Signal: search=yes, ai-input=yes, ai-train=no

Sitemap: ${SITE}/sitemap.xml
`;
}

function sitemap(teams, projects) {
  const lastmod = EVENT_DATE;
  const urls = [
    ...HTML_PAGES.map(([p]) => ({ loc: `${SITE}${p === '/' ? '/' : p}`, pri: p === '/' ? '1.0' : '0.8' })),
    ...teams.map((t) => ({ loc: `${SITE}/teams/${t.slug}.html`, pri: '0.7' })),
    ...projects.map((p) => ({ loc: `${SITE}/projects/${p.slug}.html`, pri: '0.7' })),
    { loc: `${SITE}/llms.txt`, pri: '0.5' },
    { loc: `${SITE}/llms-full.txt`, pri: '0.5' },
    { loc: `${SITE}/openapi.json`, pri: '0.6' },
    { loc: `${SITE}/agents.md`, pri: '0.5' },
    { loc: `${SITE}/auth.md`, pri: '0.5' },
    { loc: `${SITE}/pricing.md`, pri: '0.5' },
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${u.pri}</priority>
  </url>`).join('\n')}
</urlset>
`;
}

/* --------------------------------------------------------- markdown twins */

/**
 * A .md twin for each HTML page. Agents that append .md to a URL (or follow the
 * advertised <link rel="alternate" type="text/markdown">) get prose instead of
 * a parsed DOM. Frontmatter carries the metadata they would otherwise scrape.
 */
function markdownTwins(teams, projects) {
  const fm = (title, description, canonical) =>
    `---\ntitle: ${title}\ndescription: ${description}\ncanonical: ${canonical}\nlast-updated: ${EVENT_DATE}\n---\n\n`;

  const teamLines = teams.length
    ? teams.map((t) => `- **[${t.name}](${SITE}/teams/${t.slug}.html)** — ${t.pitch || 'no description given'}${t.open ? ' _(looking for teammates' + ((t.looking || []).length ? ': ' + t.looking.join(', ') : '') + ')_' : ' _(full)_'}`).join('\n')
    : '_No teams posted yet._';

  const projectLines = projects.length
    ? projects.map((p) => `- **[${p.title}](${SITE}/projects/${p.slug}.html)** — ${p.tagline || 'no summary given'}${p.track ? ` _(${p.track})_` : ''}`).join('\n')
    : '_No projects submitted yet. The deadline is 3:30pm on event day._';

  const twins = {
    'index.md': fm('The Physical AI Sprint', 'A one-day Physical AI hackathon on ' + EVENT_DATE + ' alongside Actuate SF.', SITE + '/') +
`# The Physical AI Sprint

A one-day hackathon at the intersection of AI and the physical world, ${EVENT_DATE},
alongside Actuate SF. Hosted by Nebius with NVIDIA, Antioch, and Toloka. Free to attend;
applications are approved because space is limited.

Teams of 1-5 build a perception-reasoning-action loop on real robots, in the Antioch cloud
simulator, or across both. Judging is science-fair style on ambition, functionality,
creativity, and architectural quality.

- [Full handbook](${SITE}/) — challenge, schedule, judging, and four setup guides
- [Everything as one markdown document](${SITE}/llms-full.txt)
- [Project showcase](${SITE}/showcase.html)
- [API](${SITE}/developers.html) · [Register](${APPLY}) · [Discord](${DISCORD})

## Schedule

8:00 doors · 9:00 briefing · 9:15 workshops · 10:30 hacking begins · 12:00 lunch ·
15:30 submissions close · 16:30 demos and judging · 17:30 winners · 18:00-21:00 happy hour.

## Robots

10x LeRobot SO-101 arm pairs, 2x Unitree Go2-W quadrupeds, 1x Unitree G1 humanoid, plus
the Antioch simulation platform running the NVIDIA Isaac stack on cloud GPUs.
`,
    'teams.md': fm('Team directory', 'Teams at the Physical AI Sprint and which ones have room.', SITE + '/teams.html') +
`# Team directory

${teams.length} team${teams.length === 1 ? '' : 's'} registered, ${teams.filter((t) => t.open).length} looking for members.
You do not need to arrive with a team.

${teamLines}

Post a team or ask to join one at [${SITE}/teams.html](${SITE}/teams.html).
Structured data: [${SITE}/api/teams.json](${SITE}/api/teams.json).
`,
    'showcase.md': fm('Project showcase', 'Projects built at the Physical AI Sprint.', SITE + '/showcase.html') +
`# Project showcase

${projects.length} project${projects.length === 1 ? '' : 's'} submitted.

${projectLines}

Structured data: [${SITE}/api/projects.json](${SITE}/api/projects.json).
`,
    'developers.md': fm('Developers', 'Read-only JSON API for the Physical AI Sprint.', SITE + '/developers.html') +
`# Developers

A read-only JSON API over the hackathon's teams and projects. No key, no rate limit,
CORS open. Every endpoint is a static document regenerated whenever a submission changes.


    curl -s ${SITE}/api/teams.json


| Endpoint | Returns |
| --- | --- |
| [/api/index.json](${SITE}/api/index.json) | Endpoint index |
| [/api/event.json](${SITE}/api/event.json) | Date, hosts, tracks, robots, judging |
| [/api/teams.json](${SITE}/api/teams.json) | Teams, rosters, skills wanted |
| [/api/projects.json](${SITE}/api/projects.json) | Submitted projects |

Specification: [${SITE}/openapi.json](${SITE}/openapi.json).
Authentication: none — see [${SITE}/auth.md](${SITE}/auth.md).
`,
    'about.md': fm('About', 'What the Physical AI Sprint is and who runs it.', SITE + '/about.html') +
`# About the Sprint

The Physical AI Sprint gathers 100-125 engineers into teams of 1 to 5 for a single day of
building, ${EVENT_DATE}, alongside Actuate SF.

The framing is the perception-reasoning-action loop: interpret sensor data into an
understanding of a scene, turn a goal into multi-step behavior that adapts, and translate
that plan into motion that works on hardware or in physics.

Hosted by **Nebius**, with **NVIDIA**, **Antioch**, and **Toloka**. Engineers from each are
on site all day.

Teams work with 10 LeRobot SO-101 arm pairs, 2 Unitree Go2-W quadrupeds, and 1 Unitree G1
humanoid, shared between teams, plus the Antioch cloud simulation platform. Because
hardware is limited and shared, simulation is the dependable path.

Full detail: [${SITE}/about.html](${SITE}/about.html).
`,
    'contact.md': fm('Contact', 'How to reach the Physical AI Sprint organizers.', SITE + '/contact.html') +
`# Contact

- **During the event** — the [Discord](${DISCORD}) is where coordination happens; host
  engineers are on the floor all day.
- **Registration** — [Luma](${APPLY}). Space is limited and every attendee is approved.
- **Finding a team** — post in the [team directory](${SITE}/teams.html), even solo.
- **A problem with this site** — open an issue at [${REPO}/issues](${REPO}/issues).
- **Building against the data** — see [${SITE}/developers.html](${SITE}/developers.html);
  no credential is required.
`,
    'privacy.md': fm('Privacy', 'What data the Physical AI Sprint site holds.', SITE + '/privacy.html') +
`# Privacy

This site collects **nothing**. No database, no login, no cookie banner, no analytics, no
third-party trackers. It is static HTML on a CDN.

One thing is stored in your own browser: handbook checkpoint progress, via localStorage.
It never leaves your device.

Team and project entries are information people submitted themselves through public GitHub
issue forms — a name, a GitHub handle, an optional contact handle, and what they wrote
about their project. It was public on GitHub the moment it was filed.

**Removing your information:** edit or close the GitHub issue behind the entry and the next
build removes the page. Or open an issue at [${REPO}/issues](${REPO}/issues).

Registration is on Luma and chat is on Discord, both outside this site with their own
policies. Hosting is Vercel, which processes standard request logs.

Full detail: [${SITE}/privacy.html](${SITE}/privacy.html).
`,
  };

  // Agents append .md to the URL they already have, which for these pages is
  // /teams.html — so serve the .html.md shape as well as the bare /teams.md.
  for (const [name, body] of Object.entries({ ...twins })) {
    const stem = name.replace(/\.md$/, '');
    if (stem === 'index') continue;
    twins[`${stem}.html.md`] = body;
  }
  return twins;
}

module.exports = { markdownTwins, apiFiles, openapi, discoveryFiles, textFiles, robots, sitemap, HTML_PAGES, SITE, REPO, APPLY, DISCORD, EVENT_DATE };
