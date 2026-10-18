const Tab = require("./tabs/Tab");
const TableEditorTab = require("./tabs/TableEditorTab");

const Selectr = require("../libs/selectr/selectr");
const TestUtility = require("./test-utils/TestUtility");

const utilService = require("./utilService");
const menuService = require("./menuService.js");
const updateService = require("./updateService");
const welcomeService = require("./welcomeService");
const scheduleService = require("./scheduleService");
const reloadFileService = require("./reloadFileService");
const savedSchemaService = require("./savedSchemaService");
const schemaViewerService = require("./schemaViewerService");
const abilityEditorService = require("./abilityEditorService");
const schemaMismatchService = require("./schemaMismatchService");
const preferencesService = require("./preferencesService");
const perfService = require("./perfService");
const ftcModalService = require("./ftcModalService.js");

const TableEditorWrapper = require("./table-editor/TableEditorWrapper");
const tableEditorWrapper = new TableEditorWrapper();

const services = [
  welcomeService,
  scheduleService,
  tableEditorWrapper,
  schemaViewerService,
  abilityEditorService,
];
const navigationData = require("../../../data/navigation.json");

// These will be populated after app is ready
let PATH_TO_DOCUMENTS = null;
let MADDEN_SAVE_BASE_FOLDER = {};

async function initializePaths() {
  PATH_TO_DOCUMENTS = await window.electronAPI.getDocumentsPath();
}

initializePaths();

setupEvents();
attachServicesToNavigationData();
addIpcListeners();

reloadFileService.initialize();
updateService.initialize();
ftcModalService.initialize();

conditionallyShowCheckForUpdatesNotification();

let navigationService = {};
navigationService.currentlyOpenedFile = {
  path: null,
  fileId: null,
  metadata: null,
  gameYear: null,
  type: null,
};

navigationService.currentlyOpenService = null;
navigationService.tabs = [];
navigationService.lastWindowSize = {
  height: window.innerHeight,
  width: window.innerWidth,
};

navigationService.generateMainNavigationTabs = function () {
  navigationService.tabs = [];

  const metadata = navigationService.currentlyOpenedFile.metadata;
  if (!metadata) return;

  const applicableNavigationData = navigationData.items.filter((navigation) => {
    return (
      navigation.availableVersions.includes(metadata.gameYear) &&
      navigation.availableFormats.includes(metadata.format) &&
      (navigation.availableTypes?.includes(metadata.type.gameType) ?? true)
    );
  });

  applicableNavigationData.forEach((item) => {
    let tab = new Tab();
    tab.name = item.text;
    tab.customClassList = item.classList;
    tab.clickListenerFunction = item.clickListener;

    tab.isActive = false;
    tab.isClosable = false;
    tab.isMainNavigationItem = true;

    navigationService.tabs.push(tab);
  });

  // append new tab button
  let newTabButton = new Tab();
  newTabButton.name = "+";
  newTabButton.customClassList = ["add-tab-button"];
  newTabButton.isAddTabButton = true;
  newTabButton.clickListenerFunction = "onNewTabButtonClicked";
  newTabButton.isClosable = false;

  navigationService.tabs.push(newTabButton);
};

navigationService.addTab = function (name, clickListener) {
  let tab = new TableEditorTab();
  tab.name = name;
  tab.isClosable = true;
  tab.isMainNavigationItem = false;
  tab.clickListenerFunction = clickListener;

  navigationService.tabs.splice(navigationService.tabs.length - 1, 0, tab);
  return tab;
};

navigationService.getTabByName = function (name) {
  return navigationService.tabs.find((tab) => {
    return tab.name === name;
  });
};

navigationService.getActiveTab = function () {
  return navigationService.tabs.find((tab) => {
    return tab.isActive;
  });
};

navigationService.closeTab = function (tabToClose) {
  const tabIndexToDelete = navigationService.tabs.findIndex((tab) => {
    return tab === tabToClose;
  });
  navigationService.tabs.splice(tabIndexToDelete, 1);
};

