import { useMemo, useState } from 'react';
import Autocomplete from '@renderer/components/Autocomplete/Autocomplete';
import type { ScheduleTeam } from '../../scheduleModel';
import { logoUrl } from '../../teamLogos';
import styles from './TeamSelect.module.css';

interface Props {
    teams: readonly ScheduleTeam[];
    value: ScheduleTeam;
    onChange: (team: ScheduleTeam) => void;
    // "Away team" / "Home team"
    label: string;
    // borderless (the default view) shows the border on hover only
    variant?: 'default' | 'borderless';
}

interface LogoProps {
    team: ScheduleTeam;
}

export const TeamLogo: React.FC<LogoProps> = ({ team }: LogoProps) => {
    const url = logoUrl(team);
    return url ? (
        <img alt='' className={styles.logo} src={url} />
    ) : (
        // Custom teams: the abbreviation in a circle
        <span aria-hidden className={styles.placeholder} data-placeholder>
            {team.abbreviation.slice(0, 3)}
        </span>
    );
};

// Abbreviations containing the query: an exact match first, then those
// starting with it
export function filterTeams(
    teams: readonly ScheduleTeam[],
    query: string
): ScheduleTeam[] {
    const q = query.trim().toLowerCase();
    if (!q) return [...teams];
    const rank = (t: ScheduleTeam): number => {
        const abbreviation = t.abbreviation.toLowerCase();
        if (abbreviation === q) return 0;
        return abbreviation.startsWith(q) ? 1 : 2;
    };
    // sort is stable, so each rank keeps the teams' order
    return teams
        .filter((t) => t.abbreviation.toLowerCase().includes(q))
        .sort((a, b) => rank(a) - rank(b));
}

// An autocomplete like v4's Selectr: borderless until hovered (unless
// variant is 'default'), and typing filters the teams
const TeamSelect: React.FC<Props> = ({
    teams,
    value,
    onChange,
    label,
    variant = 'borderless'
}: Props) => {
    const [showOptions, setShowOptions] = useState(false);
    // null shows the value's abbreviation and every team
    const [query, setQuery] = useState<string | null>(null);

    const options = useMemo(
        () =>
            filterTeams(teams, query ?? '').map((team) => ({
                label: team.abbreviation,
                value: team.key
            })),
        [teams, query]
    );

    const close = (): void => {
        setShowOptions(false);
        setQuery(null);
    };

    return (
        <div className={styles.teamSelect}>
            <TeamLogo team={value} />
            <div
                className={styles.input}
                onKeyDown={(e) => {
                    if (e.key === 'Escape' && showOptions) {
                        e.stopPropagation();
                        close();
                    }
                }}
            >
                <Autocomplete
                    aria-label={label}
                    onOptionSelect={(option) => {
                        close();
                        const team = teams.find((t) => t.key === option.value);
                        if (team && team.key !== value.key) onChange(team);
                    }}
                    onShowOptionsChange={(show) =>
                        show ? setShowOptions(true) : close()
                    }
                    onTextChange={(text) => {
                        setQuery(text);
                        setShowOptions(true);
                    }}
                    options={options}
                    showOptions={showOptions}
                    text={query ?? value.abbreviation}
                    value={value.key}
                    variant={variant}
                />
            </div>
        </div>
    );
};

export default TeamSelect;
