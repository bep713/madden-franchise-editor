const utilService = require("../../../utilService");

// min wins when the range is empty (editor bigger than the window)
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

class ReferenceRenderer {
  constructor(tableEditorWrapper) {
    this.tableEditorWrapper = tableEditorWrapper;
  }

  renderer(instance, td, row, col, prop, value, cellProperties) {
    if (value && value.length === 32) {
      utilService.removeChildNodes(td);
      const otherTableFlag = value[0];

      if (otherTableFlag === "0") {
        const tableId = utilService.bin2dec(value.substring(2, 15));
        const recordIndex = utilService.bin2dec(value.substring(16));

        // Look up table from cached table list (IPC format)
        const tableList = this.tableEditorWrapper.selectedTableEditor.tableList;
        const table = tableList.find((t) => t.id === tableId);

        const referenceWrapper = document.createElement("div");

        if (tableId > 0 && table) {
          cellProperties.editor = false;

          const referenceLink = document.createElement("a");
          referenceLink.innerHTML = `${table.name} - ${recordIndex}`;
          referenceWrapper.appendChild(referenceLink);

          referenceLink.addEventListener("click", (event) => {
            this.tableEditorWrapper.selectedTableEditor.navSteps[
              this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1
            ].column = col;
            this.tableEditorWrapper.selectedTableEditor.navSteps[
              this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1
            ].recordIndex = row;

            this.tableEditorWrapper.selectedTableEditor.rowIndexToSelect =
              recordIndex;
            this.tableEditorWrapper.selectedTableEditor.columnIndexToSelect = 0;

            if (
              table.id !=
              this.tableEditorWrapper.selectedTableEditor.tableSelector.getValue()
            ) {
              this.tableEditorWrapper.selectedTableEditor.tableSelector.setValue(
                table.id,
              );
            } else {
              this.tableEditorWrapper.selectedTableEditor.hot.selectCell(
                recordIndex,
                0,
              );
            }

            setTimeout(() => {
              this.tableEditorWrapper.selectedTableEditor.navSteps[
                this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1
              ].recordIndex = recordIndex;
            }, 125);
          });

          referenceLink.addEventListener("auxclick", (event) => {
            this.tableEditorWrapper.lastSelectedCell.row = row;
            this.tableEditorWrapper.lastSelectedCell.column = col;

            this.tableEditorWrapper.selectedTableEditor.navSteps[
              this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1
            ].column = col;
            this.tableEditorWrapper.selectedTableEditor.navSteps[
              this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1
            ].recordIndex = row;

            if (event.button === 1) {
              this.tableEditorWrapper._openTableInNewTab(table.id, recordIndex);
            }
          });
        } else {
          referenceWrapper.innerHTML = value;
        }

        // Allow user to manually edit the reference
        referenceWrapper.classList.add(
          "table-cell--with-button",
          "table-cell-button--show-on-hover",
        );
        const referenceEditorButton = document.createElement("button");
        referenceEditorButton.classList.add(
          "table-cell-button",
          "table-cell-button--right",
          "edit-button",
        );
        referenceWrapper.appendChild(referenceEditorButton);

        referenceEditorButton.addEventListener("click", () => {
          this._referenceEditorOnClick(
            td,
            row,
            col,
            tableId,
            recordIndex,
            value,
          );
        });

        td.appendChild(referenceWrapper);
      } else {
        td.innerHTML = value;
      }
    } else {
      td.innerHTML = value;
    }

    td.classList = cellProperties?.className || "";
    return td;
  }

  _referenceEditorOnClick(td, row, col, tableId, recordIndex, value) {
    const referenceEditorWrapper = document.getElementById(
      "reference-editor-wrapper",
    );
    referenceEditorWrapper.classList.remove("hidden");
    referenceEditorWrapper.dataset.selectedRow = row;
    referenceEditorWrapper.dataset.selectedCol = col;

    const referenceEditorContent = document.getElementById(
      "reference-editor-content",
    );
    const referenceEditorHighlight = document.getElementById(
      "reference-editor-highlight",
    );

    const referenceEditorClientRect =
      referenceEditorContent.getBoundingClientRect();
    const tdClientRect = td.getBoundingClientRect();
    const editorHeight = referenceEditorClientRect.height;
    const editorWidth = referenceEditorClientRect.width;

    // Prefer below the cell, then above. If neither fits (short window), use
    // the roomier side and clamp so the whole editor stays on screen.
    const spaceBelow = window.innerHeight - 20 - tdClientRect.bottom;
    const spaceAbove = tdClientRect.top;
    const displayOnTop =
      editorHeight > spaceBelow &&
      (editorHeight <= spaceAbove || spaceAbove > spaceBelow);

    const top = displayOnTop
      ? tdClientRect.top - editorHeight
      : tdClientRect.bottom;
    const left = tdClientRect.left;

    referenceEditorContent.style.top =
      clamp(top, 0, window.innerHeight - editorHeight) + "px";
    referenceEditorContent.style.left =
      clamp(left, 0, window.innerWidth - editorWidth) + "px";

    referenceEditorHighlight.style.top = tdClientRect.top + "px";
    referenceEditorHighlight.style.left = tdClientRect.left + "px";
    referenceEditorHighlight.style.width = tdClientRect.width + "px";
    referenceEditorHighlight.style.height = tdClientRect.height + "px";

    this.tableEditorWrapper.referenceEditor.referenceEditorSelector.setValue(
      tableId,
    );

    const rowInput = document.getElementById("reference-editor-row");
    rowInput.value = recordIndex;

    const binaryInput = document.getElementById("reference-editor-binary");
    binaryInput.value = value;
  }
}

module.exports = ReferenceRenderer;
