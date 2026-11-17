// Pure: (scans, request, env) -> AddSchemaPlan. No fs, no library.
const path = require("path");
const { includeKey, nameIdentity } = require("./scan");

/**
 * @typedef {import('./scan').FileScan} FileScan
 * @typedef {{ gameType: 'madden'|'college', gameYear: number }} GameIdentity
 * @typedef {{ schemaPath: string, fileId: string, filePath: string }} LoadedPath
 * @typedef {object} PlanEnv
 * @property {{ gameType: string, gameYear: number }[]} games  data/games.json
 * @property {{ gameType: string|null, gameYear: number|null, major: number, minor: number, path: string, source: 'bundled'|'custom' }[]} savedSchemas
 * @property {LoadedPath[]} loadedPaths
 * @property {{ path: string, game: GameIdentity, expected: { major: number, minor: number }|null }|null} open
 * @property {string} schemaDir
 */

const SEVERITY = {
  "no-files": "blocking",
  "several-schemas": "blocking",
  "mixed-kinds": "blocking",
  "not-a-schema": "blocking",
  "duplicate-name": "blocking",
  "include-cycle": "blocking",
  "several-entrypoints": "blocking",
  "no-entrypoint": "blocking",
  "no-database-name": "blocking",
  "game-required": "blocking",
  "version-required": "blocking",
  "invalid-version": "blocking",
  "malformed-xml": "blocking",
  "empty-enum": "blocking",
  "no-tables": "blocking",
  "missing-changed": "blocking",
  "target-changed": "blocking",
  "missing-include": "warning",
  "version-guessed": "warning",
  "missing-includes-accepted": "warning",
  "meta-written": "info",
  "replaces-custom": "info",
  "replaces-loaded": "info",
  "defaults-merged-at-load": "info",
};

const problem = (code, extra = {}) => ({ code, severity: SEVERITY[code], ...extra });

const GAME_PATTERNS = [
  { gameType: "college", pattern: /CollegeFB(\d{2})/ },
  { gameType: "madden", pattern: /Madden(\d{2})/ },
];

// The library's own rule (generateSchemaV2): CollegeFB if the name says so, else Madden
function gameFromDatabaseName(name) {
  const { gameType, pattern } = name.includes("CollegeFB")
    ? GAME_PATTERNS[0]
    : GAME_PATTERNS[1];
  const m = pattern.exec(name);
  return { gameType, gameYear: m ? parseInt(m[1], 10) : null };
}

