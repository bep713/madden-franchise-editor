const utilService = require("../utilService");

class Loader {
  constructor() {
    this.loader = null;
  }

  _getElement() {
    if (!this.loader) {
      this.loader = document.querySelector(".loader-wrapper");
    }
    return this.loader;
  }

  show() {
    utilService.show(this._getElement());
  }

  hide() {
    utilService.hide(this._getElement());
  }
}

module.exports = Loader;
