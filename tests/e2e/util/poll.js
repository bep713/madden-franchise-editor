// Polls `fn` until `predicate` accepts its result. Playwright's web-first
// `expect` comes from @playwright/test 1.25, which can't drive locators from
// the `playwright` 1.59 Electron instance, so React models wait with this.
async function poll(fn, predicate, { timeout = 10000, message } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (predicate(last)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `${message || "Timed out polling"} (last value: ${JSON.stringify(last)})`,
  );
}

module.exports = { poll };
