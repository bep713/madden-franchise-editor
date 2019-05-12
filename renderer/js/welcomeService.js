const { remote } = require('electron');
const app = remote.app;
const dialog = remote.dialog;
const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

const FranchiseFile = require('./FranchiseFile.js');
const FranchiseSchedule = require('./FranchiseSchedule.js');
const FranchiseGame = require('./FranchiseGame.js');
const scheduleService = require('./scheduleService.js');
const menuService = require('./menuService.js');

const pathToDocuments = app.getPath('documents');
const MADDEN_SAVE_BASE_FOLDER = `${pathToDocuments}\\Madden NFL 19\\settings`;

let welcomeService = {};

welcomeService.start = function () {
  addIpcListeners();
  setupMenu();
  loadWelcome();
  addListeners();
  // DEV_skipToSchedule();
};

module.exports = welcomeService;

function DEV_skipToSchedule() {
  loadScheduleView();
  scheduleService.loadSchedule(MADDEN_SAVE_BASE_FOLDER + '\\2019\\2019.frt');
};

function addIpcListeners() {
  ipcRenderer.on('close-file', function () {
    if (scheduleService.isLoaded()) {
      welcomeService.start();
      scheduleService.closeFile();
    }

    ipcRenderer.send('close-file');
  });
};

function setupMenu() {
  menuService.initializeMenu();  
};

function addListeners() {
  addOpenFileListener();
};

function addOpenFileListener() {
  const openFileButton = document.querySelector('#open-file');

  openFileButton.addEventListener('click', function () {
    const filePath = dialog.showOpenDialog({
      title: 'Select franchise file to open',
      defaultPath: MADDEN_SAVE_BASE_FOLDER,
      filters: [{
        name: 'Franchise file',
        extensions: ['*']
      }]
    });

    if (filePath) {
      ipcRenderer.send('load-file', filePath);
      loadScheduleView();
      scheduleService.loadSchedule(filePath[0]);
    }
  });
};

function loadWelcome() {
  loadPage('welcome.html');
};

function loadScheduleView() {
  loadPage('schedule.html');
};

function loadPage(pagePath) {
  const page = fs.readFileSync(path.join(__dirname, '..\\', pagePath));
  const content = document.querySelector('#content');
  content.innerHTML = page;
};