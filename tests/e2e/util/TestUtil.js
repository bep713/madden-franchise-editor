const fs = require("fs/promises");
const FilePaths = require("./FilePaths");

module.exports = {
  overwriteTestCareer: async () => {
    // Overwrite the test file so that we never change the pristine career file.
    // It will always start with the same state.
    const pristineCareer = await fs.readFile(FilePaths.m22.career.pristine);
    await fs.writeFile(FilePaths.m22.career.test, pristineCareer);
  },
};
