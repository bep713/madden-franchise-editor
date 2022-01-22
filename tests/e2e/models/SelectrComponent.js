const BaseComponent = require("./BaseComponent");

class SelectrComponent extends BaseComponent {
    constructor(window, selector) {
        super(window, selector);

        this.selectorLabel = this.window.locator(`${selector} .selectr-label`);
        this.selectorInput = this.window.locator(`${selector} .selectr-input`);
    };

    async click() {
        await this.baseLocator.click();
    };

    async selectOption(option) {
        await this.click();
        await this.selectorInput.type(`${option}`);
        await this.window.click(`.selectr-option:has-text("${option}")`);
    };

    async getSelectedOptionText() {
        return this.selectorLabel.innerText()
    };
};

module.exports = SelectrComponent;