navigationService.closeTabAndSelectNextAvailableIfNeeded = function (
  tabToClose,
) {
  const activeTab = navigationService.getActiveTab();
  const currentTabIndex = navigationService.tabs.findIndex((tab) => {
    return tab === tabToClose;
  });
  navigationService.closeTab(tabToClose);

  if (activeTab === tabToClose) {
    // if the user closed the active tab, select the next tab to the left.
    // otherwise, stay on the active tab.
    let nextTabToTheLeft = navigationService.tabs[currentTabIndex - 1];

    if (nextTabToTheLeft) {
      nextTabToTheLeft.isActive = true;
      navigationService[nextTabToTheLeft.clickListenerFunction]();
    }
  }
};

navigationService.selectTab = function (name) {
  let previouslyActiveTab = navigationService.getActiveTab();

  if (previouslyActiveTab) {
    previouslyActiveTab.isActive = false;
  }

  let tab = navigationService.tabs.find((tab) => {
    return tab.name === name;
  });

  if (tab) {
    tab.isActive = true;
  }
};

navigationService.scrollToTab = function (tabNode, options) {
  if (tabNode) {
    tabNode.scrollIntoViewIfNeeded(options);
  }
};

navigationService.scrollToActiveTab = function () {
  let targetNode = document.querySelector(".tab.active");
  const nextTabNode = document.querySelector(".tab.active + .tab");

  if (nextTabNode && nextTabNode.classList.contains("add-tab-button")) {
    // always keep the '+' button in view if user has last tab active
    targetNode = nextTabNode;
  }

  navigationService.scrollToTab(targetNode, { inline: "start" });
};

navigationService.scrollToTabOnRightOfActiveTab = function () {
  const targetTabDom = document.querySelector(".tab.active + .tab");
  navigationService.scrollToTab(targetTabDom, { inline: "end" });
};

navigationService.generateNavigation = function () {
  const element = document.querySelector(".tab-wrapper");
  const rightActionButtons = document.querySelector(".right-action-buttons");

  element.innerHTML = "";

  navigationService.tabs.forEach((tab) => {
    let navWrapper = document.createElement("div");
    navWrapper.innerHTML = tab.name;
    navWrapper.dataset.name = tab.name;
    navWrapper.classList.add("tab");

    if (tab.customClassList.length > 0) {
      navWrapper.classList.add(tab.customClassList);
    }

    if (tab.isClosable) {
      navWrapper.classList.add("closable");

      let closeTabButton = document.createElement("div");
      closeTabButton.classList.add("close-tab-button");

      closeTabButton.addEventListener("click", onCloseTab);
      navWrapper.addEventListener("auxclick", (event) => {
        if (event.button === 1) {
          onCloseTab(event);
        }
      });
      navWrapper.addEventListener("mousedown", (event) => {
        if (event.button === 1) {
          event.preventDefault();
        }
      });

      navWrapper.appendChild(closeTabButton);
    }

    if (tab.isActive) {
      navWrapper.classList.add("active");
    } else {
      navWrapper.addEventListener("click", () => {
        let previouslyActiveTab = navigationService.getActiveTab();

        if (previouslyActiveTab) {
          previouslyActiveTab.isActive = false;

          if (previouslyActiveTab instanceof TableEditorTab) {
            previouslyActiveTab.tableRow =
              tableEditorWrapper.lastSelectedCell.row;
            previouslyActiveTab.tableColumn =
              tableEditorWrapper.lastSelectedCell.column;
            previouslyActiveTab.tabHistory =
              tableEditorWrapper.selectedTableEditor.navSteps;
          }
        }

        tab.isActive = true;
        navigationService[tab.clickListenerFunction]();
      });
    }

    element.addEventListener("wheel", (evt) => {
      evt.preventDefault();
      element.scrollLeft += evt.deltaY;
    });

    element.appendChild(navWrapper);

    function onCloseTab(event) {
      event.stopPropagation();
      navigationService.closeTabAndSelectNextAvailableIfNeeded(tab);
      navigationService.generateNavigation();
    }
  });

  navigationService.scrollToActiveTab();

  // if (navigationService.currentlyOpenedFile) {
  //   const gameIcon = document.createElement('div');
  //   gameIcon.id = `m${navigationService.currentlyOpenedFile.gameYear}-icon`;
  //   gameIcon.className = 'madden-icon'

  //   rightActionButtons.appendChild(gameIcon);
  // }
};

