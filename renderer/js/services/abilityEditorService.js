const Selectr = require('mobius1-selectr');
const { ipcRenderer } = require('electron');
const Handsontable = require('handsontable').default;
const utilService = require('../services/utilService');
const franchiseGameYearService = require('../services/franchiseGameYearService');

let abilityEditorService = {};
abilityEditorService.name = 'scheduleEditorService';
abilityEditorService.hot = null;
abilityEditorService.strictSignatures = false;

abilityEditorService.start = function (file) {
  addEventListeners();

  if (file.isLoaded) {
    runStartTasks();
  } else {
    file.on('ready', function () {
      runStartTasks();
    });
  }

  function runStartTasks () {
    abilityEditorService.file = file;
    file.settings = {
      'saveOnChange': ipcRenderer.sendSync('getPreferences').general.autoSave[0]
    };
  
    abilityEditorService.parseAbilities();
    utilService.hide(document.querySelector('.loader-wrapper'));
  };
};

abilityEditorService.parseAbilities = function () {
  const loader = document.querySelector('.loader-wrapper');

  setTimeout(() => {
    utilService.show(loader);
  }, 10);

  setTimeout(() => {
    const activeSignatureDataTable = abilityEditorService.file.getTableById(7177);
    const playerTable = abilityEditorService.file.getTableById(franchiseGameYearService.getTableId('Player', 20));
    const positionSignatureAbilityTable = abilityEditorService.file.getTableById(4233);
    const signatureAbilityTable = abilityEditorService.file.getTableById(4147);

    abilityEditorService.activeSignatureDataTable = activeSignatureDataTable
    abilityEditorService.playerTable = playerTable
    abilityEditorService.positionSignatureAbilityTable = positionSignatureAbilityTable
    abilityEditorService.signatureAbilityTable = signatureAbilityTable

    const container3 = document.querySelector('.table-content-wrapper');
    abilityEditorService.hot = new Handsontable(container3, {
      rowHeaders: true,
      currentRowClassName: 'active-row',
      manualColumnResize: true,
      manualRowResize: true,
      afterChange: processChanges,
      afterSelection: processSelection,
      rowHeaders: function (index) {
        return index;
      }
    });

    // const filterSelector = document.querySelector('.filter-selector');

    // let teamPromise = teamTable.readRecords(['ShortName', 'LongName', 'DisplayName', 'TEAM_TYPE']);
    // let activeSignatureDataTablePromise = activeSignatureDataTable.readRecords();
    // let playerPromise = playerTable.readRecords(['FirstName', 'LastName', 'TeamIndex', 'Position', 'TraitDevelopment', 'PlayerType']);

    let readAllRecords = Promise.all([
      activeSignatureDataTable.readRecords(), 
      playerTable.readRecords(['FirstName', 'LastName', 'TraitDevelopment', 'PlayerType']),
      positionSignatureAbilityTable.readRecords(),
      signatureAbilityTable.readRecords(['Name', 'Description'])
    ]);

    readAllRecords.then(() => {
      const data = formatTable(activeSignatureDataTable);
      const headers = formatHeaders(activeSignatureDataTable);
      const columns = formatColumns(activeSignatureDataTable);

      abilityEditorService.hot.loadData(data);
      abilityEditorService.hot.updateSettings({
        data: data,
        colHeaders: headers,
        columns: columns,
        colWidths: calculateColumnWidths(columns, activeSignatureDataTable)
      });

      abilityEditorService.hot.selectCell(abilityEditorService.rowIndexToSelect, abilityEditorService.columnIndexToSelect);

      utilService.hide(loader);
    });
  }, 100);

  // teamPromise.then(() => {
  //   const teamNameData = getTeamNameData(teamTable);

  //   const filterSelectr = new Selectr(filterSelector, {
  //     data: teamNameData
  //   });

  //   filterSelectr.setValue('All');

  //   abilityEditorService.filterSelectr = filterSelectr;

  //   function getTeamNameData(team) {
  //     const teamNames = team.records.filter((record) => {
  //       return record.TEAM_TYPE === 'Current';
  //     }).map((record) => {
  //       return {
  //         'text': record.DisplayName,
  //         'value': record.DisplayName
  //       };
  //     });

  //     teamNames.unshift({
  //       'text': 'All',
  //       'value': 'All'
  //     });

  //     return teamNames;
  //   };
  // });

//   Promise.all([playerPromise, activeSignatureDataTablePromise]).then(() => {
//     const xFactorGrid = document.querySelector('.x-factor-grid');

//     const playersWithAbilities = getPlayersWithAbilities(playerTable, activeSignatureDataTable);
//     generatePlayers(playersWithAbilities);

//     function getPlayersWithAbilities(player, activeSignatureDataTable) {
//       return dedupedPlayersFromSignatureTable(activeSignatureDataTable)
//         .map((activeSignatureDataRecord) => {
//           const recordIndex = utilService.bin2dec(activeSignatureDataRecord.Player.substring(16));
//           return player.records[recordIndex];
//         });
//     };

//     function dedupedPlayersFromSignatureTable(activeSignatureDataTable) {
//       return activeSignatureDataTable.records.filter((record, index) => {
//         return index === activeSignatureDataTable.records.findIndex((r) => {
//           return r.Player === record.Player;
//         });
//       });
//     };

//     /*<div class="left-entry">
//         <div class="team-logo-wrapper">CHI</div>
//         <div class="player-name-wrapper">
//           Khalil Mack
//         </div>
//       </div>*/

//     function generatePlayers(players) {
//       players.forEach((player) => {
//         generatePlayerDisplay(player);
//       });
//     };

//     function generatePlayerDisplay(player) {
//       const wrapper = document.createElement('div');
//       wrapper.classList.add('left-entry');

//       const teamWrapper = document.createElement('div');
//       teamWrapper.classList.add('team-logo-wrapper');

//       const playerNameWrapper = document.createElement('div');
//       playerNameWrapper.classList.add('player-name-wrapper');
      
//       const playerFirstName = document.createElement('span');
//       playerFirstName.classList.add('first-name');
//       playerFirstName.innerHTML = player.FirstName;

//       const playerLastName = document.createElement('span');
//       playerLastName.classList.add('last-name');
//       playerLastName.innerHTML = player.LastName;

//       playerNameWrapper.appendChild(playerFirstName);
//       playerNameWrapper.appendChild(playerLastName);

//       wrapper.appendChild(teamWrapper);
//       wrapper.appendChild(playerNameWrapper);

//       xFactorGrid.appendChild(wrapper);
//     };
//   });

//   // readAllRecords.then(() => {
    
//   // });
};

