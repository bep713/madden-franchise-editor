const perfService = require("./services/perfService");
perfService.mark("renderer:bundle-start");
const preferencesService = require("./services/preferencesService");

// Load preferences from main process at startup
preferencesService
  .load()
  .then((prefs) => {
    perfService.mark("renderer:prefs-loaded");
    return prefs;
  })
  .catch((err) => {
    console.warn("Failed to load preferences:", err);
  });

setTimeout(() => {
  perfService.mark("renderer:editors-load-start");
  const navigationService = require("./services/navigationService.js");
  perfService.mark("renderer:editors-load-end");
  navigationService.onHomeClicked();
}, 50);
