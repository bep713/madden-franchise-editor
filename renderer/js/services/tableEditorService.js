const Selectr = require('mobius1-selectr');
const Handsontable = require('handsontable').default;
const utilService = require('./utilService');

let tableEditorService = {};
tableEditorService.file = null;
tableEditorService.hot = null;
tableEditorService.tableSelector = null;
tableEditorService.selectedTable = null;
tableEditorService.showHeaderTypes = false;
tableEditorService.navSteps = [];
tableEditorService.rowIndexToSelect = 0;
tableEditorService.columnIndexToSelect = 0;
tableEditorService.initialTableSelect = null;

let loader;

const windowResizeListener = () => {
  tableEditorService.hot.updateSettings({
    width: document.querySelector('.table-wrapper').offsetWidth
  });
};

tableEditorService.start = function (file) {
  initializeTable();
  addEventListeners();

  if (file.isLoaded) {
    runStartTasks();
  } else {
    file.on('tables-done', function () {
      runStartTasks();
    });
  }

  function runStartTasks() {
    tableEditorService.file = file;
    file.settings = {
      'saveOnChange': true
    };

    tableEditorService.loadTable();
  }
};

tableEditorService.onClose = function () {
  tableEditorService.navSteps = [];
  tableEditorService.rowIndexToSelect = 0;
  tableEditorService.columnIndexToSelect = 0;
  tableEditorService.selectedTable = null;
  tableEditorService.hot.destroy();
  tableEditorService.hot = null;
  tableEditorService.file.settings = {
    'saveOnChange': false
  };
  tableEditorService.file = null;
  tableEditorService.initialTableSelect = null;

  window.removeEventListener('resize', windowResizeListener);
};

// tableEditorService.onFileReady = function (file) {
//   tableEditorService.file = file;
//   tableEditorService.loadTable();
// };

tableEditorService.loadTable = function () {
  // const filteredChoices = tableEditorService.file.tables.filter((table) => { return table.schema; });
  const tableChoices = tableEditorService.file.tables.map((table, index) => {
    return {
      'value': table.header.tableId,
      'text': `${index} - ${table.name}`
    };
  });

  // const initialTableToLoad = '1 - OverallPercentage';

  // tableChoices.find((choice) => {
  //   return choice.text === initialTableToLoad;
  // }).selected = true;

  const tableSelector = document.querySelector('.table-selector');
  tableEditorService.tableSelector = new Selectr(tableSelector, {
    data: tableChoices
  });

  const backLink = document.querySelector('.back-link');

  tableEditorService.tableSelector.on('selectr.change', function (option) {
    utilService.show(loader);

    setTimeout(() => {
      const tableId = parseInt(tableEditorService.tableSelector.getValue(true).value);
      const table = tableEditorService.file.getTableById(tableId);

      table.readRecords().then((table) => {
        loadTable(table);
        tableEditorService.hot.selectCell(tableEditorService.rowIndexToSelect, tableEditorService.columnIndexToSelect);

        tableEditorService.rowIndexToSelect = 0;
        tableEditorService.columnIndexToSelect = 0;
      }).catch((err) => {
        console.log(err);
        loadTable(table);
      });
      
      tableEditorService.selectedTable = table;

      tableEditorService.navSteps.push({
        'tableId': tableId,
        'recordIndex': 0,
        'column': 0
      });

      if (tableEditorService.navSteps.length >= 1) {
        backLink.classList.remove('disabled');
      }

      console.log(table);
    }, 100);
  });
  
  if (tableEditorService.initialTableToSelect) {
    tableEditorService.rowIndexToSelect = tableEditorService.initialTableToSelect.recordIndex;
    tableEditorService.columnIndexToSelect = 0;

    tableChoices[tableEditorService.initialTableToSelect.tableId].selected = true;
    const table = tableEditorService.file.getTableByIndex(tableEditorService.initialTableToSelect.tableId);
    table.readRecords().then(loadTable);
    console.log(table);

    tableEditorService.navSteps.push({
      'tableId': tableEditorService.initialTableToSelect.tableId,
      'recordIndex': tableEditorService.initialTableToSelect.recordIndex,
      'column': 0
    });
  } else {
    tableChoices[1].selected = true;

    const seasonGame = tableEditorService.file.getAllTablesByName(tableChoices[1].text.substring(tableChoices[1].text.indexOf(' ') + 3));
    tableEditorService.selectedTable = seasonGame[seasonGame.length - 1];
    seasonGame[seasonGame.length - 1].readRecords().then(loadTable);
    console.log(seasonGame[seasonGame.length - 1]);

    tableEditorService.navSteps.push({
      'tableId': tableEditorService.selectedTable.header.tableId,
      'recordIndex': 0,
      'column': 0
    });
  }
};

