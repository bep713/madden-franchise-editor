let externalDataService = {};

externalDataService.getAvailableFormats = function () {
  return [
    {
      format: "csv",
      text: "CSV",
    },
    {
      format: "xlsx",
      text: "XLSX",
    },
  ];
};

externalDataService.importTableData = async function (options) {
  return window.electronAPI.externalData.import(options.inputFilePath);
};

externalDataService.exportTableData = async function (options, table) {
  if (!options) {
    throw new Error(
      "Invalid arguments. Please call .exportTableData with (options, FranchiseFileTable)",
    );
  }

  const headers = table.offsetTable.map((offset) => offset.name);
  const rows = table.records.map((record) =>
    record.fieldsArray.map((field) => field._value),
  );

  await window.electronAPI.externalData.export(
    options.outputFilePath,
    headers,
    rows,
  );
};

externalDataService.exportRawTableData = async (options, fileId, tableId) => {
  if (!options) {
    throw new Error(
      "Invalid arguments. Please call .exportRawTableData with (options, fileId, tableId)",
    );
  }
  await window.electronAPI.externalData.rawExport(
    fileId,
    tableId,
    options.outputFilePath,
  );
};

externalDataService.exportFrt = async (options, fileId) => {
  if (!options) {
    throw new Error(
      "Invalid arguments. Please call .exportFrt with (options, fileId)",
    );
  }
  await window.electronAPI.externalData.frtExport(
    fileId,
    options.outputFilePath,
  );
};

externalDataService.importRawTable = async (options, fileId, tableId) => {
  if (!options) {
    throw new Error(
      "Invalid arguments. Please call .importRawTable with (options, fileId, tableId)",
    );
  }
  await window.electronAPI.externalData.rawImport(
    fileId,
    tableId,
    options.filePath,
  );
};

module.exports = externalDataService;
