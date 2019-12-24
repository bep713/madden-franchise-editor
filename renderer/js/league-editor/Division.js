const FranchiseRecord = require('./abstract/FranchiseRecord');

class Division extends FranchiseRecord {
    constructor(record) {
        super(record);
        this._name = record.Name;
        this._teams = [];
        this.searchTextAttributes = ['name'];
        this.mainLineAttributes = ['name'];
        this.type = 'Division';
    };

    get teams () {
        return this._teams;
    };

    set teams (teams) {
        this._teams = teams;
    };

    get name () {
        return this._name;
    };

    addTeam(team) {
        this._teams.push(team);
    };
};

module.exports = Division;