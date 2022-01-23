const fs = require('fs/promises');
const { expect } = require('chai');
const { test,  } = require('@playwright/test');

const electron = require('../util/Electron');
const FilePaths = require('../util/FilePaths');

const App = require('../models/App');
const WelcomePage = require('../models/WelcomePage');
const TableEditorPage = require('../models/TableEditorPage');

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
    await welcome.openFranchiseFile(FilePaths.m22.career.test);
    await welcome.openTableEditor();

    // can import a small table
    const tableEditor = new TableEditorPage(window);
    await tableEditor._waitForTableToLoad();
    await tableEditor.importTable(FilePaths.m22.imports.overallPercentage);

    // updates references
    await tableEditor.selectCellAt(0, 0);
    let text = await tableEditor.getTextAtSelectedCell();
    expect(text).to.equal('Spline - 1');

    // updates enums
    await tableEditor.selectCellAt(0, 1);
    text = await tableEditor.getTextAtSelectedCell();
    expect(text).to.equal('QB');

    // can import a large table
    await tableEditor.openTableById(7482);
    await tableEditor.importTable(FilePaths.m22.imports.team);
    
    // updates strings
    // await tableEditor.selectCellAt(5, 75);
    await tableEditor.jumpToColumn('LongName', 5)
    text = await tableEditor.getTextAtSelectedCell();
    expect(text).to.equal('TEST');

    // updates numbers
    // await tableEditor.selectCellAt(6, 141);
    await tableEditor.jumpToColumn('SalCapNextYearSalaryReserve', 6);
    text = await tableEditor.getTextAtSelectedCell();
    expect(text).to.equal('500');

    // updates booleans
    // await tableEditor.selectCellAt(43, 110);
    await tableEditor.jumpToColumn('TeamRegressionOccurred', 43);
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

    await electronApp.close();
});

async function wait(ms) {
    await new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, ms)
    });
};