navigationService.onNewTabButtonClicked = function () {
  let newTabButton = navigationService.getActiveTab();

  if (newTabButton) {
    newTabButton.isActive = false;
  }

  let newTab = navigationService.addTab("New Tab", "onNewTabClicked");
  newTab.isActive = true;

  navigationService.onNewTabClicked();
};

navigationService.onNewTabClicked = function () {
  const activeTab = navigationService.getActiveTab();

  if (activeTab.tableId >= 0) {
    tableEditorWrapper.initialTableToSelect = {
      tableId: activeTab.tableId,
      recordIndex: activeTab.tableRow,
      columnIndex: activeTab.tableColumn,
    };
  }

  navigationService.onTableEditorClicked();
};

navigationService.onHomeClicked = async function () {
  onNavigate(welcomeService);
  const navToken = currentNavToken;
  perfService.mark("renderer:welcome-html-requested");
  if (!(await navigationService.loadPage("welcome.html", navToken))) return;
  perfService.mark("renderer:welcome-visible");
  postGenerateNavigation();

  welcomeService.start(navigationService.currentlyOpenedFile);
};

navigationService.onScheduleEditorClicked = async function () {
  navigationService.selectTab("Schedule");
  onNavigate(scheduleService);
  const navToken = currentNavToken;
  if (!(await navigationService.loadPage("schedule.html", navToken))) return;
  appendNavigation();
  postGenerateNavigation();

  scheduleService.loadSchedule(navigationService.currentlyOpenedFile.fileId);
};

navigationService.onTableEditorClicked = async function () {
  // custom logic to find the table editor tab
  let placeholderTab = navigationService.tabs.find((tab) => {
    return tab.name === "Open Table...";
  });
  if (placeholderTab) {
    // The first call to this function will remove the placeholder tab
    // and replace with a table editor tab.
    navigationService.closeTab(placeholderTab);

    const newTabExists = navigationService.tabs.find(
      (tab) => tab.name === "New Tab",
    );

    if (!newTabExists) {
      let newTab = navigationService.addTab("New Tab", "onNewTabClicked");
      newTab.isActive = true;
    }
  } else {
    // check if a table editor tab is active
    let activeTab = navigationService.getActiveTab();

    if (!(activeTab instanceof TableEditorTab)) {
      let firstTableEditorTab = navigationService.tabs.find((tab) => {
        return tab instanceof TableEditorTab;
      });

      if (firstTableEditorTab) {
        activeTab.isActive = false;
        firstTableEditorTab.isActive = true;
        return navigationService.onNewTabClicked();
      } else {
        // there are no open table editor tabs
        let newTab = navigationService.addTab("New Tab", "onNewTabClicked");
        newTab.isActive = true;

        if (activeTab) {
          activeTab.isActive = false;
        }
      }
    }
  }

  onNavigate(tableEditorWrapper);
  const navToken = currentNavToken;
  if (!(await navigationService.loadPage("table-editor.html", navToken))) return;
  appendNavigation();
  postGenerateNavigation();

  // The tab's history has to be in place before the view loads its first
  // table, otherwise a slow start() lets that load push to a history that is
  // then overwritten. The last step is dropped because loading the tab's
  // table pushes it again.
  const activeTab = navigationService.getActiveTab();
  const tabHistory = activeTab?.tabHistory;
  tabHistory?.pop();

  await tableEditorWrapper.start(
    navigationService.currentlyOpenedFile.fileId,
    tabHistory,
  );
};

navigationService.onSchemaViewerClicked = async function () {
  navigationService.selectTab("Schemas");
  onNavigate(schemaViewerService);
  const navToken = currentNavToken;
  if (!(await navigationService.loadPage("schema-viewer.html", navToken)))
    return;
  appendNavigation();
  postGenerateNavigation();

  schemaViewerService.start(navigationService.currentlyOpenedFile.fileId);
};

