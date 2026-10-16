#!/usr/bin/env node
// Read-only dependency collector for the dependency-checker skill.
// Usage: node collect.mjs [--root <repo>] [--packages a,b] [--top 10]
// Prints one JSON document to stdout. No network, no writes, no installs.
import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const ROOT = path.resolve(opt('root', process.cwd()));
const ONLY = opt('packages', '').split(',').map((s) => s.trim()).filter(Boolean);
const TOP = Number(opt('top', '10'));

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage', 'clones', '.turbo', 'out', 'results',
  'fixtures', '__fixtures__', '__snapshots__',
]);
const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|([\\/](test|tests|__tests__|e2e)[\\/])/;
const VALID_PKG = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/;
const SRC_EXT = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};
const stripJsonc = (raw) => {
  let out = '';
  let inStr = false;
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i];
    const n = raw[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') out += raw[++i] ?? '';
      else if (c === '"') inStr = false;
    } else if (c === '"') {
      inStr = true;
      out += c;
    } else if (c === '/' && n === '/') {
      while (i < raw.length && raw[i] !== '\n') i += 1;
      out += '\n';
    } else if (c === '/' && n === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) i += 1;
      i += 1;
    } else out += c;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
};
const readJsonc = (file) => {
  try {
    return JSON.parse(stripJsonc(fs.readFileSync(file, 'utf8')));
  } catch {
    return undefined;
  }
};
const human = (n) => {
  if (n == null) return null;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
};

function dirSize(dir) {
  let real;
  try {
    real = fs.realpathSync(dir);
  } catch {
    return null;
  }
  let total = 0;
  const walk = (d) => {
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules') continue;
      const p = path.join(d, e.name);
      try {
        if (e.isDirectory()) walk(p);
        else if (e.isFile() || e.isSymbolicLink()) total += fs.statSync(p).size;
      } catch {
        /* broken link */
      }
    }
  };
  walk(real);
  return total;
}

function* walkSources(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkSources(p);
    else if (e.isFile() && SRC_EXT.test(e.name) && !e.name.endsWith('.d.ts')) yield p;
  }
}

const SPEC_RES = [
  /\b(?:import|export)\s+(?:type\s+)?[^'"`;]*?\sfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?['"]([^'"]+)['"]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]/g,
];
function specifiers(rawText) {
  const text = rawText.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const out = new Set();
  for (const re of SPEC_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) out.add(m[1]);
  }
  return [...out];
}
const pkgNameOf = (spec) => {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
};

// ---- discover packages -------------------------------------------------
const packages = [];
for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
  const dir = path.join(ROOT, e.name);
  const pj = readJson(path.join(dir, 'package.json'));
  if (!pj) continue;
  if (ONLY.length && !ONLY.includes(e.name)) continue;
  const lock = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb']
    .filter((f) => fs.existsSync(path.join(dir, f)));
  const managerOf = { 'pnpm-lock.yaml': 'pnpm', 'package-lock.json': 'npm', 'yarn.lock': 'yarn', 'bun.lockb': 'bun' };
  packages.push({
    name: e.name,
    dir,
    pj,
    lockfiles: lock,
    manager: lock.length ? [...new Set(lock.map((l) => managerOf[l]))].join('+') : 'none',
    tsconfig: readJsonc(path.join(dir, 'tsconfig.json')),
  });
}
if (!packages.length) {
  console.error(`No package.json found one level below ${ROOT}`);
  process.exit(1);
}
const ownerOf = (abs) => {
  let best;
  for (const p of packages) {
    if ((abs === p.dir || abs.startsWith(p.dir + path.sep)) && (!best || p.dir.length > best.dir.length)) best = p;
  }
  return best;
};

// ---- per-package scan -----------------------------------------------------
const edges = new Map(); // "from->to|kind" -> {from,to,kind,count,examples,via}
const addEdge = (from, to, kind, file, via) => {
  const k = `${from}->${to}|${kind}`;
  const e = edges.get(k) ?? { from, to, kind, count: 0, src_count: 0, examples: [], via: new Set() };
  e.count += 1;
  if (!TEST_FILE.test(file)) e.src_count += 1;
  if (e.examples.length < 3) e.examples.push(path.relative(ROOT, file));
  if (via) e.via.add(via);
  edges.set(k, e);
};