module.exports = tableEditorService;

function initializeTable() {
  const container3 = document.querySelector('.table-content-wrapper');
  tableEditorService.hot = new Handsontable(container3, {
    rowHeaders: true,
    currentRowClassName: 'active-row',
    manualColumnResize: true,
    manualRowResize: true,
    afterChange: processChanges,
    rowHeaders: function (index) {
      return index;
    }
  });
};

function processChanges(changes) {
  if (changes) {
    changes.forEach((change) => {
      const recordIndex = change[0];
      const key = change[1];
      const newValue = change[3];

      tableEditorService.selectedTable.records[recordIndex].getFieldByKey(key).value = newValue;
    });
  }
};

function addEventListeners() {
  const jumpToColumnModal = document.querySelector('.jump-to-column-modal');
  const underlay = document.querySelector('.underlay');
  const jumpRow = document.querySelector('.jump-row');
  loader = document.querySelector('.loader-wrapper');

  window.addEventListener('resize', windowResizeListener)

  const toggleTypesButton = document.querySelector('.toggle-types');
  toggleTypesButton.addEventListener('click', function () {
    tableEditorService.showHeaderTypes = !tableEditorService.showHeaderTypes;
    const headers = formatHeaders(tableEditorService.selectedTable);

    tableEditorService.hot.updateSettings({
      colHeaders: headers
    });
  });

  const columnSelect = document.querySelector('#available-columns');
  let columnSelectr = new Selectr(columnSelect, {
    data: null
  });;

  const closeModalButton = document.querySelector('.close-modal');
  closeModalButton.addEventListener('click', function () {
    jumpToColumnModal.classList.add('hidden');
    underlay.classList.add('hidden');
  });

  const jumpToColumnButton = document.querySelector('.jump-to-column');
  jumpToColumnButton.addEventListener('click', function () {
    const headers = formatHeaders(tableEditorService.selectedTable);
    const options = headers.map((header) => {
      return {
        'value': header,
        'text': header
      };
    });

    columnSelectr.removeAll();
    columnSelectr.add(options);

    setTimeout(() => {
      columnSelect.focus();
    }, 200);

    jumpToColumnModal.classList.remove('hidden');
    underlay.classList.remove('hidden');
  });

  const goJumpToColumnButton = document.querySelector('.btn-go-jump-to-column');
  goJumpToColumnButton.addEventListener('click', function () {
    const value = columnSelectr.getValue();
    const index = columnSelectr.data.findIndex((opt) => { return opt.value === value; });

    jumpToColumnModal.classList.add('hidden');
    underlay.classList.add('hidden');

    let row = parseInt(jumpRow.value);

    if (!row || row < 0) {
      row = 0;
    }

    tableEditorService.navSteps.push({
      'tableId': tableEditorService.selectedTable.header.tableId,
      'recordIndex': row,
      'column': index
    });

    tableEditorService.hot.selectCell(row, index);
  }); 

  const backLink = document.querySelector('.back-link');
  backLink.addEventListener('click', function () {

    if (tableEditorService.navSteps.length >= 2) {
      tableEditorService.navSteps.pop();

      const navStep = tableEditorService.navSteps[tableEditorService.navSteps.length - 1];
      const table = tableEditorService.file.getTableById(navStep.tableId);

      tableEditorService.rowIndexToSelect = navStep.recordIndex;
      tableEditorService.columnIndexToSelect = navStep.column;

      tableEditorService.tableSelector.setValue(navStep.tableId);
      tableEditorService.navSteps.pop();

      tableEditorService.selectedTable = table;

      setTimeout(() => {
        if (tableEditorService.navSteps.length === 1) {
          backLink.classList.add('disabled');
        }
      }, 200);
    }
  });
};

