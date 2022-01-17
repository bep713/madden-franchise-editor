const { dialog, getCurrentWindow } = require('@electron/remote');

let elementCreationUtil = {};

elementCreationUtil.createField = (field, currentValue) => {
    switch (field.type) {
        case 'dropdown':
            return elementCreationUtil.createDropdownField(field, currentValue);
        case 'checkbox':
            return elementCreationUtil.createCheckboxField(field, currentValue);
        case 'radio':
            return elementCreationUtil.createRadioField(field, currentValue);
        case 'directory':
            return elementCreationUtil.createDirectoryField(field, currentValue);
        case 'text':
        default:
            return elementCreationUtil.createTextField(field, currentValue);
    }
};

elementCreationUtil.createDropdownField = (field, currentValue) => {
    const wrapper = document.createElement('div');
    wrapper.classList.add('field-wrapper', 'dropdown-field-wrapper');

    const label = document.createElement('label');
    label.innerHTML = field.label;

    const select = document.createElement('select');
    select.id = field.key;
    
    field.options.forEach((fieldOption) => {
        const option = document.createElement('option');
        option.text = fieldOption.label;
        option.value = fieldOption.value;
        select.options.add(option);
    });

    select.selectedIndex = field.options.findIndex((field) => {
        return field.value === currentValue;
    });

    select.addEventListener('change', function () {
        wrapper.dispatchEvent(new CustomEvent('setting-change', { 'detail': select.value }));
    });

    label.setAttribute('for', select.id);

    wrapper.appendChild(label);
    wrapper.appendChild(select);

    return wrapper;
};

elementCreationUtil.createCheckboxField = (field, currentValue) => {
    const wrapper = elementCreationUtil.createTextField(field, currentValue);
    wrapper.classList.remove('text-field-wrapper');
    wrapper.classList.add('checkbox-field-wrapper');

    const input = wrapper.querySelector('input');
    input.type = 'checkbox';

    input.after(wrapper.querySelector('label'));

    if (currentValue.length > 0) {
        input.checked = true;
    }

    input.removeEventListener('change', inputEventListener);
    input.addEventListener('change', function () {
        wrapper.dispatchEvent(new CustomEvent('setting-change', { 'detail': input.checked }));
    })

    return wrapper;
};

elementCreationUtil.createRadioField = (field, currentValue) => {

};

elementCreationUtil.createDirectoryField = (field, currentValue) => {
    const textField = elementCreationUtil.createTextField(field, currentValue);
    textField.classList.add('directory-field-wrapper');

    const directoryInputWrapper = document.createElement('div');
    directoryInputWrapper.classList.add('directory-input');
    
    const input = textField.querySelector('input');
    input.before(directoryInputWrapper);

    directoryInputWrapper.appendChild(input);

    const directoryButton = document.createElement('button');
    directoryButton.classList.add('directory-btn');

    directoryButton.addEventListener('click', function () {
        const directory = dialog.showOpenDialogSync(getCurrentWindow(), {
            title: 'Select a directory',
            defaultPath: input.value,
            properties: ['openDirectory']
        });

        if (directory) {
            input.value = directory[0];
            textField.dispatchEvent(new CustomEvent('setting-change', { 'detail': input.value }));
        }
    });

    directoryInputWrapper.appendChild(directoryButton);

    return textField;
};

elementCreationUtil.createTextField = (field, currentValue) => {
    const wrapper = document.createElement('div');
    wrapper.classList.add('field-wrapper');
    wrapper.classList.add('text-field-wrapper');

    const label = document.createElement('label');
    label.classList.add('field-label');
    label.innerHTML = field.label;

    const input = document.createElement('input');
    input.classList.add('text-field');
    input.value = currentValue;
    input.id = field.key;

    input.addEventListener('change', inputEventListener);

    label.setAttribute('for', input.id);

    wrapper.appendChild(label);
    wrapper.appendChild(input);
    
    return wrapper;
};

module.exports = elementCreationUtil;

function inputEventListener(event) {
    const wrapper = event.srcElement.parentNode.parentNode;
    wrapper.dispatchEvent(new CustomEvent('setting-change', { 'detail': event.srcElement.value }));
};