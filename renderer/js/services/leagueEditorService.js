const Fuse = require('fuse.js');
const utilService = require('./utilService');

const Team = require('../league-editor/Team');
const Coach = require('../league-editor/Coach');
const Player = require('../league-editor/Player');
const Division = require('../league-editor/Division');
const FranchiseRecordEmployablePerson = require('../league-editor/abstract/FranchiseRecordEmployablePerson');

let leagueEditorService = {};

leagueEditorService.name = 'leagueEditorService';
leagueEditorService.searchBar = null;
leagueEditorService.file = null;
leagueEditorService.loadingSpinner = null;
leagueEditorService.resultWrapper = null;
leagueEditorService.playerTables = [];
leagueEditorService.coachTables = [];
leagueEditorService.teamTables = [];
leagueEditorService.divisionTables = [];
leagueEditorService.searchObjects = [];

leagueEditorService.start = function (file) {
    leagueEditorService.file = file;

    if (file.isLoaded) {
        runStartTasks();
    } else {
        file.on('ready', function () {
            runStartTasks();
        });
    }
};

leagueEditorService.onClose = function () {
    leagueEditorService.searchBar = null;
    leagueEditorService.file = null;
};

module.exports = leagueEditorService;

function runStartTasks() {    
    leagueEditorService.loadingSpinner = document.querySelector('.loader-wrapper');
    utilService.show(leagueEditorService.loadingSpinner);

    leagueEditorService.searchBar = document.querySelector('.editor-search');
    leagueEditorService.searchBar.focus();

    leagueEditorService.resultWrapper = document.querySelector('.search-results');

    addEventListeners();
    setTimeout(() => {
        loadTables();
    }, 10);
};

function addEventListeners() {
    const searchBar = leagueEditorService.searchBar;

    searchBar.addEventListener('input', () => {
        new Promise((resolve, reject) => {
            const result = leagueEditorService.fuse.search(searchBar.value);
            parseResultList(result);
        });
    });
};

function parseResultList(resultList) {
    utilService.removeChildNodes(leagueEditorService.resultWrapper);
    
    resultList.forEach((result) => {
        const resultWrapper = document.createElement('div');
        resultWrapper.classList.add('result-wrapper');

        const mainLineElem = document.createElement('div');
        mainLineElem.classList.add('main-line');
        mainLineElem.innerHTML = result.mainLineText;

        const secondaryLineElem = document.createElement('div');
        secondaryLineElem.classList.add('secondary-line');
        secondaryLineElem.innerHTML = '<span class="type">' + result.type + '</span><span class="secondary-text">' + result.secondaryLineText + '</span>';

        resultWrapper.appendChild(mainLineElem);
        resultWrapper.appendChild(secondaryLineElem);
        leagueEditorService.resultWrapper.appendChild(resultWrapper);
    });
};

function loadTables() {
    const file = leagueEditorService.file;
    leagueEditorService.playerTables = file.getAllTablesByName('Player');
    leagueEditorService.coachTables = file.getAllTablesByName('Coach');
    leagueEditorService.teamTables = file.getAllTablesByName('Team');
    leagueEditorService.divisionTables = file.getAllTablesByName('Division');

    let recordPromises = [];

    leagueEditorService.playerTables.forEach((table) => {
        recordPromises.push(table.readRecords(['FirstName', 'LastName', 'TeamIndex', 'Age']));
    });

    leagueEditorService.coachTables.forEach((table) => {
        recordPromises.push(table.readRecords(['FirstName', 'LastName', 'TeamIndex', 'Age']));
    });

    leagueEditorService.teamTables.forEach((table) => {
        recordPromises.push(table.readRecords(['LongName', 'DisplayName', 'TEAM_ORDER', 'TeamIndex']));
    });

    leagueEditorService.divisionTables.forEach((table) => {
        recordPromises.push(table.readRecords());
    });

    Promise.all(recordPromises)
        .then(afterInitialRecordLoad);
};

function afterInitialRecordLoad() {
    readDivisionTeamArrays()
        .then(afterAllRecordsLoaded);  
};

function readDivisionTeamArrays() {
    let promises = [];

    leagueEditorService.divisionTables.forEach((table) => {
        table.records.forEach((record) => {
            const teamArrayRef = record.getReferenceDataByKey('Teams');
            const teamArrayTable = leagueEditorService.file.getTableById(teamArrayRef.tableId);

            if (teamArrayTable) {
                promises.push(teamArrayTable.readRecords());
            }
        });
    });

    return Promise.all(promises);
};

function afterAllRecordsLoaded() {
    utilService.hide(leagueEditorService.loadingSpinner);
    parseRecords();
    makeAssociations();
    initializeFuseSearch();
};

function parseRecords() {
    let searchObjects = [];

    leagueEditorService.playerTables.forEach((table) => {
        const filteredItems = table.records.filter((record) => {
            return record.Age > 0;
        });

        const players = filteredItems.map((item) => {
            return new Player(item);
        });

        if (players.length > 0) {
            searchObjects.push(players);
        }
    });

    leagueEditorService.coachTables.forEach((table) => {
        const filteredItems = table.records.filter((record) => {
            return record.Age > 0;
        });

        const coaches = filteredItems.map((item) => {
            return new Coach(item);
        });

        if (coaches.length > 0) {
            searchObjects.push(coaches);
        }
    });

    leagueEditorService.teamTables.forEach((table) => {
        const filteredItems = table.records.filter((record) => {
            return record.TEAM_ORDER < 50 || record.LongName === 'Free Agents';
        });

        const teams = filteredItems.map((item) => {
            return new Team(item);
        });

        if (teams.length > 0) {
            searchObjects.push(teams);
        }
    });

    leagueEditorService.divisionTables.forEach((table) => {
        const filteredItems = table.records.filter((record) => {
            return record.Name !== 'NFL Europe';
        });

        const divisions = filteredItems.map((item) => {
            return new Division(item);
        });

        if (divisions.length > 0) {
            searchObjects.push(divisions);
        }
    });

    leagueEditorService.searchObjects = searchObjects.flat();
};

function makeAssociations () {
    const searchObjects = leagueEditorService.searchObjects;
    const employablePeople = searchObjects.filter((obj) => {
        return obj instanceof FranchiseRecordEmployablePerson;
    });

    employablePeople.forEach((person) => {
        const team = searchObjects.find((obj) => {
            return obj instanceof Team && obj.teamIndex === person.teamIndex;
        });

        if (team) {
            person.team = team;

            if (person instanceof Coach) {
                team.coach = person;
            }
            else {
                team.addPlayer(person);
            }
        }
    });

    const divisions = searchObjects.filter((obj) => {
        return obj instanceof Division;
    });

    divisions.forEach((division) => {
        const teamArray = leagueEditorService.file.getReferencedRecord(division.record.Teams);
        teamArray.fields.forEach((field) => {
            const teamRecord = leagueEditorService.file.getReferencedRecord(field.value);
            const team = searchObjects.find((obj) => {
                return obj instanceof Team && obj.record === teamRecord;
            });

            if (team) {
                division.addTeam(team);
            }
        });
    });
};

function initializeFuseSearch() {
    const fuseOptions = {
        keys: ['searchText'],
        threshold: 0.4,
        shouldSort: true
    };

    leagueEditorService.fuse = new Fuse(leagueEditorService.searchObjects, fuseOptions);
};