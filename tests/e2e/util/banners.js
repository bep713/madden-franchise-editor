// Closes React banners (components/Banner) in `window` until none is left,
// since they overlay the bottom of the page. Each close may slide in the next
// one: wait out the 300ms slide-out, then the next banner's 20ms enter delay.
async function dismissBanners(window) {
  const banner = window.getByTestId("banner");
  while ((await banner.count()) > 0) {
    await banner.getByRole("button", { name: "Close", exact: true }).click();
    await banner.waitFor({ state: "detached" });
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

module.exports = { dismissBanners };
