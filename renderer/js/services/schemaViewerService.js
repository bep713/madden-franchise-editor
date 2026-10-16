const EventEmitter = require("events");
const utilService = require("./utilService");

let schemaViewerService = {};
schemaViewerService.name = "schemaViewerService";
schemaViewerService.fileId = null;
schemaViewerService.numberOfSchemasToShow = 100;
schemaViewerService.fields = null;
schemaViewerService.visibleFields = null;
schemaViewerService.currentOffset = 0;
schemaViewerService.schemaInfo = null;
schemaViewerService.expectedSchemaVersion = null;
schemaViewerService.eventEmitter = new EventEmitter();

schemaViewerService.start = async function (fileId) {
  utilService.show(document.querySelector(".loader-wrapper"));
  schemaViewerService.currentOffset = 0;

  addListeners();

  schemaViewerService.fileId = fileId;
  await schemaViewerService.runStartupTasks();
  utilService.hide(document.querySelector(".loader-wrapper"));
};

schemaViewerService.runStartupTasks = async function () {
  const [fieldsResult, schemaInfoResult] = await Promise.all([
    window.franchiseAPI.schemaViewer.getFields(schemaViewerService.fileId),
    window.franchiseAPI.schemaViewer.getSchemaInfo(schemaViewerService.fileId),
  ]);

  schemaViewerService.fields = fieldsResult;
  schemaViewerService.visibleFields = fieldsResult;
  schemaViewerService.schemaInfo = schemaInfoResult.schemaInfo;
  schemaViewerService.expectedSchemaVersion =
    schemaInfoResult.expectedSchemaVersion;
  schemaViewerService.gameType = schemaInfoResult.gameType;

  manageSchemaVersionInfo(
    schemaViewerService.schemaInfo,
    schemaViewerService.expectedSchemaVersion,
    schemaViewerService.gameType,
  );
  loadFields(
    schemaViewerService.fields,
    0,
    schemaViewerService.numberOfSchemasToShow,
  );

  schemaViewerService.currentOffset = schemaViewerService.numberOfSchemasToShow;
  checkLoadMore(schemaViewerService.fields);
};

module.exports = schemaViewerService;

function loadFields(fields, start, end) {
  const resultsElement = document.querySelector(".results");

  fields.slice(start, end).forEach((field) => {
    const result = document.createElement("div");
    result.classList.add("result");

    const fieldName = document.createElement("div");
    fieldName.classList.add("field-name");
    fieldName.innerHTML = field.name;

    const tableName = document.createElement("div");
    tableName.classList.add("table-name");
    tableName.innerHTML = field.table;

    const typeName = document.createElement("div");
    typeName.classList.add("table-name");
    typeName.innerHTML = field.type;

    result.appendChild(fieldName);
    result.appendChild(tableName);
    result.appendChild(typeName);
    resultsElement.appendChild(result);
  });
}

function addListeners() {
  addLoadMoreListener();
  addFieldListener();
  addTableListener();
  addTypeListener();
  addChangeSchemaListener();
}

function addLoadMoreListener() {
  const loadMore = document.querySelector(".load-more");
  loadMore.addEventListener("click", function () {
    if (schemaViewerService.currentOffset < schemaViewerService.fields.length) {
      loadFields(
        schemaViewerService.visibleFields,
        schemaViewerService.currentOffset,
        schemaViewerService.currentOffset +
          schemaViewerService.numberOfSchemasToShow,
      );
      schemaViewerService.currentOffset +=
        schemaViewerService.numberOfSchemasToShow;
    }

    checkLoadMore(schemaViewerService.fields);
  });
}

function checkLoadMore(fields) {
  const loadMore = document.querySelector(".load-more");

  if (schemaViewerService.currentOffset >= fields.length) {
    loadMore.classList.add("hidden");
  } else {
    loadMore.classList.remove("hidden");
  }
}

function addFieldListener() {
  document
    .querySelector("#field-filter")
    .addEventListener("input", filterField);
}

function addTableListener() {
  document
    .querySelector("#table-filter")
    .addEventListener("input", filterField);
}

function addTypeListener() {
  document.querySelector("#type-filter").addEventListener("input", filterField);
}

function addChangeSchemaListener() {
  const changeSchema = document.querySelector(".change-schema");
  changeSchema.addEventListener("click", function () {
    schemaViewerService.eventEmitter.emit("change-schema");
  });
}

function filterField() {
  clearFields();

  const fieldFilter = document.querySelector("#field-filter").value;
  const tableFilter = document.querySelector("#table-filter").value;
  const typeFilter = document.querySelector("#type-filter").value;

  const applicableFields = schemaViewerService.fields.filter((field) => {
    return (
      field.name.toLowerCase().indexOf(fieldFilter.toLowerCase()) >= 0 &&
      field.table.toLowerCase().indexOf(tableFilter.toLowerCase()) >= 0 &&
      field.type.toLowerCase().indexOf(typeFilter.toLowerCase()) >= 0
    );
  });

  loadFields(applicableFields, 0, schemaViewerService.numberOfSchemasToShow);
  schemaViewerService.visibleFields = applicableFields;
  schemaViewerService.currentOffset = schemaViewerService.numberOfSchemasToShow;
  checkLoadMore(applicableFields);
}

function clearFields() {
  const results = document.querySelector(".results");

  while (results.firstChild) {
    results.removeChild(results.firstChild);
  }
}

function manageSchemaVersionInfo(schemaInfo, expectedSchemaVersion, gameType = "madden") {
  const major = document.querySelector(".schema-version-wrapper .major");
  const minor = document.querySelector(".schema-version-wrapper .minor");
  const year = document.querySelector(".schema-version-wrapper .year");

  major.innerHTML = schemaInfo.major;
  minor.innerHTML = schemaInfo.minor;

  if (schemaInfo.gameYear) {
    year.innerHTML = (gameType === "college" ? "C" : "M") + schemaInfo.gameYear;
    year.classList.remove("hidden");
  } else {
    year.innerHTML = "M20";
    year.classList.add("hidden");
  }

  const expectedMajor = document.querySelector(
    ".schema-version-wrapper .expected-major",
  );
  const expectedMinor = document.querySelector(
    ".schema-version-wrapper .expected-minor",
  );
  const expectedYear = document.querySelector(
    ".schema-version-wrapper .expected-year",
  );

  expectedMajor.innerHTML = expectedSchemaVersion.major;
  expectedMinor.innerHTML = expectedSchemaVersion.minor;

  if (expectedSchemaVersion.gameYear) {
    expectedYear.innerHTML = (gameType === "college" ? "C" : "M") + expectedSchemaVersion.gameYear;
    expectedYear.classList.remove("hidden");
  } else {
    expectedYear.innerHTML = "ANY";
  }

  const usedSchema = schemaInfo;

  let schemaVersionMatch =
    expectedSchemaVersion.major === usedSchema.major &&
    expectedSchemaVersion.minor === usedSchema.minor;
  const schemaMatch = expectedSchemaVersion.gameYear
    ? schemaVersionMatch &&
      expectedSchemaVersion.gameYear === usedSchema.gameYear
    : schemaVersionMatch;

  const schemaStatus = document.querySelector(
    ".expected-schema-wrapper .status",
  );

  if (schemaStatus) {
    if (schemaMatch) {
      schemaStatus.classList.add("match");
    } else {
      schemaStatus.classList.add("no-match");
    }
  }
}