navigationService.onLeagueEditorClicked = function () {
  navigationService.selectTab(leagueEditorService.name);
  onNavigate(leagueEditorService);
  navigationService.loadPage("league-editor.html");
  appendNavigation();
  postGenerateNavigation();

  // leagueEditorService.start(navigationService.currentlyOpenedFile.fileId);
};

navigationService.refreshCurrentPage = function () {
  navigationService[
    navigationService.currentlyOpenService.navigationData.clickListener
  ]();
};

// Returns false (without injecting the page) if a newer navigation has
// started since the given token was captured.
navigationService.loadPage = async function (pagePath, navToken) {
  const fullPath = `renderer/${pagePath}`;
  const page = await window.electronAPI.fs.readFile(fullPath);
  if (navToken !== undefined && navToken !== currentNavToken) {
    return false;
  }
  const content = document.querySelector("#content");
  content.innerHTML = page;
  return true;
};

navigationService.runCloseFunction = function () {
  if (
    navigationService.currentlyOpenService &&
    navigationService.currentlyOpenService.onClose
  ) {
    navigationService.currentlyOpenService.onClose();
  }
};

if (window.electronAPI?.isTest) {
  new TestUtility(welcomeService, tableEditorWrapper);
}

module.exports = navigationService;

// Incremented on every navigation so superseded navigations can bail out
let currentNavToken = 0;

function onNavigate(service) {
  currentNavToken++;
  navigationService.runCloseFunction();
  navigationService.currentlyOpenService = service;

  if (service.navigationData.menu) {
    menuService.enableMenuIds(service.navigationData.menu.enable);
    menuService.disableMenuIds(service.navigationData.menu.disable);
  }
}

function postGenerateNavigation() {}

function addIpcListeners() {
  window.electronAPI.on("show-check-for-update-notification", function () {
    console.log("show check for update notification");
  });

  window.electronAPI.on("save-file", async function () {
    const fileId = navigationService.currentlyOpenedFile.fileId;
    if (fileId) {
      await window.franchiseAPI.saveFile(fileId);
    }
  });

  window.electronAPI.on("save-file-sync", async function () {
    const fileId = navigationService.currentlyOpenedFile.fileId;
    if (fileId) {
      await window.franchiseAPI.saveFile(fileId, { sync: true });
    }
  });

  window.electronAPI.on("close-file", function () {
    navigationService.currentlyOpenedFile.path = null;
    navigationService.currentlyOpenedFile.fileId = null;
    navigationService.currentlyOpenedFile.metadata = null;
    navigationService.currentlyOpenedFile.gameYear = null;
    navigationService.currentlyOpenedFile.type = null;
    navigationService.onHomeClicked();

    window.electronAPI.send("close-file");
  });

  window.electronAPI.on("save-file-as", async function () {
    const result = await window.electronAPI.showSaveDialog({
      title: "Save as...",
      defaultPath: preferencesService.getValue("general.defaultDirectory"),
    });

    const savePath = result.filePath;
    if (savePath) {
      const fileId = navigationService.currentlyOpenedFile.fileId;
      await window.franchiseAPI.saveFileAs(fileId, savePath);
    }
  });

  window.electronAPI.on("save-new-file", async function () {
    const result = await window.electronAPI.showSaveDialog({
      title: "Save as...",
      defaultPath: preferencesService.getValue("general.defaultDirectory"),
    });

    const savePath = result.filePath;
    if (savePath) {
      const fileId = navigationService.currentlyOpenedFile.fileId;
      await window.franchiseAPI.saveFileAsAndOpen(fileId, savePath);

      navigationService.currentlyOpenedFile.path = savePath;
      window.electronAPI.send("file-loaded", {
        path: savePath,
        type: navigationService.currentlyOpenedFile.type,
        fileId: fileId,
      });

      welcomeService.addRecentFile(savePath);
    }
  });

  window.electronAPI.on("load-schema", async function (args) {
    if (!navigationService.currentlyOpenedFile.path) {
      window.electronAPI.send("load-schema-done", {
        status: "error",
        error: "No franchise file is open.",
      });
      return;
    }
    utilService.show(document.querySelector(".loader-wrapper"));

    try {
      const fileId = navigationService.currentlyOpenedFile.fileId;
      const result = await window.franchiseAPI.loadSchema(
        fileId,
        args.path,
        args.saveSchema,
      );

      if (result.error) {
        window.electronAPI.send("load-schema-done", {
          status: "error",
          error: result.error,
        });
      } else {
        navigationService.currentlyOpenedFile.metadata = result.metadata;
        navigationService.currentlyOpenedFile.gameYear =
          result.metadata.gameYear;
        navigationService.currentlyOpenedFile.type = result.metadata.type;

        navigationService.refreshCurrentPage();
        navigationService.generateMainNavigationTabs();

        utilService.hide(document.querySelector(".loader-wrapper"));

        window.electronAPI.send("load-schema-done", {
          status: "successful",
        });
      }
    } catch (err) {
      window.electronAPI.send("load-schema-done", {
        status: "error",
        error: err.message,
      });
      utilService.hide(document.querySelector(".loader-wrapper"));
    }
  });

  window.electronAPI.on("get-schema-info-request", function (arg) {
    if (navigationService.currentlyOpenedFile.metadata) {
      window.electronAPI.send("get-schema-info-response", {
        activeFileMetadata: {
          gameYear: navigationService.currentlyOpenedFile.gameYear,
          type: navigationService.currentlyOpenedFile.type,
        },
        autoSelect: arg,
        expected:
          navigationService.currentlyOpenedFile.metadata.expectedSchemaVersion,
        loaded: navigationService.currentlyOpenedFile.metadata.schemaList?.meta,
      });
    }
  });

  window.electronAPI.on("currently-searching-response", function (arg) {
    if (!arg) {
      schemaMismatchService.initialize(
        navigationService.currentlyOpenedFile.fileId,
      );
      schemaMismatchService.eventEmitter.on("navigate", function () {
        navigationService.onSchemaViewerClicked();
      });
    }
  });
}

