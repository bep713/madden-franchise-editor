const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const { FranchiseSchema } = require("madden-franchise");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { messageBoxCalls, stubMessageBox } = require("../../util/dialogStubs");
const { poll } = require("../../util/poll");
const { makeSchemaGz, readSchemaGz } = require("../../../unit/helpers/schemaGz");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const NavigationBar = require("../../models/react/NavigationBar");
const SchemaManagementPage = require("../../models/react/SchemaManagementPage");
const AddSchemaPage = require("../../models/react/AddSchemaPage");
const Banner = require("../../models/react/Banner");

const FTX = path.join(__dirname, "../../../data/schemas/ftx");
const BUNDLED_M22 = path.join(
  __dirname,
  "../../../../node_modules/madden-franchise/data/schemas/22/M22_329_1.gz",
);
// Button indexes in the confirm boxes (utils/confirm.ts)
const CONFIRM = 0;
const CANCEL = 1;

let sandbox;
test.beforeEach(({ sandbox: s }) => {
  sandbox = s;
});

const customDir = () => path.join(electron.userDataDir, "schemas");
const customFiles = () =>
  fs.existsSync(customDir()) ? fs.readdirSync(customDir()) : [];

// Copies fixtures from tests/data/schemas/ftx/<folder> into the sandbox
function copyFtx(folder, names, into = folder) {
  const dir = path.join(sandbox.dir, into);
  fs.mkdirSync(dir, { recursive: true });
  return names.map((name) => {
    const to = path.join(dir, name);
    fs.copyFileSync(path.join(FTX, folder, name), to);
    return to;
  });
}

async function loadSchema(schemaPath) {
  const schema = new FranchiseSchema(schemaPath);
  await new Promise((resolve, reject) => {
    schema.once("schemas:done", resolve);
    try {
      schema.evaluate();
    } catch (err) {
      reject(err);
    }
  });
  return schema;
}

async function getMetadata(window) {
  return window.evaluate(async () => {
    const fileId = await window.franchiseAPI.getActiveFileId();
    return window.franchiseAPI.getMetadata(fileId);
  });
}

// The tables of the open file's loaded schema
async function loadedTableNames(window) {
  const result = await window.evaluate(async () => {
    const fileId = await window.franchiseAPI.getActiveFileId();
    return window.electronAPI.schema.getFields({ fileId });
  });
  return [...new Set(result.fields.map((field) => field.table))];
}

const samePath = (a, b) =>
  !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

async function launch() {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const window = await app.getMainWindow();
  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  return {
    electronApp,
    window,
    welcome,
    nav: new NavigationBar(window),
    schemas: new SchemaManagementPage(window),
    addPage: new AddSchemaPage(window),
    banner: new Banner(window),
  };
}

async function openAddPage({ nav, schemas, addPage }) {
  await nav.openTab("Schemas");
  await nav.waitForActiveTab("Schemas");
  await schemas.waitForPageLoad();
  await schemas.addSchema();
  await addPage.waitForPageLoad();
}

// Clicks Add and waits for the Schemas page's success banner
async function addAndWait({ addPage, schemas, banner }, message) {
  await addPage.clickAdd();
  await schemas.waitForPageLoad();
  await banner.waitForMessage("schema-added", message);
}

test("generates a schema from an FTX tree (react)", async () => {
  const ui = await launch();
  const { electronApp, addPage, schemas } = ui;
  const files = copyFtx("gen", ["MAIN.FTX", "Enums.FTX", "Teams.FTX", "Nested.FTX"]);

  await openAddPage(ui);
  await addPage.chooseFiles(electronApp, files);
  expect(await addPage.rows()).to.have.deep.members([
    { name: "MAIN.FTX", role: "entry" },
    { name: "Enums.FTX", role: "include" },
    { name: "Teams.FTX", role: "include" },
    { name: "Nested.FTX", role: "include" },
  ]);
  expect(await addPage.stillNeeded()).to.deep.equal([]);
  expect(await addPage.problems()).to.deep.equal([]);
  expect(await addPage.selectedGame()).to.equal("madden-27");

  await stubMessageBox(electronApp, CANCEL);
  await addAndWait(ui, "Added Madden 27 900.1");
  expect(await messageBoxCalls(electronApp)).to.deep.equal([]);
  await poll(
    () => schemas.hasRow("M27 v900.1"),
    (has) => has,
    { message: "The added schema is not listed" },
  );

  expect(customFiles()).to.deep.equal(["M27_900_1.gz"]);
  const saved = path.join(customDir(), "M27_900_1.gz");
  expect(readSchemaGz(saved).meta).to.deep.include({
    gameType: "madden",
    gameYear: 27,
    major: 900,
    minor: 1,
  });
  const schema = await loadSchema(saved);
  for (const name of ["League", "Team", "Coach"]) {
    expect(schema.schemaMap, name).to.have.property(name);
  }

  await electronApp.close();
});

