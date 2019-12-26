const FranchiseRecordEmployablePerson = require('./abstract/FranchiseRecordEmployablePerson');

class Player extends FranchiseRecordEmployablePerson {
    constructor(record) {
        super(record);
        this._position = record.Position;
        this._portraitId = record.PLYR_PORTRAIT;
        this.searchTextAttributes = ['firstName', 'lastName', 'team.searchText', 'position'];
        this.mainLineAttributes = ['firstName', 'lastName'];
        this.secondLineAttributes = ['team.city', 'team.abbreviation', 'separator', 'position'];
        this.type = 'Player';
        this._iconPath = `https://madden-assets-cdn.pulse.ea.com/madden19/portraits/64/${this._portraitId}.png`
    };

    get position () {
        return this._position;
    };

    get portraitId () {
        return this._portraitId;
    };
};

module.exports = Player;