abilityEditorService.onClose = function () {
  abilityEditorService.hot.destroy();
  abilityEditorService.hot = null;
  abilityEditorService.file = null;

  abilityEditorService.activeSignatureDataTable = null;
  abilityEditorService.playerTable = null;
  abilityEditorService.positionSignatureAbilityTable = null;
  abilityEditorService.signatureAbilityTable = null;

  window.removeEventListener('resize', windowResizeListener);
};

module.exports = abilityEditorService;

function addEventListeners () {
  window.addEventListener('resize', windowResizeListener);

  // const strictSignaturesCheckbox = document.querySelector('#enforce-signature-positions');
  // strictSignaturesCheckbox.addEventListener('change', () => {
  //   abilityEditorService.strictSignatures = strictSignaturesCheckbox.checked;
  // });
};

function windowResizeListener () {
  abilityEditorService.hot.updateSettings({
    width: document.querySelector('.ability-editor-content').offsetWidth
  });
};

function processChanges(changes) {
  if (!changes) { return; }

  const flipSaveOnChange = abilityEditorService.file.settings.saveOnChange;
  abilityEditorService.file.settings = {
    'saveOnChange': false
  };

  changes.forEach((change) => {
    const recordIndex = change[0];
    const column = change[1];
    const oldValue = change[2];
    const newValue = change[3];

    if (column === 'Player') {
      /* when we change the player, we need to
        1) Find the player index in the player table
        2) Check that the selected ability still matches the new player type. If it doesn't, attempt to find a match.
          2a) If no match is found, do not change the value.
          2b) If a match is found, change it.
        3) Set the new reference based on the result in #1
      */
      const newPlayerIndex = abilityEditorService.playerTable.records.findIndex((record) => {
        return `${record.FirstName} ${record.LastName}` === newValue;
      });

      if (newPlayerIndex === -1) { return; }

      const newPlayerType = abilityEditorService.playerTable.records[newPlayerIndex].PlayerType;

      const positionSignatureAbilityIndex = utilService.bin2dec(abilityEditorService.activeSignatureDataTable.records[recordIndex].Signature.substring(16));
      const positionSignatureAbility = abilityEditorService.positionSignatureAbilityTable.records[positionSignatureAbilityIndex];
      const positionSignatureAbilityTypeRequirement = positionSignatureAbility.ArchetypeRequirement;

      if (positionSignatureAbilityTypeRequirement !== newPlayerType) {
        const newPositionSignatureAbilityIndex = abilityEditorService.positionSignatureAbilityTable.records.findIndex((record) => {
          return (record.Ability === positionSignatureAbility.Ability
              && record.ArchetypeRequirement === newPlayerType);
        });

        if (newPositionSignatureAbilityIndex >= 0) {
          const newPositionSignatureReference = utilService.dec2bin(abilityEditorService.positionSignatureAbilityTable.header.tableId, 15) + utilService.dec2bin(newPositionSignatureAbilityIndex, 17);
          abilityEditorService.activeSignatureDataTable.records[recordIndex].Signature = newPositionSignatureReference;
        }
      }

      const newReference = utilService.dec2bin(franchiseGameYearService.getTableId('Player', 20), 15) + utilService.dec2bin(newPlayerIndex, 17);
      abilityEditorService.activeSignatureDataTable.records[recordIndex].Player = newReference;

    } else if (column === 'Signature') {
      /* when we change signature, we need to
        1) Find the index of the selected signature in the sig table
        2) Find the index of the signature in the PositionSignatureAbilityTable, and select the appropriate record per Player Type if applicable
        3) Calculate the new reference based on the result in #2
      */
      const signatureIndex = abilityEditorService.signatureAbilityTable.records.findIndex((record) => {
        return record.Name === newValue;
      });

      if (signatureIndex === -1) { return; }

      const playerIndex = utilService.bin2dec(abilityEditorService.activeSignatureDataTable.records[recordIndex].Player.substring(16));
      const playerRecord = abilityEditorService.playerTable.records[playerIndex];
      const playerArchetype = playerRecord.PlayerType;

      positionSignatureAbilityIndex = abilityEditorService.positionSignatureAbilityTable.records.findIndex((record) => {
        return (record.Ability == utilService.dec2bin(abilityEditorService.signatureAbilityTable.header.tableId, 15) + utilService.dec2bin(signatureIndex, 17)
          && record.ArchetypeRequirement === playerArchetype);
      });

      if (positionSignatureAbilityIndex === -1) {
        positionSignatureAbilityIndex = abilityEditorService.positionSignatureAbilityTable.records.findIndex((record) => {
          return record.Ability == utilService.dec2bin(abilityEditorService.signatureAbilityTable.header.tableId, 15) + utilService.dec2bin(signatureIndex, 17);
        });
      }

      if (positionSignatureAbilityIndex >= 0) {
        const newReference = utilService.dec2bin(abilityEditorService.positionSignatureAbilityTable.header.tableId, 15) + utilService.dec2bin(positionSignatureAbilityIndex, 17);
        abilityEditorService.activeSignatureDataTable.records[recordIndex].Signature = newReference;
      }
    }
  });

  if (flipSaveOnChange) {
    abilityEditorService.file.save();
    abilityEditorService.file.settings = {
      'saveOnChange': true
    };
  }
};

