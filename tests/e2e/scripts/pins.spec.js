const path = require('path');
const fs = require('fs/promises');
const { expect } = require('chai');
const { test,  } = require('@playwright/test');

const electron = require('../util/Electron');
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

test('pins e2e test', async () => {
    const electronApp = await electron.launchWithDefaultOptions();
    const app = new App(electronApp);
    
    const window = await app.getMainWindow();

    const welcome = new WelcomePage(window);

    await welcome.waitForPageLoad();

    // can open the table editor
    await welcome.openFranchiseFile(M22_TEST_FILEPATH);
    await welcome.openTableEditor();

    const tableEditor = new TableEditorPage(window);

    // pins are displayed correctly
    const pins = await tableEditor.getAllPins();
    expect(pins.length).to.equal(5);
    expect(pins[0]).to.equal('(4220) Player');

    // can add a pin
    await tableEditor.addSelectedTableAsPin();
    const newPins = await tableEditor.getAllPins();
    expect(newPins.length).to.equal(6);

    // can click on a pin to load the table
    await tableEditor.clickPinByTableId(4220);
    const tableName = await tableEditor.getSelectedTableName();
    expect(tableName).to.equal('124 - (4220) Player');

    // can remove a pin
    await tableEditor.removePinByTableId(4097);
    const evenNewerPins = await tableEditor.getAllPins();
    expect(evenNewerPins.length).to.equal(5);
});