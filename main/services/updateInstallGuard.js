// Asks before an update install quits the app with unsaved edits:
// save and install, install without saving, or cancel.

const path = require("path");

const SAVE_AND_INSTALL = 0;
const INSTALL_WITHOUT_SAVING = 1;
const CANCEL = 2;

function createInstallGuard({
  franchiseFileManager,
  getDialog,
  getWindow,
  hasPendingFileChange = () => false,
  hasMissingFile = () => false,
}) {
  // A destroyed or missing window shows the box without a parent.
  function showMessageBox(options) {
    const dialog = getDialog();
    const win = getWindow();
    return win && !win.isDestroyed?.()
      ? dialog.showMessageBox(win, options)
      : dialog.showMessageBox(options);
  }

  async function dirtyFileIds() {
    const ids = [...franchiseFileManager.activeFiles.keys()];
    const dirty = await Promise.all(
      ids.map((id) => franchiseFileManager.hasUnsavedChanges(id)),
    );
    return ids.filter((_, i) => dirty[i]);
  }

  function fileName(id) {
    const entry = franchiseFileManager.activeFiles.get(id);
    return entry?.path ? path.basename(entry.path) : id;
  }

  async function prepareInstall() {
    const dirty = await dirtyFileIds();
    if (dirty.length === 0) return true;

    const names = dirty.map(fileName).join(", ");
    const detail = [`Unsaved: ${names}`];
    for (const id of dirty.filter((id) => hasPendingFileChange(id))) {
      detail.push(
        `${fileName(id)} was changed outside the editor. Saving replaces those changes.`,
      );
    }
    if (dirty.some((id) => hasMissingFile(id))) {
      detail.push(
        "The file was deleted or moved outside the editor; saving writes it back to its old path.",
      );
    }

    const { response } = await showMessageBox({
      type: "warning",
      title: "Unsaved changes",
      message:
        "You have unsaved changes. The app will close to install the update.",
      detail: detail.join("\n\n"),
      buttons: ["Save and install", "Install without saving", "Cancel"],
      defaultId: SAVE_AND_INSTALL,
      cancelId: CANCEL,
      noLink: true,
    });

    if (response === INSTALL_WITHOUT_SAVING) return true;
    if (response !== SAVE_AND_INSTALL) return false;

    for (const id of dirty) {
      try {
        await franchiseFileManager.saveFile(id);
      } catch (error) {
        console.error("Failed to save before the update install:", error);
        await showMessageBox({
          type: "error",
          title: "Save failed",
          message: `${fileName(id)} could not be saved, so the update was not installed.`,
          detail: error?.message || String(error),
        });
        return false;
      }
    }
    return true;
  }

  return { prepareInstall };
}

module.exports = { createInstallGuard };
