// The show-on-hover edit button of reference and blob cells
export function createEditButton(
    action: 'edit-reference' | 'edit-blob',
    label: string
): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'table-cell-edit-button';
    button.dataset.action = action;
    button.setAttribute('aria-label', label);
    return button;
}