function setupEvents() {
  welcomeService.eventEmitter.on("open-file", async function (file) {
    navigationService.currentlyOpenedFile.path = file;

    try {
      const initialMetadata =
        await window.franchiseAPI.getMetadataFromFilePath(file);

      const openOptions = {
        schemaDirectory: savedSchemaService.getSchemaPath(),
      };

      if (initialMetadata.format === "franchise-common") {
        const selectedOverrides = await ftcModalService.promptForFtcOverrides();
        if (selectedOverrides) {
          openOptions.gameYearOverride = selectedOverrides.gameYear;
          openOptions.gameTypeOverride = selectedOverrides.gameType;
        }
      }

      const result = await window.franchiseAPI.openFile(file, openOptions);

      if (result.error) {
        // Schema not found, prompt user to pick one
        await window.electronAPI.showMessageBox({
          message:
            "The selected file does not contain schema data. Please select one on the following screen.",
        });
        showSchemaManager();
        utilService.hide(document.querySelector(".loader-wrapper"));
        return;
      }

      const { fileId, metadata } = result;

      navigationService.currentlyOpenedFile.fileId = fileId;
      navigationService.currentlyOpenedFile.metadata = metadata;

      // assume m22 if no game year is set
      if (!metadata.gameYear) {
        metadata.gameYear = 22;
      }
      if (!metadata.type?.year) {
        metadata.type = metadata.type || {};
        metadata.type.year = 22;
      }

      navigationService.currentlyOpenedFile.gameYear = metadata.gameYear;
      navigationService.currentlyOpenedFile.type = metadata.type;

      tableEditorWrapper.initialTableToSelect = null; // reset table to select on new file
      navigationService.generateMainNavigationTabs();

      window.electronAPI.send("file-loaded", {
        path: navigationService.currentlyOpenedFile.path,
        type: navigationService.currentlyOpenedFile.type,
        fileId: fileId,
      });

      window.electronAPI.send("is-currently-searching");

      // Set up event listeners for saving/saved
      window.franchiseAPI.onFileSaving(function () {
        window.electronAPI.send("saving");
        reloadFileService.hide();
      });

      window.franchiseAPI.onFileSaved(function () {
        window.electronAPI.send("saved");
      });

      const editorToOpen = preferencesService.getValue("general.defaultEditor");
      if (editorToOpen && editorToOpen !== "open-home") {
        welcomeService.eventEmitter.emit(editorToOpen);
      } else if (navigationService.currentlyOpenService) {
        navigationService.refreshCurrentPage();
      }
    } catch (err) {
      console.error("Error opening file:", err);
    } finally {
      utilService.hide(document.querySelector(".loader-wrapper"));
    }
  });

  welcomeService.eventEmitter.on("open-schedule", function () {
    navigationService.onScheduleEditorClicked();
  });

  welcomeService.eventEmitter.on("open-table-editor", function () {
    navigationService.onTableEditorClicked();
  });

  welcomeService.eventEmitter.on("open-schema-viewer", function () {
    navigationService.onSchemaViewerClicked();
  });

  scheduleService.eventEmitter.on(
    "open-table-editor",
    function (tableId, index) {
      tableEditorWrapper.initialTableToSelect = {
        tableId: tableId,
        recordIndex: index,
        columnIndex: 0,
      };

      navigationService.runCloseFunction();

      let scheduleTab = navigationService.getTabByName("Schedule");
      scheduleTab.isActive = false;

      // check if placeholder tab exists
      const placeholderTab = navigationService.getTabByName("Open Table...");
      if (placeholderTab) {
        navigationService.onTableEditorClicked();
      } else {
        navigationService.onNewTabButtonClicked();
      }
    },
  );

  schemaViewerService.eventEmitter.on("change-schema", function () {
    showSchemaManager();
  });

  tableEditorWrapper.eventEmitter.on("table-changed", (data) => {
    let tab = navigationService.getActiveTab();
    tab.name = `${data.tableId} - ${data.name}`;
    tab.tableId = data.tableId;

    navigationService.generateNavigation();
  });

  tableEditorWrapper.eventEmitter.on("table-editor:new-tab", () => {
    const previouslyActiveTab = navigationService.getActiveTab();

    if (previouslyActiveTab instanceof TableEditorTab) {
      previouslyActiveTab.tableColumn =
        tableEditorWrapper.lastSelectedCell.column;
      previouslyActiveTab.tableRow = tableEditorWrapper.lastSelectedCell.row;
      previouslyActiveTab.tabHistory =
        tableEditorWrapper.selectedTableEditor.navSteps;
    }

    navigationService.onNewTabButtonClicked();
  });

  window.addEventListener("resize", () => {
    let isGrowing = false;

    if (window.innerWidth > navigationService.lastWindowSize.width) {
      isGrowing = true;
    }

    navigationService.lastWindowSize = {
      height: window.innerHeight,
      width: window.innerWidth,
    };

    let tabWrapper = document.querySelector(".tab-wrapper");

    if (tabWrapper && !tabWrapper.classList.contains("show-scrollbar")) {
      tabWrapper.classList.add("show-scrollbar");

      setTimeout(() => {
        tabWrapper.classList.remove("show-scrollbar");
      }, 400);
    }

    if (isGrowing) {
      navigationService.scrollToTabOnRightOfActiveTab();
    } else {
      navigationService.scrollToActiveTab();
    }
  });
}

function showSchemaManager() {
  const metadata = navigationService.currentlyOpenedFile.metadata;
  if (!metadata) return;

  window.electronAPI.send("show-schema-manager", {
    activeFileMetadata: {
      gameYear: metadata.gameYear,
      type: metadata.type,
    },
    expected: metadata.expectedSchemaVersion,
    loaded: metadata.schemaList?.meta ?? null,
  });
}

function attachServicesToNavigationData() {
  services.forEach((service) => {
    service.navigationData = navigationData.items.find((nav) => {
      return nav.service === service.name;
    });
  });
}

function appendNavigation() {
  navigationService.generateNavigation();
}

function conditionallyShowCheckForUpdatesNotification() {
  perfService.mark("renderer:update-prompt-check", {
    prefsLoaded: preferencesService.get() != null,
  });
  const checkForUpdates = preferencesService.getValue(
    "general.checkForUpdates",
  );
  if (checkForUpdates === undefined || checkForUpdates === null) {
    updateService.showCheckForUpdatesNotification();
  }
}
