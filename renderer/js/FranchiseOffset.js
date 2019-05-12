class FranchiseOffset {
  constructor (data) {
    this.parse(data);
  };

  parse (data) {
    this.name = data.name;
    this.offset = data.offset;
    this.type = data.type;
    this.length = data.length;
    this.endOffset = data.offset + data.length;
  };
};

module.exports = FranchiseOffset;