test("asks before generating without a missing include (react)", async () => {
  const ui = await launch();
  const { electronApp, addPage, banner } = ui;
  const files = copyFtx("gen", ["MAIN.FTX", "Enums.FTX", "Teams.FTX"]);

  await openAddPage(ui);
  await addPage.chooseFiles(electronApp, files);
  expect(await addPage.stillNeeded()).to.deep.equal(["NESTED.FTX"]);
  expect(await addPage.problems()).to.include("missing-include");
  expect(await addPage.isAddEnabled()).to.equal(true);

  // Cancel writes nothing and stays on the page
  await stubMessageBox(electronApp, CANCEL);
  await addPage.clickAdd();
  await poll(
    () => messageBoxCalls(electronApp),
    (calls) => calls.length === 1,
    { message: "The confirmation never showed" },
  );
  const [ask] = await messageBoxCalls(electronApp);
  expect(ask.message).to.equal("Generate without NESTED.FTX?");
  expect(ask.buttons).to.deep.equal(["Generate", "Cancel"]);
  await addPage.waitForPageLoad();
  expect(customFiles()).to.deep.equal([]);

  // Adding the file clears the warning
  const [nested] = copyFtx("gen", ["Nested.FTX"]);
  await addPage.chooseFiles(electronApp, [nested]);
  expect(await addPage.stillNeeded()).to.deep.equal([]);
  expect(await addPage.problems()).to.not.include("missing-include");

  // Back to one missing, then confirm
  await addPage.removeFile("Nested.FTX");
  await addPage.waitForReplan(async () =>
    (await addPage.stillNeeded()).includes("NESTED.FTX"),
  );
  await stubMessageBox(electronApp, CONFIRM);
  await addAndWait(ui, "Added Madden 27 900.1");
  expect(await banner.problems()).to.deep.equal(["missing-includes-accepted"]);
  expect(customFiles()).to.deep.equal(["M27_900_1.gz"]);
  const saved = readSchemaGz(path.join(customDir(), "M27_900_1.gz"));
  const names = saved.schemas.map((s) => s.name);
  expect(names).to.include.members(["League", "Team"]);
  expect(names).to.not.include("Coach");

  await electronApp.close();
});

test("a ready .gz without a game or version takes them from the options (react)", async () => {
  const ui = await launch();
  const { electronApp, addPage } = ui;
  // The bundled C27 gz has a version in its meta; this one has only the year
  const gz = makeSchemaGz({ gameYear: 27 }, undefined, {
    fileName: "college.gz",
    dir: path.join(sandbox.dir, "gz"),
  });

  await openAddPage(ui);
  await addPage.chooseFiles(electronApp, [gz]);
  expect(await addPage.rows()).to.deep.equal([{ name: "college.gz", role: "schema" }]);
  expect(await addPage.hasFacts()).to.equal(true);
  expect(await addPage.fact("tables")).to.equal("1");
  expect(await addPage.fact("game")).to.equal("None");
  expect(await addPage.fact("version")).to.equal("None");
  expect(await addPage.fact("saves-as")).to.equal("—");
  expect(await addPage.hasAdvancedOptions()).to.equal(false);
  expect(await addPage.problems()).to.include("game-required");
  expect(await addPage.isAddEnabled()).to.equal(false);

  await addPage.selectGame("CFB 27");
  await addPage.setVersion(470, 3);
  await addPage.waitForReplan(async () => (await addPage.fact("saves-as")) === "C27_470_3.gz");
  expect(await addPage.problems()).to.not.include("game-required");
  expect(await addPage.isAddEnabled()).to.equal(true);

  await stubMessageBox(electronApp, CANCEL);
  await addAndWait(ui, "Added CFB 27 470.3");
  expect(customFiles()).to.deep.equal(["C27_470_3.gz"]);
  expect(readSchemaGz(path.join(customDir(), "C27_470_3.gz")).meta).to.deep.include({
    gameType: "college",
    gameYear: 27,
    major: 470,
    minor: 3,
  });

  await electronApp.close();
});

