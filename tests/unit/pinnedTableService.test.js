// pinnedTableService keys pins by the table's uniqueId and falls back to
// tableId. Legacy pins.json files (tableId + tableName only) must keep working
// and get a uniqueId filled in the first time a matching file is opened.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const SERVICE = path.resolve(
  __dirname,
  "../../renderer/js/services/pinnedTableService.js",
);

let stored;
let writes;

function loadService(initialPins) {
  stored = initialPins === undefined ? null : structuredClone(initialPins);
  writes = 0;
  global.window = {
    electronAPI: {
      fs: {
        readJson: async () => structuredClone(stored),
        writeJson: async (filename, data) => {
          writes++;
          stored = structuredClone(data);
        },
      },
    },
  };
  delete require.cache[SERVICE];
  return require(SERVICE);
}

test.afterEach(() => {
  delete global.window;
});

const tableList = [
  { id: 10, uniqueId: 111, name: "Player" },
  { id: 20, uniqueId: 222, name: "Team" },
  { id: 30, uniqueId: 0, name: "Thing[]" },
  { id: 40, uniqueId: 444, name: "Dup" },
  { id: 41, uniqueId: 445, name: "Dup" },
];

const pinsFile = (pins) => [{ gameYear: 25, gameType: "madden", pins }];

test("legacy pin with a matching id and name gets a uniqueId", async () => {
  const service = loadService(pinsFile([{ tableId: 10, tableName: "Player" }]));
  await service.initialize(25, tableList);

  assert.deepEqual(stored[0].pins, [
    { tableId: 10, tableName: "Player", uniqueId: 111 },
  ]);
});

test("legacy pin with a stale id migrates by a unique name", async () => {
  const service = loadService(pinsFile([{ tableId: 99, tableName: "Team" }]));
  await service.initialize(25, tableList);

  assert.deepEqual(stored[0].pins, [
    { tableId: 20, tableName: "Team", uniqueId: 222 },
  ]);
});

test("legacy pin whose id points at a differently named table is not trusted", async () => {
  // id 20 is Team now, but there are two "Dup" tables, so nothing is safe to pick
  const service = loadService(pinsFile([{ tableId: 20, tableName: "Dup" }]));
  await service.initialize(25, tableList);

  assert.deepEqual(stored[0].pins, [{ tableId: 20, tableName: "Dup" }]);
  assert.equal(writes, 0);
  assert.equal(service.resolvePin(service.applicablePins[0]).name, "Team");
});

test("pin on a table with uniqueId 0 stays keyed by tableId", async () => {
  const service = loadService(pinsFile([{ tableId: 30, tableName: "Thing[]" }]));
  await service.initialize(25, tableList);

  const [pin] = service.applicablePins;
  assert.equal(pin.uniqueId, undefined);
  assert.equal(service.resolvePin(pin).id, 30);
  assert.ok(service.findPin({ tableId: 30, uniqueId: 0 }));
});

test("uniqueId pin resolves after the tableId shifts and refreshes the hint", async () => {
  const service = loadService(
    pinsFile([{ uniqueId: 111, tableId: 9999, tableName: "Player" }]),
  );
  await service.initialize(25, tableList);

  assert.equal(service.resolvePin(service.applicablePins[0]).id, 10);
  assert.equal(stored[0].pins[0].tableId, 10);
});

test("uniqueId pin missing from the file does not fall back to tableId", async () => {
  const service = loadService(
    pinsFile([{ uniqueId: 777, tableId: 10, tableName: "Gone" }]),
  );
  await service.initialize(25, tableList);

  assert.equal(service.resolvePin(service.applicablePins[0]), null);
  assert.equal(service.findPin({ tableId: 10, uniqueId: 111 }), undefined);
  assert.equal(writes, 0);
});

