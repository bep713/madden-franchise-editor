const moment = require("moment");
const EventEmitter = require("events").EventEmitter;

const utilService = require("./utilService");
const recentFileService = require("./recentFileService");
const preferencesService = require("./preferencesService");

let welcomeService = {};
welcomeService.name = "welcomeService";
welcomeService.eventEmitter = new EventEmitter();

addGlobalIpcListeners();

welcomeService.start = function (file) {
  addTemporaryIpcListeners();
  addVersionNumber();
  addListeners();
  addRecentFiles();
  hideOpenedFileLinks();

  if (file.type) {
    showOpenedFileLinks();
    toggleNavigationLinks(file.type);
    toggleMaddenIcons(file.type.year);
  }
};

welcomeService.addRecentFile = async (filePath) => {
  await recentFileService.addFile(filePath);
  await refreshRecentFilesList();
};

welcomeService.onClose = function () {
  window.electronAPI.removeFileLoadedListener(onFileLoaded);
  window.electronAPI.removeCloseFileListener(onFileClosed);
};

welcomeService.openFileFromPath = (filePath) => {
  openFileFromPath(filePath);
};

module.exports = welcomeService;

async function addVersionNumber() {
  const version = document.querySelector(".version");
  const appVersion = await window.electronAPI.getVersion();
  version.innerHTML = `v${appVersion}`;
}

function addListeners() {
  addOpenFileListener();
  addOpenScheduleListener();
  addOpenTableEditorListener();
  addOpenSchemaViewerListener();
  addOpenAbilityEditorListener();
}

function addOpenFileListener() {
  const openFileButton = document.querySelector("#open-file");
  const openDifferentFileButton = document.querySelector(
    "#open-different-file",
  );

  if (openFileButton) {
    openFileButton.addEventListener("click", openFile);
  }
  if (openDifferentFileButton) {
    openDifferentFileButton.addEventListener("click", openFile);
  }
}

function addGlobalIpcListeners() {
  window.electronAPI.onReloadFile((filePath) => {
    openFileFromPath(filePath);
  });
}

function addTemporaryIpcListeners() {
  window.electronAPI.onFileLoaded(onFileLoaded);
  window.electronAPI.onCloseFile(onFileClosed);
}

function onFileLoaded(file) {
  if (!file || !file.type) return;
  toggleNavigationLinks(file.type);
  toggleMaddenIcons(file.type.year);
}

function onFileClosed() {
  hideOpenedFileLinks();
}

function toggleNavigationLinks(type) {
  const scheduleLink = document.querySelector("#open-schedule");
  const abilityLink = document.querySelector("#open-ability-editor");

  if (type.format === "franchise-common") {
    abilityLink.classList.add("unavailable");
    scheduleLink.classList.add("unavailable");
  } else if (type.year === 19) {
    abilityLink.classList.add("unavailable");
    scheduleLink.classList.remove("unavailable");
  } else if (
    type.year === 21 ||
    type.year === 22 ||
    type.year === 23 ||
    type.year === 24
  ) {
    abilityLink.classList.add("unavailable");
  } else {
    abilityLink.classList.remove("unavailable");
    scheduleLink.classList.remove("unavailable");
  }
}

function toggleMaddenIcons(year) {
  const iconsToDisable = document.querySelectorAll(
    '.madden-icon:not([data-year="' + year + '"])',
  );
  const iconToEnable = document.querySelector(
    '.madden-icon[data-year="' + year + '"]',
  );

  iconsToDisable.forEach((icon) => {
    icon.classList.add("inactive");
  });

  iconToEnable.classList.remove("inactive");
}

function addOpenScheduleListener() {
  const openScheduleButton = document.querySelector("#open-schedule");
  openScheduleButton.addEventListener("click", function () {
    welcomeService.eventEmitter.emit("open-schedule");
  });
}

function addOpenTableEditorListener() {
  const openTableEditor = document.querySelector("#open-table-editor");
  openTableEditor.addEventListener("click", function () {
    welcomeService.eventEmitter.emit("open-table-editor");
  });
}

function addOpenSchemaViewerListener() {
  const openTableEditor = document.querySelector("#open-schema-viewer");
  openTableEditor.addEventListener("click", function () {
    welcomeService.eventEmitter.emit("open-schema-viewer");
  });
}

