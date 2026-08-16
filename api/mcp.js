/**
 * MCP server for The Physical AI Sprint — Streamable HTTP transport.
 *
 * Exposes the same read-only data the JSON API publishes, over the protocol
 * agents actually call. Zero dependencies: JSON-RPC 2.0 handled directly, so
 * the project stays a static deploy with functions rather than a built app.
 *
 * Read-only by design. There is nothing to write here: registration lives on
 * Luma and submissions are GitHub issue forms, both of which need a signed-in
 * human. Every tool is annotated readOnlyHint so an agent knows it can call
 * them without confirmation.
 */

const ORIGIN = process.env.PUBLIC_ORIGIN || 'https://www.buildspace.tv';
const PROTOCOL_VERSION = '2025-06-18';
const SERVER = { name: 'physical-ai-sprint', version: '1.0.0' };

const INSTRUCTIONS = [
  'Data for The Physical AI Sprint, a one-day Physical AI hackathon on 2026-08-17 in',
  'San Francisco alongside Actuate SF, hosted by Nebius with NVIDIA, Antioch and Toloka.',
  '',
  'Use these tools to answer questions about the event itself (date, schedule, hosts,',
  'robots available, judging criteria), about which teams are attending and which still',
  'have room for members, and about what projects teams built.',
  '',
  'Everything here is read-only. You cannot register a person, create a team, or submit',
  'a project through this server: registration is on Luma and both forms are GitHub issue',
  'forms that need a signed-in human. Give the user the link instead of attempting it.',
].join('\n');

async function load(file) {
  const res = await fetch(`${ORIGIN}/api/${file}.json`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`upstream ${res.status} for ${file}`);
  return res.json();
}

