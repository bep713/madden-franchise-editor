const utilService = require("./services/utilService");
const savedSchemaService = require("./services/savedSchemaService");
const schemaSearchService = require("./services/schemaSearchService");
const preferencesService = require("./services/preferencesService");

let schemaInformation;
let isCurrentlySearching = false;

setupListeners();
setupIpcListeners();
setupSchemaService().then(async () => {
  await parseAvailableSchemas();
});

function setupListeners() {
  const addSchema = document.querySelector("#add-schema");
  addSchema.addEventListener("click", async () => {
    const result = await window.electronAPI.showOpenDialog({
      title: "Open custom schema file...",
      defaultPath: preferencesService.getValue("general.defaultDirectory"),
      filters: [
        {
          name: "Franchise schema",
          extensions: ["gz", "xml", "ftx"],
        },
      ],
    });

    const customSchemaFile = result.filePaths;
    if (customSchemaFile && customSchemaFile.length > 0) {
      utilService.show(document.querySelector(".loader-wrapper"));

      setTimeout(() => {
        window.electronAPI.send("load-schema", {
          path: customSchemaFile[0],
          saveSchema: true,
        });
      }, 20);
    }
  });

  const searchSchemas = document.querySelector("#search-for-schemas-full");
  searchSchemas.addEventListener("click", async () => {
    const result = await window.electronAPI.showOpenDialog({
      title: "Select Madden Executable",
      defaultPath: preferencesService.getValue(
        "gameVersions.madden20Directory",
      ),
      properties: ["openFile"],
      filters: [
        {
          name: "Game executable",
          extensions: ["exe"],
        },
      ],
    });

    const maddenInstallDirectory = result.filePaths;
    if (maddenInstallDirectory && maddenInstallDirectory.length > 0) {
      utilService.show(document.querySelector(".loader-wrapper"));

      setTimeout(() => {
        console.time("search");
        schemaSearchService
          .getScanDirectories(maddenInstallDirectory[0], "full")
          .then((dirs) => {
            saveSchemas(dirs);
          })
          .catch((err) => {
            console.error("Failed to get scan directories:", err);
            utilService.hide(document.querySelector(".loader-wrapper"));
          });
      }, 20);
    }
  });

  const searchSchemasQuick = document.querySelector(
    "#search-for-schemas-quick",
  );
  searchSchemasQuick.addEventListener("click", async () => {
    const result = await window.electronAPI.showOpenDialog({
      title: "Select Madden Executable",
      properties: ["openFile"],
      filters: [
        {
          name: "Game executable",
          extensions: ["exe"],
        },
      ],
    });

    const maddenInstallDirectory = result.filePaths;
    if (maddenInstallDirectory && maddenInstallDirectory.length > 0) {
      quickSchemaScan(maddenInstallDirectory[0]);
    }
  });
}

function saveSchemas(directoriesToSearch) {
  let filesDone = 0;
  let filesToSearch = 0;
  updateProgressMessage(0);
  isCurrentlySearching = true;

  schemaSearchService
    .search(directoriesToSearch)
    .then(async (schemas) => {
      for (const schema of schemas) {
        const exists = await savedSchemaService.schemaExists(schema.meta);
        if (!exists) {
          await savedSchemaService.saveSchemaData(schema.data, schema.meta);
        }
      }

      await parseAvailableSchemas(true);
      schemaSearchService.eventEmitter.off("file-done", updateLoadingMessage);
      console.timeEnd("search");
      utilService.hide(document.querySelector(".loader-wrapper"));
      isCurrentlySearching = false;
    })
    .catch(() => {
      isCurrentlySearching = false;
      utilService.hide(document.querySelector(".loader-wrapper"));
    });

  schemaSearchService.eventEmitter.on("directory-scan", (numFiles) => {
    filesToSearch += numFiles.fileCount;
    updateLoadingMessage();
    filesDone -= 1;
  });

  schemaSearchService.eventEmitter.on("file-done", updateLoadingMessage);

  function updateLoadingMessage(data) {
    filesDone += 1;
    const progress = (filesDone / filesToSearch) * 100;
    updateProgressMessage(progress);
  }
}

function quickSchemaScan(maddenInstallDirectory) {
  utilService.show(document.querySelector(".loader-wrapper"));

  setTimeout(() => {
    console.time("search");
    schemaSearchService
      .getScanDirectories(maddenInstallDirectory, "quick")
      .then((dirs) => {
        saveSchemas(dirs);
      })
      .catch((err) => {
        console.error("Failed to get scan directories:", err);
        utilService.hide(document.querySelector(".loader-wrapper"));
      });
  }, 20);
}

