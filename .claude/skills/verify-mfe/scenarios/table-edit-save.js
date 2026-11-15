// Feature: table-editor (edit-cell, save). React UI.
// Opens the sandbox career file, edits Team[52].LongName "New York" -> "Old York"
// in the grid, saves via File > Save, and proves the edit reached the file on
// disk (parsed independently in the driver process) and the grid.
const fs = require("fs");

const TEAM = 7482;
const ROW = 52;

module.exports = async ({ electronApp, app, models, sandbox, poll, readSavedTable, shot, log }) => {
  const { welcome, tableEditor } = models;

  await welcome.openFranchiseFile(electronApp, sandbox.careerPath);
  log("opened", await welcome.getStartedTitle());
  await shot("welcome-file-open");

  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();
  await tableEditor.openTableById(TEAM);
  log("table header:", await tableEditor.getSelectedTableName());

  const headers = (await app.readTable(TEAM)).headers.map((h) => h.name);
  await tableEditor.grid.selectCell(ROW, "LongName", headers);
  const before = await tableEditor.grid.getTextAtSelectedCell();
  log("cell before:", before);
  if (before !== "New York") throw new Error(`expected New York, got ${before}`);
  await shot("before-edit");

  await tableEditor.grid.setTextAtSelectedCell("Old York");
  const after = await tableEditor.grid.getTextAtSelectedCell();
  log("cell after:", after);
  if (after !== "Old York") throw new Error(`grid shows ${after}`);
  await shot("after-edit");

  const mtime = fs.statSync(sandbox.careerPath).mtimeMs;
  await app.clickMenuItem("Save");
  await poll(() => fs.statSync(sandbox.careerPath).mtimeMs, (m) => m > mtime, {
    timeout: 30000, message: "Save did not write the file",
  });
  log("file mtime advanced after Save");

  const disk = await readSavedTable(sandbox.careerPath, TEAM, ["LongName"]);
  const onDisk = disk.records[ROW].LongName;
  log("on disk Team[52].LongName:", onDisk);
  if (onDisk !== "Old York") throw new Error(`disk has ${onDisk}`);
  await shot("after-save");
};
