// planAdd (main/services/schemaImport/plan.js) on literal header scans.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const games = require("../../data/games.json");
const { planAdd, OPTION_SOURCES, SEVERITY } = require("../../main/services/schemaImport/plan");

const IN = path.resolve("/mfe-in");
const SCHEMA_DIR = path.resolve("/mfe-user/schemas");
const BUNDLED = path.resolve("/mfe-lib/data/schemas");

const ftx = (name, { db, major, minor, includes = [] } = {}) => ({
  path: path.join(IN, name),
  name,
  format: "ftx",
  header: {
    databaseName: db ?? null,
    major: major ?? null,
    minor: minor ?? null,
    includes,
  },
});
const gz = (name, meta = null, tables = 3) => ({
  path: path.join(IN, name),
  name,
  format: "gz",
  tables,
  meta: meta && {
    gameType: null,
    gameYear: null,
    major: null,
    minor: null,
    databaseName: null,
    ...meta,
  },
});
const bad = (name) => ({ path: path.join(IN, name), name, format: "invalid", detail: "Not a schema file" });

const saved = (name, source, dir = source === "custom" ? SCHEMA_DIR : BUNDLED) => {
  const m = /(M|C)(\d+)_(\d+)_(\d+)/.exec(name);
  return {
    gameType: m[1] === "C" ? "college" : "madden",
    gameYear: +m[2],
    major: +m[3],
    minor: +m[4],
    path: path.join(dir, name),
    source,
  };
};

const ENV = { games, savedSchemas: [], loadedPaths: [], open: null, schemaDir: SCHEMA_DIR };
const REQUEST = { files: [], overrides: {}, includeDefaults: true };

const seen = new Set();
function plan(scans, request = {}, env = {}) {
  const result = planAdd(scans, { ...REQUEST, ...request }, { ...ENV, ...env });
  result.problems.forEach((p) => seen.add(p.code));
  return result;
}
const codes = (p) => p.problems.map((x) => x.code);
const find = (p, code) => p.problems.find((x) => x.code === code);
const role = (p, name) => p.files.find((f) => f.name === name).role;

// A complete generate tree: MAIN -> Enums, Teams -> NESTED
const GEN = [
  ftx("MAIN.FTX", { db: "Madden27_Franchise", major: "900", minor: "1", includes: ["Enums.FTX", "Teams.FTX"] }),
  ftx("Enums.FTX"),
  ftx("Teams.FTX", { includes: ["NESTED.FTX"] }),
  ftx("Nested.FTX"),
];

test("every severity comes from the one table", () => {
  const p = plan([gz("a.gz"), gz("b.gz"), bad("c.txt")]);
  for (const x of p.problems) assert.equal(x.severity, SEVERITY[x.code]);
});

test("kind: no files, one gz, two gz, mixed, ftx, self-contained ftx, invalid", () => {
  const none = plan([]);
  assert.equal(none.kind, null);
  assert.deepEqual(codes(none), ["no-files"]);
  assert.equal(none.canAdd, false);

  assert.equal(plan([gz("M27_620_0.gz")]).kind, "copy-gz");

  const two = plan([gz("a.gz"), gz("b.gz")]);
  assert.equal(two.kind, "copy-gz");
  assert.deepEqual(find(two, "several-schemas").files, ["a.gz", "b.gz"]);
  assert.equal(two.facts, null);

  const mixed = plan([gz("a.gz"), ftx("MAIN.FTX")]);
  assert.equal(mixed.kind, null);
  assert.ok(codes(mixed).includes("mixed-kinds"));

  assert.equal(plan(GEN).kind, "generate");

  const alone = plan([ftx("STANDALONE.FTX", { db: "Madden26_Franchise", major: "310", minor: "0" })]);
  assert.equal(alone.kind, "generate");
  assert.equal(alone.entry, path.join(IN, "STANDALONE.FTX"));
  assert.equal(alone.files[0].role, "entry");
  assert.equal(alone.target.fileName, "M26_310_0.gz");
  assert.equal(alone.canAdd, true);

  const invalid = plan([bad("notes.txt"), ...GEN]);
  assert.equal(role(invalid, "notes.txt"), "invalid");
  assert.deepEqual(find(invalid, "not-a-schema"), {
    code: "not-a-schema",
    severity: "blocking",
    path: path.join(IN, "notes.txt"),
    detail: "Not a schema file",
  });
  assert.equal(invalid.canAdd, false);
});

