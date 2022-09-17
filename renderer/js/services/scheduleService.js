const fs = require('fs');
const EventEmitter = require('events');
const { app } = require('@electron/remote');

const Selectr = require('../libs/selectr/selectr');
const utilService = require('./utilService');
const teamData = require('../../../data/teamData.json');
const dayOfWeekData = require('../../../data/dayOfWeekData.json');
const seasonWeekData = require('../../../data/seasonWeekData.json');
const FranchiseSchedule = require('../franchise/FranchiseSchedule');
const franchiseGameYearService = require('../services/franchiseGameYearService');

const teamChoices = getTeamChoices(teamData.teams);
const dayChoices = getDayChoices();
const scheduleYearChoices = getScheduleChoices();

let scheduleService = {};
scheduleService.name = 'scheduleEditorService';
scheduleService.file = null;
scheduleService.eventEmitter = new EventEmitter();

scheduleService.loadSchedule = function (file) {
  utilService.show(document.querySelector('.loader-wrapper'));

  setTimeout(() => {
    scheduleService.file = {
      schedule: new FranchiseSchedule(file),
      file: file
    };

    scheduleService.file.schedule.on('ready', () => {
      this.loadGamesByWeek(0);
      utilService.hide(document.querySelector('.loader-wrapper'));
    });

    addEventListeners();
    this.loadWeeks();
  }, 1);
};

scheduleService.loadWeeks = function () {
  removeWeekNumberElements();
  attachWeekNumberElements();
  attachEventListenersToWeekNumberElements();
};

scheduleService.loadGamesByWeek = function (weekNum) {
  removeGameElements();
  setActiveWeek(weekNum);
  attachGameElementsForWeek(weekNum);
};

scheduleService.onClose = function () {
  const contextMenu = document.querySelector('.context-menu');
  contextMenu.removeEventListener('click', hideContextMenu);
};

module.exports = scheduleService;

function addEventListeners() {
  const gamesListElement = document.querySelector('.games-wrapper');
  gamesListElement.addEventListener('click', function () {
    hideContextMenu();
    hideHexView();
  });

  const contextMenu = document.querySelector('.context-menu');
  contextMenu.addEventListener('click', hideContextMenu);

  const viewTableEditor = document.querySelector('#view-table-editor');
  viewTableEditor.addEventListener('click', function () {
    const gameOffset = parseInt(contextMenu.getAttribute('data-game'));
    scheduleService.eventEmitter.emit('open-table-editor', scheduleService.file.file.getTableByName('SeasonGame').header.tableId, gameOffset);
  });

  const modalClose = document.querySelectorAll('.modal-header .close-modal');
  modalClose.forEach((modalClose) => {
    modalClose.addEventListener('click', closeModals);
  });

  const yearSelect = document.querySelector('#available-years');
  const yearSelectr = new Selectr(yearSelect, {
    data: scheduleYearChoices
  });
  yearSelectr.setValue('2021.json');

  const replaceAllButton = document.querySelector('.btn-replace-all');
  replaceAllButton.addEventListener('click', function () {
    closeModals();

    const selectedFile = yearSelectr.selectedValue;
    const scheduleFile = require(`../../../schedules/${selectedFile}`);
    const spinner = document.querySelector('.loader-wrapper');
    spinner.classList.remove('hidden');

    setTimeout(() => {
      scheduleService.file.schedule.replaceAllGamesWithFile(scheduleFile);
      spinner.classList.add('hidden');
      scheduleService.loadGamesByWeek(0);
    }, 100);
  });

  const replaceAll = document.querySelector('#replace-all');
  replaceAll.addEventListener('click', function () {
    const replaceAllModal = document.querySelector('.replace-all-modal');
    const underlay = document.querySelector('.underlay');

    replaceAllModal.classList.remove('hidden');
    underlay.classList.remove('hidden');
  });
};

function populateHexViewWrapper(event, data, header) {
  const hexViewWrapper = document.querySelector('.hex-view-wrapper');
  hexViewWrapper.style.top = `${event.y}px`;

  if ((event.x + 500) > window.innerWidth) {
    hexViewWrapper.style.left = `${window.innerWidth - 500}px`;
  } else {
    hexViewWrapper.style.left = `${event.x}px`; 
  }

  hexViewWrapper.classList.remove('hidden');

  const textArea = hexViewWrapper.querySelector('textarea');
  textArea.value = data;
  textArea.maxLength = 275;

  const headerTextElement = document.querySelector('.header-text');
  headerTextElement.textContent = header;
};

