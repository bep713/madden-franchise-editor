const utilService = require('../services/utilService');
const EventEmitter = require('events').EventEmitter;

module.exports = {
    eventEmitter: new EventEmitter(),

    showReferenceViewer: (referencedRecordData, references) => {
        const modal = document.getElementById('reference-modal');
        const close = document.querySelector('.reference-modal .close-modal');
        const referenceListWrapper = document.getElementById('reference-list-wrapper');

        const closeEventListener = function () {
            utilService.hide(modal);
            close.removeEventListener('click', closeEventListener);
        };

        close.addEventListener('click', closeEventListener);

        const referencedRecordText = document.getElementById('referenced-record-text');

        utilService.show(modal);

        referencedRecordText.innerHTML = `(${referencedRecordData.tableId}) ${referencedRecordData.name} - Record #${referencedRecordData.recordIndex}:`;
        referenceListWrapper.innerHTML = '';

        if (references && references.length > 0) {
            references.forEach((reference) => {
                let referenceDiv = document.createElement('div');
                referenceDiv.classList.add('reference-link');
                referenceDiv.innerText = `(${reference.tableId}) ${reference.name}`;

                referenceDiv.addEventListener('click', () => {
                    utilService.hide(modal);
                    module.exports.eventEmitter.emit('reference-clicked', reference);
                });
    
                referenceListWrapper.appendChild(referenceDiv);
            });
        }
        else {
            referenceListWrapper.innerText = 'No references.';
        }
    }
};