test("entry: the unique root; the larger reachable set wins; a tie; no root", () => {
  const p = plan([...GEN, ftx("Unrelated.FTX")]);
  assert.equal(p.entry, path.join(IN, "MAIN.FTX"));
  assert.deepEqual(
    p.files.map((f) => [f.name, f.role]),
    [
      ["MAIN.FTX", "entry"],
      ["Enums.FTX", "include"],
      ["Teams.FTX", "include"],
      ["Nested.FTX", "include"],
      ["Unrelated.FTX", "unused"],
    ],
  );
  assert.equal(p.canAdd, true);

  const tie = plan([
    ftx("A.FTX", { db: "Madden27_X", major: "1", minor: "0", includes: ["X.FTX"] }),
    ftx("X.FTX"),
    ftx("B.FTX", { db: "Madden27_X", major: "1", minor: "0", includes: ["Y.FTX"] }),
    ftx("Y.FTX"),
  ]);
  assert.equal(tie.entry, null);
  assert.deepEqual(find(tie, "several-entrypoints").files, ["A.FTX", "B.FTX"]);
  assert.equal(tie.target, null);
  assert.ok(!codes(tie).includes("game-required"), "no option noise without an entry");

  const loop = plan([ftx("A.FTX", { includes: ["B.FTX"] }), ftx("B.FTX", { includes: ["A.FTX"] })]);
  assert.ok(codes(loop).includes("no-entrypoint"));
  assert.deepEqual(find(loop, "include-cycle").files, ["A.FTX", "B.FTX"]);
});

test("a chosen entry: settles a tie, narrows the tree, breaks a loop; a stale one is ignored", () => {
  const TIE = [
    ftx("A.FTX", { db: "Madden27_X", major: "1", minor: "0", includes: ["X.FTX"] }),
    ftx("X.FTX"),
    ftx("B.FTX", { db: "Madden26_Y", major: "2", minor: "0", includes: ["Y.FTX"] }),
    ftx("Y.FTX"),
  ];
  const tie = plan(TIE, { entry: path.join(IN, "B.FTX") });
  assert.equal(tie.entry, path.join(IN, "B.FTX"));
  assert.equal(tie.entryChosen, true);
  assert.ok(!codes(tie).includes("several-entrypoints"));
  assert.deepEqual(
    tie.files.map((f) => [f.name, f.role]),
    [
      ["A.FTX", "unused"],
      ["X.FTX", "unused"],
      ["B.FTX", "entry"],
      ["Y.FTX", "include"],
    ],
  );
  assert.equal(tie.target.fileName, "M26_2_0.gz");
  assert.equal(tie.canAdd, true);

  // An include as the entry: its parent and siblings are unused, and so are
  // the parent's missing includes
  const sub = plan(
    [...GEN.map((s) => (s.name === "MAIN.FTX" ? { ...s, header: { ...s.header, includes: [...s.header.includes, "Gone.FTX"] } } : s))],
    { entry: path.join(IN, "Teams.FTX"), overrides: { game: { gameType: "madden", year: "27" }, major: "1", minor: "0" } },
  );
  assert.deepEqual(
    sub.files.map((f) => [f.name, f.role]),
    [
      ["MAIN.FTX", "unused"],
      ["Enums.FTX", "unused"],
      ["Teams.FTX", "entry"],
      ["Nested.FTX", "include"],
    ],
  );
  assert.deepEqual(sub.missing, []);
  assert.ok(codes(sub).includes("no-database-name"));

  const loop = plan(
    [ftx("A.FTX", { db: "Madden27_X", major: "1", minor: "0", includes: ["B.FTX"] }), ftx("B.FTX", { includes: ["A.FTX"] })],
    { entry: path.join(IN, "A.FTX") },
  );
  assert.ok(!codes(loop).includes("no-entrypoint"));
  assert.equal(role(loop, "A.FTX"), "entry");
  assert.deepEqual(find(loop, "include-cycle").files, ["A.FTX", "B.FTX"]);

  const stale = plan(GEN, { entry: path.join(IN, "Removed.FTX") });
  assert.equal(stale.entry, path.join(IN, "MAIN.FTX"));
  assert.equal(stale.entryChosen, false);
  assert.equal(plan(GEN).entryChosen, false);

  // Case-insensitive, like every other path compare
  assert.equal(plan(GEN, { entry: path.join(IN, "teams.ftx") }).entry, path.join(IN, "Teams.FTX"));
});

