const FranchiseRecordEmployablePerson = require('./abstract/FranchiseRecordEmployablePerson');

class Coach extends FranchiseRecordEmployablePerson {
    constructor(record) {
        super(record);
        this.searchTextAttributes = ['firstName', 'lastName', 'team.searchText'];
        this.mainLineAttributes = ['firstName', 'lastName'];
        this.secondLineAttributes = ['team.city', 'team.abbreviation'];
        this.type = 'Coach';
        this._portraitId = record.Portrait;
        this._iconPath = `img/coach-portraits/${this._portraitId}.png`;
    };
};

module.exports = Coach;