// FranchiseFileManager's reference scan and empty-record chain, against the
// m22 career fixture. Nothing is saved, so the fixture isn't modified.
require("./helpers/electronStub");
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const manager = require("../../main/services/FranchiseFileManager");

const CAREER = path.join(__dirname, "..", "data", "m22", "career", "CAREER-M22TEST");
const OVERALL_PERCENTAGE = 4097;
const PLAYER = 4220;

let fileId;
test.before(async () => {
  ({ fileId } = await manager.openFile(CAREER));
});
test.after(() => manager.closeFile(fileId));

test("getReferencesToRecord returns one entry per referencing record", async () => {
  assert.deepEqual(
    await manager.getReferencesToRecord(fileId, OVERALL_PERCENTAGE, 5),
    [
      {
        tableId: 6259,
        name: "OverallPercentage[]",
        recordIndex: 0,
        fieldName: "OverallPercentage5",
        fieldIndex: 5,
      },
    ],
  );

  const playerRefs = await manager.getReferencesToRecord(fileId, PLAYER, 0);
  assert.equal(playerRefs.length, 8);
  for (const ref of playerRefs) {
    assert.ok(Number.isInteger(ref.recordIndex), JSON.stringify(ref));
    assert.equal(typeof ref.fieldName, "string");
    // fieldIndex is the field's column in readTableData's headers
    const { headers } = await manager.readTableData(fileId, ref.tableId);
    assert.equal(headers[ref.fieldIndex].name, ref.fieldName, JSON.stringify(ref));
  }

  assert.deepEqual(await manager.getReferencesToRecord(fileId, PLAYER, 3959), []);
});

test("setTableNextRecordToUse only accepts an empty record", async () => {
  await assert.rejects(
    manager.setTableNextRecordToUse(fileId, PLAYER, 0),
    /Record 0 is not empty/,
  );
  await assert.rejects(
    manager.setTableNextRecordToUse(fileId, PLAYER, 999999),
    /Record not found/,
  );

  const result = await manager.setTableNextRecordToUse(fileId, PLAYER, 375);
  assert.equal(result.nextRecordToUse, 375);
  assert.ok(result.emptyRecordIndices.includes(375));
  assert.ok(!result.emptyRecordIndices.includes(373));
  assert.ok(!result.emptyRecordIndices.includes(374));

  // records that left the chain are no longer empty
  const table = manager.activeFiles.get(fileId).file.getTableById(PLAYER);
  assert.equal(table.records[373].isEmpty, false);
  assert.equal(table.records[375].isEmpty, true);
});
