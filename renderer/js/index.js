const preferencesService = require("./services/preferencesService");

// Load preferences from main process at startup
preferencesService.load().catch((err) => {
  console.warn("Failed to load preferences:", err);
});

setTimeout(() => {
  const navigationService = require("./services/navigationService.js");
  navigationService.onHomeClicked();
}, 50);
