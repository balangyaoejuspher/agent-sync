import fs from 'fs-extra';
import path from 'node:path';
import { globby } from 'globby';
import type { ProjectContext, Orm } from './detector.js';

export interface SchemaExtraction {
  dialect: Orm;
  content: string;
  source: string;
}

export interface QueryPattern {
  snippet: string;
  file: string;
  line: number;
}

export interface ApiRoute {
  method: string;
  path: string;
  file: string;
  line: number;
}

export interface AuthMarker {
  snippet: string;
  file: string;
  line: number;
}

export interface AuthReport {
  middlewares: AuthMarker[];
  roleConstants: AuthMarker[];
  routeFilesWithAuth: Set<string>;
}

export interface CiJob {
  workflow: string;
  file: string;
  name: string;
  triggers: string[];
  steps: string[];
}

export interface CiReport {
  systems: string[];
  jobs: CiJob[];
  secrets: string[];
}

export interface SynthesisInputs {
  context: ProjectContext;
  schema: SchemaExtraction | null;
  queryPatterns: QueryPattern[];
  routes?: ApiRoute[];
  routingStyle?: string;
  auth?: AuthReport;
  ci?: CiReport;
}

export async function extractSchema(context: ProjectContext): Promise<SchemaExtraction | null> {
  const { root, orm } = context;

  if (orm === 'prisma') {
    const file = path.join(root, 'prisma', 'schema.prisma');
    if (await fs.pathExists(file)) {
      const content = await fs.readFile(file, 'utf8');
      return { dialect: 'prisma', content, source: path.relative(root, file) };
    }
  }

  if (orm === 'drizzle') {
    const files = await globby(['**/schema.ts', '**/schema/*.ts', '**/db/schema*.ts'], {
      cwd: root,
      gitignore: true,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    });
    if (files.length > 0) {
      const merged = await mergeFiles(root, files.slice(0, 8));
      return { dialect: 'drizzle', content: merged.content, source: merged.source };
    }
  }

  if (orm === 'typeorm') {
    const files = await globby(['**/*.entity.ts', '**/entities/*.ts'], {
      cwd: root,
      gitignore: true,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**']
    });
    if (files.length > 0) {
      const merged = await mergeFiles(root, files.slice(0, 12));
      return { dialect: 'typeorm', content: merged.content, source: merged.source };
    }
  }

  if (orm === 'sequelize') {
    const files = await globby(
      ['**/models/*.{ts,js}', '**/models/*/index.{ts,js}', '**/src/models/*.{ts,js}'],
      {
        cwd: root,
        gitignore: true,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
      }
    );
    const filtered: string[] = [];
    for (const f of files) {
      const body = await fs.readFile(f, 'utf8').catch(() => '');
      if (/sequelize|DataTypes|Model\.init|sequelize\.define/.test(body)) filtered.push(f);
    }
    if (filtered.length > 0) {
      const merged = await mergeFiles(root, filtered.slice(0, 20));
      return { dialect: 'sequelize', content: merged.content, source: merged.source };
    }
  }

  if (orm === 'mongoose') {
    const files = await globby(['**/models/*.{ts,js}', '**/schemas/*.{ts,js}'], {
      cwd: root,
      gitignore: true,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    });
    const filtered: string[] = [];
    for (const f of files) {
      const body = await fs.readFile(f, 'utf8').catch(() => '');
      if (/mongoose\.Schema|new\s+Schema\s*\(/.test(body)) filtered.push(f);
    }
    if (filtered.length > 0) {
      const merged = await mergeFiles(root, filtered.slice(0, 20));
      return { dialect: 'mongoose', content: merged.content, source: merged.source };
    }
  }

  if (orm === 'sqlalchemy' || orm === 'django-orm') {
    const files = await globby(['**/models.py', '**/models/*.py'], {
      cwd: root,
      gitignore: true,
      absolute: true,
      ignore: ['**/.venv/**', '**/venv/**', '**/site-packages/**', '**/migrations/**']
    });
    if (files.length > 0) {
      const merged = await mergeFiles(root, files.slice(0, 12));
      return { dialect: orm, content: merged.content, source: merged.source };
    }
  }

  if (orm === 'active-record') {
    const files = await globby(['app/models/**/*.rb', 'db/schema.rb'], {
      cwd: root,
      gitignore: true,
      absolute: true
    });
    if (files.length > 0) {
      const merged = await mergeFiles(root, files.slice(0, 20));
      return { dialect: 'active-record', content: merged.content, source: merged.source };
    }
  }

  if (orm === 'knex') {
    const migDirs = await globby(['**/migrations'], {
      cwd: root,
      gitignore: true,
      absolute: true,
      onlyDirectories: true,
      ignore: ['**/node_modules/**']
    });
    const files: string[] = [];
    for (const dir of migDirs.slice(0, 3)) {
      const found = await globby(['*.{ts,js}'], { cwd: dir, absolute: true });
      files.push(...found);
    }
    files.sort();
    const tail = files.slice(-15);
    if (tail.length > 0) {
      const merged = await mergeFiles(root, tail);
      return { dialect: 'knex', content: merged.content, source: merged.source };
    }
  }

  if (orm === 'raw-mongo') {
    const files = await globby(
      [
        '**/models/*.{ts,js}',
        '**/schemas/*.{ts,js}',
        '**/db/**/*.{ts,js}',
        '**/dao/*.{ts,js}',
        '**/*-dao.{ts,js}',
        '**/*.dao.{ts,js}',
        '**/data/*.{ts,js}',
        '**/repositories/*.{ts,js}'
      ],
      {
        cwd: root,
        gitignore: true,
        absolute: true,
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
      }
    );
    const filtered: string[] = [];
    for (const f of files) {
      const body = await fs.readFile(f, 'utf8').catch(() => '');
      if (/MongoClient|\.collection\s*\(|insertOne|findOne|updateOne|deleteOne/.test(body)) {
        filtered.push(f);
      }
    }
    if (filtered.length > 0) {
      const merged = await mergeFiles(root, filtered.slice(0, 20));
      return { dialect: 'raw-mongo', content: merged.content, source: merged.source };
    }
  }

  if (orm === 'gorm') {
    const files = await globby(['**/*.go'], {
      cwd: root,
      gitignore: true,
      absolute: true,
      ignore: ['**/vendor/**']
    });
    const filtered: string[] = [];
    for (const f of files) {
      const body = await fs.readFile(f, 'utf8').catch(() => '');
      if (/`gorm:"|gorm\.Model/.test(body)) filtered.push(f);
    }
    if (filtered.length > 0) {
      const merged = await mergeFiles(root, filtered.slice(0, 20));
      return { dialect: 'gorm', content: merged.content, source: merged.source };
    }
  }

  if (orm === 'raw-sql') {
    const files = await globby(['**/migrations/**/*.sql'], {
      cwd: root,
      gitignore: true,
      absolute: true
    });
    files.sort();
    const tail = files.slice(-15);
    if (tail.length > 0) {
      const merged = await mergeFiles(root, tail);
      return { dialect: 'raw-sql', content: merged.content, source: merged.source };
    }
  }

  return null;
}

async function mergeFiles(
  root: string,
  files: string[]
): Promise<{ content: string; source: string }> {
  const parts: string[] = [];
  for (const f of files) {
    const rel = path.relative(root, f);
    const body = await fs.readFile(f, 'utf8').catch(() => '');
    parts.push(`// ===== ${rel} =====\n${body.trim()}\n`);
  }
  return {
    content: parts.join('\n'),
    source: files.length === 1 ? path.relative(root, files[0]!) : `${files.length} files merged`
  };
}

const QUERY_PATTERN_REGEXES: Record<string, RegExp> = {
  prisma: /\bprisma\.(\w+)\.(findMany|findUnique|findFirst|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\b/g,
  drizzle: /\bdb\.(select|insert|update|delete)\s*\(/g,
  typeorm: /\b(?:getRepository|AppDataSource\.getRepository)\s*\(\s*\w+\s*\)\.(find|findOne|findBy|save|insert|update|delete|remove)\b/g,
  sequelize: /\b\w+\.(findAll|findOne|findByPk|create|update|destroy|bulkCreate)\b/g,
  mongoose: /\b\w+\.(find|findOne|findById|create|updateOne|updateMany|deleteOne|deleteMany|aggregate)\b/g,
  'raw-mongo': /\.(insertOne|insertMany|findOne|updateOne|updateMany|deleteOne|deleteMany|countDocuments|aggregate)\s*\(/g,
  knex: /\bknex\s*\(\s*['"][^'"]+['"]\s*\)\.(select|insert|update|delete|where|orderBy|join|leftJoin|innerJoin)\b/g,
  sqlalchemy: /\bsession\.(query|add|delete|merge|execute|scalars|scalar)\b|\bselect\s*\(\s*\w+\s*\)/g,
  'django-orm': /\b\w+\.objects\.(all|filter|get|create|update|delete|annotate|aggregate|values|exclude)\b/g,
  'active-record': /\b[A-Z]\w*\.(find|find_by|where|create|update|destroy|all|first|last|new)\b/g,
  gorm: /\b(?:db|tx)\.(?:Model\s*\(\s*[^)]+\)\s*\.)?(Find|First|Where|Create|Save|Update|Delete|Raw|Exec|Joins|Preload)\b/g
};

export async function extractQueryPatterns(
  context: ProjectContext,
  limit = 20
): Promise<QueryPattern[]> {
  const { root, orm, language } = context;
  const regex = QUERY_PATTERN_REGEXES[orm];
  if (!regex) return [];

  const extensions =
    language === 'python'
      ? ['**/*.py']
      : language === 'ruby'
        ? ['**/*.rb']
        : ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'];

  const files = await globby(extensions, {
    cwd: root,
    gitignore: true,
    absolute: true,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.venv/**',
      '**/venv/**',
      '**/site-packages/**',
      '**/coverage/**'
    ]
  });

  const counts = new Map<string, QueryPattern>();
  for (const f of files) {
    if (counts.size >= limit * 4) break;
    const body = await fs.readFile(f, 'utf8').catch(() => '');
    const localRegex = new RegExp(regex.source, regex.flags);
    let m: RegExpExecArray | null;
    while ((m = localRegex.exec(body)) !== null) {
      const snippet = m[0];
      if (counts.has(snippet)) continue;
      const line = body.slice(0, m.index).split('\n').length;
      counts.set(snippet, { snippet, file: path.relative(root, f), line });
      if (counts.size >= limit) break;
    }
  }
  return [...counts.values()].slice(0, limit);
}

export function applyTemplate(markdown: string, vars: Record<string, string>): string {
  return markdown.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return vars[key] ?? '';
  });
}

const EXPRESS_ROUTE_REGEX =
  /\b(?:app|router|api)\s*\.\s*(get|post|put|patch|delete|all|use|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/g;
const FASTIFY_ROUTE_REGEX =
  /\bfastify\s*\.\s*(get|post|put|patch|delete|options|head|route)\s*\(\s*['"`]([^'"`]+)['"`]/g;
const FASTAPI_ROUTE_REGEX =
  /@(?:app|router)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*['"]([^'"]+)['"]/g;
const FLASK_ROUTE_REGEX = /@(?:app|bp|blueprint)\s*\.\s*route\s*\(\s*['"]([^'"]+)['"]/g;
const FLASK_METHOD_HINT = /methods\s*=\s*\[\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/i;
const DJANGO_PATH_REGEX = /\b(?:path|re_path|url)\s*\(\s*r?['"]([^'"]*)['"]/g;
const RAILS_RESOURCES_REGEX = /\bresources?\s+:(\w+)/g;
const RAILS_VERB_REGEX = /\b(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/g;
const NEST_ROUTE_REGEX =
  /@(Get|Post|Put|Patch|Delete|Head|Options|All)\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;

async function readSourceFiles(
  root: string,
  exts: string[],
  ignore: string[]
): Promise<string[]> {
  return globby(exts, {
    cwd: root,
    gitignore: true,
    absolute: true,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.venv/**',
      '**/venv/**',
      '**/site-packages/**',
      '**/coverage/**',
      ...ignore
    ]
  });
}

function lineOf(body: string, index: number): number {
  return body.slice(0, index).split('\n').length;
}

async function extractNodeRoutes(root: string, framework: string): Promise<ApiRoute[]> {
  const files = await readSourceFiles(
    root,
    ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
    []
  );
  const routes: ApiRoute[] = [];

  for (const f of files) {
    const body = await fs.readFile(f, 'utf8').catch(() => '');
    const rel = path.relative(root, f);

    if (framework === 'nextjs') {
      const m = matchNextRouteFile(rel);
      if (m) {
        const methodRegex = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
        let mm: RegExpExecArray | null;
        let found = false;
        while ((mm = methodRegex.exec(body)) !== null) {
          routes.push({ method: mm[1]!, path: m, file: rel, line: lineOf(body, mm.index) });
          found = true;
        }
        if (!found && /export\s+default\b/.test(body)) {
          routes.push({ method: 'ANY', path: m, file: rel, line: 1 });
        }
      }
    }

    const expressRegex = new RegExp(EXPRESS_ROUTE_REGEX.source, EXPRESS_ROUTE_REGEX.flags);
    let em: RegExpExecArray | null;
    while ((em = expressRegex.exec(body)) !== null) {
      const verb = em[1]!.toUpperCase();
      if (verb === 'USE') continue;
      routes.push({ method: verb, path: em[2]!, file: rel, line: lineOf(body, em.index) });
    }

    const fastifyRegex = new RegExp(FASTIFY_ROUTE_REGEX.source, FASTIFY_ROUTE_REGEX.flags);
    let fm: RegExpExecArray | null;
    while ((fm = fastifyRegex.exec(body)) !== null) {
      routes.push({ method: fm[1]!.toUpperCase(), path: fm[2]!, file: rel, line: lineOf(body, fm.index) });
    }

    if (framework === 'nestjs') {
      const controllerPrefix = matchNestController(body);
      const nestRegex = new RegExp(NEST_ROUTE_REGEX.source, NEST_ROUTE_REGEX.flags);
      let nm: RegExpExecArray | null;
      while ((nm = nestRegex.exec(body)) !== null) {
        const sub = nm[2] ?? '';
        const full = joinPaths(controllerPrefix, sub);
        routes.push({ method: nm[1]!.toUpperCase(), path: full, file: rel, line: lineOf(body, nm.index) });
      }
    }
  }

  return dedupeRoutes(routes);
}

function matchNextRouteFile(rel: string): string | null {
  const norm = rel.replace(/\\/g, '/');
  const appRoute = norm.match(/^(?:src\/)?app\/(.+)\/route\.[tj]sx?$/);
  if (appRoute) {
    return '/' + appRoute[1]!.replace(/\(([^)]+)\)\//g, '').replace(/\[\.\.\.(\w+)\]/g, ':*$1').replace(/\[(\w+)\]/g, ':$1');
  }
  const pagesApi = norm.match(/^(?:src\/)?pages\/api\/(.+)\.[tj]sx?$/);
  if (pagesApi) {
    let p = pagesApi[1]!;
    if (p.endsWith('/index')) p = p.slice(0, -'/index'.length);
    return '/api/' + p.replace(/\[\.\.\.(\w+)\]/g, ':*$1').replace(/\[(\w+)\]/g, ':$1');
  }
  return null;
}

function matchNestController(body: string): string {
  const m = body.match(/@Controller\s*\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/);
  if (!m) return '';
  return m[1] ?? '';
}

function joinPaths(a: string, b: string): string {
  const aa = a.replace(/^\/+|\/+$/g, '');
  const bb = b.replace(/^\/+|\/+$/g, '');
  const joined = [aa, bb].filter(Boolean).join('/');
  return '/' + joined;
}

async function extractPythonRoutes(root: string, framework: string): Promise<ApiRoute[]> {
  const files = await readSourceFiles(root, ['**/*.py'], []);
  const routes: ApiRoute[] = [];

  for (const f of files) {
    const body = await fs.readFile(f, 'utf8').catch(() => '');
    const rel = path.relative(root, f);

    const fastapiRegex = new RegExp(FASTAPI_ROUTE_REGEX.source, FASTAPI_ROUTE_REGEX.flags);
    let m: RegExpExecArray | null;
    while ((m = fastapiRegex.exec(body)) !== null) {
      routes.push({ method: m[1]!.toUpperCase(), path: m[2]!, file: rel, line: lineOf(body, m.index) });
    }

    const flaskRegex = new RegExp(FLASK_ROUTE_REGEX.source, FLASK_ROUTE_REGEX.flags);
    let fm: RegExpExecArray | null;
    while ((fm = flaskRegex.exec(body)) !== null) {
      const idx = fm.index;
      const tail = body.slice(idx, idx + 400);
      const methodMatch = tail.match(FLASK_METHOD_HINT);
      const verb = methodMatch ? methodMatch[1]!.toUpperCase() : 'GET';
      routes.push({ method: verb, path: fm[1]!, file: rel, line: lineOf(body, idx) });
    }

    if (framework === 'django' && /\burls\.py$/.test(rel.replace(/\\/g, '/').toLowerCase())) {
      const djangoRegex = new RegExp(DJANGO_PATH_REGEX.source, DJANGO_PATH_REGEX.flags);
      let dm: RegExpExecArray | null;
      while ((dm = djangoRegex.exec(body)) !== null) {
        const raw = dm[1]!;
        const cleaned = '/' + raw.replace(/^[/^]+/, '').replace(/\$$/, '');
        routes.push({ method: 'ANY', path: cleaned, file: rel, line: lineOf(body, dm.index) });
      }
    }
  }

  return dedupeRoutes(routes);
}

async function extractRubyRoutes(root: string): Promise<ApiRoute[]> {
  const routesFile = path.join(root, 'config', 'routes.rb');
  if (!(await fs.pathExists(routesFile))) return [];
  const body = await fs.readFile(routesFile, 'utf8');
  const rel = path.relative(root, routesFile);
  const routes: ApiRoute[] = [];

  const verbRegex = new RegExp(RAILS_VERB_REGEX.source, RAILS_VERB_REGEX.flags);
  let m: RegExpExecArray | null;
  while ((m = verbRegex.exec(body)) !== null) {
    routes.push({ method: m[1]!.toUpperCase(), path: '/' + m[2]!.replace(/^\/+/, ''), file: rel, line: lineOf(body, m.index) });
  }

  const resourceRegex = new RegExp(RAILS_RESOURCES_REGEX.source, RAILS_RESOURCES_REGEX.flags);
  let rm: RegExpExecArray | null;
  while ((rm = resourceRegex.exec(body)) !== null) {
    const name = rm[1]!;
    const line = lineOf(body, rm.index);
    for (const verb of ['GET', 'POST']) {
      routes.push({ method: verb, path: `/${name}`, file: rel, line });
    }
    routes.push({ method: 'GET', path: `/${name}/:id`, file: rel, line });
    routes.push({ method: 'PATCH', path: `/${name}/:id`, file: rel, line });
    routes.push({ method: 'DELETE', path: `/${name}/:id`, file: rel, line });
  }
  return dedupeRoutes(routes);
}

function dedupeRoutes(routes: ApiRoute[]): ApiRoute[] {
  const seen = new Set<string>();
  const out: ApiRoute[] = [];
  for (const r of routes) {
    const key = `${r.method} ${r.path} @ ${r.file}:${r.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return out;
}

export async function extractApiRoutes(context: ProjectContext): Promise<ApiRoute[]> {
  const { root, language, framework } = context;
  if (language === 'typescript' || language === 'javascript') {
    return extractNodeRoutes(root, framework);
  }
  if (language === 'python') {
    return extractPythonRoutes(root, framework);
  }
  if (language === 'ruby') {
    return extractRubyRoutes(root);
  }
  return [];
}

export function routingStyleFor(framework: string): string {
  switch (framework) {
    case 'nextjs':
      return 'file-system routing (app/route.ts or pages/api)';
    case 'express':
      return 'express router (app.METHOD / router.METHOD)';
    case 'fastify':
      return 'fastify routes (fastify.METHOD)';
    case 'nestjs':
      return 'controller decorators (@Controller + @Get/@Post/...)';
    case 'fastapi':
      return 'FastAPI decorators (@app.METHOD / @router.METHOD)';
    case 'flask':
      return 'Flask blueprints (@app.route / @bp.route)';
    case 'django':
      return 'Django urls.py path() entries';
    case 'rails':
      return 'Rails config/routes.rb';
    default:
      return 'unknown';
  }
}

const AUTH_MIDDLEWARE_PATTERNS: RegExp[] = [
  /\b(requireAuth|isAuthenticated|ensureAuthenticated|authenticate|authMiddleware|jwtAuth|verifyToken|verifyJwt|authorize|protect|loginRequired|checkAuth|requireUser|requireLogin)\b/g,
  /@UseGuards\s*\(\s*([A-Z]\w*Guard)\s*\)/g,
  /\bpassport\.authenticate\s*\(/g,
  /@login_required\b/g,
  /@permission_classes\s*\(/g,
  /@authentication_classes\s*\(/g,
  /Depends\s*\(\s*(?:get_current_user|require_user|get_current_active_user|oauth2_scheme)\b/g,
  /\bbefore_action\s+:authenticate(?:_user!)?/g,
  /\bdevise_(?:for|scope)\b/g
];

const ROLE_CONSTANT_PATTERNS: RegExp[] = [
  /\b(?:ROLE|ROLES|PERMISSION|PERMISSIONS|SCOPE|SCOPES)_[A-Z][A-Z0-9_]*\b/g,
  /\b(?:Role|Permission|Scope)\.[A-Z][A-Za-z0-9_]*\b/g,
  /\brole\s*:\s*['"`](admin|user|owner|editor|viewer|moderator|guest|superuser|staff)['"`]/gi,
  /\bhasRole\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
  /@(?:Roles|HasRole|RequirePermissions)\s*\(\s*([^)]+)\)/g
];

function dedupeMarkers(markers: AuthMarker[]): AuthMarker[] {
  const seen = new Set<string>();
  const out: AuthMarker[] = [];
  for (const m of markers) {
    const key = `${m.snippet}@${m.file}:${m.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

export async function extractAuth(context: ProjectContext): Promise<AuthReport> {
  const { root, language } = context;

  const exts: string[] =
    language === 'python'
      ? ['**/*.py']
      : language === 'ruby'
        ? ['**/*.rb']
        : language === 'go'
          ? ['**/*.go']
          : ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'];

  const files = await globby(exts, {
    cwd: root,
    gitignore: true,
    absolute: true,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.venv/**',
      '**/venv/**',
      '**/site-packages/**',
      '**/coverage/**',
      '**/vendor/**'
    ]
  });

  const middlewares: AuthMarker[] = [];
  const roles: AuthMarker[] = [];
  const routeFilesWithAuth = new Set<string>();

  for (const f of files) {
    const body = await fs.readFile(f, 'utf8').catch(() => '');
    if (!body) continue;
    const rel = path.relative(root, f);

    let matchedHere = false;
    for (const re of AUTH_MIDDLEWARE_PATTERNS) {
      const localRe = new RegExp(re.source, re.flags);
      let m: RegExpExecArray | null;
      while ((m = localRe.exec(body)) !== null) {
        middlewares.push({ snippet: m[0], file: rel, line: lineOf(body, m.index) });
        matchedHere = true;
        if (middlewares.length > 500) break;
      }
    }
    if (matchedHere) routeFilesWithAuth.add(rel);

    for (const re of ROLE_CONSTANT_PATTERNS) {
      const localRe = new RegExp(re.source, re.flags);
      let m: RegExpExecArray | null;
      while ((m = localRe.exec(body)) !== null) {
        roles.push({ snippet: m[0], file: rel, line: lineOf(body, m.index) });
        if (roles.length > 200) break;
      }
    }
  }

  return {
    middlewares: dedupeMarkers(middlewares),
    roleConstants: dedupeMarkers(roles),
    routeFilesWithAuth
  };
}

export function classifyRoutesByAuth(
  routes: ApiRoute[],
  auth: AuthReport
): { authed: ApiRoute[]; pub: ApiRoute[] } {
  const authed: ApiRoute[] = [];
  const pub: ApiRoute[] = [];
  for (const r of routes) {
    if (auth.routeFilesWithAuth.has(r.file)) authed.push(r);
    else pub.push(r);
  }
  return { authed, pub };
}

const CI_SECRET_REGEX = /\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}|\$\{\s*([A-Z0-9_]+)\s*\}/g;

interface CiFileSpec {
  system: string;
  glob: string;
  parser: (root: string, file: string, body: string) => CiJob[];
}

function parseGithubWorkflow(root: string, file: string, body: string): CiJob[] {
  const rel = path.relative(root, file);
  const workflow = baseName(file);
  const triggers = extractGhTriggers(body);
  const jobs: CiJob[] = [];

  const jobsHeader = body.match(/^jobs\s*:\s*$/m);
  if (!jobsHeader) return jobs;
  const after = body.slice(jobsHeader.index! + jobsHeader[0].length);
  const jobRe = /^([ ]{2})([A-Za-z0-9_-]+)\s*:\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = jobRe.exec(after)) !== null) {
    const jobName = m[2]!;
    const tail = after.slice(m.index, after.indexOf('\n', m.index + m[0].length) + 4000);
    const steps = extractGhSteps(tail);
    jobs.push({ workflow, file: rel, name: jobName, triggers, steps });
  }
  return jobs;
}

function extractGhTriggers(body: string): string[] {
  const match = body.match(/^on\s*:(.*?)(?=^[A-Za-z_]+\s*:|\Z)/ms);
  if (!match) return [];
  const block = match[1] ?? '';
  const inline = block.trim();
  if (inline.startsWith('[')) {
    return inline
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const inlineWord = inline.match(/^[a-z_]+\b/);
  if (inlineWord) return [inlineWord[0]];
  const triggers: string[] = [];
  const triggerRe = /^\s{2}([a-z_]+)\s*:/gm;
  let tm: RegExpExecArray | null;
  while ((tm = triggerRe.exec(block)) !== null) {
    triggers.push(tm[1]!);
  }
  return Array.from(new Set(triggers));
}

function extractGhSteps(jobBlock: string): string[] {
  const steps: string[] = [];
  const stepRe = /^\s{6,}-\s+(?:name:\s*(.+)|uses:\s*([^\s]+)|run:\s*(.+))/gm;
  let m: RegExpExecArray | null;
  while ((m = stepRe.exec(jobBlock)) !== null) {
    const label = (m[1] || m[2] || m[3] || '').trim().split('\n')[0];
    if (label) steps.push(label);
    if (steps.length >= 12) break;
  }
  return steps;
}

function parseGitlabCi(root: string, file: string, body: string): CiJob[] {
  const rel = path.relative(root, file);
  const workflow = baseName(file);
  const triggers = /\brules\b|\bonly\b|\bexcept\b/.test(body) ? ['conditional'] : ['push'];
  const jobs: CiJob[] = [];
  const jobRe = /^([A-Za-z0-9_.\-]+)\s*:\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = jobRe.exec(body)) !== null) {
    const name = m[1]!;
    if (
      [
        'stages',
        'variables',
        'image',
        'services',
        'include',
        'workflow',
        'default',
        'before_script',
        'after_script',
        'cache'
      ].includes(name)
    ) {
      continue;
    }
    const tail = body.slice(m.index, m.index + 2000);
    const script = tail.match(/script\s*:\s*([\s\S]*?)(\n[A-Za-z]|$)/);
    const steps: string[] = [];
    if (script) {
      const lines = script[1]!.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 10);
      steps.push(...lines.map((l) => l.replace(/^-\s*/, '')));
    }
    jobs.push({ workflow, file: rel, name, triggers, steps });
  }
  return jobs;
}

function parseCircleci(root: string, file: string, body: string): CiJob[] {
  const rel = path.relative(root, file);
  const workflow = baseName(file);
  const jobs: CiJob[] = [];
  const jobsMatch = body.match(/^jobs\s*:\s*([\s\S]*?)(^workflows\s*:|$)/m);
  if (!jobsMatch) return jobs;
  const block = jobsMatch[1] ?? '';
  const jobRe = /^\s{2}([A-Za-z0-9_-]+)\s*:\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = jobRe.exec(block)) !== null) {
    jobs.push({
      workflow,
      file: rel,
      name: m[1]!,
      triggers: ['push'],
      steps: []
    });
  }
  return jobs;
}

function parseTravis(root: string, file: string, body: string): CiJob[] {
  const rel = path.relative(root, file);
  const workflow = baseName(file);
  const script = body.match(/^script\s*:\s*([\s\S]*?)(\n[A-Za-z]|$)/m);
  const steps: string[] = [];
  if (script) {
    const lines = script[1]!
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .slice(0, 10);
    steps.push(...lines.map((l) => l.replace(/^-\s*/, '')));
  }
  return [{ workflow, file: rel, name: 'default', triggers: ['push', 'pull_request'], steps }];
}

function parseAzurePipelines(root: string, file: string, body: string): CiJob[] {
  const rel = path.relative(root, file);
  const workflow = baseName(file);
  const triggers = /^trigger\s*:/m.test(body) ? ['push'] : [];
  if (/^pr\s*:/m.test(body)) triggers.push('pull_request');
  const jobs: CiJob[] = [];
  const jobRe = /^\s*-\s*job\s*:\s*(\S+)/gm;
  let m: RegExpExecArray | null;
  while ((m = jobRe.exec(body)) !== null) {
    jobs.push({ workflow, file: rel, name: m[1]!, triggers, steps: [] });
  }
  if (jobs.length === 0) {
    jobs.push({ workflow, file: rel, name: 'pipeline', triggers, steps: [] });
  }
  return jobs;
}

function baseName(file: string): string {
  return path.basename(file).replace(/\.(ya?ml|yml)$/, '');
}

const CI_SPECS: CiFileSpec[] = [
  { system: 'github-actions', glob: '.github/workflows/*.{yml,yaml}', parser: parseGithubWorkflow },
  { system: 'gitlab-ci', glob: '.gitlab-ci.yml', parser: parseGitlabCi },
  { system: 'circleci', glob: '.circleci/config.yml', parser: parseCircleci },
  { system: 'travis', glob: '.travis.yml', parser: parseTravis },
  { system: 'azure-pipelines', glob: 'azure-pipelines.{yml,yaml}', parser: parseAzurePipelines }
];

export async function extractCi(context: ProjectContext): Promise<CiReport> {
  const root = context.root;
  const jobs: CiJob[] = [];
  const systems = new Set<string>();
  const secrets = new Set<string>();

  for (const spec of CI_SPECS) {
    const files = await globby([spec.glob], { cwd: root, gitignore: true, absolute: true });
    for (const f of files) {
      const body = await fs.readFile(f, 'utf8').catch(() => '');
      if (!body) continue;
      systems.add(spec.system);
      jobs.push(...spec.parser(root, f, body));
      const secretRe = new RegExp(CI_SECRET_REGEX.source, CI_SECRET_REGEX.flags);
      let m: RegExpExecArray | null;
      while ((m = secretRe.exec(body)) !== null) {
        const name = m[1] ?? m[2];
        if (name && name !== 'GITHUB_TOKEN') secrets.add(name);
      }
      if (body.includes('${{ secrets.GITHUB_TOKEN }}')) secrets.add('GITHUB_TOKEN');
    }
  }

  return {
    systems: [...systems].sort(),
    jobs,
    secrets: [...secrets].sort()
  };
}

export function buildSynthesisVars(inputs: SynthesisInputs): Record<string, string> {
  const { context, schema, queryPatterns, routes, routingStyle, auth, ci } = inputs;

  const patternsBlock =
    queryPatterns.length === 0
      ? '_No usage patterns detected yet._'
      : queryPatterns
          .map((p) => `- \`${p.snippet}\`  — ${p.file}:${p.line}`)
          .join('\n');

  const schemaBlock = schema
    ? `\`\`\`\n${truncate(schema.content, 12000)}\n\`\`\`\n\n_Source: ${schema.source}_`
    : '_No schema source detected. Re-run after configuring your ORM._';

  const routesBlock =
    !routes || routes.length === 0
      ? '_No routes detected._'
      : routesTable(routes);

  let authMiddlewaresBlock = '_No auth middleware/decorator patterns detected._';
  let authRolesBlock = '_No role / permission constants detected._';
  let publicRoutesBlock = '_No routes detected._';
  let authRoutesBlock = '_No routes detected._';
  let authRouteCount = 0;
  let publicRouteCount = 0;

  if (auth) {
    if (auth.middlewares.length > 0) {
      authMiddlewaresBlock = markersList(auth.middlewares, 30);
    }
    if (auth.roleConstants.length > 0) {
      authRolesBlock = markersList(auth.roleConstants, 30);
    }
    if (routes && routes.length > 0) {
      const { authed, pub } = classifyRoutesByAuth(routes, auth);
      authRouteCount = authed.length;
      publicRouteCount = pub.length;
      publicRoutesBlock = pub.length === 0 ? '_None — every route\'s handler file references an auth marker._' : routesTable(pub);
      authRoutesBlock = authed.length === 0 ? '_None — no route handler file referenced an auth marker._' : routesTable(authed);
    }
  }

  return {
    PROJECT_LANGUAGE: context.language,
    PROJECT_FRAMEWORK: context.framework,
    PROJECT_ORM: context.orm,
    PROJECT_PACKAGE_MANAGER: context.packageManager,
    DB_DIALECT: schema?.dialect ?? context.orm,
    DB_SCHEMA_CONTEXT: schemaBlock,
    QUERY_PATTERNS: patternsBlock,
    API_ROUTES: routesBlock,
    API_ROUTE_COUNT: String(routes?.length ?? 0),
    ROUTING_STYLE: routingStyle ?? routingStyleFor(context.framework),
    AUTH_MIDDLEWARES: authMiddlewaresBlock,
    AUTH_ROLES: authRolesBlock,
    PUBLIC_ROUTES: publicRoutesBlock,
    AUTH_ROUTES: authRoutesBlock,
    AUTH_ROUTE_COUNT: String(authRouteCount),
    PUBLIC_ROUTE_COUNT: String(publicRouteCount),
    CI_SYSTEMS: ci && ci.systems.length > 0 ? ci.systems.join(', ') : 'none detected',
    CI_WORKFLOWS: ciJobsBlock(ci),
    CI_SECRETS:
      !ci || ci.secrets.length === 0
        ? '_No secrets referenced._'
        : ci.secrets.map((s) => `- \`${s}\``).join('\n'),
    GENERATED_AT: new Date().toISOString()
  };
}

function ciJobsBlock(ci: CiReport | undefined): string {
  if (!ci || ci.jobs.length === 0) return '_No CI pipelines detected._';
  const byFile = new Map<string, CiJob[]>();
  for (const j of ci.jobs) {
    const arr = byFile.get(j.file) ?? [];
    arr.push(j);
    byFile.set(j.file, arr);
  }
  const sections: string[] = [];
  for (const [file, jobs] of byFile) {
    const lines = [`### \`${file}\``];
    const firstTriggers = jobs[0]?.triggers ?? [];
    if (firstTriggers.length > 0) {
      lines.push(`_Triggers: ${firstTriggers.join(', ')}_`);
    }
    lines.push('');
    lines.push('| Job | Steps |', '|---|---|');
    for (const j of jobs) {
      const stepText =
        j.steps.length === 0
          ? '_(none captured)_'
          : j.steps
              .slice(0, 6)
              .map((s) => '`' + s.replace(/`/g, "'") + '`')
              .join(' · ');
      lines.push(`| \`${j.name}\` | ${stepText} |`);
    }
    sections.push(lines.join('\n'));
  }
  return sections.join('\n\n');
}

function markersList(markers: AuthMarker[], max: number): string {
  const slice = markers.slice(0, max);
  const out = slice.map((m) => `- \`${m.snippet}\`  — ${m.file}:${m.line}`);
  if (markers.length > max) out.push(`- _+${markers.length - max} more_`);
  return out.join('\n');
}

function routesTable(routes: ApiRoute[]): string {
  const max = 200;
  const slice = routes.slice(0, max);
  const lines = ['| Method | Path | Source |', '|---|---|---|'];
  for (const r of slice) {
    lines.push(`| \`${r.method}\` | \`${r.path}\` | ${r.file}:${r.line} |`);
  }
  if (routes.length > max) {
    lines.push(`| ... | ... | _+${routes.length - max} more in references/routes.json_ |`);
  }
  return lines.join('\n');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n\n... (truncated, ${s.length - max} more chars)`;
}