function addOpenAbilityEditorListener() {
  const openAbilityEditor = document.querySelector("#open-ability-editor");
  openAbilityEditor.addEventListener("click", function () {
    welcomeService.eventEmitter.emit("open-ability-editor");
  });
}

async function addRecentFiles() {
  await recentFileService.initialize();
  await refreshRecentFilesList();
}

async function refreshRecentFilesList() {
  const recentFiles = await recentFileService.getRecentFiles();
  const recentFilesList = document.querySelector(".load-recent-file ul");
  const recentFilesPlaceholder = document.querySelector("#no-recent-files");

  if (recentFiles.length === 0) {
    utilService.show(recentFilesPlaceholder);
  } else {
    utilService.hide(recentFilesPlaceholder);

    document
      .querySelectorAll(".load-recent-file ul li:not(#no-recent-files")
      .forEach((item) => {
        item.parentNode.removeChild(item);
      });

    recentFiles.forEach((file) => {
      const fileName = file.path.substring(file.path.lastIndexOf("\\") + 1);
      const remainderOfPath = file.path.substring(
        0,
        file.path.lastIndexOf("\\"),
      );

      const filePathDiv = document.createElement("div");
      filePathDiv.classList.add("file-item");

      const fileNameSpan = document.createElement("span");
      fileNameSpan.classList.add("file-name", "link-item");
      fileNameSpan.innerHTML = fileName;
      fileNameSpan.addEventListener("click", function () {
        openFileFromPath(file.path);
      });

      const filePathSpan = document.createElement("span");
      filePathSpan.classList.add("file-path");
      filePathSpan.innerHTML = `(${remainderOfPath})`;

      const fileAccessTime = document.createElement("span");
      fileAccessTime.classList.add("file-access-time");
      fileAccessTime.innerHTML = moment(file.time).format("MM/DD/YYYY hh:mm A");

      filePathDiv.appendChild(fileNameSpan);
      filePathDiv.appendChild(filePathSpan);
      filePathDiv.appendChild(fileAccessTime);

      const item = document.createElement("li");
      item.appendChild(filePathDiv);

      recentFilesList.appendChild(item);
    });
  }
}

async function openFile() {
  const result = await window.electronAPI.showOpenDialog({
    title: "Select franchise file to open",
    defaultPath: preferencesService.getValue("general.defaultDirectory"),
    filters: [
      {
        name: "Franchise file",
        extensions: ["*"],
      },
    ],
  });

  const filePath = result.filePaths;
  if (filePath && filePath.length > 0) {
    openFileFromPath(filePath[0]);
  }
}

async function openFileFromPath(filePath) {
  const exists = await window.electronAPI.fs.exists(filePath);
  if (exists) {
    utilService.show(document.querySelector(".loader-wrapper"));

    setTimeout(async () => {
      welcomeService.eventEmitter.emit("open-file", filePath);
      await recentFileService.addFile(filePath);
      const editorToOpen = preferencesService.getValue("general.defaultEditor");
      if (editorToOpen && editorToOpen !== "open-home") {
        welcomeService.eventEmitter.emit(editorToOpen);
      } else {
        showOpenedFileLinks();
        setTimeout(() => {
          utilService.hide(document.querySelector(".loader-wrapper"));
        }, 50);
      }
    }, 50);
  } else {
    window.electronAPI.showMessageBox({
      type: "error",
      title: "File not found",
      message:
        "Could not find the selected file. You may have renamed or deleted it.",
    });
    await recentFileService.removeFile(filePath);
    await refreshRecentFilesList();
  }
}

function showOpenedFileLinks() {
  const openFileButton = document.querySelector("#open-file");
  if (openFileButton) {
    utilService.hide(openFileButton);
  }

  const openDifferentFileButton = document.querySelector(
    "#open-different-file",
  );
  if (openDifferentFileButton) {
    utilService.show(openDifferentFileButton);
  }

  const fileActions = document.querySelector(".file-actions");
  if (fileActions) {
    utilService.show(fileActions);
  }
}

function hideOpenedFileLinks() {
  const openFileButton = document.querySelector("#open-file");
  utilService.show(openFileButton);

  const openDifferentFileButton = document.querySelector(
    "#open-different-file",
  );
  utilService.hide(openDifferentFileButton);

  const fileActions = document.querySelector(".file-actions");
  utilService.hide(fileActions);
}
