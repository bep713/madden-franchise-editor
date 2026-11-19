import { describe, expect, it } from 'vitest';
import { relativeTime } from './relativeTime';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = 1_700_000_000_000;

describe('relativeTime', () => {
    it.each([
        [0, 'Just now'],
        [MINUTE - 1, 'Just now'],
        [MINUTE, '1 min ago'],
        [HOUR - 1, '59 min ago'],
        [HOUR, '1 h ago'],
        [DAY - 1, '23 h ago'],
        [DAY, '1 d ago'],
        [10 * DAY + HOUR, '10 d ago']
    ])('%i ms ago reads %s', (elapsed, expected) => {
        expect(relativeTime(NOW - elapsed, NOW)).toBe(expected);
    });
});