test("include cycles: a self include, a cycle under one root, a cycle only in unused files", () => {
  const self = plan([ftx("MAIN.FTX", { db: "Madden27_X", major: "1", minor: "0", includes: ["MAIN.FTX"] })]);
  assert.equal(self.entry, path.join(IN, "MAIN.FTX"));
  assert.deepEqual(find(self, "include-cycle"), {
    code: "include-cycle",
    severity: "blocking",
    files: ["MAIN.FTX"],
  });
  assert.equal(self.canAdd, false);

  const under = plan([
    ftx("CYCLE_MAIN.FTX", { db: "Madden27_X", major: "901", minor: "0", includes: ["Rosters.FTX"] }),
    ftx("Rosters.FTX", { includes: ["Players.FTX"] }),
    ftx("Players.FTX", { includes: ["Rosters.FTX"] }),
  ]);
  const cycle = find(under, "include-cycle");
  assert.deepEqual(cycle.files, ["Rosters.FTX", "Players.FTX"]);
  assert.equal(cycle.path, undefined);
  assert.equal(under.canAdd, false);

  const unused = plan([
    ...GEN,
    ftx("Stray.FTX", { includes: ["Loop1.FTX"] }),
    ftx("Loop1.FTX", { includes: ["Loop2.FTX"] }),
    ftx("Loop2.FTX", { includes: ["Loop1.FTX"] }),
  ]);
  assert.equal(unused.entry, path.join(IN, "MAIN.FTX"));
  const rows = unused.problems.filter((p) => p.code === "include-cycle");
  assert.deepEqual(
    rows.map((r) => r.path),
    [path.join(IN, "Loop1.FTX"), path.join(IN, "Loop2.FTX")],
  );
  assert.ok(rows.every((r) => role(unused, path.basename(r.path)) === "unused"));
});

test("missing includes: a warning listed once, not counted from unused files", () => {
  const p = plan([
    ftx("MAIN.FTX", { db: "Madden27_X", major: "900", minor: "1", includes: ["Enums.FTX", "Teams.FTX"] }),
    ftx("Teams.FTX", { includes: ["NESTED.FTX", "enums.ftx"] }),
    ftx("Stray.FTX", { includes: ["Ghost.FTX"] }),
  ]);
  assert.deepEqual(p.missing, ["Enums.FTX", "NESTED.FTX"]);
  assert.deepEqual(p.files.find((f) => f.name === "Teams.FTX").missing, ["NESTED.FTX", "enums.ftx"]);
  assert.deepEqual(p.files.find((f) => f.name === "Stray.FTX").missing, []);
  assert.deepEqual(find(p, "missing-include"), {
    code: "missing-include",
    severity: "warning",
    files: ["Enums.FTX", "NESTED.FTX"],
  });
  assert.equal(p.canAdd, true);
});

test("duplicate-name: the same include key from two paths", () => {
  const p = plan([...GEN, { ...ftx("nested.ftx"), path: path.join(IN, "sub", "nested.ftx") }]);
  const dups = p.problems.filter((x) => x.code === "duplicate-name");
  assert.equal(dups.length, 2);
  assert.deepEqual(dups[0].files, ["Nested.FTX", "nested.ftx"]);
  assert.equal(p.canAdd, false);
});

test("no-database-name blocks even with every option typed", () => {
  const p = plan([ftx("NO_DB_MAIN.FTX", { includes: ["Enums.FTX"] }), ftx("Enums.FTX")], {
    overrides: { game: { gameType: "madden", year: "27" }, major: "1", minor: "0" },
  });
  assert.ok(codes(p).includes("no-database-name"));
  assert.equal(p.canAdd, false);
});

test("OPTION_SOURCES rows are in the contract's detection order", () => {
  assert.deepEqual(
    OPTION_SOURCES.map((r) => r.source),
    ["ftx-header", "gz-meta", "file-name", "only-game-for-year", "open-file"],
  );
});

