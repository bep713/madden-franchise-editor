const path = require("path");
const fs = require("fs/promises");
const { app, shell } = require("electron");
const games = require("../../data/games.json");
const { ensureRecentFilesLoaded } = require("./recentFilesHandler");

const CAREER_FILE_PATTERN = /^CAREER-\w+$/;

/**
 * Main process handlers for the React welcome page (window.electronAPI.files).
 * Recent files are shared with recentFilesHandler but returned in the
 * renderer's RecentFile shape (src/shared/types/files.ts).
 */
function registerFilesHandlers(loggedIpc) {
  loggedIpc.handle("files:get-saves", async () => {
    try {
      const [recentFiles, filesByGame] = await Promise.all([
        getRecentFiles(),
        getSavesByGame(),
      ]);
      return { success: true, recentFiles, filesByGame };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        recentFiles: [],
        filesByGame: {},
      };
    }
  });

  loggedIpc.handle("files:open-folder", async (event, folderPath) => {
    if (!folderPath || typeof folderPath !== "string") {
      throw new Error("Invalid folder path provided");
    }
    await shell.openPath(folderPath);
  });
}

function getRecentFiles() {
  return ensureRecentFilesLoaded().map((recentFile) => ({
    basePath: path.dirname(recentFile.path),
    fullPath: recentFile.path,
    lastAccessedTime: recentFile.time,
    name: path.basename(recentFile.path),
  }));
}

/**
 * Scans each game's Documents saves folder for CAREER-* files.
 * Games without a saves folder (or without saves) are left out.
 */
async function getSavesByGame() {
  const documentsPath = app.getPath("documents");
  const filesByGame = {};

  for (const game of games) {
    const savesFullPath = path.join(
      documentsPath,
      game.directories.savesRelativePath,
    );

    let dirents;
    try {
      dirents = await fs.readdir(savesFullPath, { withFileTypes: true });
    } catch {
      continue;
    }

    const files = await Promise.all(
      dirents
        .filter(
          (dirent) => dirent.isFile() && CAREER_FILE_PATTERN.test(dirent.name),
        )
        .map(async (dirent) => {
          const fullPath = path.join(savesFullPath, dirent.name);
          const stats = await fs.stat(fullPath);
          return {
            basePath: savesFullPath,
            fullPath,
            name: dirent.name,
            mtime: stats.mtime.getTime(),
          };
        }),
    );

    if (files.length > 0) {
      filesByGame[game.title] = {
        game: {
          ...game,
          directories: { ...game.directories, savesFullPath },
        },
        files: files.sort((a, b) => b.mtime - a.mtime),
      };
    }
  }

  return filesByGame;
}

module.exports = { registerFilesHandlers };
