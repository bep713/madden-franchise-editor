// Returns the metadata navigationService already received from openFile,
// falling back to an IPC fetch (e.g. before it is set, or for another fileId).
async function getFileMetadata(fileId) {
  // Required lazily to avoid a circular dependency with navigationService
  const { currentlyOpenedFile } = require("./navigationService");
  if (currentlyOpenedFile?.fileId === fileId && currentlyOpenedFile.metadata) {
    return currentlyOpenedFile.metadata;
  }
  return window.franchiseAPI.getMetadata(fileId);
}

module.exports = { getFileMetadata };
