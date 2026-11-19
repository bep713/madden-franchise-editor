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

    // Typing key by key loses keys when the grid takes focus back on a busy
    // window, so set the search value and fire the keyup Selectr searches on.
    // A click on an open dropdown closes it, so open it only if needed, and
    // try again if it closed before the option could be clicked.
    async selectOption(option) {
        const optionLocator = this.window.locator(`.selectr-option:has-text("${option}")`);
        for (let attempt = 1; ; attempt++) {
            try {
                const isOpen = await this.baseLocator.evaluate((el) => el.classList.contains('open'));
                if (!isOpen) {
                    await this.click();
                }
                await this.selectorInput.waitFor({ state: 'visible', timeout: 2000 });
                await this.selectorInput.evaluate((input, value) => {
                    input.value = value;
                    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                }, `${option}`);
                // first(), like page.click: a search for "Name" also lists "STADIUM_ASSETNAME"
                await optionLocator.first().click({ timeout: 2000 });
                return;
            } catch (err) {
                if (attempt === 3) throw err;
            }
        }
    };

    async getSelectedOptionText() {
        return this.selectorLabel.innerText()
    };
};

module.exports = SelectrComponent;