const Selectr = require('mobius1-selectr');
const Handsontable = require('handsontable').default;

let tableEditorService = {};
tableEditorService.file = null;
tableEditorService.hot = null;
tableEditorService.tableSelector = null;
tableEditorService.selectedTable = null;
tableEditorService.showHeaderTypes = false;

tableEditorService.start = function (file) {
  initializeTable();
  addEventListeners();

  if (file.isLoaded) {
    tableEditorService.file = file;
    tableEditorService.loadTable();
  } else {
    file.on('tables-done', function () {
      tableEditorService.file = file;
      tableEditorService.loadTable();
    });
  }
};

// tableEditorService.onFileReady = function (file) {
//   tableEditorService.file = file;
//   tableEditorService.loadTable();
// };

tableEditorService.loadTable = function () {
  const filteredChoices = tableEditorService.file.tables.filter((table) => { return table.schema; });
  const tableChoices = filteredChoices.map((table) => {
    return {
      'value': table.header.tableId,
      'text': table.name
    };
  });

  const initialTableToLoad = 'SeasonOffensiveStats';

  tableChoices.find((choice) => {
    return choice.text === initialTableToLoad;
  }).selected = true;

  const tableSelector = document.querySelector('.table-selector');
  tableEditorService.tableSelector = new Selectr(tableSelector, {
    data: tableChoices
  });

  tableEditorService.tableSelector.on('selectr.change', function (option) {
    const tableId = parseInt(tableEditorService.tableSelector.getValue(true).value);
    const table = tableEditorService.file.getTableById(tableId);
    table.readRecords().then(loadTable);
    tableEditorService.selectedTable = table;
    console.log(table);
  });

  const seasonGame = tableEditorService.file.getAllTablesByName(initialTableToLoad);
  tableEditorService.selectedTable = seasonGame[seasonGame.length - 1];
  seasonGame[seasonGame.length - 1].readRecords().then(loadTable);
  console.log(seasonGame[seasonGame.length - 1]);
};

module.exports = tableEditorService;

function initializeTable() {
  const container3 = document.querySelector('.table-content-wrapper');
  tableEditorService.hot = new Handsontable(container3, {
    rowHeaders: true,
    currentRowClassName: 'active-row',
    manualColumnResize: true,
    manualRowResize: true,
    afterChange: processChanges
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
  const toggleTypesButton = document.querySelector('.toggle-types');
  toggleTypesButton.addEventListener('click', function () {
    tableEditorService.showHeaderTypes = !tableEditorService.showHeaderTypes;
    const headers = formatHeaders(tableEditorService.selectedTable);

    tableEditorService.hot.updateSettings({
      colHeaders: headers
    });
  });
};

function loadTable(table) {
  const data = formatTable(table);
  const headers = formatHeaders(table);

  tableEditorService.hot.loadData(data);
  tableEditorService.hot.updateSettings({
    data: data,
    colHeaders: headers
  });
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
  if (tableEditorService.showHeaderTypes) {
    return table.offsetTable.map((offset) => {
      return `${offset.name} <div class="header-type">${offset.type}</div>`;
    });
  } else {
    return table.offsetTable.map((offset) => {
      return offset.name;
    });
  }
};