const path = require("path");
const electron = require("electron");
const ipcRenderer = electron.ipcRenderer;

const preferencesService = require("./services/preferencesService");

// Static imports for settings manager services (required for browserify bundling)
const appVersionsService = require("./services/settings-manager/appVersionsService");
const gameSettingsService = require("./services/settings-manager/gameSettingsService");
const gameVersionsService = require("./services/settings-manager/gameVersionsService");

// Map service IDs to their modules for runtime lookup
const serviceRegistry = {
  appVersions: appVersionsService,
  general: gameSettingsService,
  gameVersions: gameVersionsService,
};

const pageData = require("../../data/settingsManagerData.json");

let preferences;
// Set when main asks for a page flow (menu items). Such a request owns the
// window, so the startup flow must neither hide it nor start a second flow.
let showRequested = false;

// This window is created on demand and main sends its event as soon as the
// page loads, so the listeners must exist before the first await.
addIpcListeners();
const initialized = initializeSettingsManagerAsync();

async function initializeSettingsManagerAsync() {
  preferences = await preferencesService.getAll();

  // Guard against undefined/null preferences from IPC
  if (!preferences || typeof preferences !== "object") {
    preferences = preferencesService.getPreferenceKeys();
  }

  await initializeSettingsManager(preferences);

  if (showRequested) {
    return;
  }

  const pagesToShow = getPagesToShow(preferences);

  if (pagesToShow.length > 0) {
    // Window visibility is now managed via IPC
    setTimeout(() => {
      if (!showRequested) showPages(pagesToShow);
    }, 1000);
  }
  // Otherwise nothing to show. Main only creates this window at startup when
  // pages are pending, or when a menu item asks for it (showRequested), so it
  // must not be hidden here: that would race with the requested flow.
}

function addIpcListeners() {
  ipcRenderer.on("show-release-notes-dialog", async () => {
    showRequested = true;
    await initialized;
    let pagesToShow = [];

    for (let page in preferences.settingsManager) {
      pagesToShow.push(page);
    }

    pagesToShow = pagesToShow
      .map((page) => {
        return pageData.items.find((data) => {
          return data.id === page;
        });
      })
      .sort((a, b) => {
        return a.order - b.order;
      });

    showPages(pagesToShow);
  });

  ipcRenderer.on("show-settings-dialog", async () => {
    showRequested = true;
    await initialized;
    let pagesToShow = [];

    for (let page in preferences.settingsManager) {
      if (page === "appVersions") break;
      pagesToShow.push(page);
    }

    pagesToShow = pagesToShow
      .map((page) => {
        return pageData.items.find((data) => {
          return data.id === page;
        });
      })
      .sort((a, b) => {
        return a.order - b.order;
      });

    showPages(pagesToShow);
  });
}

function showPages(pages) {
  let currentIndex = 0;
  const services = loadServices(pages);

  loadPageAtMetaIndex(currentIndex);

  async function loadPageAtMetaIndex(index) {
    const currentPage = pages[index];

    if (!currentPage) {
      setAllSettingsAsShown();
      window.electronAPI.preferences.hideWindow();
      return;
    }

    const currentService = services[index];

    await loadPage(currentPage);

    currentService.initialize({
      onBack: function () {
        loadPageAtMetaIndex(index - 1);
      },
      onContinue: function () {
        loadPageAtMetaIndex(index + 1);
      },
    });

    const backButton = document.querySelector(currentPage.backButtonSelector);
    const continueButton = document.querySelector(
      currentPage.continueButtonSelector,
    );

    if (index === 0) {
      backButton.classList.add("hidden");
    }

    if (index + 1 === pages.length) {
      if (currentPage.id === "appVersions") {
        continueButton.innerHTML = "Close";
      } else {
        continueButton.innerHTML = continueButton.innerHTML
          .replace("continue", "close")
          .replace("Continue", "Close");
      }
    }
  }

  function loadServices(pages) {
    return pages.map((page) => {
      return serviceRegistry[page.id];
    });
  }
}

async function loadPage(page) {
  const pageContent = await window.electronAPI.fs.readFile(page.page);
  const content = document.querySelector("#settings-content");
  content.innerHTML = pageContent;
}

async function initializeSettingsManager(preferences) {
  const preferencesSchema = preferencesService.getPreferenceKeys();
  // Main already fills missing keys, so this normally changes nothing and
  // skips the write.
  if (setMissingKeys(preferencesSchema, preferences)) {
    await preferencesService.setAll(preferences);
  }
}

// Returns true if any key was filled in.
function setMissingKeys(schema, objectToCheck) {
  let changed = false;

  for (let category in schema) {
    if (
      objectToCheck[category] === null ||
      objectToCheck[category] === undefined
    ) {
      // A null default over a stored null is not a fill.
      if (objectToCheck[category] === null && schema[category] === null) {
        continue;
      }
      objectToCheck[category] = schema[category];
      changed = true;
    } else {
      const nextLevelDown = schema[category];
      const currentValue = objectToCheck[category];

      if (
        typeof nextLevelDown === "object" &&
        !Array.isArray(nextLevelDown) &&
        currentValue !== null &&
        currentValue !== undefined &&
        typeof currentValue === "object"
      ) {
        if (setMissingKeys(schema[category], currentValue)) {
          changed = true;
        }
      }
    }
  }

  return changed;
}

function getPagesToShow(preferences) {
  let pagesToShow = [];

  for (let page in preferences.settingsManager) {
    if (checkPage(preferences.settingsManager[page])) {
      pagesToShow.push(page);
    }
  }

  return pagesToShow
    .map((page) => {
      return pageData.items.find((data) => {
        return data.id === page;
      });
    })
    .sort((a, b) => {
      return a.order - b.order;
    });

  function checkPage(page) {
    for (let key in page) {
      if (!page[key]) {
        return true;
      }
    }

    return false;
  }
}

async function setAllSettingsAsShown() {
  const preferences = await preferencesService.getAll();

  for (let page in preferences.settingsManager) {
    for (let key in preferences.settingsManager[page]) {
      preferences.settingsManager[page][key] = true;
    }
  }

  await preferencesService.setAll(preferences);
}
