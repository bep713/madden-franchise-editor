import { describe, expect, it } from 'vitest';
import { logoUrl } from './teamLogos';

describe('logoUrl', () => {
    it('finds an NFL logo by its teamData path', () => {
        expect(
            logoUrl({ logoPath: 'img/team-logos/nfl/cardinals.PNG' })
        ).toEqual(expect.stringContaining('cardinals'));
    });

    it('has no logo for a custom team or an unknown file', () => {
        expect(logoUrl({})).toBeUndefined();
        expect(
            logoUrl({ logoPath: 'img/team-logos/nfl/missing.PNG' })
        ).toBeUndefined();
    });
});
