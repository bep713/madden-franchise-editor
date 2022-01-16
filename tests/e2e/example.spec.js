// @ts-check
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

test('basic test', async () => {
  const electronApp = await electron.launch({ args: ['.'] });

  const windows = await electronApp.windows();

  await new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, 5000);
  });

  console.log(windows);
  // await window.screenshot({ path: 'intro.png' });

  await electronApp.close();
});
