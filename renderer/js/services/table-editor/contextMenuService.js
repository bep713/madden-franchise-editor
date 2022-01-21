module.exports = {
    getContextMenu(tableEditorView) {
        return {
            items: {
                'find_references': {
                    name: () => {
                        return 'Find references to this record...'
                    },
                    disabled: () => {
                        const selectedRows = tableEditorView.hot.getSelectedLast();
                        return selectedRows[0] !== selectedRows[2];
                    },
                    callback: (key, selection, clickEvent) => {
                        const selectedTableId = tableEditorView.selectedTable.header.tableId;
                        const selectedRow = selection[0].end.row;

                        const references = tableEditorView.file.getReferencesToRecord(selectedTableId, selectedRow);

                        const selectedRecordData = {
                            tableId: selectedTableId,
                            name: tableEditorView.selectedTable.name,
                            recordIndex: selectedRow
                        };

                        tableEditorView.showReferenceViewer(selectedRecordData, references)
                    }
                },
                'empty_row': {
                    name: () => {
                        return 'Set selected record(s) as empty';
                    },
                    disabled: () => {
                        const selectedRow = tableEditorView.hot.getSelectedLast()[0];
                        return selectedRow >= 0 &&
                            (tableEditorView.selectedTable.header.record1Size < 4 ||
                            tableEditorView.selectedTable.records[selectedRow].isEmpty);
                    },
                    callback: (key, selection, clickEvent) => {
                        selection.forEach((selectionGroup) => {
                            for (let i = selectionGroup.start.row; i <= selectionGroup.end.row; i++) {
                                tableEditorView.selectedTable.records[i].empty();
                            }
                        });

                        // We need to iterate over every empty record because their empty record reference may have changed.
                        let changes = [];

                        tableEditorView.selectedTable.emptyRecords.forEach((_, key) => {
                            tableEditorView.selectedTable.records[key].fields.forEach((field, index) => {
                                changes.push([key, index, field.value]);
                            });
                        });

                        tableEditorView.hot.setDataAtCell(changes, 'onEmpty');
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
                                    return tableEditorView.hot.getSelectedLast()[2] !== tableEditorView.hot.getSelectedLast()[0];
                                },
                                callback: (key, selection, clickEvent) => {
                                    tableEditorView.selectedTable.setNextRecordToUse(selection[0].start.row, true);
                                }
                            }
                        ]
                    }
                }
            }
        }
    }
}