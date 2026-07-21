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

initializeSettingsManagerAsync();

async function initializeSettingsManagerAsync() {
  preferences = await preferencesService.getAll();

  // Guard against undefined/null preferences from IPC
  if (!preferences || typeof preferences !== "object") {
    preferences = preferencesService.getPreferenceKeys();
  }

  await initializeSettingsManager(preferences);
  addIpcListeners();

  const pagesToShow = getPagesToShow(preferences);

  if (pagesToShow.length > 0) {
    // Window visibility is now managed via IPC
    setTimeout(() => {
      showPages(pagesToShow);
    }, 1000);
  } else {
    window.electronAPI.preferences.hideWindow();
  }
}

function addIpcListeners() {
  ipcRenderer.on("show-release-notes-dialog", () => {
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

  ipcRenderer.on("show-settings-dialog", () => {
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
    currentService.initialize();

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

    backButton.addEventListener("click", () => {
      loadPageAtMetaIndex(index - 1);
    });

    continueButton.addEventListener("click", () => {
      loadPageAtMetaIndex(index + 1);
    });
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
  setMissingKeys(preferencesSchema, preferences);
  await preferencesService.setAll(preferences);
}

function setMissingKeys(schema, objectToCheck) {
  for (let category in schema) {
    if (
      objectToCheck[category] === null ||
      objectToCheck[category] === undefined
    ) {
      objectToCheck[category] = schema[category];
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
        setMissingKeys(schema[category], currentValue);
      }
    }
  }
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
