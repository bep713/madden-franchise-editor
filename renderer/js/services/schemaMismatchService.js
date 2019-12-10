const EventEmitter = require('events').EventEmitter;
const HIDDEN_CLASS = 'hidden';
const BASE_CLASS = 'schema-mismatch';
const WRAPPER_HIDDEN_CLASS = 'notification-wrapper--hidden';

let schemaMismatchService = {};
schemaMismatchService.eventEmitter = new EventEmitter();

schemaMismatchService.initialize = (file) => {
  const schemaMismatch = document.querySelector(`.${BASE_CLASS}`);
  schemaMismatchService.reloadWrapper = schemaMismatch;
  schemaMismatch.classList.add(HIDDEN_CLASS);
  schemaMismatch.classList.add(WRAPPER_HIDDEN_CLASS);
  addEventListeners();
  addFileListeners(file);
};

schemaMismatchService.hide = () => {
  hideReloadWrapper();
};

module.exports = schemaMismatchService;

function addFileListeners(file) {
  if (file.isLoaded) {
    checkMismatch();
  }
  else {
    file.on('ready', function () {
      checkMismatch();
    });
  }

  function checkMismatch() {
    const expectedSchema = file.expectedSchemaVersion;
    const usedSchema = file.schemaList.meta;
    
    if (expectedSchema.major !== usedSchema.major || expectedSchema.minor !== usedSchema.minor || expectedSchema.gameYear !== usedSchema.gameYear) {
      if (!schemaMismatchService.reloadWrapper) { return }
      
      schemaMismatchService.eventEmitter.emit('schema-quick-search');

      schemaMismatchService.reloadWrapper.classList.remove(HIDDEN_CLASS);

      setTimeout(() => {
        schemaMismatchService.reloadWrapper.classList.remove(WRAPPER_HIDDEN_CLASS);
      }, 20);
    }
  };
};

function addEventListeners() {
  if (!schemaMismatchService.reloadWrapper) { return; }
  
  const primaryAction = schemaMismatchService.reloadWrapper.querySelector('.primary-button');
  primaryAction.addEventListener('click', function () {
    schemaMismatchService.eventEmitter.emit('navigate');
    hideReloadWrapper();
  });

  const dismissAction = schemaMismatchService.reloadWrapper.querySelector('.dismiss-action');
  dismissAction.addEventListener('click', function () {
    hideReloadWrapper();
  });
};

function hideReloadWrapper() {
  if (!schemaMismatchService.reloadWrapper) { return; }
  schemaMismatchService.reloadWrapper.classList.add(WRAPPER_HIDDEN_CLASS);

  setTimeout(() => {
    schemaMismatchService.reloadWrapper.classList.add(HIDDEN_CLASS);
  }, 300);
};