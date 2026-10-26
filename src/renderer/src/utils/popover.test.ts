import { describe, expect, it } from 'vitest';
import { placePopover } from './popover';

const viewport = { width: 1000, height: 800 };
const size = { width: 300, height: 200 };

describe('placePopover', () => {
    it('goes below the anchor when there is room', () => {
        expect(
            placePopover({ top: 100, bottom: 130, left: 50 }, size, viewport)
        ).toEqual({
            top: 130,
            left: 50
        });
    });

    it('goes above the anchor when there is no room below', () => {
        // spaceBelow = 800 - 20 - 700 = 80 < 200, spaceAbove = 670
        expect(
            placePopover({ top: 670, bottom: 700, left: 50 }, size, viewport)
        ).toEqual({
            top: 470,
            left: 50
        });
    });

    it('picks the roomier side when neither fits', () => {
        const tall = { width: 300, height: 600 };
        // below = 800 - 20 - 400 = 380, above = 370 -> below, then clamped to 800 - 600
        expect(
            placePopover({ top: 370, bottom: 400, left: 0 }, tall, viewport).top
        ).toBe(200);
        // below = 800 - 20 - 450 = 330, above = 420 -> above, 420 - 600 clamps to 0
        expect(
            placePopover({ top: 420, bottom: 450, left: 0 }, tall, viewport).top
        ).toBe(0);
    });

    it('clamps both axes to the window', () => {
        expect(
            placePopover({ top: 50, bottom: 700, left: 900 }, size, viewport)
        ).toEqual({
            top: 600,
            left: 700
        });
        expect(
            placePopover({ top: 10, bottom: 20, left: -40 }, size, viewport)
                .left
        ).toBe(0);
    });

    it('pins to 0 when the editor is bigger than the window', () => {
        expect(
            placePopover(
                { top: 100, bottom: 130, left: 50 },
                { width: 1200, height: 900 },
                viewport
            )
        ).toEqual({ top: 0, left: 0 });
    });
});