const TOOLS = [
  {
    name: 'list_teams',
    title: 'List hackathon teams',
    description: 'List the teams taking part in The Physical AI Sprint, with each team\'s roster, the skills they already have, and the skills they are still looking for. Optionally filter to teams that have room for more members, or to teams seeking a particular skill.',
    inputSchema: {
      type: 'object',
      properties: {
        looking_for_members: {
          type: 'boolean',
          description: 'When true, return only teams that still have room for new members.',
        },
        skill: {
          type: 'string',
          description: 'Case-insensitive substring to match against the skills a team is looking for, e.g. "vision".',
        },
      },
      required: [],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'get_team',
    title: 'Get one team',
    description: 'Get a single hackathon team by its slug, including the full roster with GitHub handles, the pitch describing what they want to build, and the URL of the GitHub thread where people ask to join.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The team slug, as returned by list_teams, e.g. "practice-makes-perfect".' },
      },
      required: ['slug'],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'list_projects',
    title: 'List submitted projects',
    description: 'List the projects submitted to the showcase, with the track each ran in (simulation only, hardware only, or both), the robots used, demo media, and the team that built it. Optionally filter by track or by robot.',
    inputSchema: {
      type: 'object',
      properties: {
        track: {
          type: 'string',
          enum: ['sim', 'hardware', 'both'],
          description: 'Filter to one track: "sim", "hardware", or "both".',
        },
        robot: {
          type: 'string',
          description: 'Case-insensitive substring matched against the robots a project used, e.g. "SO-101" or "G1".',
        },
      },
      required: [],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'get_event_details',
    title: 'Get event details',
    description: 'Get the details of The Physical AI Sprint: the date, start and end times, hosting organizations, the three project tracks, the robot hardware available, the judging criteria, the submission deadline, and how to register.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
];

const text = (value) => ({
  content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

async function callTool(name, args) {
  const a = args && typeof args === 'object' ? args : {};

  if (name === 'list_teams') {
    const { data } = await load('teams');
    let teams = data;
    if (a.looking_for_members === true) teams = teams.filter((t) => t.lookingForMembers);
    if (typeof a.skill === 'string' && a.skill.trim()) {
      const q = a.skill.trim().toLowerCase();
      teams = teams.filter((t) => (t.skillsWanted || []).some((s) => s.toLowerCase().includes(q)));
    }
    return text({ count: teams.length, teams });
  }

  if (name === 'get_team') {
    if (typeof a.slug !== 'string' || !a.slug.trim()) {
      return { isError: true, ...text('The "slug" argument is required. Call list_teams to see the available slugs.') };
    }
    const { data } = await load('teams');
    const team = data.find((t) => t.slug === a.slug.trim());
    if (!team) {
      return { isError: true, ...text(`No team with slug "${a.slug}". Call list_teams to see the available slugs.`) };
    }
    return text(team);
  }

  if (name === 'list_projects') {
    const { data } = await load('projects');
    let projects = data;
    if (typeof a.track === 'string' && a.track.trim()) {
      const t = a.track.trim().toLowerCase();
      if (!['sim', 'hardware', 'both'].includes(t)) {
        return { isError: true, ...text('The "track" argument must be one of: sim, hardware, both.') };
      }
      projects = projects.filter((p) => p.track === t);
    }
    if (typeof a.robot === 'string' && a.robot.trim()) {
      const q = a.robot.trim().toLowerCase();
      projects = projects.filter((p) => (p.robots || []).some((r) => r.toLowerCase().includes(q)));
    }
    return text({ count: projects.length, projects });
  }

  if (name === 'get_event_details') return text(await load('event'));

  const err = new Error(`Unknown tool: ${name}`);
  err.rpcCode = -32602;
  throw err;
}

function rpcError(id, code, message, data) {
  return { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message, ...(data ? { data } : {}) } };
}

async function handleRpc(msg) {
  const { id, method, params } = msg || {};

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { ...SERVER, title: 'The Physical AI Sprint' },
        instructions: INSTRUCTIONS,
      },
    };
  }

  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  }

  if (method === 'tools/call') {
    const name = params && params.name;
    if (typeof name !== 'string') return rpcError(id, -32602, 'Invalid params: "name" is required.');
    if (!TOOLS.some((t) => t.name === name)) {
      return rpcError(id, -32602, `Unknown tool: ${name}`, { available: TOOLS.map((t) => t.name) });
    }
    try {
      return { jsonrpc: '2.0', id, result: await callTool(name, params.arguments) };
    } catch (e) {
      // A tool that fails reports it in-band so the model can react, rather
      // than surfacing a protocol error it cannot do anything about.
      return { jsonrpc: '2.0', id, result: { isError: true, ...text(`Tool "${name}" failed: ${e.message}`) } };
    }
  }

  // Notifications carry no id and expect no response.
  if (typeof method === 'string' && method.startsWith('notifications/')) return null;

  return rpcError(id, -32601, `Method not found: ${method}`);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(204).end();

  // A plain GET is a human or a crawler, not a transport handshake.
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(JSON.stringify({
      name: SERVER.name,
      title: 'The Physical AI Sprint',
      version: SERVER.version,
      description: 'MCP server exposing the hackathon\'s teams, projects, and event details. Read-only, no authentication.',
      protocolVersion: PROTOCOL_VERSION,
      transport: 'streamable-http',
      endpoint: `${ORIGIN}/api/mcp`,
      serverCard: `${ORIGIN}/.well-known/mcp/server-card.json`,
      documentation: `${ORIGIN}/developers.html`,
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
      hint: 'POST JSON-RPC 2.0 to this URL. Start with the "initialize" method.',
    }, null, 2));
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(405).send(JSON.stringify(rpcError(null, -32600, `${req.method} is not supported. POST JSON-RPC to this endpoint.`)));
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = undefined; }
  }
  if (!body || typeof body !== 'object') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(400).send(JSON.stringify(rpcError(null, -32700, 'Parse error: body is not valid JSON-RPC.')));
  }

  try {
    // Batches are part of JSON-RPC 2.0 and cheap to support.
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(handleRpc))).filter(Boolean);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(out.length ? 200 : 202).send(out.length ? JSON.stringify(out) : '');
    }
    const out = await handleRpc(body);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!out) return res.status(202).end();
    return res.status(200).send(JSON.stringify(out));
  } catch (e) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(500).send(JSON.stringify(rpcError(body && body.id, -32603, `Internal error: ${e.message}`)));
  }
};

module.exports.TOOLS = TOOLS;
module.exports.SERVER = SERVER;
