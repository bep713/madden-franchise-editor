const path = require('path');
const fs = require('fs/promises');
const { expect } = require('chai');
const { test,  } = require('@playwright/test');

const electron = require('../util/Electron');
const FilePaths = require('../util/FilePaths');

const App = require('../models/App');
const WelcomePage = require('../models/WelcomePage');
const TableEditorPage = require('../models/TableEditorPage');
const ColumnJumpModal = require('../models/ColumnJumpModal');
const ReferenceEditorModal = require('../models/ReferenceEditorModal');

test.beforeAll(async () => {
  // Overwrite the test file so that we never change the pristine career file.
  // It will always start with the same state.
  const pristineCareer = await fs.readFile(FilePaths.m22.career.pristine);
  await fs.writeFile(FilePaths.m22.career.test, pristineCareer);
});

test('basic test', async () => {
  const electronApp = await electron.launchWithDefaultOptions();
  const app = new App(electronApp);
  
  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);

  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(FilePaths.m22.career.test);
  await welcome.openScheduleEditor();


  // table editor tab defaults to expected text
  const tableEditor = new TableEditorPage(window);
  let firstTabExists = await tableEditor.tabs.tabWithNameExists('Open Table...');
  expect(firstTabExists).to.be.true;

  
  // can click on default tab to load first table
  await tableEditor.tabs.openTabByName('Open Table...');
  await tableEditor._waitForTableToLoad();

  let tabName = await tableEditor.tabs.getActiveTabName();
  expect(tabName).to.equal('4097 - OverallPercentage');

  let numberOfTabs = await tableEditor.tabs.getNumberOfOpenTabs();
  expect(numberOfTabs).to.equal(4);

  firstTabExists = await tableEditor.tabs.tabWithNameExists('Open Table...');
  expect(firstTabExists).to.be.false;

  await app.closeFile();
  await welcome.openFranchiseFile(FilePaths.m22.career.test);


  // defaults to the first table and correctly populates tab name
  await welcome.openTableEditor();  
  await tableEditor._waitForTableToLoad();
  tabName = await tableEditor.tabs.getActiveTabName();
  expect(tabName).to.equal('4097 - OverallPercentage');


  // default table editor tab is removed
  firstTabExists = await tableEditor.tabs.tabWithNameExists('Open Table...');
  expect(firstTabExists).to.be.false;


  // starts with the expected number of tabs
  numberOfTabs = await tableEditor.tabs.getNumberOfOpenTabs();
  expect(numberOfTabs).to.equal(4);


  // tab name changes to match table name
  await tableEditor.openTableById(7482);
  tabName = await tableEditor.tabs.getActiveTabName();
  expect(tabName).to.equal('7482 - Team');


  // can open a new tab, will switch to new tab, and will load the table
  await tableEditor.tabs.openNewTab();
  await tableEditor._waitForTableToLoad();
  tabName = await tableEditor.tabs.getActiveTabName();
  expect(tabName).to.equal('4097 - OverallPercentage');

  numberOfTabs = await tableEditor.tabs.getNumberOfOpenTabs();
  expect(numberOfTabs).to.equal(5);


  // can close the active tab, will open the tab to the left
  await tableEditor.tabs.closeActiveTab();
  await tableEditor._waitForTableToLoad();
  tabName = await tableEditor.tabs.getActiveTabName();
  expect(tabName).to.equal('7482 - Team');

  numberOfTabs = await tableEditor.tabs.getNumberOfOpenTabs();
  expect(numberOfTabs).to.equal(4);

  await tableEditor.tabs.openNewTab();
  await tableEditor._waitForTableToLoad();
  await tableEditor.openTableById(4098);
  await tableEditor._waitForTableToLoad();

  await tableEditor.tabs.openNewTab();
  await tableEditor._waitForTableToLoad();

  numberOfTabs = await tableEditor.tabs.getNumberOfOpenTabs();
  expect(numberOfTabs).to.equal(6);


  // can switch between active tabs and remember table placement
  await tableEditor.selectCellAt(5, 1);

  await tableEditor.tabs.openTabByName('4098 - CutDayStartEvent');
  await tableEditor._waitForTableToLoad();
  tabName = await tableEditor.tabs.getActiveTabName();
  expect(tabName).to.equal('4098 - CutDayStartEvent');

  let tableName = await tableEditor.getSelectedTableName();
  expect(tableName).to.equal('4098 - CutDayStartEvent');

  await tableEditor.tabs.openTabByName('4097 - OverallPercentage');
  await tableEditor._waitForTableToLoad();
  tabName = await tableEditor.tabs.getActiveTabName();
  expect(tabName).to.equal('4097 - OverallPercentage');

  let cellText = await tableEditor.getTextAtSelectedCell();
  expect(cellText).to.equal('HB');  // cell 5,1 in OverallPercentage


  // can close a non-active tab. The active tab will not change.
  await tableEditor.tabs.closeTabByName('4098 - CutDayStartEvent');
  await tableEditor._waitForTableToLoad();

  numberOfTabs = await tableEditor.tabs.getNumberOfOpenTabs();
  expect(numberOfTabs).to.equal(5);

  tabName = await tableEditor.tabs.getActiveTabName();
  expect(tabName).to.equal('4097 - OverallPercentage');


  // each tab has its own history
  await tableEditor.tabs.openTabByName('7482 - Team');
  await tableEditor.clickBackButton();
  await tableEditor._waitForTableToLoad();

  tabName = await tableEditor.tabs.getActiveTabName();
  expect(tabName).to.equal('4097 - OverallPercentage');
  
  tableName = await tableEditor.getSelectedTableName();
  expect(tableName).to.equal('4097 - OverallPercentage');

  await tableEditor.openTableById(7482);


  // can click Home tab to go to Welcome page
  await tableEditor.tabs.openTabByName('Home');
  welcome.waitForPageLoad();


  // can open the table editor again and it will remember the last tab
  await welcome.openTableEditor();
  await tableEditor._waitForTableToLoad();
  tabName = await tableEditor.tabs.getActiveTabName();
  expect(tabName).to.equal('7482 - Team');

  tableName = await tableEditor.getSelectedTableName();
  expect(tableName).to.equal('7482 - Team');

  numberOfTabs = await tableEditor.tabs.getNumberOfOpenTabs();
  expect(numberOfTabs).to.equal(5);


  // can close all active table editor tabs
  await tableEditor.tabs.closeActiveTab();
  await tableEditor.tabs.closeTabByName('4097 - OverallPercentage');
  await tableEditor.tabs.openTabByName('Home');


  // can open the table editor again and it will default to first table
  await welcome.waitForPageLoad();
  await welcome.openTableEditor();
  await tableEditor._waitForTableToLoad();
  tabName = await tableEditor.tabs.getActiveTabName();
  expect(tabName).to.equal('4097 - OverallPercentage');

  tableName = await tableEditor.getSelectedTableName();
  expect(tableName).to.equal('4097 - OverallPercentage');

  numberOfTabs = await tableEditor.tabs.getNumberOfOpenTabs();
  expect(numberOfTabs).to.equal(4);


  await electronApp.close();
});

async function wait(ms) {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms)
  });
};
