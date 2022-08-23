const fs = require('fs/promises');
const { expect } = require('chai');
const { test,  } = require('@playwright/test');

const electron = require('../util/Electron');
const FilePaths = require('../util/FilePaths');

const App = require('../models/App');
const WelcomePage = require('../models/WelcomePage');
const TableEditorPage = require('../models/TableEditorPage');
const SettingsManager = require('../models/SettingsManager');

test.beforeAll(async () => {
    // Overwrite the test file so that we never change the pristine career file.
    // It will always start with the same state.
    const pristineCareer = await fs.readFile(FilePaths.m22.career.pristine);
    await fs.writeFile(FilePaths.m22.career.test, pristineCareer);
});

test('import table e2e test', async () => {
    const electronApp = await electron.launchWithDefaultOptions();
    const app = new App(electronApp);
    
    const window = await app.getMainWindow();

    const welcome = new WelcomePage(window);

    await welcome.waitForPageLoad();
    await toggleAutoSave(false);
    await welcome.openFranchiseFile(FilePaths.m22.career.test);
    await welcome.openTableEditor();

    // can import a small table
    const tableEditor = new TableEditorPage(window);
    await tableEditor._waitForTableToLoad();
    await tableEditor.importTable(FilePaths.m22.imports.overallPercentage);

    // can import a large table
    await tableEditor.openTableById(7482);
    await tableEditor.importTable(FilePaths.m22.imports.team);

    // can import a table without every column
    await tableEditor.openTableById(4104);
    await tableEditor.importTable(FilePaths.m22.imports.stadium);

    // fields change on import
    await checkImportedFields();

    // fields persist after saving
    await app.saveFile();
    await app.closeFile();
    await welcome.waitForPageLoad();
    await welcome.openFranchiseFile(FilePaths.m22.career.test);
    await welcome.openTableEditor();
    await checkImportedFields();

    // changes persist on auto-save
    await toggleAutoSave(true);
    await tableEditor.openTableById(4712);
    await tableEditor.importTable(FilePaths.m22.imports.franchise);
    await tableEditor.jumpToColumn('HasFantasyRoster', 0);
    let text = await tableEditor.getTextAtSelectedCell();
    expect(text).to.equal('true');
    await wait(250);

    await app.closeFile();
    await welcome.waitForPageLoad();
    await welcome.openFranchiseFile(FilePaths.m22.career.test);
    await welcome.openTableEditor();
    await tableEditor.openTableById(4712);
    await tableEditor.jumpToColumn('HasFantasyRoster', 0);
    text = await tableEditor.getTextAtSelectedCell();
    expect(text).to.equal('true');

    // can import a raw table
    await tableEditor.openTableById(4097);
    await tableEditor.importRawTable(FilePaths.m22.imports.rawTable.overallPercentage);

    await tableEditor.selectCellAt(0, 0);
    text = await tableEditor.getTextAtSelectedCell();
    expect(text).to.equal('Spline - 10');

    await tableEditor.selectCellAt(0, 1);
    text = await tableEditor.getTextAtSelectedCell();
    expect(text).to.equal('FS');

    await tableEditor.selectCellAt(1, 0);
    text = await tableEditor.getTextAtSelectedCell();
    expect(text).to.equal('Spline - 11');

    await toggleAutoSave(false);

    await electronApp.close();

    async function checkImportedFields() {
        // updates references
        await tableEditor.openTableById(4097);
        await tableEditor.selectCellAt(0, 0);
        let text = await tableEditor.getTextAtSelectedCell();
        expect(text).to.equal('Spline - 1');

        // updates enums
        await tableEditor.selectCellAt(0, 1);
        text = await tableEditor.getTextAtSelectedCell();
        expect(text).to.equal('QB');
        
        // updates strings
        await tableEditor.openTableById(7482);
        await tableEditor.jumpToColumn('LongName', 5)
        text = await tableEditor.getTextAtSelectedCell();
        expect(text).to.equal('TEST');

        // updates numbers
        await tableEditor.jumpToColumn('SalCapNextYearSalaryReserve', 6);
        text = await tableEditor.getTextAtSelectedCell();
        expect(text).to.equal('500');

        // updates booleans
        await tableEditor.jumpToColumn('TeamRegressionOccurred', 43);
        text = await tableEditor.getTextAtSelectedCell();
        expect(text).to.equal('true');

        // updates table which imported single column correctly
        await tableEditor.openTableById(4104);
        await tableEditor.jumpToColumn('Name', 8);
        text = await tableEditor.getTextAtSelectedCell();
        expect(text).to.equal('Test Stadium Name');

        await tableEditor.jumpToColumn('STADIUM_AIRPORTCODE', 0);
        text = await tableEditor.getTextAtSelectedCell();
        expect(text).to.equal('LAS');
    };

    async function toggleAutoSave(val) {
        await app._clickMenuItem('ViewReleaseNotes');

        const settingsManagerWindow = await app.getSettingsManager();
        const settingsManager = new SettingsManager(settingsManagerWindow);
        
        await settingsManager.clickContinue();
        await settingsManager.setAutoSaveSetting(val);
        await settingsManager.clickContinue();
        await settingsManager.clickContinue();
    };
});

async function wait(ms) {
    await new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, ms)
    });
};