test("findPin and removePin key on uniqueId", async () => {
  const service = loadService(
    pinsFile([
      { uniqueId: 111, tableId: 10, tableName: "Player" },
      { uniqueId: 222, tableId: 20, tableName: "Team" },
    ]),
  );
  await service.initialize(25, tableList);

  // same tableId, different table: not pinned
  assert.equal(service.findPin({ tableId: 10, uniqueId: 555 }), undefined);

  const pin = service.findPin({ tableId: 12345, uniqueId: 222 });
  assert.equal(pin.tableName, "Team");

  service.removePin(pin);
  assert.deepEqual(
    service.applicablePins.map((p) => p.uniqueId),
    [111],
  );
});

test("addPin leaves out a missing uniqueId", async () => {
  const service = loadService(pinsFile([]));
  await service.initialize(25, tableList);

  service.addPin({ uniqueId: 0, tableId: 30, tableName: "Thing[]" });
  service.addPin({ uniqueId: 222, tableId: 20, tableName: "Team" });

  assert.deepEqual(service.applicablePins, [
    { tableId: 30, tableName: "Thing[]" },
    { tableId: 20, tableName: "Team", uniqueId: 222 },
  ]);
});

test("pins for a game year without defaults are saved", async () => {
  const service = loadService(); // no pins.json yet
  await service.initialize(25, tableList);

  service.addPin({ uniqueId: 222, tableId: 20, tableName: "Team" });
  await Promise.resolve();

  assert.deepEqual(stored.find((p) => p.gameYear === 25).pins, [
    { tableId: 20, tableName: "Team", uniqueId: 222 },
  ]);
});

test("default seed pins are migrated on the first run", async () => {
  const service = loadService(); // no pins.json yet
  await service.initialize(22, [
    { id: 4220, uniqueId: 1612938518, name: "Player" },
    { id: 7000, uniqueId: 42, name: "Team" },
  ]);

  const pins = stored.find((p) => p.gameYear === 22).pins;
  assert.deepEqual(pins.slice(0, 2), [
    { tableId: 4220, tableName: "Player", uniqueId: 1612938518 },
    { tableId: 7000, tableName: "Team", uniqueId: 42 },
  ]);
  // Franchise/League aren't in this table list, so they stay as they were
  assert.equal(pins[2].uniqueId, undefined);
});


test("untyped entries up to 27 become Madden; a college 27 file gets its own", async () => {
  const pin = { uniqueId: 111, tableId: 10, tableName: "Player" };
  const service = loadService([
    { gameYear: 22, pins: [] },
    { gameYear: 27, pins: [pin] },
  ]);
  await service.initialize(27, tableList, "college");

  assert.deepEqual(service.applicablePins, []);
  assert.deepEqual(stored, [
    { gameYear: 22, gameType: "madden", pins: [] },
    { gameYear: 27, gameType: "madden", pins: [pin] },
    { gameYear: 27, gameType: "college", pins: [] },
  ]);
});

test("Madden and college pins for the same year stay separate", async () => {
  const service = loadService([
    { gameYear: 27, gameType: "madden", pins: [] },
    { gameYear: 27, gameType: "college", pins: [] },
  ]);
  await service.initialize(27, tableList, "college");
  service.addPin({ uniqueId: 222, tableId: 20, tableName: "Team" });

  assert.deepEqual(stored[0].pins, []);
  assert.equal(stored[1].pins[0].uniqueId, 222);
  assert.ok(service.findPin({ tableId: 20, uniqueId: 222 }));
});

test("an untyped entry after 27 takes the type of the first file opened", async () => {
  const pin = { uniqueId: 111, tableId: 10, tableName: "Player" };
  const service = loadService([
    { gameYear: 28, pins: [pin] },
    { gameYear: 29, pins: [] },
  ]);
  await service.initialize(28, tableList, "college");

  assert.deepEqual(service.applicablePins, [pin]);
  assert.deepEqual(stored, [
    { gameYear: 28, gameType: "college", pins: [pin] },
    { gameYear: 29, pins: [] },
  ]);
});

test("a missing gameType is treated as Madden", async () => {
  const service = loadService(); // no pins.json yet
  await service.initialize(21, [], undefined);

  assert.equal(service.applicablePins.length, 4);
  assert.ok(stored.every((pinMeta) => pinMeta.gameType === "madden"));
});
