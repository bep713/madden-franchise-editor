const xlsx = require('xlsx');
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

test('export table e2e test', async () => {
    const electronApp = await electron.launchWithDefaultOptions();
    const app = new App(electronApp);
    
    const window = await app.getMainWindow();

    const welcome = new WelcomePage(window);

    await welcome.waitForPageLoad();
    await welcome.openFranchiseFile(FilePaths.m22.career.test);
    await welcome.openTableEditor();

    // can export a table
    const tableEditor = new TableEditorPage(window);
    await tableEditor._waitForTableToLoad();
    await tableEditor.exportTable(FilePaths.m22.exports.test);

    xlsxCompare(FilePaths.m22.exports.test, FilePaths.m22.exports.overallPercentage);

    // can export a more complex table
    await tableEditor.openTableById(4220);
    await tableEditor.exportTable(FilePaths.m22.exports.test);

    xlsxCompare(FilePaths.m22.exports.test, FilePaths.m22.exports.player);

    await electronApp.close();
});

function xlsxCompare(fileToTest, fileToCompare) {
    const testWb = xlsx.readFile(fileToTest);
    const testData = getJsonDataFromWb(testWb);

    const compareWb = xlsx.readFile(fileToCompare);
    const compareData = getJsonDataFromWb(compareWb);

    expect(testData).to.eql(compareData);

    function getJsonDataFromWb(wb) {
        return xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
            'raw': false
        });
    };
};