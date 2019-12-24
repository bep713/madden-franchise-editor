const FranchiseRecordPerson = require('./FranchiseRecordPerson');

class FranchiseRecordEmployedPerson extends FranchiseRecordPerson {
    constructor(record) {
        super(record);
        this._teamIndex = record.TeamIndex;
        this._team = null;
    };

    get teamIndex () {
        return this._teamIndex;
    };

    set teamIndex (index) {
        this._teamIndex = index;
    };

    get team () {
        return this._team;
    };

    set team (team) {
        this._team = team;
        this.teamIndex = team.teamIndex;
    };
};

module.exports = FranchiseRecordEmployedPerson;