const FranchiseTable = require('../franchise/FranchiseTable');
const offsetData = require('../../../data/offsets.json');

let tables;
let offsetDataService = {};

offsetDataService.parse = function () {
  tables = [];

  offsetData.tables.forEach((table) => {
    tables.push(new FranchiseTable(table));  
  });
};

offsetDataService.getTable = function (tableName) {
  return tables.find((table) => { return table.name === tableName; });
}

module.exports = offsetDataService;