test("ftx-header: the first file with databaseName, depth-first", () => {
  const p = plan([
    ftx("ORDER_MAIN.FTX", { major: "111", minor: "1", includes: ["First.FTX", "Second.FTX"] }),
    ftx("First.FTX", { includes: ["Deep.FTX"] }),
    ftx("Deep.FTX", { db: "Madden25_Franchise", major: "250", minor: "3" }),
    ftx("Second.FTX", { db: "CollegeFB26_Dynasty", major: "260", minor: "7" }),
  ]);
  assert.deepEqual(p.options.game, {
    value: { gameType: "madden", gameYear: 25 },
    detected: { gameType: "madden", gameYear: 25 },
    source: "ftx-header",
    from: "Deep.FTX",
    overridden: false,
  });
  assert.equal(p.options.major.value, 250);
  assert.equal(p.options.minor.value, 3);
  assert.equal(p.target.fileName, "M25_250_3.gz");

  const college = plan([ftx("CFB_MAIN.FTX", { db: "CollegeFB27_Dynasty", major: "468", minor: "9" })]);
  assert.deepEqual(college.options.game.value, { gameType: "college", gameYear: 27 });
  assert.equal(college.target.fileName, "C27_468_9.gz");
});

test("gz-meta wins over the file name", () => {
  const p = plan([gz("M26_1_1.gz", { gameType: "madden", gameYear: 27, major: 620, minor: 0 })]);
  assert.equal(p.options.game.source, "gz-meta");
  assert.deepEqual(p.options.game.value, { gameType: "madden", gameYear: 27 });
  assert.equal(p.options.major.source, "gz-meta");
  assert.equal(p.options.major.value, 620);
  assert.deepEqual(p.gameCandidates, [
    { gameType: "madden", gameYear: 27 },
    { gameType: "madden", gameYear: 26 },
  ]);
});

test("file-name: a gz without meta, and an FTX entry's name", () => {
  const p = plan([gz("C27_468_2.gz")]);
  assert.equal(p.options.game.source, "file-name");
  assert.equal(p.options.game.from, "C27_468_2.gz");
  assert.deepEqual(p.options.game.value, { gameType: "college", gameYear: 27 });
  assert.equal(p.options.minor.value, 2);
  assert.equal(p.options.minor.source, "file-name");

  const entry = plan([ftx("M24_100_2.FTX", { db: "Franchise" })]);
  assert.equal(entry.options.major.source, "file-name");
  assert.equal(entry.options.major.value, 100);
});

test("only-game-for-year: one games.json game for the year, none when two share it", () => {
  const p = plan([gz("schema.gz", { gameYear: 25, major: 1, minor: 2 })]);
  assert.equal(p.options.game.source, "only-game-for-year");
  assert.equal(p.options.game.from, null);
  assert.deepEqual(p.options.game.value, { gameType: "madden", gameYear: 25 });

  const shared = plan([gz("college.gz", { gameYear: 27, major: 468, minor: 2 })]);
  assert.equal(shared.options.game.value, null);
  assert.ok(codes(shared).includes("game-required"));
  assert.equal(shared.target, null);
  assert.equal(shared.facts.fileMeta.major, 468);
});

test("open-file: the open file's game for that year and its expected version", () => {
  const open = {
    path: path.resolve("/saves/CAREER-CFB"),
    game: { gameType: "college", gameYear: 27 },
    expected: { major: 470, minor: 1 },
  };
  const year = plan([gz("college.gz", { gameYear: 27 })], {}, { open });
  assert.equal(year.options.game.source, "open-file");
  assert.equal(year.options.game.from, "CAREER-CFB");
  assert.equal(year.options.major.source, "open-file");
  assert.equal(year.options.major.value, 470);
  assert.deepEqual(find(year, "version-guessed"), {
    code: "version-guessed",
    severity: "warning",
    files: ["CAREER-CFB"],
  });
  assert.equal(year.canAdd, true);

  const otherYear = plan([gz("old.gz", { gameYear: 25 })], {}, { open });
  assert.equal(otherYear.options.game.source, "only-game-for-year");
  assert.equal(otherYear.options.major.value, null, "no version from a file of another game");

  const nothing = plan([gz("blank.gz")], {}, { open });
  assert.deepEqual(nothing.options.game.value, { gameType: "college", gameYear: 27 });
  assert.equal(nothing.target.fileName, "C27_470_1.gz");
});