function updateProgressMessage(progress) {
  const progressElement = document.querySelector(".progress-message");
  progressElement.innerHTML = `${progress.toFixed(0)}%`;
}

function setupIpcListeners() {
  window.electronAPI.on("load-schema-done", async function (arg) {
    utilService.hide(document.querySelector(".loader-wrapper"));

    if (arg.status === "successful") {
      await parseAvailableSchemas();
      showSchemaLoadedNotification();
    } else {
      showSchemaErrorNotification();
    }
  });

  window.electronAPI.on("get-schema-info-response", function (arg) {
    schemaInformation = arg;

    // Guard against undefined loaded schema (e.g., no schema loaded yet)
    if (schemaInformation.loaded) {
      const loadedSchema = document.querySelector(
        `.schema-list-wrapper li[data-game-year="${schemaInformation.loaded.gameYear}"][data-major="${schemaInformation.loaded.major}"][data-minor="${schemaInformation.loaded.minor}"]`,
      );

      if (loadedSchema) {
        loadedSchema.classList.add("loaded-schema");
      }
    }

    if (schemaInformation.expected) {
      const expectedSchema = document.querySelector(
        `.schema-list-wrapper li[data-game-year="${schemaInformation.expected.gameYear}"][data-major="${schemaInformation.expected.major}"][data-minor="${schemaInformation.expected.minor}"]`,
      );

      if (expectedSchema) {
        expectedSchema.classList.add("expected-schema");

        const loadedSchema = schemaInformation.loaded
          ? document.querySelector(
              `.schema-list-wrapper li[data-game-year="${schemaInformation.loaded.gameYear}"][data-major="${schemaInformation.loaded.major}"][data-minor="${schemaInformation.loaded.minor}"]`,
            )
          : null;

        if (loadedSchema && loadedSchema !== expectedSchema && arg.autoSelect) {
          expectedSchema.click();
        }
      }
    }
  });

  window.electronAPI.on("schema-quick-scan", function (arg) {
    const settingToCheck = `madden${arg}Directory`;
    const directory = preferencesService.getValue(
      `gameVersions.${settingToCheck}`,
    );

    if (
      directory === null ||
      directory === undefined ||
      directory.length === 0
    ) {
      console.warn(
        `No directory set for Madden ${arg}. Set one on the preferences page (Ctrl+Shift+P to open).\n\nTo scan for a custom directory,` +
          `choose the 'Quick scan' option on the schema manager and select your Madden executable file.`,
      );
      return;
    }

    quickSchemaScan(directory + `/Madden${arg}.exe`);
  });

  window.electronAPI.on("is-currently-searching", function () {
    window.electronAPI.send(
      "currently-searching-response",
      isCurrentlySearching,
    );
  });
}

async function setupSchemaService() {
  await savedSchemaService.initialize();
}

async function parseAvailableSchemas(autoSelect) {
  const schemas = await savedSchemaService.getSavedSchemas();
  schemas.sort((a, b) => {
    if (a.gameYear !== b.gameYear) {
      return a.gameYear - b.gameYear;
    } else if (a.major !== b.major) {
      return a.major - b.major;
    } else {
      return a.minor - b.minor;
    }
  });
  const list = document.querySelector(".schema-list-wrapper");
  list.innerHTML = "";

  schemas.forEach((schema) => {
    const listItem = document.createElement("li");
    listItem.classList.add("schema-list-item");
    listItem.innerHTML = `${schema.filename[0] === "C" ? "C" : "M"}${schema.gameYear} ${schema.major}.${schema.minor}`;

    listItem.addEventListener("click", () => {
      utilService.show(document.querySelector(".loader-wrapper"));

      setTimeout(() => {
        window.electronAPI.send("load-schema", {
          path: schema.path,
          saveSchema: false,
        });
      }, 20);
    });

    listItem.dataset.gameYear = schema.gameYear;
    listItem.dataset.major = schema.major;
    listItem.dataset.minor = schema.minor;

    list.appendChild(listItem);
  });

  window.electronAPI.send("get-schema-info-request", autoSelect);
}

function showSchemaLoadedNotification() {
  utilService.showNotificationElement(".schema-loaded", 3500);
}

function showSchemaErrorNotification() {
  utilService.showNotificationElement(".schema-error", 3500);
}

function isDev() {
  return process.env.NODE_ENV === "development";
}
