module.exports = {
    getContextMenu(tableEditorService) {
        return {
            items: {
                'empty_row': {
                    name: () => {
                        return 'Set selected record(s) as empty';
                    },
                    disabled: () => {
                        const selectedRow = tableEditorService.hot.getSelectedLast()[0];
                        return tableEditorService.selectedTable.header.record1Size < 4 ||
                            tableEditorService.selectedTable.records[selectedRow].isEmpty;
                    },
                    callback: (key, selection, clickEvent) => {
                        selection.forEach((selectionGroup) => {
                            for (let i = selectionGroup.start.row; i <= selectionGroup.end.row; i++) {
                                tableEditorService.selectedTable.records[i].empty();
                            }
                        });

                        // We need to iterate over every empty record because their empty record reference may have changed.
                        let changes = [];

                        tableEditorService.selectedTable.emptyRecords.forEach((_, key) => {
                            tableEditorService.selectedTable.records[key].fields.forEach((field, index) => {
                                changes.push([key, index, field.value]);
                            });
                        });

                        tableEditorService.hot.setDataAtCell(changes, 'onEmpty');
                    }
                },
                'advanced': {
                    name: 'Advanced...',
                    submenu: {
                        items: [
                            {
                                key: 'advanced:setNextRecordToUse',
                                name: 'Set as next empty record to use',
                                disabled: () => {
                                    return tableEditorService.hot.getSelectedLast()[2] !== tableEditorService.hot.getSelectedLast()[0];
                                },
                                callback: (key, selection, clickEvent) => {
                                    tableEditorService.selectedTable.setNextRecordToUse(selection[0].start.row, true);
                                }
                            }
                        ]
                    }
                }
            }
        }
    }
}