function removeWeekNumberElements() {
  removeAllChildNodes('.week-wrapper');
};

function removeAllChildNodes(selector) {
  var myNode = document.querySelector(selector);

  while (myNode.firstChild) {
      myNode.removeChild(myNode.firstChild);
  }
}

function attachWeekNumberElements() {
  const weekWrapper = document.querySelector('.week-wrapper');
  let attribute = 'weekIndex';
  
  console.log(scheduleService.file)

  if (scheduleService.file.file.gameYear < 22) {
    attribute = 'legacyWeekIndex';
  }
  
  seasonWeekData.weeks.forEach((week, index) => {
    const weekElement = document.createElement('div');
    weekElement.classList.add('week');
    weekElement.setAttribute('data-week', index);
    weekElement.setAttribute('data-week-schedule', week[attribute]);
    weekElement.setAttribute('data-week-type', week.scheduleId);
    weekElement.textContent = week.abbreviation;

    weekWrapper.appendChild(weekElement);
  });
};

function attachEventListenersToWeekNumberElements() {
  const weekElements = document.querySelectorAll('.week-wrapper .week');

  for (let i = 0; i < weekElements.length; i++) {
    const week = weekElements[i];

    week.addEventListener('click', function () {
      const weekNumber = this.getAttribute('data-week');
      scheduleService.loadGamesByWeek(weekNumber);
    });
  }
};

function removeGameElements() {
  removeAllChildNodes('.games-wrapper');
};

function setActiveWeek(week) {
  clearActiveWeek();

  const weekElement = document.querySelector(`.week[data-week="${week}"]`);
  
  if (weekElement) {
    weekElement.classList.add('active');
  }
};

function clearActiveWeek() {
  const currentActiveWeekElement = document.querySelector(`.week.active`);

  if (currentActiveWeekElement) {
    currentActiveWeekElement.classList.remove('active');
  }
};

function attachGameElementsForWeek (weekNum) {
  scheduleService.file.schedule.getGamesInWeek(weekNum).forEach(attachGameElement);
};

