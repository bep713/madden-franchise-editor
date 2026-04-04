const path = require("path");
const fs = require("fs");
const { app } = require("electron");

const RECENT_FILES_FILENAME = "recentFiles.json";
const MAX_RECENT_FILES = 10;

let recentFiles = [];

function registerRecentFilesHandlers(loggedIpc) {
  loggedIpc.handle("recent-files:initialize", async () => {
    try {
      const filePath = path.join(
        app.getPath("userData"),
        RECENT_FILES_FILENAME,
      );

      if (!fs.existsSync(filePath)) {
        recentFiles = [];
        return recentFiles;
      }

      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      recentFiles = Array.isArray(data) ? data : [];
      return recentFiles;
    } catch (error) {
      recentFiles = [];
      throw new Error(`Failed to initialize recent files: ${error.message}`);
    }
  });

  loggedIpc.handle("recent-files:add", async (event, filePath) => {
    try {
      const indexInRecents = recentFiles.findIndex(
        (file) => file.path === filePath,
      );

      if (indexInRecents >= 0) {
        recentFiles[indexInRecents].time = Date.now();
      } else {
        recentFiles.push({
          path: filePath,
          time: Date.now(),
        });

        if (recentFiles.length > MAX_RECENT_FILES) {
          recentFiles = getSortedRecentFiles().slice(0, MAX_RECENT_FILES);
        }
      }

      writeToRecentFilesStore();
      return getSortedRecentFiles();
    } catch (error) {
      throw new Error(`Failed to add recent file: ${error.message}`);
    }
  });

  loggedIpc.handle("recent-files:remove", async (event, filePath) => {
    try {
      const indexInRecents = recentFiles.findIndex(
        (file) => file.path === filePath,
      );

      if (indexInRecents >= 0) {
        recentFiles.splice(indexInRecents, 1);
        writeToRecentFilesStore();
      }

      return getSortedRecentFiles();
    } catch (error) {
      throw new Error(`Failed to remove recent file: ${error.message}`);
    }
  });

  loggedIpc.handle("recent-files:get", async () => {
    try {
      return getSortedRecentFiles();
    } catch (error) {
      throw new Error(`Failed to get recent files: ${error.message}`);
    }
  });
}

function getSortedRecentFiles() {
  return recentFiles.sort((a, b) => b.time - a.time);
}

function writeToRecentFilesStore() {
  const filePath = path.join(app.getPath("userData"), RECENT_FILES_FILENAME);
  fs.writeFileSync(filePath, JSON.stringify(recentFiles));
}

module.exports = { registerRecentFilesHandlers };
