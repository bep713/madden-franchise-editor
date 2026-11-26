# Open a file

A user opens a Madden or CFB franchise file from the Welcome page. The Get Started card then shows the file's name and links to its editors, the file is added to Recent Files, and File > Close returns the app to the no-file state.

## Sub-features

- `open-dialog` opens a file through "Open a file..." on the Get Started card.
- `open-recent` reopens a file from the Recent Files card.
- `open-nav` shows the tabs for an opened M22 career file: `Home`, `Schedule`, `Schemas`, `Open Table...`.
- `close-file` closes the file with File > Close, after which `CloseFile` is disabled.

## How to get to it (user POV)

- On the Welcome (Home) page, click "Open a file..." on the Get Started card, or click "Open a different file" when a file is already open.
- Click "Open a file..." in the side nav (`[data-action="open-file"]`).
- Click a file name on the Recent Files card.
- Use File > Open (menu id `Open`) and File > Close (menu id `CloseFile`).

## Driving it with drive.js

Preconditions:

- The baseline from `README.md`.

- **Open via the card.** Call `await models.welcome.openFranchiseFile(electronApp, sandbox.careerPath)`, which stubs the open dialog and clicks the link. `await models.welcome.getStartedTitle()` returns `CAREER-E2ETEST`. Take `shot("opened")`.
- **Tabs.** `await models.nav.tabNames()` returns `["Home","Schedule","Schemas","Open Table..."]`.
- **Recent.** `await models.welcome.recentFile("CAREER-E2ETEST").waitFor()` succeeds.
- **Close.** Call `await app.clickMenuItem("CloseFile")`, then `poll(() => window.evaluate(() => window.franchiseAPI.getActiveFileId()), id => id === null)`. After that, `await app.isMenuItemEnabled("CloseFile")` is `false`. Take `shot("closed")`.
- **Reopen from recent.** Call `await models.welcome.recentFile("CAREER-E2ETEST").click()`, then `await models.welcome.waitForOpenFile(sandbox.careerPath)`.

## Gotchas

- A schema mismatch banner can overlay the page. `openFranchiseFile` dismisses it. Pass `{ keepBanners: true }` if the banner is what you are verifying.
- Common files (FTC) ask for parameters first. Use `welcome.startOpenFile`, then `e2e("models/react/CommonFileModal.js")`. Common fixtures are `tests/data/m22/common/FTC-E2ETEST`, which can only be opened, never saved.
- Recent files live in userData, so each run starts with an empty list.
