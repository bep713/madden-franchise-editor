const FranchiseRecord = require('./FranchiseRecord');

class FranchiseRecordPerson extends FranchiseRecord {
    constructor(record) {
        super(record);
        this._firstName = record.FirstName;
        this._lastName = record.LastName;
    };

    get firstName () {
        return this._firstName;
    };

    get lastName () {
        return this._lastName;
    };
};

module.exports = FranchiseRecordPerson;