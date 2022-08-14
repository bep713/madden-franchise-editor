const BaseComponent = require("./BaseComponent");

class TabComponent extends BaseComponent {
    constructor(window, baseSelector) {
        super(window, baseSelector);

        this.locators = {
            add: this.baseLocator.locator('.add-tab-button')
        };
    };

    async openNewTab() {
        await this.locators.add.click();
    };

    async closeTabByName(name) {
        const tab = await this.baseLocator.locator(`.tab[data-name="${name}"]`); 
        await tab.hover();
        await tab.locator(`.close-tab-button`).click();
    };

    async openTabByName(name) {
        await this.baseLocator.locator(`.tab[data-name="${name}"]`).click();
    };

    async getActiveTabName() {
        return (await this.baseLocator.locator('.tab.active').innerText());
    };

    async closeActiveTab() {
        await this.baseLocator.locator('.tab.active .close-tab-button').click();
    };

    async getNumberOfOpenTabs() {
        return (await this.baseLocator.locator('.tab').count()) - 1;    // Decrease 1 to remove the add tab button
    };

    async tabWithNameExists(name) {
        return (await this.baseLocator.locator(`.tab[data-name="${name}"]`).count()) > 0;
    };
};

module.exports = TabComponent;