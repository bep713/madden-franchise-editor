import { useCallback, useEffect, useRef } from 'react';

// How long Back/Forward must be held to open the history menu (Chrome's)
export const HOLD_MS = 500;

export interface HoldHandlers {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerUp: () => void;
    onPointerCancel: () => void;
    onClick: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
}

// A browser's Back button: a click calls onClick, a hold or a right-click
// opens the menu. Releasing over a menu item after a hold picks it (press,
// drag, release), by clicking the item under the pointer.
export default function useHoldToOpen(
    onClick: () => void,
    onOpenMenu: () => void,
    disabled: boolean
): HoldHandlers {
    const timerRef = useRef<number | undefined>(undefined);
    // Set when a hold opened the menu, so the click that follows is swallowed
    const heldRef = useRef(false);
    const releaseRef = useRef<((e: PointerEvent) => void) | null>(null);

    const clearTimer = useCallback(() => {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
    }, []);

    const removeRelease = useCallback(() => {
        if (releaseRef.current) {
            document.removeEventListener('pointerup', releaseRef.current);
            releaseRef.current = null;
        }
    }, []);

    useEffect(
        () => () => {
            clearTimer();
            removeRelease();
        },
        [clearTimer, removeRelease]
    );

    const latest = useRef({ onClick, onOpenMenu, disabled });
    useEffect(() => {
        latest.current = { onClick, onOpenMenu, disabled };
    });

    return {
        onPointerDown: (e) => {
            heldRef.current = false;
            clearTimer();
            removeRelease();
            if (e.button !== 0 || latest.current.disabled) {
                return;
            }
            timerRef.current = window.setTimeout(() => {
                timerRef.current = undefined;
                heldRef.current = true;
                latest.current.onOpenMenu();
                const onRelease = (ev: PointerEvent): void => {
                    removeRelease();
                    const item = document
                        .elementFromPoint(ev.clientX, ev.clientY)
                        ?.closest<HTMLElement>('[data-history-index]');
                    item?.click();
                };
                releaseRef.current = onRelease;
                document.addEventListener('pointerup', onRelease);
            }, HOLD_MS);
        },
        onPointerUp: clearTimer,
        onPointerCancel: () => {
            clearTimer();
            removeRelease();
        },
        onClick: () => {
            if (heldRef.current) {
                heldRef.current = false;
                return;
            }
            if (!latest.current.disabled) {
                latest.current.onClick();
            }
        },
        onContextMenu: (e) => {
            e.preventDefault();
            clearTimer();
            if (!latest.current.disabled) {
                latest.current.onOpenMenu();
            }
        }
    };
}
