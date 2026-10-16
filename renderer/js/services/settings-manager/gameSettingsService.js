const settingsManagerUtil = require("./settingsManagerUtil");

let gameSettingsService = {};

gameSettingsService.initialize = function ({ onBack, onContinue }) {
  settingsManagerUtil.createFields({
    category: "general",
    onBack,
    onContinue,
  });
};

gameSettingsService.id = "gameSettings";

module.exports = gameSettingsService;
