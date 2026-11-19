// Light and Dark screenshots of every v5 page and the shared windows.
// Run: node .claude/skills/verify-mfe/scripts/drive.js .claude/skills/verify-mfe/scenarios/theme-sweep.js
// The theme goes through main's preferences:set, the same path as Settings.
module.exports = async ({ electronApp, app, window, models, sandbox, shot, log, poll, evidenceDir }) => {
  const follow = async (page) => {
    await page.emulateMedia({ colorScheme: "no-override" });
    return page;
  };
  await window.emulateMedia({ colorScheme: "no-override" });

  const setTheme = async (theme) => {
    await window.evaluate(
      (theme) => window.electronAPI.preferences.set({ general: { theme } }),
      theme,
    );
    await poll(
      () => electronApp.evaluate(({ nativeTheme }) => nativeTheme.themeSource),
      (source) => source === theme,
      { message: `themeSource is ${theme}` },
    );
    await window.waitForTimeout(200);
  };

  const capture = async (name, page = window) => {
    for (const theme of ["light", "dark"]) {
      await setTheme(theme);
      if (page === window) {
        await shot(`${name}-${theme}`);
      } else {
        const file = `${name}-${theme}.png`;
        await page.screenshot({ path: require("path").join(evidenceDir, file) });
        log(`shot ${file}`);
      }
    }
  };

  await capture("welcome-empty");
  await models.welcome.openFranchiseFile(electronApp, sandbox.careerPath);
  await capture("welcome-open");

  await models.welcome.openTableEditor();
  await models.tableEditor.waitForTableToLoad();
  await models.tableEditor.openTableById(7482);
  await capture("table-editor");

  await models.nav.openTab("Schedule");
  await models.schedule.waitForLoad();
  await capture("schedule");

  await models.nav.openTab("Schemas");
  await models.schemas.waitForPageLoad();
  await capture("schemas");

  await models.schemas.viewSchema("M22 v329.1");
  await models.schemaViewer.waitForOpen();
  await capture("schema-viewer");
  await models.schemaViewer.close();

  await models.schemas.addSchema();
  await window.getByRole("heading").first().waitFor();
  await capture("add-schema");

  const findWindow = (part) =>
    poll(() => electronApp.windows().find((w) => w.url().includes(part)), Boolean, {
      message: `${part} window`,
    });

  await app._clickMenuItem("ShowPreferences");
  const settings = await follow(await findWindow("settings"));
  await settings.locator("#uiVersion").waitFor();
  await capture("settings-general", settings);

  await electronApp.evaluate(({ ipcMain }) => ipcMain.emit("show-schema-manager", {}));
  const schemaManager = await follow(await findWindow("schema-manager"));
  await schemaManager.waitForLoadState("load");
  await capture("schema-manager", schemaManager);

  await app._clickMenuItem("Credits");
  const credits = await follow(await findWindow("credits"));
  await credits.waitForLoadState("load");
  await capture("credits", credits);
};
