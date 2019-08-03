const data = require('../../../data/gameYearTableIdData.json');

const franchiseGameYearService = {};

franchiseGameYearService.getTableId = (name, year) => {
  if (data[name] === null) { return -1; }
  else return data[name][year];
};

module.exports = franchiseGameYearService;