test("replaces a custom schema the open file uses, and undoes it (react)", async () => {
  test.setTimeout(120 * 1000);
  const ui = await launch();
  const { electronApp, window, welcome, nav, schemas, addPage, banner } = ui;
  // Two .gz inputs with the M22 fixture's identity (329.1 from their meta); the
  // second has one more table
  const first = path.join(sandbox.dir, "first", "M22_329_1.gz");
  fs.mkdirSync(path.dirname(first), { recursive: true });
  fs.copyFileSync(BUNDLED_M22, first);
  const changed = readSchemaGz(BUNDLED_M22);
  changed.schemas.push({
    name: "AddedByTest",
    numMembers: "1",
    base: "none()",
    attributes: [{ name: "Flag", type: "bool" }],
  });
  const second = makeSchemaGz(changed.meta, changed.schemas, {
    fileName: "M22_329_1.gz",
    dir: path.join(sandbox.dir, "second"),
  });
  const saved = path.join(electron.userDataDir, "schemas", "M22_329_1.gz");
  const tableNames = () => readSchemaGz(saved).schemas.map((s) => s.name);

  await welcome.openFranchiseFile(electronApp, sandbox.careerPath);
  await openAddPage(ui);
  await addPage.chooseFiles(electronApp, [first]);
  expect(await addPage.fact("saves-as")).to.equal("M22_329_1.gz");
  // The bundled meta has no gameType, so the copy is rewritten with it
  expect(await addPage.problems()).to.include("meta-written");
  await stubMessageBox(electronApp, CANCEL);
  await addAndWait(ui, "Added Madden 22 329.1");
  const firstSaved = fs.readFileSync(saved);
  expect(readSchemaGz(saved).meta).to.deep.include({ gameType: "madden", gameYear: 22 });
  expect(readSchemaGz(saved).schemas).to.deep.equal(readSchemaGz(first).schemas);

  // Load the copy into the open file, so the replace has a user
  await schemas.clickSchema("M22 v329.1 (Custom)");
  await schemas.waitForLoaded("M22 v329.1 (Custom)");
  expect(samePath((await getMetadata(window)).schemaList.path, saved)).to.equal(true);

  async function replace() {
    await schemas.addSchema();
    await addPage.waitForPageLoad();
    await addPage.chooseFiles(electronApp, [second]);
    expect(await addPage.problems()).to.include.members(["replaces-custom", "replaces-loaded"]);
    await stubMessageBox(electronApp, CONFIRM);
    const before = (await messageBoxCalls(electronApp)).length;
    await addAndWait(ui, "Replaced your custom Madden 22 329.1");
    const calls = await messageBoxCalls(electronApp);
    expect(calls.length).to.equal(before + 1);
    expect(calls[calls.length - 1].message).to.equal("Replace your custom M22 329.1?");
    expect(calls[calls.length - 1].buttons).to.deep.equal(["Replace", "Cancel"]);
    expect(customFiles()).to.deep.equal(["M22_329_1.gz"]);
    expect(tableNames()).to.include("AddedByTest");
  }

  // Every banner action closes the banner, so Undo and "Use it" each get a replace
  await replace();
  await banner.click("Undo");
  await poll(
    () => fs.readFileSync(saved).equals(firstSaved),
    (restored) => restored,
    { message: "Undo never brought the first copy back" },
  );
  expect(customFiles()).to.deep.equal(["M22_329_1.gz"]);

  await replace();
  await banner.click(`Use it in ${path.basename(sandbox.careerPath)}`);
  await poll(
    () => loadedTableNames(window),
    (names) => names.includes("AddedByTest"),
    { message: "The open file never reloaded with the new copy" },
  );
  expect(samePath((await getMetadata(window)).schemaList.path, saved)).to.equal(true);
  expect(await nav.activeTabName()).to.equal("Schemas");
  expect(customFiles()).to.deep.equal(["M22_329_1.gz"]);

  await electronApp.close();
});

test("malformed XML is blocked and writes nothing (react)", async () => {
  const ui = await launch();
  const { electronApp, addPage } = ui;
  const files = [
    ...copyFtx("bad", ["BROKEN_MAIN.FTX"], "broken"),
    ...copyFtx("gen", ["Enums.FTX"], "broken"),
  ];

  await openAddPage(ui);
  await addPage.chooseFiles(electronApp, files);
  await stubMessageBox(electronApp, CANCEL);
  await addPage.clickAdd();
  await poll(
    () => addPage.rowProblems("BROKEN_MAIN.FTX"),
    (codes) => codes.includes("malformed-xml"),
    { message: "malformed-xml never showed on the row" },
  );
  await addPage.waitForPageLoad();
  expect(await addPage.isAddEnabled()).to.equal(false);
  expect(customFiles()).to.deep.equal([]);
  expect(fs.readdirSync(electron.userDataDir)).to.not.include("schema-staging");

  await electronApp.close();
});

test("choosing a folder lists each of its files (react)", async () => {
  const ui = await launch();
  const { electronApp, addPage } = ui;
  const names = ["MAIN.FTX", "Enums.FTX", "Teams.FTX", "Nested.FTX", "Unrelated.FTX"];
  copyFtx("gen", names);

  await openAddPage(ui);
  await addPage.chooseFolder(electronApp, path.join(sandbox.dir, "gen"));
  const rows = await addPage.rows();
  expect(rows.map((row) => row.name)).to.deep.equal([...names].sort());
  expect(rows).to.deep.include({ name: "MAIN.FTX", role: "entry" });
  expect(rows).to.deep.include({ name: "Unrelated.FTX", role: "unused" });

  // Each row can be removed on its own
  await addPage.removeFile("Unrelated.FTX");
  await addPage.waitForReplan(
    async () => (await addPage.rows()).length === names.length - 1,
  );

  await electronApp.close();
});

