class BaseComponent {
    constructor(window, baseSelector) {
        this.window = window;
        this.baseSelector = baseSelector;
        this.baseLocator = this.window.locator(baseSelector);
    };
};

module.exports = BaseComponent;