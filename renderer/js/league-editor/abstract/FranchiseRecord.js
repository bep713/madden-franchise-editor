const SearchableRecord = require('./SearchableRecord');

class FranchiseRecord extends SearchableRecord {
    constructor(record) {
        super();
        this._index = record.index;
        this._record = record;
    }

    get index () {
        return this._index;
    };

    get record () {
        return this._record;
    };
};

module.exports = FranchiseRecord;