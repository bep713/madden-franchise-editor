const BaseComponent = require("./BaseComponent");

class PinComponent extends BaseComponent {
    constructor(window, baseSelector) {
        super(window, baseSelector);

        this.locators = {
            add: this.baseLocator.locator('.add-new-pin'),
            delete: this.baseLocator.locator('.delete-pin:visible')
        };
    };

    async addPin() {
        await this.locators.add.click();
    };

    async removePinByTableId(tableId) {
        await this.baseLocator.locator(`.pin[tableid="${tableId}"]`).hover();
        await this.locators.delete.click();
    };

    async getAllPins() {
        return await this.baseLocator.locator('.pin').allTextContents();
    };

    async clickPinByTableId(tableId) {
        await this.baseLocator.locator(`.pin[tableid="${tableId}"]`).click();
    };
};

module.exports = PinComponent;