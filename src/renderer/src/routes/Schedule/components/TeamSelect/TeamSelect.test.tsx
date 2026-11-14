import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleTeam } from '../../scheduleModel';
import TeamSelect, { filterTeams } from './TeamSelect';

const ARI: ScheduleTeam = {
    key: 'ARI',
    abbreviation: 'ARI',
    city: 'Arizona',
    nickname: 'Cardinals',
    logoPath: 'img/team-logos/nfl/cardinals.PNG',
    referenceIndex: 0,
    custom: false
};
const CUSTOM: ScheduleTeam = {
    key: 'LON',
    abbreviation: 'LON',
    city: 'London',
    nickname: 'Monarchs',
    referenceIndex: 5,
    custom: true
};

const setup = (value = ARI) => {
    const onChange = vi.fn();
    render(
        <TeamSelect
            label='Home team'
            onChange={onChange}
            teams={[ARI, CUSTOM]}
            value={value}
        />
    );
    return {
        onChange,
        input: screen.getByRole('combobox', { name: 'Home team' })
    };
};

describe('TeamSelect', () => {
    it('shows the value, and every team when opened', async () => {
        const { input } = setup();
        expect(input).toHaveValue('ARI');
        expect(screen.queryByRole('button', { name: 'LON' })).toBeNull();
        await userEvent.click(input);
        expect(screen.getByRole('button', { name: 'ARI' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'LON' })).toBeTruthy();
    });

    it('calls onChange with the clicked team', async () => {
        const { onChange, input } = setup();
        await userEvent.click(input);
        await userEvent.click(screen.getByRole('button', { name: 'LON' }));
        expect(onChange).toHaveBeenCalledWith(CUSTOM);
        expect(input).toHaveValue('ARI');
    });

    it('filters as you type, and Enter picks the first match', async () => {
        const { onChange, input } = setup();
        await userEvent.clear(input);
        await userEvent.type(input, 'lo');
        expect(screen.queryByRole('button', { name: 'ARI' })).toBeNull();
        await userEvent.keyboard('{Enter}');
        expect(onChange).toHaveBeenCalledWith(CUSTOM);
    });

    it('opens on the current team, so Enter keeps it', async () => {
        const { onChange, input } = setup(CUSTOM);
        await userEvent.click(input);
        await userEvent.keyboard('{Enter}');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('Escape closes and restores the value', async () => {
        const { onChange, input } = setup();
        await userEvent.clear(input);
        await userEvent.type(input, 'lo');
        await userEvent.keyboard('{Escape}');
        expect(input).toHaveValue('ARI');
        expect(screen.queryByRole('button', { name: 'LON' })).toBeNull();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('shows the logo for an NFL team', () => {
        setup();
        expect(document.querySelector('img')).toHaveAttribute(
            'src',
            expect.stringContaining('cardinals')
        );
        expect(document.querySelector('[data-placeholder]')).toBeNull();
    });

    it('shows a placeholder for a custom team', () => {
        setup(CUSTOM);
        expect(document.querySelector('img')).toBeNull();
        expect(document.querySelector('[data-placeholder]')).toHaveTextContent(
            'LON'
        );
    });
});

describe('filterTeams', () => {
    const team = (abbreviation: string): ScheduleTeam => ({
        ...CUSTOM,
        key: abbreviation,
        abbreviation
    });
    const teams = [team('ATL'), team('ULA'), team('LAC'), team('LAR')];

    it('returns every team for an empty query', () => {
        expect(filterTeams(teams, ' ')).toEqual(teams);
    });

    it('puts an exact match first', () => {
        expect(filterTeams(teams, 'lar').map((t) => t.key)).toEqual(['LAR']);
        const withLa = [team('LAC'), team('LA')];
        expect(filterTeams(withLa, 'LA').map((t) => t.key)).toEqual([
            'LA',
            'LAC'
        ]);
    });

    it('matches anywhere, ignoring case, prefixes first', () => {
        expect(filterTeams(teams, 'la').map((t) => t.key)).toEqual([
            'LAC',
            'LAR',
            'ULA'
        ]);
    });
});
