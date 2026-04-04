module.exports = {
  getContextMenu(tableEditorView) {
    return {
      items: {
        find_references: {
          name: () => {
            return "Find references to this record...";
          },
          disabled: () => {
            const selectedRows = tableEditorView.hot.getSelectedLast();
            return selectedRows[0] !== selectedRows[2];
          },
          callback: async (key, selection, clickEvent) => {
            const selectedTableId = tableEditorView.selectedTable.tableId;
            const selectedRow = selection[0].end.row;

            const result = await window.franchiseAPI.getReferencesToRecord(
              tableEditorView.fileId,
              selectedTableId,
              selectedRow,
            );

            if (result.error) {
              console.error("Failed to get references:", result.error);
              return;
            }

            const selectedRecordData = {
              tableId: selectedTableId,
              name: tableEditorView.selectedTable.name,
              recordIndex: selectedRow,
            };

            tableEditorView.showReferenceViewer(
              selectedRecordData,
              result.data,
            );
          },
        },
        open_new_tab: {
          name: () => {
            return "Open this reference in a new tab";
          },
          disabled: () => {
            const selectedRows = tableEditorView.hot.getSelectedLast();
            if (
              selectedRows[0] !== selectedRows[2] ||
              selectedRows[1] !== selectedRows[3]
            ) {
              return true;
            } else {
              const cellNode = tableEditorView.hot.getCell(
                selectedRows[0],
                selectedRows[1],
              );
              const editButton = cellNode.querySelector(".edit-button"); // reference renderers always have an edit button
              return !editButton;
            }
          },
          callback: (key, selection, clickEvent) => {
            const cellNode = tableEditorView.hot.getCell(
              selection[0].end.row,
              selection[0].end.col,
            );
            const link = cellNode.querySelector("a");
            const event = new MouseEvent("auxclick", { button: 1 });
            link.dispatchEvent(event);
          },
        },
        empty_row: {
          name: () => {
            return "Set selected record(s) as empty";
          },
          disabled: () => {
            // TODO: Migrate to IPC - requires main process handler for emptying records
            return true;
          },
          callback: (key, selection, clickEvent) => {
            // TODO: Implement via IPC call to main process
            console.warn("Empty row feature not yet migrated to IPC");
          },
        },
        advanced: {
          name: "Advanced...",
          submenu: {
            items: [
              {
                key: "advanced:setNextRecordToUse",
                name: "Set as next empty record to use",
                disabled: () => {
                  return (
                    tableEditorView.hot.getSelectedLast()[2] !==
                    tableEditorView.hot.getSelectedLast()[0]
                  );
                },
                callback: (key, selection, clickEvent) => {
                  tableEditorView.selectedTable.setNextRecordToUse(
                    selection[0].start.row,
                    true,
                  );
                },
              },
            ],
          },
        },
      },
    };
  },
};
