const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(value, max));

// Port of v4's ReferenceRenderer._referenceEditorOnClick: below the anchor, or above it when
// there isn't room below, then clamped to the window.
export function placePopover(
    anchor: { top: number; bottom: number; left: number },
    size: { width: number; height: number },
    viewport: { width: number; height: number }
): { top: number; left: number } {
    const spaceBelow = viewport.height - 20 - anchor.bottom;
    const spaceAbove = anchor.top;
    const displayOnTop =
        size.height > spaceBelow &&
        (size.height <= spaceAbove || spaceAbove > spaceBelow);
    const top = displayOnTop ? anchor.top - size.height : anchor.bottom;
    return {
        top: clamp(top, 0, viewport.height - size.height),
        left: clamp(anchor.left, 0, viewport.width - size.width)
    };
}
