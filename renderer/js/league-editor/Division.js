const FranchiseRecord = require('./abstract/FranchiseRecord');

class Division extends FranchiseRecord {
    constructor(record) {
        super(record);
        this._name = record.Name;
        this._teams = [];
        this.searchTextAttributes = ['name'];
        this.mainLineAttributes = ['name'];
        this.type = 'Division';
        
        if (this._name.indexOf('AFC') > -1) {
            this._iconPath = 'img/team-logos/nfl/afc.png'
        }
        else {
            this._iconPath = 'img/team-logos/nfl/nfc.png';
        }
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