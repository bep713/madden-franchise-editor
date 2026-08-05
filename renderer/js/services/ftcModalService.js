const ftcModalService = {};

ftcModalService.initialize = async () => {
  const sections = await window.electronAPI.preferences.getSections();
  const ftcGameYearOptions = findFieldByKey(sections, "ftcGameYearOverride");
  const ftcGameTypeOptions = findFieldByKey(sections, "ftcGameTypeOverride");

  const gameYearDropdown = document.getElementById("ftc-game-year");
  if (gameYearDropdown && ftcGameYearOptions) {
    ftcGameYearOptions.options.forEach((o) =>
      createAndAppendOption(o, gameYearDropdown),
    );
  }

  const gameTypeDropdown = document.getElementById("ftc-game-type");
  if (gameTypeDropdown && ftcGameTypeOptions) {
    ftcGameTypeOptions.options.forEach((o) =>
      createAndAppendOption(o, gameTypeDropdown),
    );
  }
};

ftcModalService.promptForFtcOverrides = async () => {
  return new Promise(async (resolve) => {
    const underlay = document.getElementById("ftc-override-underlay");
    const modal = document.getElementById("ftc-override-modal");
    const confirmBtn = document.getElementById("ftc-override-confirm");
    const yearSelect = document.getElementById("ftc-game-year");
    const typeSelect = document.getElementById("ftc-game-type");

    if (!underlay || !modal || !confirmBtn || !yearSelect || !typeSelect) {
      resolve(null);
    }

    underlay.classList.remove("hidden");
    modal.classList.remove("hidden");

    const prefs = await window.electronAPI.preferences.get();

    const savedYear = prefs.general.ftcGameYearOverride;
    const savedType = prefs.general.ftcGameTypeOverride;

    if (savedYear !== undefined && savedYear !== null) {
      yearSelect.value = savedYear;
    }

    if (savedType) {
      typeSelect.value = savedType;
    }

    async function onConfirm() {
      confirmBtn.removeEventListener("click", onConfirm);

      const gameYear = parseInt(yearSelect.value, 10);
      const gameType = typeSelect.value;

      underlay.classList.add("hidden");
      modal.classList.add("hidden");

      resolve({ gameYear, gameType });
    }

    confirmBtn.addEventListener("click", onConfirm);
  });
};

module.exports = ftcModalService;

function findFieldByKey(sections, key) {
  for (const section of sections) {
    for (const group of section.form?.groups ?? []) {
      for (const field of group.fields ?? []) {
        if (field.key === key) return field;
      }
    }
  }
  return null;
}

/**
 *
 * @param {{ label: string; value: string}} optionSetting The option value
 * @param {HTMLSelectElement} parentElement The dropdown element
 */
function createAndAppendOption(optionSetting, parentElement) {
  const optEl = document.createElement("option");
  optEl.text = optionSetting.label;
  optEl.value = optionSetting.value;

  parentElement.appendChild(optEl);
}