const report = [];
for (const pkg of packages) {
  const paths = pkg.tsconfig?.compilerOptions?.paths ?? {};
  const baseUrl = path.resolve(pkg.dir, pkg.tsconfig?.compilerOptions?.baseUrl ?? '.');
  const aliasList = Object.entries(paths).map(([key, targets]) => ({
    key,
    prefix: key.replace(/\*$/, ''),
    wildcard: key.endsWith('*'),
    target: String((targets && targets[0]) ?? '').replace(/\*$/, ''),
  }));

  const imported = new Map(); // external pkg -> {count, src, example}
  const noteImport = (n, file) => {
    if (!VALID_PKG.test(n)) return;
    const isTest = TEST_FILE.test(file);
    const cur = imported.get(n) ?? { count: 0, src: 0, example: path.relative(ROOT, file) };
    cur.count += 1;
    if (!isTest) {
      cur.src += 1;
      if (TEST_FILE.test(path.join(ROOT, cur.example))) cur.example = path.relative(ROOT, file);
    }
    imported.set(n, cur);
  };
  let fileCount = 0;
  const codeLines = []; // [file, non-comment text] for the string-reference pass
  for (const file of walkSources(pkg.dir)) {
    fileCount += 1;
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    codeLines.push([file, text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')]);
    for (const spec of specifiers(text)) {
      if (spec.startsWith('.')) {
        const target = path.resolve(path.dirname(file), spec);
        const owner = ownerOf(target);
        if (owner && owner.name !== pkg.name) addEdge(pkg.name, owner.name, 'relative', file);
        continue;
      }
      const alias = aliasList.find((a) => (a.wildcard ? spec.startsWith(a.prefix) : spec === a.key));
      if (alias) {
        const rest = alias.wildcard ? spec.slice(alias.prefix.length) : '';
        const target = path.resolve(baseUrl, alias.target + rest);
        const owner = ownerOf(target);
        if (owner && owner.name !== pkg.name) addEdge(pkg.name, owner.name, 'alias', file, alias.key.replace(/\/\*$/, ''));
        else if (target.includes(`${path.sep}node_modules${path.sep}`) || !owner) {
              noteImport(pkgNameOf(spec), file);
        }
        continue;
      }
      if (BUILTINS.has(spec) || BUILTINS.has(pkgNameOf(spec))) continue;
      noteImport(pkgNameOf(spec), file);
    }
  }

  // tooling text: scripts + top-level config-ish files
  const scripts = Object.values(pkg.pj.scripts ?? {}).join('\n');
  let toolingText = scripts;
  for (const f of fs.readdirSync(pkg.dir, { withFileTypes: true })) {
    if (!f.isFile() || /lock|\.map$|\.(md|mdx|txt|png|svg|ico)$/i.test(f.name)) continue;
    if (f.name === 'package.json' || /^(README|CLAUDE|AGENTS|INSIGHTS)/i.test(f.name)) continue;
    try {
      const st = fs.statSync(path.join(pkg.dir, f.name));
      if (st.size < 200_000) toolingText += `\n${fs.readFileSync(path.join(pkg.dir, f.name), 'utf8')}`;
    } catch {
      /* ignore */
    }
  }

  const nm = path.join(pkg.dir, 'node_modules');
  const installed = fs.existsSync(nm);
  const kinds = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  const deps = [];
  for (const kind of kinds) {
    for (const [name, range] of Object.entries(pkg.pj[kind] ?? {})) {
      const depDir = path.join(nm, name);
      const depPj = readJson(path.join(depDir, 'package.json'));
      const size = installed && depPj ? dirSize(depDir) : null;
      const used = imported.get(name);
      const base = name.startsWith('@types/') ? name.slice(7).replace('__', '/') : null;
      const typesUsed = base ? (imported.has(base) || base === 'node') : false;
      let tooling = null;
      if (!used && !typesUsed) {
        const bins = depPj?.bin ? (typeof depPj.bin === 'string' ? [depPj.name] : Object.keys(depPj.bin)) : [];
        const needles = [name, ...bins].filter(Boolean);
        const hit = needles.find((n) => new RegExp(`(^|[^\\w@/-])${n.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^\\w-]|$)`).test(toolingText));
        tooling = hit ? hit : null;
      }
      let implicit = null;
      if (!used && !typesUsed && !tooling) {
        const has = (n) => Object.hasOwn({ ...pkg.pj.dependencies, ...pkg.pj.devDependencies }, n);
        const topFile = (re) => fs.readdirSync(pkg.dir).some((f) => re.test(f));
        if (name === 'react-dom' && (has('react') || has('next'))) implicit = 'peer of react/next';
        else if (name === '@types/react-dom' && has('react-dom')) implicit = 'types of react-dom';
        else if (name === 'typescript' && pkg.tsconfig) implicit = 'tsconfig.json present';
        else if ((name === 'postcss' || name === 'autoprefixer') && topFile(/^postcss\.config\./)) implicit = 'postcss.config present';
        else if (name === 'tailwindcss' && (has('@tailwindcss/postcss') || has('@tailwindcss/vite') || topFile(/^tailwind\.config\./))) implicit = 'tailwind plugin/config present';
        else if (/^eslint-(config|plugin)-/.test(name) && has('eslint')) implicit = 'eslint plugin';
      }
      const flags = [];
      let stringRef = null;
      if (!used && !typesUsed && !tooling && !implicit) {
        const quoted = new RegExp(`['"\`]${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}['"\`]`);
        const hit = codeLines.find(([, t]) => quoted.test(t));
        if (hit) stringRef = path.relative(ROOT, hit[0]);
      }
      if (!used && !typesUsed && !tooling && !implicit && !stringRef) flags.push('no-import-found');
      if (kind === 'dependencies' && !used && !typesUsed && tooling) flags.push('runtime-dep-used-only-by-tooling');
      if (name.startsWith('@types/') && kind === 'dependencies') flags.push('types-in-runtime-deps');
      deps.push({
        name,
        kind,
        range,
        installed_version: depPj?.version ?? null,
        size_bytes: size,
        size_human: human(size),
        import_count: used?.src ?? 0,
        import_count_tests: used ? used.count - used.src : 0,
        example_import: used?.example ?? null,
        used_by_tooling: tooling ?? (implicit ? `implicit: ${implicit}` : stringRef ? `string reference in ${stringRef}` : null),
        flags,
      });
    }
  }
  const declared = new Set(deps.map((d) => d.name));
  const undeclared = [...imported.entries()]
    .filter(([n, v]) => !declared.has(n) && n !== pkg.pj.name && v.src > 0)
    .map(([name, v]) => ({ name, count: v.src, example: v.example }));

  report.push({
    name: pkg.name,
    manager: pkg.manager,
    lockfiles: pkg.lockfiles.map((l) => path.relative(ROOT, path.join(pkg.dir, l))),
    installed,
    source_files: fileCount,
    aliases: aliasList.map((a) => a.key),
    declared_counts: Object.fromEntries(kinds.map((k) => [k, Object.keys(pkg.pj[k] ?? {}).length])),
    declared_size_bytes: installed ? deps.reduce((s, d) => s + (d.size_bytes ?? 0), 0) : null,
    declared_size_human: installed ? human(deps.reduce((s, d) => s + (d.size_bytes ?? 0), 0)) : null,
    deps: deps.sort((a, b) => (b.size_bytes ?? -1) - (a.size_bytes ?? -1)),
    undeclared_imports: undeclared,
  });
}

// ---- cross-package results ------------------------------------------------
const versionMap = new Map();
for (const p of report) {
  for (const d of p.deps) {
    const arr = versionMap.get(d.name) ?? [];
    arr.push({ package: p.name, kind: d.kind, range: d.range, installed: d.installed_version });
    versionMap.set(d.name, arr);
  }
}
const drift = [...versionMap.entries()]
  .filter(([, v]) => v.length > 1 && new Set(v.map((x) => x.range)).size > 1)
  .map(([name, versions]) => ({ name, versions }));

const heavy = report
  .flatMap((p) => p.deps.map((d) => ({ package: p.name, name: d.name, kind: d.kind, size_bytes: d.size_bytes, size_human: d.size_human })))
  .filter((d) => d.size_bytes)
  .sort((a, b) => b.size_bytes - a.size_bytes)
  .slice(0, TOP);

const internal_edges = [...edges.values()].map((e) => ({ ...e, tests_only: e.src_count === 0, via: [...e.via] }));

const id = (n) => n.replace(/[^A-Za-z0-9]/g, '_');
const mer = ['flowchart LR'];
for (const p of report) mer.push(`  ${id(p.name)}["${p.name}<br/>${p.manager}${p.declared_size_human ? ` · ${p.declared_size_human}` : ''}"]`);
for (const e of internal_edges) {
  const via = e.via.length ? ` ${e.via.join(', ')}` : '';
  const tag = e.tests_only ? ' (tests only)' : '';
  mer.push(`  ${id(e.from)} -->|"${e.kind}${via}${tag} ×${e.count}"| ${id(e.to)}`);
}
for (const p of report) {
  p.deps.filter((d) => d.size_bytes).slice(0, 3).forEach((d, i) => {
    const nid = `${id(p.name)}_x${i}`;
    mer.push(`  ${nid}(["${d.name} ${d.size_human}"]):::ext`);
    mer.push(`  ${id(p.name)} -.-> ${nid}`);
  });
}
mer.push('  classDef ext fill:#eef,stroke:#99c');

const notes = [];
for (const p of report) if (!p.installed) notes.push(`${p.name}: node_modules missing, sizes are null (run the package's install first)`);
const managers = [...new Set(report.map((p) => p.manager))];
if (managers.length > 1) notes.push(`mixed package managers across packages: ${managers.join(', ')} (one per package)`);
for (const p of report) if (p.lockfiles.length > 1) notes.push(`${p.name}: more than one lockfile (${p.lockfiles.join(', ')})`);
notes.push('sizes are the package files on disk (self size, nested node_modules excluded), not transitive or bundled size');

console.log(JSON.stringify({
  root: ROOT,
  generated_at: new Date().toISOString(),
  packages: report,
  internal_edges,
  version_drift: drift,
  top_heavy: heavy,
  mermaid: mer.join('\n'),
  notes,
}, null, 2));
