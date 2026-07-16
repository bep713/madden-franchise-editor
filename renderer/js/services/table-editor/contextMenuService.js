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

            const selectedRecordData = {
              tableId: selectedTableId,
              name: tableEditorView.selectedTable.name,
              recordIndex: selectedRow,
            };

            const references = Array.isArray(result.data) ? result.data : [];

            if (result.error) {
              console.error("Failed to get references:", result.error);
              references.errorMessage = result.error;
            }

            tableEditorView.showReferenceViewer(
              selectedRecordData,
              references,
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
            const selectedRange = tableEditorView.hot.getSelectedLast();
            if (!selectedRange) {
              return true;
            }

            const physicalStart = tableEditorView.hot.toPhysicalRow(
              selectedRange[0],
            );
            const physicalEnd = tableEditorView.hot.toPhysicalRow(
              selectedRange[2],
            );

            const start = Math.min(physicalStart, physicalEnd);
            const end = Math.max(physicalStart, physicalEnd);

            if (start < 0 || end < 0) {
              return true;
            }

            const headerRecordSize =
              tableEditorView.selectedTable?.header?.record1Size ?? 0;
            if (headerRecordSize < 4) {
              return true;
            }

            for (let recordIndex = start; recordIndex <= end; recordIndex++) {
              const meta = tableEditorView.selectedTable?.recordMeta?.[recordIndex];
              const isEmpty = Boolean(meta?.isEmpty);
              if (!isEmpty) {
                return false;
              }
            }

            return true;
          },
          callback: async (key, selection, clickEvent) => {
            const selectedRange = tableEditorView.hot.getSelectedLast();
            if (!selectedRange) {
              return;
            }

            const physicalStart = tableEditorView.hot.toPhysicalRow(
              selectedRange[0],
            );
            const physicalEnd = tableEditorView.hot.toPhysicalRow(
              selectedRange[2],
            );

            const start = Math.min(physicalStart, physicalEnd);
            const end = Math.max(physicalStart, physicalEnd);
            const targetIndices = [];

            for (let recordIndex = start; recordIndex <= end; recordIndex++) {
              const meta = tableEditorView.selectedTable?.recordMeta?.[recordIndex];
              if (!meta?.isEmpty) {
                targetIndices.push(recordIndex);
              }
            }

            if (!targetIndices.length) {
              return;
            }

            const result = await window.franchiseAPI.setTableRecordsEmpty(
              tableEditorView.fileId,
              tableEditorView.selectedTable.tableId,
              targetIndices,
            );

            if (result?.error) {
              console.error("Failed to set records empty:", result.error);
              return;
            }

            await tableEditorView.loadTableById(tableEditorView.selectedTable.tableId);
            tableEditorView.hot.selectCell(selectedRange[0], selectedRange[1]);
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
                  if (
                    typeof tableEditorView.selectedTable?.setNextRecordToUse ===
                    "function"
                  ) {
                    tableEditorView.selectedTable.setNextRecordToUse(
                      selection[0].start.row,
                      true,
                    );
                  } else {
                    console.warn(
                      "setNextRecordToUse is not available on serialized tables yet.",
                    );
                  }
                },
              },
            ],
          },
        },
      },
    };
  },
};