function attachGameElement (game) {
  const gamesListElement = document.querySelector('.games-wrapper');
  const gameWrapper = document.createElement('div');
  gameWrapper.classList.add('game');

  const awayTeamWrapper = document.createElement('div');
  awayTeamWrapper.classList.add('away-team-wrapper');
  awayTeamWrapper.classList.add('team-wrapper');

  const awayTeamLogo = document.createElement('img');
  awayTeamLogo.classList.add('away-team-logo');
  awayTeamLogo.classList.add('team-logo');
  changeTeamLogo(awayTeamLogo, game.awayTeam.logoPath);

  const awayTeamName = document.createElement('select');
  awayTeamName.classList.add('team-name');
  awayTeamName.textContent = game.awayTeam.abbreviation;

  awayTeamWrapper.appendChild(awayTeamLogo);
  awayTeamWrapper.appendChild(awayTeamName);

  const awayTeamSelector = new Selectr(awayTeamName, {
    data: getTeamChoices(scheduleService.file.schedule.teamData),
    // renderOption: selectrCustomOptionRenderer
  });

  awayTeamSelector.setValue(game.awayTeam.abbreviation);

  awayTeamSelector.on('selectr.change', function (option) {
    game.awayTeam = getTeamByAbbreviation(scheduleService.file.schedule.teamData, option.value);
    changeTeamLogo(awayTeamLogo, game.awayTeam.logoPath);
  });

  const homeTeamWrapper = document.createElement('div');
  homeTeamWrapper.classList.add('home-team-wrapper');
  homeTeamWrapper.classList.add('team-wrapper');

  const homeTeamLogo = document.createElement('img');
  homeTeamLogo.classList.add('home-team-logo');
  homeTeamLogo.classList.add('team-logo');
  changeTeamLogo(homeTeamLogo, game.homeTeam.logoPath);

  const homeTeamName = document.createElement('select');
  homeTeamName.classList.add('team-name');

  homeTeamWrapper.appendChild(homeTeamLogo);
  homeTeamWrapper.appendChild(homeTeamName);

  const homeTeamSelector = new Selectr(homeTeamName, {
    data: getTeamChoices(scheduleService.file.schedule.teamData),
    // renderOption: selectrCustomOptionRenderer
  });

  homeTeamSelector.setValue(game.homeTeam.abbreviation);

  homeTeamSelector.on('selectr.change', function (option) {
    game.homeTeam = getTeamByAbbreviation(scheduleService.file.schedule.teamData, option.value);
    changeTeamLogo(homeTeamLogo, game.homeTeam.logoPath);
  });

  const dayWrapper = document.createElement('div');
  dayWrapper.classList.add('day-wrapper');

  const dayName = document.createElement('select');
  dayName.classList.add('day-name');

  dayWrapper.appendChild(dayName);

  const dayOfWeekSelector = new Selectr(dayName, {
    data: dayChoices,
    width: '100px'
  });

  dayOfWeekSelector.setValue(game.dayOfWeek.abbreviation);

  dayOfWeekSelector.on('selectr.change', function (option) {
    game.dayOfWeek = getDayOfWeekByAbbreviation(option.value);
  });

  const timeWrapper = document.createElement('div');
  timeWrapper.classList.add('time-wrapper');

  const time = document.createElement('input');
  time.type = 'time';
  time.value = game.time.format('HH:mm');

  time.addEventListener('change', function () {
    const currentTime = game.time;
    const newTime = time.value.split(':');
    currentTime.utc().hour(newTime[0]);
    currentTime.utc().minute(newTime[1]);

    game.time = currentTime;
  });

  timeWrapper.appendChild(time);

  gameWrapper.appendChild(awayTeamWrapper);
  gameWrapper.appendChild(homeTeamWrapper);
  gameWrapper.appendChild(dayWrapper);
  gameWrapper.appendChild(timeWrapper);

  gameWrapper.addEventListener('contextmenu', function (e) {
    const contextMenu = document.querySelector('.context-menu');
    
    if ((e.x + 150) > window.innerWidth) {
      contextMenu.style.left = `${window.innerWidth - 150}px`;  
    } else {
      contextMenu.style.left = `${e.x}px`;
    }
    contextMenu.style.top = `${e.y}px`;
    contextMenu.classList.remove('hidden');
    contextMenu.setAttribute('data-game', game.offset);
  });

  gamesListElement.append(gameWrapper);

  function changeTeamLogo(element, logoPath) {
    if (logoPath) {
      element.src = logoPath;
      element.classList.remove('hidden');
    }
    else {
      element.classList.add('hidden');
    }
  }
}

function hideContextMenu () {
  const contextMenu = document.querySelector('.context-menu');
  contextMenu.classList.add('hidden');
};

function hideHexView() {
  const hexView = document.querySelector('.hex-view-wrapper');
  hexView.classList.add('hidden');
};

function chunk(str, n) {
  var ret = [];
  var i;
  var len;

  for(i = 0, len = str.length; i < len; i += n) {
      ret.push(str.substr(i, n))
  }

  return ret;
};

function getTeamChoices(teams) {
  return teams.map((team) => {
    return {
      'value': team.abbreviation,
      'text': team.abbreviation,
      'selected': false,
      'disabled': false
    };
  });
};

function getDayChoices() {
  return dayOfWeekData.days.map((day) => {
    return {
      'value': day.abbreviation,
      'text': day.abbreviation,
      'selected': false,
      'disabled': false
    };
  })
};

function getScheduleChoices() {
  return fs.readdirSync(`${app.getAppPath()}\\schedules`).reverse().map((year) => {
    return {
      'value': year,
      'text': year,
      'selected': false,
      'disabled': false
    };
  });
};

function getTeamByAbbreviation(teamList, abbreviation) {
  return teamList.find((team) => { return team.abbreviation === abbreviation; });
};

function getDayOfWeekByAbbreviation(abbreviation) {
  return dayOfWeekData.days.find((day) => { return day.abbreviation === abbreviation; });
};

function closeModals () {
  const modals = document.querySelectorAll('.modal');
  const underlay = document.querySelector('.underlay');

  modals.forEach((modal) => {
    modal.classList.add('hidden');
  });

  underlay.classList.add('hidden');
}