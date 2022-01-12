const EventEmitter = require('events');
const utilService = require('./utilService');

let schemaViewerService = {};
schemaViewerService.name = 'schemaViewerService';
schemaViewerService.file = null;
schemaViewerService.numberOfSchemasToShow = 100;
schemaViewerService.fields = null;
schemaViewerService.visibleFields = null;
schemaViewerService.currentOffset = 0;
schemaViewerService.schemaInfo = null;
schemaViewerService.eventEmitter = new EventEmitter();

schemaViewerService.start = function (file) {
  utilService.show(document.querySelector('.loader-wrapper'));
  schemaViewerService.currentOffset = 0;
  
  addListeners();

  if (file.isLoaded) {
    schemaViewerService.runStartupTasks(file);
  } else {
    file.on('ready', function () {
      schemaViewerService.runStartupTasks(file);
    });
  }
};

schemaViewerService.runStartupTasks = function (file) {
  schemaViewerService.file = file;
  schemaViewerService.schemaInfo = file.schemaList.meta;
  manageSchemaVersionInfo(schemaViewerService.schemaInfo);
  schemaViewerService.loadFields();
  utilService.hide(document.querySelector('.loader-wrapper'));
};

schemaViewerService.loadFields = function () {
  schemaViewerService.fields = getAllFields(schemaViewerService.file);
  schemaViewerService.visibleFields = schemaViewerService.fields;
  loadFields(schemaViewerService.fields, 0, schemaViewerService.numberOfSchemasToShow);

  schemaViewerService.currentOffset = schemaViewerService.numberOfSchemasToShow;
  checkLoadMore(schemaViewerService.fields);
};

module.exports = schemaViewerService;

function getAllFields (file) {
  const filteredTables = file.tables.filter((table) => { return table.schema; });
  return filteredTables.map((table) => {
    return table.schema.attributes.map((schemaAttrib) => {
      return {
        'name': schemaAttrib.name,
        'table': table.name,
        'type': schemaAttrib.type
      };
    });
  }).flat();
};

function loadFields (fields, start, end) {
  const resultsElement = document.querySelector('.results');

  fields.slice(start, end).forEach((field) => {
    const result = document.createElement('div');
    result.classList.add('result');

    const fieldName = document.createElement('div');
    fieldName.classList.add('field-name');
    fieldName.innerHTML = field.name;

    const tableName = document.createElement('div');
    tableName.classList.add('table-name');
    tableName.innerHTML = field.table;

    const typeName = document.createElement('div');
    typeName.classList.add('table-name');
    typeName.innerHTML = field.type;

    result.appendChild(fieldName);
    result.appendChild(tableName);
    result.appendChild(typeName);
    resultsElement.appendChild(result);
  });
};

function addListeners() {
  addLoadMoreListener();
  addFieldListener();
  addTableListener();
  addTypeListener();
  addChangeSchemaListener();
};

function addLoadMoreListener() {
  const loadMore = document.querySelector('.load-more');
  loadMore.addEventListener('click', function () {
    if (schemaViewerService.currentOffset < schemaViewerService.fields.length) {
      loadFields(schemaViewerService.visibleFields, schemaViewerService.currentOffset, schemaViewerService.currentOffset + schemaViewerService.numberOfSchemasToShow);
      schemaViewerService.currentOffset += schemaViewerService.numberOfSchemasToShow;
    }

    checkLoadMore(schemaViewerService.fields);
  });
};

function checkLoadMore(fields) {
  const loadMore = document.querySelector('.load-more');

  if (schemaViewerService.currentOffset >= fields.length) {
    loadMore.classList.add('hidden');
  } else {
    loadMore.classList.remove('hidden');
  }
};

function addFieldListener() {
  document.querySelector('#field-filter').addEventListener('input', filterField);
};

function addTableListener() {
  document.querySelector('#table-filter').addEventListener('input', filterField);
};

function addTypeListener() {
  document.querySelector('#type-filter').addEventListener('input', filterField);
};

function addChangeSchemaListener() {
  const changeSchema = document.querySelector('.change-schema');
  changeSchema.addEventListener('click', function () {
    schemaViewerService.eventEmitter.emit('change-schema');
  });
};

function filterField() {
  clearFields();
  
  const fieldFilter = document.querySelector('#field-filter').value;
  const tableFilter = document.querySelector('#table-filter').value;
  const typeFilter = document.querySelector('#type-filter').value;
  
  const applicableFields = schemaViewerService.fields.filter((field) => {
    return field.name.toLowerCase().indexOf(fieldFilter.toLowerCase()) >= 0
      && field.table.toLowerCase().indexOf(tableFilter.toLowerCase()) >= 0
      && field.type.toLowerCase().indexOf(typeFilter.toLowerCase()) >= 0;
  });

  loadFields(applicableFields, 0, schemaViewerService.numberOfSchemasToShow);
  schemaViewerService.visibleFields = applicableFields;
  schemaViewerService.currentOffset = schemaViewerService.numberOfSchemasToShow;
  checkLoadMore(applicableFields);
};

function clearFields() {
  const results = document.querySelector('.results');

  while (results.firstChild) {
    results.removeChild(results.firstChild);
  }
};

function manageSchemaVersionInfo() {
  const major = document.querySelector('.schema-version-wrapper .major');
  const minor = document.querySelector('.schema-version-wrapper .minor');
  const year = document.querySelector('.schema-version-wrapper .year');

  major.innerHTML = schemaViewerService.schemaInfo.major;
  minor.innerHTML = schemaViewerService.schemaInfo.minor;

  if (schemaViewerService.schemaInfo.gameYear) {
    year.innerHTML = 'M' + schemaViewerService.schemaInfo.gameYear;
    year.classList.remove('hidden');
  } else {
    year.innerHTML = 'M20';
    year.classList.add('hidden');
  }

  const expectedMajor = document.querySelector('.schema-version-wrapper .expected-major');
  const expectedMinor = document.querySelector('.schema-version-wrapper .expected-minor');
  const expectedYear = document.querySelector('.schema-version-wrapper .expected-year');

  expectedMajor.innerHTML = schemaViewerService.file.expectedSchemaVersion.major;
  expectedMinor.innerHTML = schemaViewerService.file.expectedSchemaVersion.minor;

  if (schemaViewerService.file.expectedSchemaVersion.gameYear) {
    expectedYear.innerHTML = 'M' + schemaViewerService.file.expectedSchemaVersion.gameYear;
    expectedYear.classList.remove('hidden');
  }
  else {
    expectedYear.innerHTML = 'ANY';
  }

  const expectedSchema = schemaViewerService.file.expectedSchemaVersion
  const usedSchema = schemaViewerService.schemaInfo;

  let schemaVersionMatch = expectedSchema.major === usedSchema.major && expectedSchema.minor === usedSchema.minor;
  const schemaMatch = expectedSchema.gameYear ? schemaVersionMatch && expectedSchema.gameYear === usedSchema.gameYear : schemaVersionMatch;

  const schemaStatus = document.querySelector('.expected-schema-wrapper .status');

  if (schemaStatus) {
    if (schemaMatch) {
      schemaStatus.classList.add('match'); 
    }
    else {
      schemaStatus.classList.add('no-match');
    }
  }
};