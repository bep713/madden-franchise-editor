class SearchableRecord {
    constructor() {
        this._searchTextAttributes = [];
        this._searchText = null;
        this._iconPath = null;
        this._mainLineAttributes = [];
        this._secondLineAttributes = [];
        this.type = null;
    };

    get searchText() {
        return this._searchTextAttributes.reduce((prev, accum) => {
            return prev + byString(this, accum) + ' ';
        }, '');
    };

    set searchTextAttributes (attributes) {
        this._searchTextAttributes = attributes;
    };

    get mainLineText () {
        return this._mainLineAttributes.reduce((prev, accum) => {
            return prev + byString(this, accum) + ' ';
        }, '');
    };

    set mainLineAttributes (attributes) {
        this._mainLineAttributes = attributes;
    };

    get secondaryLineText () {
        return this._secondLineAttributes.reduce((prev, accum) => {
            return prev + byString(this, accum) + ' ';
        }, '');
    };

    set secondLineAttributes (attributes) {
        this._secondLineAttributes = attributes;
    };

    get type () {
        return this._type;
    };

    set type (type) {
        this._type = type;
    };
};

module.exports = SearchableRecord;

function byString(o, s) {
    s = s.replace(/\[(\w+)\]/g, '.$1'); // convert indexes to properties
    s = s.replace(/^\./, '');           // strip a leading dot
    var a = s.split('.');
    for (var i = 0, n = a.length; i < n; ++i) {
        var k = a[i];
        if (k in o) {
            o = o[k];
        } else {
            return;
        }
    }
    return o;
};