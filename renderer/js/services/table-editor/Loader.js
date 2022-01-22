const utilService = require('../utilService');

class Loader {
    constructor() {
        this.loader = document.querySelector('.loader-wrapper');
    };

    show() {
        utilService.show(this.loader);
    };

    hide() {
        utilService.hide(this.loader);
    };
};

module.exports = Loader;