function processSelection(selection) {

};

function formatTable(table) {
  return table.records.map((record) => {
    return record._fields.reduce((accumulator, currentValue) => {
      if (currentValue.key === 'Signature') {
        const positionSignatureRecordIndex = utilService.bin2dec(currentValue.value.substring(16));
        const positionSignatureAbility = abilityEditorService.positionSignatureAbilityTable.records[positionSignatureRecordIndex].Ability;
        const signatureRecordIndex = utilService.bin2dec(positionSignatureAbility.substring(16));

        accumulator[currentValue.key] = abilityEditorService.signatureAbilityTable.records[signatureRecordIndex].Name;
      }
      else if (currentValue.key === 'Player') {
        const recordIndex = utilService.bin2dec(currentValue.value.substring(16));
        const record = abilityEditorService.playerTable.records[recordIndex]
        accumulator[currentValue.key] = `${record.FirstName} ${record.LastName}`;
      }
      else {
        accumulator[currentValue.key] = currentValue.value;
      }

      return accumulator;
    }, {});
  });
};

function formatHeaders(table) {
  if (table.offsetTable) {
    if (abilityEditorService.showHeaderTypes) {
      return table.offsetTable.map((offset) => {
        return `${offset.name} <div class="header-type">${offset.type}</div>`;
      });
    } else {
      return table.offsetTable.map((offset) => {
        return offset.name;
      });
    }
  } else {
    return [];
  }
};

