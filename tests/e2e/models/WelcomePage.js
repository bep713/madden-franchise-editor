const util = require('../util/UiTestUtil');

class WelcomePage {
    constructor(window) {
        this.window = window;
        this.locators = {
            openFranchiseFileLink: this.window.locator('#open-file-input'),
            scheduleLink: this.window.locator('#open-schedule'),
            tableEditorLink: this.window.locator('#open-table-editor'),
            schemaViewerLink: this.window.locator('#open-schema-viewer'),
            abilityEditorLink: this.window.locator('#open-ability-editor'),
            mostRecentlyOpenedFile: this.window.locator('.load-recent-file > ul > li:first-child .file-item')
        }
    };

    async waitForPageLoad() {
        await this.window.waitForSelector('.link-item', {
            state: 'attached'
        });
    };

    async openFranchiseFile(path) {
        await util.enterFilePath(this.window, '#open-file-input', path);
    };

    async openTableEditor() {
        await this.locators.tableEditorLink.click();
    };

    async openScheduleEditor() {
        await this.locators.scheduleLink.click();
    };
};

module.exports = WelcomePage;