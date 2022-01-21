const path = require('path');
const fs = require('fs/promises');
const { expect } = require('chai');
const { test,  } = require('@playwright/test');
const { _electron: electron } = require('playwright');

const App = require('../models/App');
const WelcomePage = require('../models/WelcomePage');
const TableEditorPage = require('../models/TableEditorPage');
const ReferenceEditorModal = require('../models/ReferenceEditorModal');

// const M22_TEST_FILEPATH = path.join(__dirname, '../../data/m22/CAREER-E2ETEST');
const M22_TEST_FILEPATH = path.join('C://Users//Matt//Documents//CAREER-E2ETEST');
const M22_PRISTINE_CAREER_FILEPATH = path.join(__dirname, '../../data/m22/CAREER-M22TEST');

test.beforeAll(async () => {
  // Overwrite the test file so that we never change the pristine career file.
  // It will always start with the same state.
  const pristineCareer = await fs.readFile(M22_PRISTINE_CAREER_FILEPATH);
  await fs.writeFile(M22_TEST_FILEPATH, pristineCareer);
});

test('basic test', async () => {
  const electronApp = await electron.launch({ args: ['.'] });
  const app = new App(electronApp);
  
  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);

  await welcome.waitForPageLoad();

  // can open the table editor
  await welcome.openFranchiseFile(M22_TEST_FILEPATH);
  await welcome.openTableEditor();

  const tableEditor = new TableEditorPage(window);

  // table editor displays correct data
  const firstCell = await tableEditor.getTextAtSelectedCell();
  expect(firstCell).to.equal('Spline - 0');
  
  // can open a different table
  await tableEditor.openTableById(7482);

  // other table data displays properly  
  await tableEditor.selectCellAt(52, 75);
  const ny = await tableEditor.getTextAtSelectedCell();
  expect(ny).to.equal('New York');

  // can edit a field
  await tableEditor.setTextAtSelectedCell('Old York');

  // edit sticks
  const oy = await tableEditor.getTextAtSelectedCell();
  expect(oy).to.equal('Old York');

  // can save the file
  await app.saveFile();

  // can close the file
  await app.closeFile();

  // can re-open it
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(M22_TEST_FILEPATH);
  await welcome.openTableEditor();

  // ensure our changes stuck
  await tableEditor.openTableById(7482);
  await tableEditor.selectCellAt(52, 75);
  const oy2 = await tableEditor.getTextAtSelectedCell();
  expect(oy2).to.equal('Old York');

  // can follow references
  await tableEditor.selectCellAt(43, 1);
  const stadiumReference = await tableEditor.getTextAtSelectedCell();
  expect(stadiumReference).to.equal('Stadium - 12');

  await tableEditor.followSelectedCellReference();
  const table = await tableEditor.getSelectedTableName();
  expect(table).to.equal('8 - (4104) Stadium');

  // can edit references
  await tableEditor.selectCellAt(18, 0);
  await tableEditor.openEditReferenceModalAtSelectedCell();

  const referenceEditor = new ReferenceEditorModal(window);
  
  const selectedTable = await referenceEditor.getSelectedTable();
  expect(selectedTable).to.equal('45 - (4141) StadiumPartInfo');

  const selectedRowIndex = await referenceEditor.getRowIndex();
  expect(selectedRowIndex).to.equal('18');

  const selectedBinary = await referenceEditor.getBinary();
  expect(selectedBinary).to.equal('00100000010110100000000000010010');

  await referenceEditor.setTableReferenceById(4146);
  await referenceEditor.setRowIndex(25);

  // updates binary
  const newBinary = await referenceEditor.getBinary();
  expect(newBinary).to.equal('00100000011001000000000000011001');

  await referenceEditor.close();

  await electronApp.close();
});

async function wait(ms) {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms)
  });
};
