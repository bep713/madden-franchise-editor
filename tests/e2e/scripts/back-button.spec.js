const path = require('path');
const fs = require('fs/promises');
const { expect } = require('chai');
const { test,  } = require('@playwright/test');

const electron = require('../util/Electron');
const FilePaths = require('../util/FilePaths');

const App = require('../models/App');
const WelcomePage = require('../models/WelcomePage');
const TableEditorPage = require('../models/TableEditorPage');
const ReferenceEditorModal = require('../models/ReferenceEditorModal');

test.beforeAll(async () => {
  // Overwrite the test file so that we never change the pristine career file.
  // It will always start with the same state.
  const pristineCareer = await fs.readFile(FilePaths.m22.career.pristine);
  await fs.writeFile(FilePaths.m22.career.test, pristineCareer);
});

test('back button e2e test', async () => {
    const electronApp = await electron.launchWithDefaultOptions();
    const app = new App(electronApp);
    
    const window = await app.getMainWindow();

    const welcome = new WelcomePage(window);

    await welcome.waitForPageLoad();

    // can open the table editor
    await welcome.openFranchiseFile(FilePaths.m22.career.test);
    await welcome.openTableEditor();

    const tableEditor = new TableEditorPage(window);

    // Can go back one table
    await tableEditor.openTableById(7482);
    await tableEditor.clickBackButton();

    let tableName = await tableEditor.getSelectedTableName();
    expect(tableName).to.equal('4097 - OverallPercentage');
   
    // can go back after clicking on a reference
    await tableEditor.followSelectedCellReference();
    await tableEditor.clickBackButton();
    tableName = await tableEditor.getSelectedTableName();
    expect(tableName).to.equal('4097 - OverallPercentage');

    // can go back to the specific cell that you were on
    await tableEditor.selectCellAt(5, 0);
    await tableEditor.followSelectedCellReference();
    await tableEditor.clickBackButton();
    let cellText = await tableEditor.getTextAtSelectedCell();
    expect(cellText).to.equal('Spline - 5');

    // can go back multiple tables and cells
    await tableEditor.followSelectedCellReference();
    await tableEditor.selectCellAt(5, 1);
    await tableEditor.followSelectedCellReference();
    await tableEditor.clickBackButton();
    tableName = await tableEditor.getSelectedTableName();
    expect(tableName).to.equal('7022 - Spline');
    cellText = await tableEditor.getTextAtSelectedCell();
    expect(cellText).to.equal('int[] - 10');

    await tableEditor.clickBackButton();
    tableName = await tableEditor.getSelectedTableName();
    expect(tableName).to.equal('4097 - OverallPercentage');
    cellText = await tableEditor.getTextAtSelectedCell();
    expect(cellText).to.equal('Spline - 5');
});

async function wait(ms) {
    await new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, ms)
    });
  };
  