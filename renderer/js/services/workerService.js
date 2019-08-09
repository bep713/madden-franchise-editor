const { ipcRenderer, remote, shell } = require('electron');
const dialog = remote.dialog;
const app = remote.app;

const externalDataService = require('./externalDataService');

let workerService = {};

workerService.start = function () {
  
};

module.exports = workerService;