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

// Bulk import of parsed rows – sends rows to main for mutation
externalDataService.importTableBulk = async function (fileId, tableId, rows) {
  return window.electronAPI.externalData.importBulk(fileId, tableId, rows);
};

externalDataService.exportTableData = async function (options, table) {
  if (!options) {
    throw new Error(
      "Invalid arguments. Please call .exportTableData with (options, FranchiseFileTable)",
    );
  }

  const headers = table.headers.map((offset) => offset.name);
  const rows = table.records.map((record) => headers.map((h) => record[h]));

  console.log(headers, rows);

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
