const EventEmitter = require("events").EventEmitter;
const HIDDEN_CLASS = "hidden";
const BASE_CLASS = "schema-mismatch";
const WRAPPER_HIDDEN_CLASS = "notification-wrapper--hidden";

let schemaMismatchService = {};
schemaMismatchService.eventEmitter = new EventEmitter();

schemaMismatchService.initialize = async (fileId) => {
  const schemaMismatch = document.querySelector(`.${BASE_CLASS}`);
  schemaMismatchService.reloadWrapper = schemaMismatch;
  schemaMismatch.classList.add(HIDDEN_CLASS);
  schemaMismatch.classList.add(WRAPPER_HIDDEN_CLASS);
  addEventListeners();
  await checkMismatch(fileId);
};

schemaMismatchService.hide = () => {
  hideReloadWrapper();
};

module.exports = schemaMismatchService;

async function checkMismatch(fileId) {
  try {
    const result = await window.franchiseAPI.schemaMismatch.check(fileId);

    if (result.hasMismatch) {
      if (!schemaMismatchService.reloadWrapper) {
        return;
      }

      schemaMismatchService.reloadWrapper.classList.remove(HIDDEN_CLASS);

      setTimeout(() => {
        schemaMismatchService.reloadWrapper.classList.remove(
          WRAPPER_HIDDEN_CLASS,
        );
      }, 20);
    }
  } catch (error) {
    console.error("Failed to check schema mismatch:", error);
  }
}

function addEventListeners() {
  if (!schemaMismatchService.reloadWrapper) {
    return;
  }

  const primaryAction =
    schemaMismatchService.reloadWrapper.querySelector(".primary-button");
  primaryAction.addEventListener("click", function () {
    schemaMismatchService.eventEmitter.emit("navigate");
    hideReloadWrapper();
  });

  const dismissAction =
    schemaMismatchService.reloadWrapper.querySelector(".dismiss-action");
  dismissAction.addEventListener("click", function () {
    hideReloadWrapper();
  });
}

function hideReloadWrapper() {
  if (!schemaMismatchService.reloadWrapper) {
    return;
  }
  schemaMismatchService.reloadWrapper.classList.add(WRAPPER_HIDDEN_CLASS);

  setTimeout(() => {
    schemaMismatchService.reloadWrapper.classList.add(HIDDEN_CLASS);
  }, 300);
}
