const fs = require('fs');
const path = require('path');
const electron = require('electron');
const ipcRenderer = electron.ipcRenderer;
const remote = electron.remote;

const preferencesService = require('./js/services/preferencesService');

const pageData = require('../data/settingsManagerData.json');
const currentWindow = remote.getCurrentWindow();
const preferences = ipcRenderer.sendSync('getPreferences');

initializeSettingsManager(preferences);
addIpcListeners();

const pagesToShow = getPagesToShow(preferences);

if (pagesToShow.length > 0) {
    currentWindow.show();

    setTimeout(() => {
        currentWindow.moveTop();
        showPages(pagesToShow);
    }, 1000);
} else {
    currentWindow.hide();
}

function addIpcListeners() {
    ipcRenderer.on('show-all-pages', () => {
        let pagesToShow = [];
        
        for (let page in preferences.settingsManager) {
            pagesToShow.push(page);
        }

        pagesToShow = pagesToShow.map((page) => {
            return pageData.items.find((data) => { return data.id === page; });
        }).sort((a, b) => { 
            return a.order - b.order;
        });

        showPages(pagesToShow);
    });
};

function showPages(pages) {
    let currentIndex = 0;
    const services = loadServices(pages);
    
    loadPageAtMetaIndex(currentIndex);

    function loadPageAtMetaIndex(index) {
        const currentPage = pages[index];

        if (!currentPage) {
            setAllSettingsAsShown(preferences);
            currentWindow.hide();
            return;
        }

        const currentService = services[index];

        loadPage(currentPage);
        currentService.initialize();

        const backButton = document.querySelector(currentPage.backButtonSelector);
        const continueButton = document.querySelector(currentPage.continueButtonSelector);

        if (index === 0) {
            backButton.classList.add('hidden');
        }
        else if ((index + 1) === pages.length) {
            continueButton.innerHTML = continueButton.innerHTML.replace('continue', 'close').replace('Continue', 'Close');
        }

        backButton.addEventListener('click', () => {
            loadPageAtMetaIndex(index - 1);
        });

        continueButton.addEventListener('click', () => {
            loadPageAtMetaIndex(index + 1);
        });
    };

    function loadServices(pages) {
        return pages.map((page) => {
            return require(page.service);
        });
    };
};

function loadPage(page) {
    const pageContent = fs.readFileSync(path.join(__dirname, page.page));
    const content = document.querySelector('#settings-content');
    content.innerHTML = pageContent;
};

function initializeSettingsManager(preferences) {
    const preferencesSchema = preferencesService.getPreferenceKeys();
    setMissingKeys(preferencesSchema, preferences);        
    ipcRenderer.sendSync('setPreferences', preferences);
};

function setMissingKeys(schema, objectToCheck) {
    for (let category in schema) {
        if (objectToCheck[category] === null || objectToCheck[category] === undefined) {
            objectToCheck[category] = schema[category];
        }
        else {
            const nextLevelDown = schema[category];

            if (typeof(nextLevelDown) === 'object' && !Array.isArray(nextLevelDown)) {
                setMissingKeys(schema[category], objectToCheck[category]);
            }
        }
    }
};

function getPagesToShow(preferences) {
    let pagesToShow = [];

    for (let page in preferences.settingsManager) {
        if (checkPage(preferences.settingsManager[page])) {
            pagesToShow.push(page);
        }
    }

    return pagesToShow.map((page) => {
        return pageData.items.find((data) => { return data.id === page; });
    }).sort((a, b) => { 
        return a.order - b.order;
    });

    function checkPage(page) {
        for (let key in page) {
            if (!page[key]) {
                return true;
            }
        }

        return false;
    };
};

function setAllSettingsAsShown() {
    const preferences = ipcRenderer.sendSync('getPreferences');
    
    for (let page in preferences.settingsManager) {
        for (let key in preferences.settingsManager[page]) {
            preferences.settingsManager[page][key] = true;
        }
    }

    ipcRenderer.sendSync('setPreferences', preferences);
};