const { ipcRenderer } = require('electron');
const FranchiseSchema = require('../franchise/FranchiseSchema');

let workerService = {};

workerService.start = function () {
  ipcRenderer.on('read-schema', function (path) {
    const schema = new FranchiseSchema();

    schema.on('done', function () {
      ipcRenderer.send('read-schema-done', schema);
    });
  });
};

module.exports = workerService;