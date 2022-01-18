const path = require('path');
const { expect } = require('chai');
const { test } = require('@playwright/test');
const { _electron: electron } = require('playwright');

const App = require('../models/App');
const WelcomePage = require('../models/WelcomePage');
const TableEditorPage = require('../models/TableEditorPage');

test('basic test', async () => {
  const electronApp = await electron.launch({ args: ['.'] });
  const app = new App(electronApp);
  
  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);

  await welcome.waitForPageLoad();

  // can open the table editor
  await welcome.openNewFranchiseFile(path.join(__dirname, '../../data/m22/CAREER-M22TEST'));
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

  await electronApp.close();
});

async function wait(ms) {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms)
  });
};