test("none: game-required and version-required", () => {
  const p = plan([gz("blank.gz")]);
  assert.ok(codes(p).includes("game-required"));
  assert.ok(codes(p).includes("version-required"));
  assert.equal(p.options.game.source, null);
  assert.equal(p.canAdd, false);
  assert.deepEqual(p.facts, { tables: 3, fileMeta: null });
});

test("version-guessed only for the open-file source, and not once overridden", () => {
  const open = {
    path: path.resolve("/saves/CAREER-M27"),
    game: { gameType: "madden", gameYear: 27 },
    expected: { major: 620, minor: 0 },
  };
  assert.ok(!codes(plan([gz("M27_620_0.gz")], {}, { open })).includes("version-guessed"));
  assert.ok(!codes(plan(GEN, {}, { open })).includes("version-guessed"));
  const typed = plan([gz("blank.gz")], {
    overrides: { game: { gameType: "madden", year: "27" }, major: "620", minor: "0" },
  }, { open });
  assert.ok(!codes(typed).includes("version-guessed"));
});

test("an unlisted detected game: Madden28 from the FTX header", () => {
  const p = plan([ftx("MAIN.FTX", { db: "Madden28_Franchise", major: "1", minor: "0" })]);
  assert.deepEqual(p.gameCandidates, [{ gameType: "madden", gameYear: 28 }]);
  assert.deepEqual(p.options.game.value, { gameType: "madden", gameYear: 28 });
  assert.equal(p.target.fileName, "M28_1_0.gz");
  assert.equal(p.canAdd, true);
});

test("overrides: values kept as typed, detected kept, invalid text blocks", () => {
  const p = plan(GEN, { overrides: { game: { gameType: "college", year: "27" }, major: "905", minor: "0" } });
  assert.deepEqual(p.options.game, {
    value: { gameType: "college", gameYear: 27 },
    detected: { gameType: "madden", gameYear: 27 },
    source: "ftx-header",
    from: "MAIN.FTX",
    overridden: true,
  });
  assert.equal(p.options.major.value, 905);
  assert.equal(p.options.major.detected, 900);
  assert.equal(p.target.fileName, "C27_905_0.gz");

  for (const text of ["", "1.5", "-1", "abc"]) {
    const bad = plan(GEN, { overrides: { major: text } });
    assert.deepEqual(find(bad, "invalid-version"), { code: "invalid-version", severity: "blocking", detail: "major" }, text);
    assert.equal(bad.options.major.value, null);
    assert.ok(!codes(bad).includes("version-required"));
    assert.equal(bad.canAdd, false);
  }
  const year = plan(GEN, { overrides: { game: { gameType: "madden", year: "2027" } } });
  assert.equal(find(year, "invalid-version").detail, "game");
  assert.ok(!codes(year).includes("game-required"));
});

test("meta-written lists each field that changes", () => {
  const partial = plan([gz("schema.gz", { gameYear: 27, major: 620, minor: 0 })], {
    overrides: { game: { gameType: "madden", year: "27" } },
  });
  assert.deepEqual(find(partial, "meta-written"), {
    code: "meta-written",
    severity: "info",
    changes: [{ field: "gameType", from: null, to: "madden" }],
  });

  const none = plan([gz("M27_620_0.gz")]);
  assert.deepEqual(find(none, "meta-written").changes, [
    { field: "gameType", from: null, to: "madden" },
    { field: "gameYear", from: null, to: 27 },
    { field: "major", from: null, to: 620 },
    { field: "minor", from: null, to: 0 },
  ]);

  const same = plan([gz("x.gz", { gameType: "madden", gameYear: 27, major: 620, minor: 0 })]);
  assert.ok(!codes(same).includes("meta-written"));
  assert.ok(!codes(plan(GEN)).includes("meta-written"));
});

