const recentFileService = {};

recentFileService.initialize = async () => {
  if (!window.electronAPI?.recentFiles) {
    throw new Error("Recent files API not available");
  }
  return window.electronAPI.recentFiles.initialize();
};

recentFileService.addFile = async (filePath) => {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("Invalid file path");
  }
  if (!window.electronAPI?.recentFiles) {
    throw new Error("Recent files API not available");
  }
  return window.electronAPI.recentFiles.addFile(filePath);
};

recentFileService.removeFile = async (filePath) => {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("Invalid file path");
  }
  if (!window.electronAPI?.recentFiles) {
    throw new Error("Recent files API not available");
  }
  return window.electronAPI.recentFiles.removeFile(filePath);
};

recentFileService.getRecentFiles = async () => {
  if (!window.electronAPI?.recentFiles) {
    throw new Error("Recent files API not available");
  }
  return window.electronAPI.recentFiles.getRecentFiles();
};

module.exports = recentFileService;
