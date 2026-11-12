import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleTeam } from '../../scheduleModel';
import TeamSelect from './TeamSelect';

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
        select: screen.getByRole('combobox', { name: 'Home team' })
    };
};

describe('TeamSelect', () => {
    it('shows the team abbreviations, with the value selected', () => {
        const { select } = setup();
        expect(select).toHaveValue('ARI');
        expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(
            ['ARI', 'LON']
        );
    });

    it('calls onChange with the team', async () => {
        const { onChange, select } = setup();
        await userEvent.selectOptions(select, 'LON');
        expect(onChange).toHaveBeenCalledWith(CUSTOM);
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
