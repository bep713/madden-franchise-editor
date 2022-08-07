const Tab = require('./Tab');

class TableEditorTab extends Tab {
    constructor() {
        super();
        
        this.tableId = -1;
        this.tableRow = 0;
        
        this.isClosable = true;
        this.isMiniTab = false;
        this.isAddTabButton = false;
    }
};

module.exports = TableEditorTab;