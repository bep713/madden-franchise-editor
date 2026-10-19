const EventEmitter = require("events").EventEmitter;

const utilService = require("./utilService");
const recentFileService = require("./recentFileService");
const preferencesService = require("./preferencesService");
const perfService = require("./perfService");

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
    toggleGameIcons(file.type);
  }
  perfService.mark("renderer:welcome-interactive");
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

// Same output as moment(time).format("MM/DD/YYYY hh:mm A")
function formatAccessTime(time) {
  const date = new Date(time);
  if (isNaN(date.getTime())) return "Invalid date";

  const pad = (n) => String(n).padStart(2, "0");
  const hours = date.getHours();
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()} ${pad(hours % 12 || 12)}:${pad(date.getMinutes())} ${hours < 12 ? "AM" : "PM"}`;
}

function addListeners() {
  addOpenFileListener();
  addOpenScheduleListener();
  addOpenTableEditorListener();
  addOpenSchemaViewerListener();
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
  toggleGameIcons(file.type);
}

function onFileClosed() {
  hideOpenedFileLinks();
}

function toggleNavigationLinks(type) {
  const scheduleLink = document.querySelector("#open-schedule");

  if (type.format === "franchise-common") {
    scheduleLink.classList.add("unavailable");
  } else if (type.year === 19) {
    scheduleLink.classList.remove("unavailable");
  } else if (
    type.year === 21 ||
    type.year === 22 ||
    type.year === 23 ||
    type.year === 24 ||
    type.year === 25 ||
    type.year === 26 ||
    type.year === 27
  ) {
    // Disable schedule editor for CFB
    if (type.gameType === "college") {
      scheduleLink.classList.add("unavailable");
    }
  } else {
    scheduleLink.classList.remove("unavailable");
  }
}

function toggleGameIcons(type) {
  const { year, gameType } = type;

  toggleMaddenIcons(year, gameType);
  toggleCfbIcons(year, gameType);
}

function toggleMaddenIcons(year, gameType) {
  const maddenIcons = document.querySelectorAll(".madden-icon");

  if (gameType === "college") {
    maddenIcons.forEach((icon) => {
      icon.classList.add("inactive");
    });

    return;
  }

  const iconsToDisable = document.querySelectorAll(
    '.madden-icon:not([data-year="' + year + '"])',
  );
  const iconToEnable = document.querySelector(
    '.madden-icon[data-year="' + year + '"]',
  );

  iconsToDisable.forEach((icon) => {
    icon.classList.add("inactive");
  });

  if (iconToEnable) {
    iconToEnable.classList.remove("inactive");
  }
}

function toggleCfbIcons(year, gameType) {
  const cfbIcons = document.querySelectorAll(".cfb-icon");

  cfbIcons.forEach((icon) => {
    icon.classList.add("inactive");
  });

  if (gameType !== "college") {
    return;
  }

  const iconToEnable = document.querySelector(
    '.cfb-icon[data-year="' + year + '"]',
  );

  if (iconToEnable) {
    iconToEnable.classList.remove("inactive");
  }
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

async function addRecentFiles() {
  await recentFileService.initialize();
  await refreshRecentFilesList();
  perfService.mark("renderer:recent-files-rendered");
  await perfService.report();
  startPerfOpen();
}

// File-open profiling (MFE_PERF_OPEN): open the file once the startup report is out,
// optionally a second time (warm), then send the open marks.
let perfOpenStarted = false;
function startPerfOpen() {
  // the welcome page (and so addRecentFiles) runs again whenever home is reloaded
  if (!perfService.openPath || perfOpenStarted) return;
  perfOpenStarted = true;
  let opens = 0;
  const total = perfService.openWarm ? 2 : 1;
  perfService.onOpenInteractive(() => {
    opens++;
    if (opens < total) {
      openFileFromPath(perfService.openPath);
    } else {
      perfService.reportOpen();
    }
  });
  openFileFromPath(perfService.openPath);
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
      fileAccessTime.innerHTML = formatAccessTime(file.time);

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
  perfService.openRequested();
  const exists = await window.electronAPI.fs.exists(filePath);
  if (exists) {
    utilService.show(document.querySelector(".loader-wrapper"));
    perfService.mark("open:loader-shown");

    setTimeout(async () => {
      welcomeService.eventEmitter.emit("open-file", filePath);
      await recentFileService.addFile(filePath);
      // Non-home default editors are opened by navigationService once the file is open
      const editorToOpen = preferencesService.getValue("general.defaultEditor");
      if (!editorToOpen || editorToOpen === "open-home") {
        showOpenedFileLinks();
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