const intOrNull = (text) => {
  const n = parseInt(text, 10);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

/**
 * Detection order. game(ctx, year) returns a full or partial identity (year =
 * the first year an earlier row found); version(ctx, game) returns
 * { major, minor }, each nullable. Rows that return null don't apply.
 */
const OPTION_SOURCES = [
  {
    source: "ftx-header",
    kinds: ["generate"],
    from: (c) => c.tree?.header?.name ?? null,
    game: (c) => {
      const name = c.tree?.header?.header.databaseName;
      return name ? gameFromDatabaseName(name) : null;
    },
    version: (c) =>
      c.tree?.header
        ? {
            major: intOrNull(c.tree.header.header.major),
            minor: intOrNull(c.tree.header.header.minor),
          }
        : null,
  },
  {
    source: "gz-meta",
    kinds: ["copy-gz"],
    from: (c) => c.gz.name,
    game: (c) => c.gz.meta && { gameType: c.gz.meta.gameType, gameYear: c.gz.meta.gameYear },
    version: (c) => c.gz.meta && { major: c.gz.meta.major, minor: c.gz.meta.minor },
  },
  {
    source: "file-name",
    kinds: ["generate", "copy-gz"],
    from: (c) => c.named.name,
    game: (c) => nameIdentity(c.named.name),
    version: (c) => nameIdentity(c.named.name),
  },
  {
    source: "only-game-for-year",
    kinds: ["generate", "copy-gz"],
    from: () => null,
    game: (c, year) => {
      const games = c.env.games.filter((g) => g.gameYear === year);
      return games.length === 1
        ? { gameType: games[0].gameType, gameYear: year }
        : null;
    },
    version: () => null,
  },
  {
    source: "open-file",
    kinds: ["generate", "copy-gz"],
    from: (c) => (c.env.open ? path.basename(c.env.open.path) : null),
    game: (c, year) =>
      c.env.open && (year === null || c.env.open.game.gameYear === year)
        ? c.env.open.game
        : null,
    version: (c, game) =>
      c.env.open?.expected && game && sameGame(game, c.env.open.game)
        ? c.env.open.expected
        : null,
  },
];

const sameGame = (a, b) => a.gameType === b.gameType && a.gameYear === b.gameYear;
const isFullGame = (g) => !!g && !!g.gameType && Number.isInteger(g.gameYear);
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const sameSet = (a, b, key = (x) => x) => {
  const sa = new Set(a.map(key));
  const sb = new Set(b.map(key));
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
};

/**
 * @param {FileScan[]} scans
 * @param {import('../../../src/shared/types/addSchema').AddSchemaRequest & Partial<import('../../../src/shared/types/addSchema').AddSchemaCommit>} request
 * @param {PlanEnv} env
 * @returns {import('../../../src/shared/types/addSchema').AddSchemaPlan}
 */
function planAdd(scans, request, env) {
  const problems = [];
  const files = scans.map((s) => ({
    path: s.path,
    name: s.name,
    role: { invalid: "invalid", gz: "schema", ftx: "unused" }[s.format],
    includes: s.format === "ftx" ? s.header.includes : [],
    missing: [],
  }));
  for (const s of scans) {
    if (s.format === "invalid") {
      problems.push(problem("not-a-schema", { path: s.path, detail: s.detail }));
    }
  }

  const gzs = scans.filter((s) => s.format === "gz");
  const ftxs = scans.filter((s) => s.format === "ftx");
  let kind = null;
  if (scans.length === 0) problems.push(problem("no-files"));
  else if (gzs.length && ftxs.length) problems.push(problem("mixed-kinds"));
  else if (gzs.length) {
    kind = "copy-gz";
    if (gzs.length > 1) {
      problems.push(problem("several-schemas", { files: gzs.map((s) => s.name) }));
    }
  } else if (ftxs.length) kind = "generate";

  const tree = kind === "generate" ? buildTree(ftxs, files, problems) : null;
  const gz = kind === "copy-gz" && gzs.length === 1 ? gzs[0] : null;
  // The file whose name the file-name source reads
  const named = gz ?? tree?.entry ?? null;
  const ctx = { kind, gz, tree, env, named };

  const { options, gameCandidates } = resolveOptions(ctx, request.overrides, problems);
  const identity =
    options.game.value && options.major.value !== null && options.minor.value !== null
      ? { ...options.game.value, major: options.major.value, minor: options.minor.value }
      : null;
  const target = identity && named ? targetFor(identity, env) : null;

  const guessedFrom = [options.game, options.major, options.minor].find(
    (o) => o.source === "open-file" && !o.overridden,
  );
  if (guessedFrom) problems.push(problem("version-guessed", { files: [guessedFrom.from] }));
  if (tree?.missing.length) {
    problems.push(problem("missing-include", { files: tree.missing }));
  }
  if (gz && identity) {
    const changes = metaChanges(gz.meta, identity);
    if (changes.length) problems.push(problem("meta-written", { changes }));
  }
  if (target?.replaces.length) {
    problems.push(
      problem("replaces-custom", {
        files: target.replaces.map((r) => path.relative(env.schemaDir, r.path)),
      }),
    );
    const loaders = [
      ...new Set(
        target.replaces.flatMap((r) => r.loadedBy.map((l) => path.basename(l.filePath))),
      ),
    ];
    if (loaders.length) problems.push(problem("replaces-loaded", { files: loaders }));
  }
  if (kind === "generate" && !request.includeDefaults) {
    problems.push(problem("defaults-merged-at-load"));
  }

  const missing = tree?.missing ?? [];
  if (request.acceptMissing && !sameSet(request.acceptMissing, missing)) {
    problems.push(problem("missing-changed", { files: missing }));
  }
  if (request.confirmedTarget) {
    const confirmed = request.confirmedTarget;
    const unchanged =
      target &&
      target.fileName === confirmed.fileName &&
      sameSet(
        target.replaces.map((r) => r.path),
        confirmed.replaces,
        (p) => path.resolve(p).toLowerCase(),
      );
    if (!unchanged) problems.push(problem("target-changed"));
  }

  return {
    kind,
    files,
    entry: tree?.entry?.path ?? null,
    missing,
    facts: gz ? { tables: gz.tables, fileMeta: gz.meta } : null,
    options,
    gameCandidates,
    includeDefaults: request.includeDefaults,
    target,
    problems,
    canAdd: !!target && !problems.some((p) => p.severity === "blocking"),
  };
}

/**
 * The include graph from the header scans. Sets roles and per-file missing on
 * `files`, pushes graph problems, and returns the entry, the files it reaches
 * (depth-first pre-order, the library's order), the missing include names and
 * the first reached file with a databaseName.
 */
function buildTree(ftxs, files, problems) {
  const byKey = new Map();
  for (const s of ftxs) {
    const key = includeKey(s.name);
    byKey.set(key, [...(byKey.get(key) ?? []), s]);
  }
  for (const group of byKey.values()) {
    if (group.length > 1) {
      for (const s of group) {
        problems.push(
          problem("duplicate-name", { path: s.path, files: group.map((g) => g.name) }),
        );
      }
    }
  }
  const node = (key) => byKey.get(key)?.[0];
  const nodes = [...byKey.values()].map((g) => g[0]);
  const children = (s) =>
    s.header.includes.map((name) => ({ name, child: node(includeKey(name)) }));

  const reach = (start) => {
    const seen = new Set();
    const order = [];
    const visit = (s) => {
      if (seen.has(s)) return;
      seen.add(s);
      order.push(s);
      children(s).forEach(({ child }) => child && visit(child));
    };
    visit(start);
    return order;
  };

  const included = new Set();
  for (const s of nodes) {
    for (const { child } of children(s)) if (child && child !== s) included.add(child);
  }
  const roots = nodes.filter((s) => !included.has(s));
  const reaches = roots.map((root) => ({ root, order: reach(root) }));
  const most = Math.max(0, ...reaches.map((r) => r.order.length));
  const best = reaches.filter((r) => r.order.length === most);

  const empty = { entry: null, reached: [], missing: [], header: null };
  const cycles = findCycles(nodes, children);
  if (roots.length === 0) {
    problems.push(problem("no-entrypoint"));
    cycles.forEach((c) => problems.push(problem("include-cycle", { files: c.map((s) => s.name) })));
    return empty;
  }
  if (best.length > 1) {
    problems.push(problem("several-entrypoints", { files: best.map((r) => r.root.name) }));
    return empty;
  }

  const [{ root: entry, order: reached }] = best;
  const reachedSet = new Set(reached);
  const rows = new Map(files.map((f) => [f.path, f]));
  const missing = [];
  const missingKeys = new Set();
  for (const s of reached) {
    const row = rows.get(s.path);
    row.role = s === entry ? "entry" : "include";
    for (const { name, child } of children(s)) {
      if (child) continue;
      row.missing.push(name);
      const key = includeKey(name);
      if (!missingKeys.has(key)) {
        missingKeys.add(key);
        missing.push(name);
      }
    }
  }
  for (const cycle of cycles) {
    const names = cycle.map((s) => s.name);
    if (cycle.some((s) => reachedSet.has(s))) {
      problems.push(problem("include-cycle", { files: names }));
    } else {
      cycle.forEach((s) => problems.push(problem("include-cycle", { path: s.path, files: names })));
    }
  }
  const header = reached.find((s) => s.header.databaseName) ?? null;
  if (!header) problems.push(problem("no-database-name"));
  return { entry, reached, missing, header };
}

/** The databaseName generateSchemaV2 reads: the first reached file with one. */
function databaseName(scans) {
  const ftxs = scans.filter((s) => s.format === "ftx");
  const rows = ftxs.map((s) => ({ path: s.path, missing: [] }));
  return buildTree(ftxs, rows, []).header?.header.databaseName ?? null;
}

// Every distinct cycle, as its member files in include order
function findCycles(nodes, children) {
  const cycles = [];
  const keys = new Set();
  const done = new Set();
  const stack = [];
  const visit = (s) => {
    if (done.has(s)) return;
    const at = stack.indexOf(s);
    if (at >= 0) {
      const cycle = stack.slice(at);
      const key = cycle.map((c) => c.path).sort().join("\n");
      if (!keys.has(key)) {
        keys.add(key);
        cycles.push(cycle);
      }
      return;
    }
    stack.push(s);
    children(s).forEach(({ child }) => child && visit(child));
    stack.pop();
    done.add(s);
  };
  nodes.forEach(visit);
  return cycles;
}

function resolveOptions(ctx, overrides = {}, problems) {
  const rows = ctx.kind ? OPTION_SOURCES.filter((r) => r.kinds.includes(ctx.kind)) : [];
  const usable = ctx.named !== null;

  const gameCandidates = [];
  let detectedGame = null;
  let year = null;
  for (const row of usable ? rows : []) {
    const g = row.game(ctx, year);
    if (!g) continue;
    if (year === null && Number.isInteger(g.gameYear)) year = g.gameYear;
    if (!isFullGame(g)) continue;
    const identity = { gameType: g.gameType, gameYear: g.gameYear };
    if (!gameCandidates.some((c) => sameGame(c, identity))) gameCandidates.push(identity);
    detectedGame ??= { value: identity, source: row.source, from: row.from(ctx) };
  }

  const invalid = [];
  const game = option(detectedGame, overrides.game, (o) => {
    const y = /^\d{1,2}$/.test(o.year) ? Number(o.year) : null;
    return y && (o.gameType === "madden" || o.gameType === "college")
      ? { gameType: o.gameType, gameYear: y }
      : null;
  }, () => invalid.push("game"));

  const detectVersion = (field) => {
    for (const row of usable ? rows : []) {
      const v = row.version(ctx, game.value);
      if (v && Number.isInteger(v[field])) {
        return { value: v[field], source: row.source, from: row.from(ctx) };
      }
    }
    return null;
  };
  const parseVersion = (text) => (/^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null);
  const major = option(detectVersion("major"), overrides.major, parseVersion, () => invalid.push("major"));
  const minor = option(detectVersion("minor"), overrides.minor, parseVersion, () => invalid.push("minor"));

  invalid.forEach((field) => problems.push(problem("invalid-version", { detail: field })));
  if (usable && ctx.kind) {
    if (!game.value && !game.overridden) problems.push(problem("game-required"));
    if (
      (major.value === null && !major.overridden) ||
      (minor.value === null && !minor.overridden)
    ) {
      problems.push(problem("version-required"));
    }
  }
  return { options: { game, major, minor }, gameCandidates };
}

function option(detected, override, parse, onInvalid) {
  const overridden = override !== undefined;
  let value = detected?.value ?? null;
  if (overridden) {
    value = parse(override);
    if (value === null) onInvalid();
  }
  return {
    value,
    detected: detected?.value ?? null,
    source: detected?.source ?? null,
    from: detected?.from ?? null,
    overridden,
  };
}

function metaChanges(fileMeta, identity) {
  return ["gameType", "gameYear", "major", "minor"]
    .map((field) => ({ field, from: fileMeta?.[field] ?? null, to: identity[field] }))
    .filter((c) => c.from !== c.to);
}

/**
 * Where an identity is saved, and the custom files it replaces (any folder
 * depth, any extension: whatever the picker reads as that identity).
 * @param {GameIdentity & { major: number, minor: number }} identity
 * @param {PlanEnv} env
 */
function targetFor(identity, env) {
  const prefix = identity.gameType === "college" ? "C" : "M";
  const yy = String(identity.gameYear).padStart(2, "0");
  const fileName = `${prefix}${yy}_${identity.major}_${identity.minor}.gz`;
  const replaces = env.savedSchemas
    .filter(
      (s) =>
        s.source === "custom" &&
        s.gameType === identity.gameType &&
        s.gameYear === identity.gameYear &&
        s.major === identity.major &&
        s.minor === identity.minor,
    )
    .map((s) => ({
      path: s.path,
      loadedBy: env.loadedPaths
        .filter((l) => samePath(l.schemaPath, s.path))
        .map(({ fileId, filePath }) => ({ fileId, filePath })),
    }));
  return { fileName, path: path.join(env.schemaDir, fileName), replaces };
}

module.exports = { planAdd, targetFor, databaseName, OPTION_SOURCES, SEVERITY, problem };
