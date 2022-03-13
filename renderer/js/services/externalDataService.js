const fs = require('fs');
const xlsx = require('xlsx');

let externalDataService = {};

externalDataService.getAvailableFormats = function () {
  return [{
    'format': 'csv',
    'text': 'CSV'
  }, {
    'format': 'xlsx',
    'text': 'XLSX'
  }];
};

externalDataService.importTableData = function (options) {
  return new Promise((resolve, reject) => {
    const wb = xlsx.readFile(options.inputFilePath);
    resolve(xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      'raw': false
    }));
  });
};

externalDataService.exportTableData = function (options, table) {
  return new Promise((resolve, reject) => {
    if (!options) { reject('Invalid arguments. Please call .exportTableData with (options, FranchiseFileTable)'); }
    
    let headers = table.offsetTable.map((offset) => {
      return offset.name;
    });

    const data = table.records.map((record) => {
      return record.fieldsArray.map((field) => { return field._value; });
    });

    let wb = xlsx.utils.book_new();

    const ws = xlsx.utils.json_to_sheet([headers].concat(data), {
      'skipHeader': true
    });

    xlsx.utils.book_append_sheet(wb, ws);

    try {
      xlsx.writeFile(wb, options.outputFilePath);
    }
    catch (err) {
      reject(err);
    }

    resolve();
  });
};

externalDataService.exportRawTableData = async (options, table) => {
  if (!options) { reject('Invalid arguments. Please call .exportTableData with (options, FranchiseFileTable)'); }
  fs.writeFileSync(options.outputFilePath, table.data);
};

externalDataService.exportFrt = async (options, file) => {
  if (!options) { reject('Invalid arguments. Please call .exportTableData with (options, FranchiseFile)'); }
  fs.writeFileSync(options.outputFilePath, file.unpackedFileContents);
};

externalDataService.importRawTable = async (options, table) => {
  if (!options) { reject('Invalid arguments. Please call .exportTableData with (options, FranchiseFileTable)'); }
  const tableData = await fs.readFileSync(options.filePath);
  await table.replaceRawData(tableData, true);
};

module.exports = externalDataService;