function formatColumns(table) {
  return [{
    'data': 'Signature',
    'renderer': 'dropdown',
    'wordWrap': false,
    'editor': 'dropdown',
    'source': getSignatureChoices()
  }, {
    'data': 'Player',
    'renderer': 'dropdown',
    'wordWrap': false,
    'editor': 'dropdown',
    'source': getPlayerChoices()
  }, {
    'data': 'Active',
    'renderer': 'dropdown',
    'wordWrap': false,
    'editor': 'dropdown',
    'source': ['true', 'false']
  }, {
    'data': 'SlotIndex',
    'renderer': 'text',
    'wordWrap': false,
    'editor': 'text'
  }];
};

function getSignatureChoices() {
  return abilityEditorService.signatureAbilityTable.records.map((record) => {
    return record.Name;
  });
};

function getPlayerChoices () {
  return abilityEditorService.playerTable.records.map((record) => {
    return `${record.FirstName} ${record.LastName}`;
  });
};

function calculateColumnWidths(columns, table) {
  let widths = columns.map((col, index) => {
    const offset = table.offsetTable[index];
    const colMinWidth = ((col.data.length * 9) + 26);
    let calculatedWidth = 0;

    if (offset.isReference || offset.enum) {
      calculatedWidth = 350;
    }
    else if (offset.maxLength) {
      calculatedWidth = (offset.maxLength * 9) + 26;
    }
    else if (offset.type === 'bool') {
      calculatedWidth = 80;
    }
    else {
      calculatedWidth = (offset.length * 9) + 26;
    }

    return colMinWidth > calculatedWidth ? colMinWidth : calculatedWidth;
  });
  
  return widths;
};

function referenceRenderer(instance, td, row, col, prop, value, cellProperties) {
  if (value && value.length === 32) {
    utilService.removeChildNodes(td);
    const referenceLink = document.createElement('a');
    const otherTableFlag = value[0];

    if (otherTableFlag === '0') {
      const tableIndex = utilService.bin2dec(value.substring(3,15));
      const recordIndex = utilService.bin2dec(value.substring(16));
      const table = abilityEditorService.file.getTableByIndex(tableIndex);

      if (tableIndex > 0 && table) {
        referenceLink.innerHTML = `${table.name} - ${recordIndex}`;
        td.appendChild(referenceLink);

        referenceLink.addEventListener('click', function () {
          // abilityEditorService.navSteps[abilityEditorService.navSteps.length - 1].column = col;
          // abilityEditorService.navSteps[abilityEditorService.navSteps.length - 1].recordIndex = row;

          // abilityEditorService.rowIndexToSelect = recordIndex;
          // abilityEditorService.columnIndexToSelect = 0;

          if (table.header.tableId != abilityEditorService.tableSelector.getValue()) {
            abilityEditorService.tableSelector.setValue(table.header.tableId);
          } 
          else {
            abilityEditorService.hot.selectCell(recordIndex, 0);
          }

          // setTimeout(() => {
            // abilityEditorService.navSteps[abilityEditorService.navSteps.length - 1].recordIndex = recordIndex;
          // }, 1000);
        });
      } else {
        td.innerHTML = value;
      }
    } else {
      td.innerHTML = value;
    }
  } else {
    td.innerHTML = value;
  }

  return td;
};