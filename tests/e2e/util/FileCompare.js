// Copied from scripts/export.spec.js, which keeps its own copies.
const xlsx = require("xlsx");
const crypto = require("crypto");
const fs = require("fs/promises");
const { expect } = require("chai");

const TestUtil = require("./TestUtil");

// Exports are written by the main process after the click resolves.
async function waitForFile(filePath, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if ((await fs.stat(filePath)).size > 0) {
        // give the writer a moment to finish
        await TestUtil.wait(250);
        return;
      }
    } catch (e) {
      /* not written yet */
    }
    await TestUtil.wait(100);
  }
  throw new Error(`Timed out waiting for ${filePath} to be written`);
}

function xlsxCompare(fileToTest, fileToCompare) {
  const testWb = xlsx.readFile(fileToTest);
  const testData = getJsonDataFromWb(testWb);

  const compareWb = xlsx.readFile(fileToCompare);
  const compareData = getJsonDataFromWb(compareWb);

  expect(testData).to.eql(compareData);

  function getJsonDataFromWb(wb) {
    return xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      raw: false,
    });
  }
}

async function fileCompare(fileToTest, fileToCompare) {
  const testFile = await fs.readFile(fileToTest);
  let testHash = crypto.createHash("sha1");
  testHash.update(testFile);

  const compareFile = await fs.readFile(fileToCompare);
  let compareHash = crypto.createHash("sha1");
  compareHash.update(compareFile);

  expect(testHash.digest("hex")).to.eql(compareHash.digest("hex"));
}

module.exports = { waitForFile, xlsxCompare, fileCompare };
