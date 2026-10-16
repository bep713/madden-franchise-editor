let appVersionsService = {};

appVersionsService.initialize = async function ({ onBack, onContinue } = {}) {
  const version = await window.electronAPI.getVersion();
  const versionElement = document.querySelector(".version");
  if (versionElement) {
    versionElement.innerHTML = `v${version}`;
  }

  const continueButton = document.querySelector(".continue-btn");
  if (continueButton && onContinue) {
    continueButton.addEventListener("click", () => onContinue());
  }

  const backButton = document.querySelector(".back-btn");
  if (backButton && onBack) {
    backButton.addEventListener("click", () => onBack());
  }
};

appVersionsService.id = "appVersions";

module.exports = appVersionsService;