// An entry FTX in `dir` that includes `total` files, the first `present` of
// them written next to it. The first include has a very long name.
function writeBigTree(dir, total, present) {
  fs.mkdirSync(dir, { recursive: true });
  const names = Array.from({ length: total }, (_, i) =>
    i === 0 ? `${"VeryLongIncludeName".repeat(8)}.FTX` : `Inc${String(i).padStart(2, "0")}.FTX`,
  );
  const includes = names.map((n) => `    <IncludeFile fileName="${n}"/>`).join("\n");
  fs.writeFileSync(
    path.join(dir, "MAIN.FTX"),
    `<?xml version="1.0" encoding="utf-8"?>
<FranTkData databaseName="Madden27_Franchise" dataMajorVersion="900" dataMinorVersion="1">
  <Includes>
${includes}
  </Includes>
  <schemas/>
</FranTkData>`,
  );
  for (const name of names.slice(0, present)) {
    fs.writeFileSync(path.join(dir, name), '<?xml version="1.0"?>\n<FranTkData><schemas/></FranTkData>');
  }
  return names;
}

test("long file and still-needed lists collapse, and Options keeps its width (react)", async () => {
  const ui = await launch();
  const { electronApp, window, addPage } = ui;
  const dir = path.join(sandbox.dir, "big");
  const names = writeBigTree(dir, 30, 12);

  await openAddPage(ui);
  await addPage.chooseFolder(electronApp, dir);

  // 13 files (entry + 12): 10 shown
  expect(await addPage.rows()).to.have.length(10);
  await addPage.showMore("files");
  expect(await addPage.rows()).to.have.length(13);
  await addPage.showMore("files");
  expect(await addPage.rows()).to.have.length(10);

  // 18 still needed: 5 shown, with the count
  expect(await addPage.stillNeeded()).to.deep.equal(names.slice(12, 17));
  expect(await addPage.locators.stillNeeded.innerText()).to.contain("Still needed (18 files,");
  await addPage.showMore("missing");
  expect(await addPage.stillNeeded()).to.have.length(18);

  // The warning names five and counts the rest
  expect(await addPage.problemText("missing-include")).to.contain(
    `${names.slice(12, 17).join(", ")} and 13 more`,
  );

  // The long name (sorted last) is cut off, and Options stays a third
  await addPage.showMore("files");
  const layout = await window.evaluate(() => {
    const width = (sel) => document.querySelector(sel).getBoundingClientRect().width;
    const longName = document.querySelector('li[data-name^="VeryLong"] [title^="VeryLong"]');
    return {
      files: width('[data-testid="schema-files"]'),
      options: width('[data-testid="schema-options"]'),
      clipped: longName.scrollWidth > longName.clientWidth,
    };
  });
  expect(layout.clipped).to.equal(true);
  expect(layout.options).to.be.closeTo(layout.files / 2, 2);

  await electronApp.close();
});

test("the Schemas tab goes back from the Add page (react)", async () => {
  const ui = await launch();
  const { nav, schemas, addPage } = ui;

  await openAddPage(ui);
  expect(await nav.activeTabName()).to.equal("Schemas");
  await nav.openTab("Schemas");
  await schemas.waitForPageLoad();
  await addPage.locators.headline.waitFor({ state: "detached" });

  // And the page's own back button
  await schemas.addSchema();
  await addPage.waitForPageLoad();
  await addPage.back();
  await schemas.waitForPageLoad();
  await addPage.locators.headline.waitFor({ state: "detached" });

  await ui.electronApp.close();
});

test("without the default schemas, the saved file has only the FTX tables (react) @slow", async () => {
  const ui = await launch();
  const { electronApp, addPage } = ui;
  const files = copyFtx("standalone", ["STANDALONE.FTX"]);

  await openAddPage(ui);
  await addPage.chooseFiles(electronApp, files);
  expect(await addPage.hasDefaultsNote()).to.equal(false);
  await addPage.setIncludeDefaults(false);
  await addPage.waitForReplan(() => addPage.hasDefaultsNote());

  await stubMessageBox(electronApp, CANCEL);
  await addPage.clickAdd();
  await ui.schemas.waitForPageLoad();
  await ui.banner.waitForBanner("schema-added");
  const [fileName] = customFiles();
  const saved = readSchemaGz(path.join(customDir(), fileName));
  const names = saved.schemas.map((s) => s.name);
  expect(names).to.include("Player");
  expect(names).to.not.include("UserEntity");

  await electronApp.close();
});
