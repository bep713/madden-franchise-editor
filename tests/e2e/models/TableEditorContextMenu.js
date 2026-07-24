const BaseComponent = require("./BaseComponent");

class TableEditorContextMenu extends BaseComponent {
  constructor(window, baseSelector) {
    super(window, baseSelector);

    this.locators = {
      findRefs: this.baseLocator.locator(
        '.htItemWrapper:has-text("Find references to this record...")',
      ),
      openRefInNewTab: this.baseLocator.locator(
        '.htItemWrapper:has-text("Open this reference in a new tab")',
      ),
      setEmpty: this.baseLocator.locator(
        '.htItemWrapper:has-text("Set selected record(s) as empty")',
      ),
      advanced: this.baseLocator.locator(
        '.htItemWrapper:has-text("Advanced...")',
      ),
      setNextEmptyRecord: this.baseLocator.locator(
        '.htItemWrapper:has-text("Set as next empty record to use")',
      ),
    };
  }

  async clickFindReferencesToRecord() {
    await this.locators.findRefs.click();
  }

  async clickOpenReferenceInNewTab() {
    await this.locators.openRefInNewTab.click();
  }

  async clickSetEmpty() {
    await this.locators.setEmpty.click();
  }

  async clickSetNextEmptyRecord() {
    await this.locators.advanced.hover();
    await this.locators.setNextEmptyRecord.click();
  }
}

module.exports = TableEditorContextMenu;
