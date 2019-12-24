const FranchiseRecordEmployablePerson = require('./abstract/FranchiseRecordEmployablePerson');

class Player extends FranchiseRecordEmployablePerson {
    constructor(record) {
        super(record);
        this.searchTextAttributes = ['firstName', 'lastName', 'team.searchText'];
        this.mainLineAttributes = ['firstName', 'lastName'];
        this.secondLineAttributes = ['team.city', 'team.abbreviation'];
        this.type = 'Player';
    };
};

module.exports = Player;