test("target: a free name, custom copies anywhere replaced, bundled twin left alone", () => {
  const free = plan(GEN);
  assert.deepEqual(free.target, {
    fileName: "M27_900_1.gz",
    path: path.join(SCHEMA_DIR, "M27_900_1.gz"),
    replaces: [],
  });
  assert.ok(!codes(free).includes("replaces-custom"));

  const savedSchemas = [
    saved("M27_900_1.gz", "custom"),
    saved("M27_900_1.gz", "custom", path.join(SCHEMA_DIR, "old")),
    saved("M27_900_1.FTX", "custom"),
    saved("C27_900_1.gz", "custom"),
    saved("M27_900_2.gz", "custom"),
    saved("M27_900_1.gz", "bundled"),
  ];
  const loadedPaths = [
    { schemaPath: path.join(SCHEMA_DIR, "old", "M27_900_1.gz"), fileId: "file-1", filePath: path.resolve("/saves/CAREER-A") },
  ];
  const p = plan(GEN, {}, { savedSchemas, loadedPaths });
  assert.deepEqual(
    p.target.replaces.map((r) => r.path),
    [
      path.join(SCHEMA_DIR, "M27_900_1.gz"),
      path.join(SCHEMA_DIR, "old", "M27_900_1.gz"),
      path.join(SCHEMA_DIR, "M27_900_1.FTX"),
    ],
  );
  assert.deepEqual(p.target.replaces[1].loadedBy, [{ fileId: "file-1", filePath: path.resolve("/saves/CAREER-A") }]);
  assert.deepEqual(find(p, "replaces-custom").files, [
    "M27_900_1.gz",
    path.join("old", "M27_900_1.gz"),
    "M27_900_1.FTX",
  ]);
  assert.deepEqual(find(p, "replaces-loaded"), { code: "replaces-loaded", severity: "info", files: ["CAREER-A"] });
  assert.equal(p.canAdd, true);

  const twin = plan([gz("M27_620_0.gz")], {}, { savedSchemas: [saved("M27_620_0.gz", "bundled")] });
  assert.deepEqual(twin.target.replaces, []);
});

test("commit checks: acceptMissing and confirmedTarget must match what main derives", () => {
  const tree = [GEN[0], GEN[1], GEN[2]];
  const target = { fileName: "M27_900_1.gz", replaces: [] };
  const ok = plan(tree, { acceptMissing: ["NESTED.FTX"], confirmedTarget: target });
  assert.equal(ok.canAdd, true);

  const missing = plan(tree, { acceptMissing: [], confirmedTarget: target });
  assert.deepEqual(find(missing, "missing-changed").files, ["NESTED.FTX"]);
  assert.equal(missing.canAdd, false);

  const savedSchemas = [saved("M27_900_1.gz", "custom")];
  const changed = plan(GEN, { acceptMissing: [], confirmedTarget: target }, { savedSchemas });
  assert.deepEqual(find(changed, "target-changed"), { code: "target-changed", severity: "blocking" });
  assert.equal(changed.canAdd, false);

  const confirmed = plan(GEN, {
    acceptMissing: [],
    confirmedTarget: { fileName: "M27_900_1.gz", replaces: [path.join(SCHEMA_DIR, "m27_900_1.GZ")] },
  }, { savedSchemas });
  assert.equal(confirmed.canAdd, true, "paths compare without case");

  const renamed = plan(GEN, {
    acceptMissing: [],
    confirmedTarget: { fileName: "M27_900_2.gz", replaces: [] },
  });
  assert.ok(codes(renamed).includes("target-changed"));
});

test("defaults-merged-at-load when Add default schemas is unchecked, for generate only", () => {
  assert.ok(codes(plan(GEN, { includeDefaults: false })).includes("defaults-merged-at-load"));
  assert.ok(!codes(plan(GEN)).includes("defaults-merged-at-load"));
  const gzPlan = plan([gz("M27_620_0.gz")], { includeDefaults: false });
  assert.ok(!codes(gzPlan).includes("defaults-merged-at-load"));
  assert.equal(gzPlan.includeDefaults, false);
});

test("facts: set for copy-gz, null for generate, fileMeta null without meta", () => {
  const p = plan([gz("x.gz", { gameType: "madden", gameYear: 27, major: 620, minor: 0, databaseName: "Madden27_Franchise" }, 12)]);
  assert.deepEqual(p.facts, {
    tables: 12,
    fileMeta: { gameType: "madden", gameYear: 27, major: 620, minor: 0, databaseName: "Madden27_Franchise" },
  });
  assert.equal(plan(GEN).facts, null);
  assert.equal(plan([gz("x.gz")]).facts.fileMeta, null);
});

test("every problem code main can derive without the library is covered above", () => {
  const addOnly = ["malformed-xml", "empty-enum", "no-tables", "missing-includes-accepted"];
  const expected = Object.keys(SEVERITY).filter((c) => !addOnly.includes(c));
  assert.deepEqual(expected.filter((c) => !seen.has(c)), []);
});
