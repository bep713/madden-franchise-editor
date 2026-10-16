const settingsManagerUtil = require("./settingsManagerUtil");

let gameVersionsService = {};

gameVersionsService.initialize = function ({ onBack, onContinue }) {
  settingsManagerUtil.createFields({
    category: "gameVersions",
    onBack,
    onContinue,
  });
};

gameVersionsService.id = "gameDirectories";

module.exports = gameVersionsService;
