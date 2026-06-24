#!/usr/bin/env node
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, resolve as resolvePath } from 'node:path';

const args = process.argv.slice(2);
let projectRoot = process.cwd();
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project' && args[i + 1]) {
    projectRoot = resolvePath(args[i + 1]);
    i++;
  }
}

const skillsDir = join(projectRoot, '.agents', 'skills');
const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'agent-sync', version: '0.1.0' };

async function listSkillFiles() {
  if (!existsSync(skillsDir)) return [];
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const skillDir = join(skillsDir, e.name);
    const items = await walk(skillDir);
    for (const item of items) {
      const rel = item.slice(skillDir.length + 1).split(/[\\/]/).join('/');
      out.push({ skill: e.name, rel, absolute: item });
    }
  }
  return out;
}

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await walk(p)));
    } else if (e.isFile()) {
      out.push(p);
    }
  }
  return out;
}

function uriFor(skill, rel) {
  return `agent-sync://${skill}/${rel}`;
}

function parseUri(uri) {
  const m = uri.match(/^agent-sync:\/\/([^/]+)\/(.+)$/);
  if (!m) return null;
  return { skill: decodeURIComponent(m[1]), rel: m[2].split('/').map(decodeURIComponent).join('/') };
}

async function handleInitialize() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: { tools: {}, resources: {} },
    serverInfo: SERVER_INFO
  };
}

async function handleToolsList() {
  return {
    tools: [
      {
        name: 'list_skills',
        description: 'List every Agent Skill synthesized for this project by agent-sync.',
        inputSchema: { type: 'object', properties: {}, additionalProperties: false }
      },
      {
        name: 'read_skill',
        description: 'Return the full SKILL.md and reference files for a given skill name.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Skill directory name (e.g. db-navigator).' }
          },
          required: ['name'],
          additionalProperties: false
        }
      }
    ]
  };
}

async function handleToolsCall(params) {
  const { name, arguments: argsObj } = params ?? {};
  if (name === 'list_skills') {
    const skills = existsSync(skillsDir)
      ? (await readdir(skillsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name)
      : [];
    const text = skills.length ? skills.join('\n') : '(no skills installed)';
    return { content: [{ type: 'text', text }] };
  }
  if (name === 'read_skill') {
    const skill = String(argsObj?.name ?? '');
    const skillDir = join(skillsDir, skill);
    if (!skill || !existsSync(skillDir)) {
      return { content: [{ type: 'text', text: `Skill "${skill}" not found in ${skillsDir}` }], isError: true };
    }
    const files = await walk(skillDir);
    const parts = [];
    for (const f of files) {
      const rel = f.slice(skillDir.length + 1).split(/[\\/]/).join('/');
      const s = await stat(f);
      if (s.size > 200_000) {
        parts.push(`===== ${rel} =====\n(skipped, ${s.size} bytes)\n`);
        continue;
      }
      const body = await readFile(f, 'utf8').catch(() => '(binary)');
      parts.push(`===== ${rel} =====\n${body}\n`);
    }
    return { content: [{ type: 'text', text: parts.join('\n') }] };
  }
  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
}

async function handleResourcesList() {
  const files = await listSkillFiles();
  return {
    resources: files
      .filter((f) => f.rel.endsWith('.md') || f.rel.endsWith('.json') || f.rel.endsWith('.prisma') || f.rel.endsWith('.sql') || f.rel.endsWith('.py') || f.rel.endsWith('.rb') || f.rel.endsWith('.ts'))
      .map((f) => ({
        uri: uriFor(f.skill, f.rel),
        name: `${f.skill}/${f.rel}`,
        description: `agent-sync skill resource (${f.skill})`,
        mimeType: f.rel.endsWith('.json') ? 'application/json' : 'text/markdown'
      }))
  };
}

async function handleResourcesRead(params) {
  const uri = String(params?.uri ?? '');
  const parsed = parseUri(uri);
  if (!parsed) throw rpcError(-32602, `Invalid URI: ${uri}`);
  const file = join(skillsDir, parsed.skill, ...parsed.rel.split('/'));
  if (!file.startsWith(resolvePath(skillsDir))) throw rpcError(-32602, 'Path escapes skills dir');
  if (!existsSync(file)) throw rpcError(-32602, `Not found: ${uri}`);
  const text = await readFile(file, 'utf8');
  return {
    contents: [
      {
        uri,
        mimeType: basename(file).endsWith('.json') ? 'application/json' : 'text/markdown',
        text
      }
    ]
  };
}

function rpcError(code, message, data) {
  const err = new Error(message);
  err.code = code;
  if (data !== undefined) err.data = data;
  return err;
}

async function dispatch(method, params) {
  switch (method) {
    case 'initialize':
      return handleInitialize();
    case 'tools/list':
      return handleToolsList();
    case 'tools/call':
      return handleToolsCall(params);
    case 'resources/list':
      return handleResourcesList();
    case 'resources/read':
      return handleResourcesRead(params);
    case 'ping':
      return {};
    case 'notifications/initialized':
    case 'notifications/cancelled':
      return null;
    default:
      throw rpcError(-32601, `Method not found: ${method}`);
  }
}

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

let buffer = '';
let pending = 0;
let stdinClosed = false;

function maybeExit() {
  if (stdinClosed && pending === 0) process.exit(0);
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  let nl;
  while ((nl = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    pending++;
    handleLine(line).finally(() => {
      pending--;
      maybeExit();
    });
  }
});

async function handleLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  try {
    const result = await dispatch(method, params);
    if (id !== undefined && result !== null) {
      send({ jsonrpc: '2.0', id, result });
    }
  } catch (err) {
    if (id !== undefined) {
      send({
        jsonrpc: '2.0',
        id,
        error: {
          code: err && typeof err.code === 'number' ? err.code : -32603,
          message: err && err.message ? String(err.message) : 'Internal error'
        }
      });
    }
  }
}

process.stdin.on('end', () => {
  stdinClosed = true;
  maybeExit();
});