function loadTable(table) {
  const data = formatTable(table);
  const headers = formatHeaders(table);
  const columns = formatColumns(table);

  tableEditorService.hot.loadData(data);
  tableEditorService.hot.updateSettings({
    data: data,
    colHeaders: headers,
    columns: columns
  });

  tableEditorService.hot.selectCell(tableEditorService.rowIndexToSelect, tableEditorService.columnIndexToSelect);

  utilService.hide(loader);
};

function formatTable(table) {
  return table.records.map((record) => {
    return record._fields.reduce((accumulator, currentValue) => {
      accumulator[currentValue.key] = currentValue.value;
      return accumulator;
    }, {});
  });
};

function formatHeaders(table) {
  if (table.offsetTable) {
    if (tableEditorService.showHeaderTypes) {
      return table.offsetTable.map((offset) => {
        return `${offset.name} <div class="header-type">${offset.type}</div>`;
      });
    } else {
      return table.offsetTable.map((offset) => {
        return offset.name;
      });
    }
  } else {
    return [];
  }
};

function formatColumns(table) {
  if (table.offsetTable) {
    return table.offsetTable.map((offset) => {
      return {
        'data': offset.name,
        'renderer': offset.isReference ? referenceRenderer : offset.enum || offset.type === 'bool' ? 'dropdown' : 'text',
        'readOnly': offset.isReference,
        'wordWrap': false,
        'editor': offset.enum || offset.type === 'bool' ? 'select' : 'text',
        'selectOptions': offset.enum ? offset.enum.members.map((member) => { return member.name; }) : offset.type === 'bool' ? ['true', 'false'] : []
      };
    });
  } else {
    return [];
  }
};

function referenceRenderer(instance, td, row, col, prop, value, cellProperties) {
  if (value && value.length === 32) {
    utilService.removeChildNodes(td);
    const referenceLink = document.createElement('a');
    const otherTableFlag = value[0];

    if (otherTableFlag === '0') {
      const tableIndex = utilService.bin2dec(value.substring(3,15));
      const recordIndex = utilService.bin2dec(value.substring(16));
      const table = tableEditorService.file.getTableByIndex(tableIndex);

      if (tableIndex > 0 && table) {
        referenceLink.innerHTML = `${table.name} - ${recordIndex}`;
        td.appendChild(referenceLink);

        referenceLink.addEventListener('click', function () {
          tableEditorService.navSteps[tableEditorService.navSteps.length - 1].column = col;
          tableEditorService.navSteps[tableEditorService.navSteps.length - 1].recordIndex = row;

          tableEditorService.rowIndexToSelect = recordIndex;
          tableEditorService.columnIndexToSelect = 0;

          if (table.header.tableId != tableEditorService.tableSelector.getValue()) {
            tableEditorService.tableSelector.setValue(table.header.tableId);
          } 
          else {
            tableEditorService.hot.selectCell(recordIndex, 0);
          }

          setTimeout(() => {
            tableEditorService.navSteps[tableEditorService.navSteps.length - 1].recordIndex = recordIndex;
          }, 1000);
        });
      } else {
        td.innerHTML = value;
      }
    } else {
      td.innerHTML = value;
    }
  } else {
    td.innerHTML = value;
  }

  return td;
};

function enumRenderer(instance, td, row, col, prop, value, cellProperties) {
  const colEnum = tableEditorService.selectedTable.records[0].getFieldByKey(prop).offset.enum;

  if (colEnum) {
    // const val = colEnum.getMemberByUnformattedValue(value);
    
    // td.innerHTML = val.name;
    td.innerHTML = value;
  } else {
    td.innerHTML = value;
  }

  return td;
};