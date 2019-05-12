const FranchiseOffset = require('./FranchiseOffset');

class FranchiseTable {
  constructor(data) {
    this.parse(data);
  };

  parse (data) {
    this.name = data.table;
    this.offsets = [];

    data.offsets.forEach((offsetData) => {
      this.offsets.push(new FranchiseOffset(offsetData));
    });
  };

  getOffsetFor(key) {
    return this.offsets.find((offset) => { return offset.name === key; });
  };
};

module.exports = FranchiseTable;