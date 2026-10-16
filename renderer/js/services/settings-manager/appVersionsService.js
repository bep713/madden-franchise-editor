let appVersionsService = {};

appVersionsService.initialize = async function () {
  const version = await window.electronAPI.getVersion();
  const versionElement = document.querySelector(".version");
  if (versionElement) {
    versionElement.innerHTML = `v${version}`;
  }
};

appVersionsService.id = "appVersions";

module.exports = appVersionsService;
