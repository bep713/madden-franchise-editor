class Tab {
    constructor() {
        this.name = '';
        this.isActive = false;
        this.isClosable = false;
        this.customClassList = [];
        this.isAddTabButton = false;
        this.clickListenerFunction = '';
        this.isMainNavigationItem = false;
    }
};

module.exports = Tab;