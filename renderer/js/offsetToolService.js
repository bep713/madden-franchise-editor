let offsetToolService = {};

offsetToolService.start = function () {
  buildSearchRow();
};

module.exports = offsetToolService;

offsetToolService.start();

function buildSearchRow() {
  const mainContent = document.querySelector('.content-main');
  const searchRowIndex = mainContent.querySelectorAll('.search-row').length;

  const length = document.querySelector('#length');
  length.addEventListener('input', function () {
    runSearch();
  });

  const searchRow = document.createElement('div');
  searchRow.classList.add('search-row');

  const valueWrapper = document.createElement('div')
  valueWrapper.classList.add('value-wrapper');

  const valueInput = document.createElement('input');
  valueInput.classList.add('value');
  valueInput.id = `value-${searchRowIndex}`;
  valueInput.type = 'text';

  valueInput.addEventListener('keyup', function () {
    runSearch();
  });
  
  const valueLabel = document.createElement('label');
  valueLabel.for = `value-${searchRowIndex}`;
  valueLabel.textContent = 'Value';

  const valueActionButtons = document.createElement('div');
  valueActionButtons.classList.add('value-action-buttons');

  const convertToBinaryButton = document.createElement('button');
  convertToBinaryButton.classList.add('action-button');
  convertToBinaryButton.textContent = 'Decimal to binary';
  convertToBinaryButton.addEventListener('click', function () {
    const binary = dec2bin(valueInput.value);
    valueInput.value = binary;
    runSearch();
  });

  const convertToDecimalButton = document.createElement('button');
  convertToDecimalButton.classList.add('action-button');
  convertToDecimalButton.textContent = 'Binary to decimal';
  convertToDecimalButton.addEventListener('click', function () {
    const binary = bin2dec(valueInput.value);
    valueInput.value = binary;
    runSearch();
  });

  valueActionButtons.appendChild(convertToBinaryButton);
  valueActionButtons.appendChild(convertToDecimalButton);

  valueWrapper.appendChild(valueLabel);
  valueWrapper.appendChild(valueInput);
  valueWrapper.appendChild(valueActionButtons);

  const dataWrapper = document.createElement('div');
  dataWrapper.classList.add('data-wrapper');
  dataWrapper.classList.add('textarea-wrapper');

  const textAreaWrapper = document.createElement('div');
  textAreaWrapper.classList.add('container');
  textAreaWrapper.id = `container-${searchRowIndex}`;

  const backdrop = document.createElement('div');
  backdrop.classList.add('backdrop');
  backdrop.id = `backdrop-${searchRowIndex}`;

  const highlights = document.createElement('div');
  highlights.classList.add('highlights');
  highlights.id = `highlights-${searchRowIndex}`;

  backdrop.appendChild(highlights);

  const dataTextarea = document.createElement('textarea');
  dataTextarea.classList.add('data');
  dataTextarea.id = `data-${searchRowIndex}`;

  dataTextarea.addEventListener('input', function () {
    runSearch();
  });

  dataTextarea.addEventListener('scroll', function () {
    handleScroll(dataTextarea, backdrop);
  });

  const valueActionButtons2 = document.createElement('div');
  valueActionButtons2.classList.add('value-action-buttons');

  const convertHexToBinaryButton = document.createElement('button');
  convertHexToBinaryButton.classList.add('action-button');
  convertHexToBinaryButton.textContent = 'Hex to binary';
  convertHexToBinaryButton.addEventListener('click', function () {
    const hex = dataTextarea.value;
    const hexArray = hex.split(' ');
    let binary = [];
    
    hexArray.forEach((hex) => {
      const bits = hex2bin(hex);
      binary.push(bits);
    });

    dataTextarea.value = binary.join('');
    runSearch();
  });

  valueActionButtons2.appendChild(convertHexToBinaryButton);

  const convertBinaryToHexButton = document.createElement('button');
  convertBinaryToHexButton.classList.add('action-button');
  convertBinaryToHexButton.textContent = 'Binary to hex';
  convertBinaryToHexButton.addEventListener('click', function () {
    const binary = dataTextarea.value;
    const byteArray = chunk(binary, 8);

    let bytes = [];
    
    byteArray.forEach((byte) => {
      const hex = bin2hex(byte);

      if (hex) {
        bytes.push(hex); 
      }
    });

    dataTextarea.value = bytes.join(' ');
    runSearch();
  });

  valueActionButtons2.appendChild(convertBinaryToHexButton);

  textAreaWrapper.appendChild(backdrop);
  textAreaWrapper.appendChild(dataTextarea);
  textAreaWrapper.appendChild(valueActionButtons2);
  
  const dataLabel = document.createElement('label');
  dataLabel.for = `data-${searchRowIndex}`;
  dataLabel.textContent = 'Data';

  dataWrapper.appendChild(dataLabel);
  dataWrapper.appendChild(textAreaWrapper);

  const notesWrapper = document.createElement('div');
  notesWrapper.classList.add('notes-wrapper');
  
  const notesTextArea = document.createElement('textarea');
  notesTextArea.classList.add('notes');
  notesTextArea.id = `notes-${searchRowIndex}`;
  
  const notesLabel = document.createElement('label');
  notesLabel.for = `notes-${searchRowIndex}`;
  notesLabel.textContent = 'Notes';

  notesWrapper.appendChild(notesLabel);
  notesWrapper.appendChild(notesTextArea);

  const buttonWrapper = document.createElement('div');
  buttonWrapper.classList = 'button-wrapper';

  const addRowButton = document.createElement('button');
  addRowButton.classList.add('btn');
  addRowButton.classList.add('btn-add-row');
  addRowButton.textContent = '+';

  addRowButton.addEventListener('click', function () {
    buildSearchRow();
  });

  const removeRowButton = document.createElement('button');
  removeRowButton.classList.add('btn');
  removeRowButton.classList.add('btn-remove-row');
  removeRowButton.textContent = '-';

  removeRowButton.addEventListener('click', function () {
    removeSearchRow(searchRow);
  });

  buttonWrapper.appendChild(addRowButton);
  buttonWrapper.appendChild(removeRowButton);

  searchRow.appendChild(valueWrapper);
  searchRow.appendChild(dataWrapper);
  searchRow.appendChild(notesWrapper);
  searchRow.appendChild(buttonWrapper);

  mainContent.appendChild(searchRow);
};

