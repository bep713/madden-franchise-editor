const { remote } = require('electron');
const app = remote.app;

let appVersionsService = {};

appVersionsService.initialize = function () {
    const version = app.getVersion();
    document.querySelector('.version').innerHTML = `v${version}`;
};

appVersionsService.id = 'appVersions';

module.exports = appVersionsService;