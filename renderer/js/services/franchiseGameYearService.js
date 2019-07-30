const data = require('../../../data/gameYearTableIndexData.json');

const franchiseGameYearService = {};

franchiseGameYearService.getTableIndex = (name, year) => {
  if (data[name] === null) { return -1; }
  else return data[name][year];
};

module.exports = franchiseGameYearService;