function removeSearchRow(searchRow) {
  searchRow.remove();
};

function runSearch() {
  const rows = document.querySelectorAll('.search-row');
  let length = parseInt(document.querySelector('#length').value);

  if (!length) {
    const firstValue = document.querySelector('.value');
    length = firstValue.value.length;
  }

  let indices = [];

  rows.forEach((row) => {
    const dataElement = row.querySelector('.data');
    const highlights = row.querySelector('.highlights');

    let value = row.querySelector('.value').value;

    if (value.length < length) {
      let zeros = '';
      for (let i = value.length; i < length; i++) {
        zeros += '0';
      }

      value = zeros + value;
    }

    const valueRegex = new RegExp(`(${value})`, 'g');
    const data = dataElement.value;

    if (data && value) {
      const highlightedText = applyHighlights(valueRegex, data);
      highlights.innerHTML = highlightedText;

      let indexList = [];
      let i = -1;

      while ((i=data.indexOf(value, i+1)) >= 0) {
        indexList.push(i);
      }

      indices.push(indexList);
    }
  });

  let intersects = intersection(indices);
  const offsetElement = document.querySelector('#offset');
  offsetElement.value = intersects;

  if (intersects.length > 0) {
    const firstIntersect = intersects[0];

    rows.forEach((row, index) => {
      const offsetMatch = indices[index].findIndex((matchIndex) => { return matchIndex === firstIntersect; });
      const offsetMatchMark = row.querySelector(`mark:nth-child(${offsetMatch+1})`);

      if (offsetMatchMark) {
        offsetMatchMark.classList.add('offset-match');
      }
    });
  }
};

function applyHighlights(value, text) {
  return text
      .replace(/\n$/g, '\n\n')
      .replace(value, '<mark>$&</mark>');
};

function handleScroll(textarea, backdrop) {
  var scrollTop = textarea.scrollTop;
  backdrop.scrollTop = scrollTop;
};

function intersection(arrayOfArrays) {
  return arrayOfArrays
      .reduce((acc,array,index) => { // Intersect arrays
          if (index === 0)
              return array;
          return array.filter((value) => acc.includes(value));
      }, [])
      .filter((value, index, self) => self.indexOf(value) === index) // Make values unique
  ;
};

function dec2bin(dec) {
  return (dec >>> 0).toString(2);
};

function bin2dec(binary) {
  return parseInt(binary, 2);
};

function hex2bin(hex){
  return (parseInt(hex, 16).toString(2)).padStart(8, '0');
};

function bin2hex(bin) {
  return parseInt(bin, 2).toString(16).padStart(2, '0').toUpperCase();
};

function chunk(str, n) {
  var ret = [];
  var i;
  var len;

  for(i = 0, len = str.length; i < len; i += n) {
      ret.push(str.substr(i, n))
  }

  return ret;
};