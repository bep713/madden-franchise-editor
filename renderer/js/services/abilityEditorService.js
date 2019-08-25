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
    const activeSignatureDataTables = abilityEditorService.file.getAllTablesByName('ActiveSignatureData');
    const activeSignatureDataTable = activeSignatureDataTables[0];
    const activeSignatureDataTable1 = activeSignatureDataTables[1];

    const playerTable = abilityEditorService.file.getTableByName('Player');
    const positionSignatureAbilityTable = abilityEditorService.file.getTableByName('PositionSignatureAbility');
    const signatureAbilityTable = abilityEditorService.file.getTableByName('SignatureAbility');
    // const teamTable = abilityEditorService.file.getTableById(franchiseGameYearService.getTableId('Team', 20));

    const teamTable = abilityEditorService.file.tables.find((table) => {
      return table.name === 'Team' && table.header.data1RecordCount > 1;
    });

    abilityEditorService.activeSignatureDataTable = activeSignatureDataTable;
    abilityEditorService.activeSignatureDataTable1 = activeSignatureDataTable1;
    abilityEditorService.playerTable = playerTable;
    abilityEditorService.positionSignatureAbilityTable = positionSignatureAbilityTable;
    abilityEditorService.signatureAbilityTable = signatureAbilityTable;
    abilityEditorService.teamTable = teamTable;

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
      activeSignatureDataTable1.readRecords(),
      playerTable.readRecords(['FirstName', 'LastName', 'TraitDevelopment', 'PlayerType', 'TeamIndex']),
      positionSignatureAbilityTable.readRecords(),
      signatureAbilityTable.readRecords(['Name', 'Description']),
      teamTable.readRecords(['ShortName', 'TeamIndex'])
    ]);

    readAllRecords.then(() => {
      const data1 = formatTable(activeSignatureDataTable);
      const data2 = formatTable(activeSignatureDataTable1);
      const data = data1.concat(data2);

      let metadata1 = [];
      let metadata2 = [];

      for (let i = 0; i < data1.length; i++) {
        metadata1.push({
          'tableId': activeSignatureDataTable.header.tableId,
          'recordNumber': i
        });
      }

      for (let i = 0; i < data2.length; i++) {
        metadata2.push({
          'tableId': activeSignatureDataTable1.header.tableId,
          'recordNumber': i
        });
      }

      const metadata = metadata1.concat(metadata2);

      Handsontable.hooks.once('afterCellMetaReset', () => {
        metadata.forEach((meta, index) => {
          for (let j = 0; j < columns.length; j++) {
            abilityEditorService.hot.setCellMeta(index, j, 'recordNumber', meta.recordNumber);
            abilityEditorService.hot.setCellMeta(index, j, 'tableId', meta.tableId);

            if (abilityEditorService.hot.getDataAtCell(index, j) === null) {
              abilityEditorService.hot.setCellMeta(index, j, 'readOnly', true);
            }
          }
        });
      }, abilityEditorService.hot);

      const headers = formatHeaders(activeSignatureDataTable);
      const columns = formatColumns(activeSignatureDataTable);

      abilityEditorService.hot.updateSettings({
        data: data,
        colHeaders: headers,
        columns: columns,
        colWidths: calculateColumnWidths(columns, activeSignatureDataTable),
        columnSorting: {
          initialConfig: {
            column: 1,
            sortOrder: 'asc'
          }
        }
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

    const meta = abilityEditorService.hot.getCellMeta(recordIndex, abilityEditorService.hot.propToCol(column));
    const activeSignatureDataTable = abilityEditorService.file.getTableById(meta.tableId);

    if (column === 'Player') {
      /* when we change the player, we need to
        1) Find the player index in the player table
        2) Check that the selected ability still matches the new player type. If it doesn't, attempt to find a match.
          2a) If no match is found, do not change the value.
          2b) If a match is found, change it.
        3) Set the new reference based on the result in #1
      */
      
      const playerInfo = /(\S+)\s(\S+(?:(?=\s\()|(?!\s\()\s\S+))\s\((\S+)\)/.exec(newValue);
      if (!playerInfo) { 
        resetCellValue(recordIndex, 1, oldValue);
        return; 
      }

      const firstName = playerInfo[1];
      const lastName = playerInfo[2];
      const shortName = playerInfo[3];

      const teamIndex = abilityEditorService.teamTable.records.find((record) => {
        return record.ShortName === shortName;
      }).TeamIndex;

      let newPlayerIndex;
     
      newPlayerIndex = abilityEditorService.playerTable.records.findIndex((record) => {
        return record.FirstName === firstName && record.LastName === lastName && record.TeamIndex === teamIndex;
      });

      if (newPlayerIndex === -1) {
        // check if there's a space in the last name. If so, retry with the 'second name' as part of the first name (rare) Ex: Shaun Dion Hamilton. Shaun Dion is the first name.
        // Usually, the last name is the one with a space. Ex: Leighton Vander Esch or Melvin Gordon III.
        const newFirstName = firstName + ' ' + lastName.substring(0, lastName.indexOf(' '));
        const newLastName = lastName.substring(lastName.indexOf(' ') + 1);

        console.log(newFirstName, newLastName);
        
        newPlayerIndex = abilityEditorService.playerTable.records.findIndex((record) => {
          return record.FirstName === newFirstName && record.LastName === newLastName && record.TeamIndex === teamIndex;
        });

        if (newPlayerIndex === -1) {
          resetCellValue(recordIndex, 1, oldValue);
          return; 
        }
      }

      const newPlayerType = abilityEditorService.playerTable.records[newPlayerIndex].PlayerType;

      const positionSignatureAbilityIndex = utilService.bin2dec(activeSignatureDataTable.records[meta.recordNumber].Signature.substring(16));
      const positionSignatureAbility = abilityEditorService.positionSignatureAbilityTable.records[positionSignatureAbilityIndex];
      const positionSignatureAbilityTypeRequirement = positionSignatureAbility.ArchetypeRequirement;

      if (positionSignatureAbilityTypeRequirement !== newPlayerType) {
        const newPositionSignatureAbilityIndex = abilityEditorService.positionSignatureAbilityTable.records.findIndex((record) => {
          return (record.Ability === positionSignatureAbility.Ability
              && record.ArchetypeRequirement === newPlayerType);
        });

        if (newPositionSignatureAbilityIndex >= 0) {
          const newPositionSignatureReference = utilService.dec2bin(abilityEditorService.positionSignatureAbilityTable.header.tableId, 15) + utilService.dec2bin(newPositionSignatureAbilityIndex, 17);
          activeSignatureDataTable.records[meta.recordNumber].Signature = newPositionSignatureReference;
        }
      }

      const newReference = utilService.dec2bin(franchiseGameYearService.getTableId('Player', 20), 15) + utilService.dec2bin(newPlayerIndex, 17);
      activeSignatureDataTable.records[meta.recordNumber].Player = newReference;

    } else if (column === 'Signature') {
      /* when we change signature, we need to
        1) Find the index of the selected signature in the sig table
        2) Find the index of the signature in the PositionSignatureAbilityTable, and select the appropriate record per Player Type if applicable
        3) Calculate the new reference based on the result in #2
      */
      const signatureIndex = abilityEditorService.signatureAbilityTable.records.findIndex((record) => {
        return record.Name === newValue;
      });

      if (signatureIndex === -1) { 
        resetCellValue(recordIndex, 0, oldValue);
        return; 
      }

      const playerIndex = utilService.bin2dec(activeSignatureDataTable.records[meta.recordNumber].Player.substring(16));
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
        activeSignatureDataTable.records[meta.recordNumber].Signature = newReference;
      }
    }
  });

  if (flipSaveOnChange) {
    abilityEditorService.file.save();
    abilityEditorService.file.settings = {
      'saveOnChange': true
    };
  }

  function resetCellValue(row, col, oldValue) {
    abilityEditorService.hot.setDataAtCell(row, col, oldValue);
  }
};

function processSelection(selection) {

};

function formatTable(table) {
  return table.records.map((record) => {
    return record._fields.reduce((accumulator, currentValue) => {
      if (currentValue.key === 'Signature') {
        const isValidReference = utilService.bin2dec(record.Signature.substring(0, 15)) !== 0;

        if (isValidReference) {
          const positionSignatureRecordIndex = utilService.bin2dec(currentValue.value.substring(16));
          const positionSignatureAbility = abilityEditorService.positionSignatureAbilityTable.records[positionSignatureRecordIndex].Ability;
          const signatureRecordIndex = utilService.bin2dec(positionSignatureAbility.substring(16));

          accumulator[currentValue.key] = abilityEditorService.signatureAbilityTable.records[signatureRecordIndex].Name;
        }
      }
      else if (currentValue.key === 'Player') {
        const isValidReference = utilService.bin2dec(record.Player.substring(0, 15)) !== 0;

        if (isValidReference) {
          const recordIndex = utilService.bin2dec(currentValue.value.substring(16));
          const record = abilityEditorService.playerTable.records[recordIndex];
          const teamAbbreviation = abilityEditorService.teamTable.records.find((teamRecord) => { return teamRecord.TeamIndex === record.TeamIndex; }).ShortName;
          accumulator[currentValue.key] = `${record.FirstName} ${record.LastName} (${teamAbbreviation})`;
        }
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
  return abilityEditorService.signatureAbilityTable.records.filter((record) => {
    return record.getFieldByKey('Name').unformattedValue !== '00000000000000000000000000000000';
  }).map((record) => {
    return record.Name;
  });
};

function getPlayerChoices () {
  return abilityEditorService.playerTable.records.filter((record) => {
    return record.getFieldByKey('LastName').unformattedValue != '00000000000000000000000000000000';
  }).map((record) => {
    const teamAbbreviation = abilityEditorService.teamTable.records.find((teamRecord) => { return teamRecord.TeamIndex === record.TeamIndex; }).ShortName;
    return `${record.FirstName} ${record.LastName} (${teamAbbreviation})`;
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