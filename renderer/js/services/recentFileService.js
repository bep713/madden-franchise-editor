const fs = require('fs');
const path = require('path');
const { app } = require('@electron/remote');

const PATH_TO_RECENT_FILES = path.join(app.getPath('userData'), 'recentFiles.json');
const MAX_RECENT_FILES = 10;

let recentFileService = {};
recentFileService.recentFiles = [];

recentFileService.initialize = () => {
  if (fs.existsSync(PATH_TO_RECENT_FILES)) {
    try {
      recentFileService.recentFiles = JSON.parse(fs.readFileSync(PATH_TO_RECENT_FILES));
    }
    catch (err) {
      recentFileService.recentFiles = [];
    }
  }
  else {
    recentFileService.recentFiles = [];
  }
};

recentFileService.addFile = (filePath) => {
  const indexInRecents = recentFileService.recentFiles.findIndex((file) => {
    return file.path === filePath;
  });

  if (indexInRecents >= 0) {
    recentFileService.recentFiles[indexInRecents].time = Date.now();
  }
  else {
    recentFileService.recentFiles.push({
      'path': filePath,
      'time': Date.now()
    });

    if (recentFileService.recentFiles.length > MAX_RECENT_FILES) {
      recentFileService.recentFiles = recentFileService.getRecentFiles().slice(0, MAX_RECENT_FILES);
    }
  }

  writeToRecentFilesStore(recentFileService.recentFiles);
};

recentFileService.removeFile = (filePath) => {
  const indexInRecents = recentFileService.recentFiles.findIndex((file) => {
    return file.path === filePath;
  });

  if (indexInRecents >= 0) {
    recentFileService.recentFiles.splice(indexInRecents, 1);
    writeToRecentFilesStore(recentFileService.recentFiles);
  }
};

recentFileService.getRecentFiles = () => {
  return recentFileService.recentFiles.sort((a, b) => { return b.time - a.time; });
};

module.exports = recentFileService;

function writeToRecentFilesStore(data) {
  fs.writeFileSync(PATH_TO_RECENT_FILES, JSON.stringify(data));
};