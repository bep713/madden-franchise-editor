import Dropdown from '@renderer/components/Dropdown/Dropdown';
import type { ScheduleTeam } from '../../scheduleModel';
import { logoUrl } from '../../teamLogos';
import styles from './TeamSelect.module.css';

interface Props {
    teams: readonly ScheduleTeam[];
    value: ScheduleTeam;
    onChange: (team: ScheduleTeam) => void;
    // "Away team" / "Home team"
    label: string;
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

// A native <select>: type-ahead is enough for ~32 teams, and e2e can use
// selectOption
const TeamSelect: React.FC<Props> = ({
    teams,
    value,
    onChange,
    label
}: Props) => (
    <div className={styles.teamSelect}>
        <TeamLogo team={value} />
        <Dropdown
            aria-label={label}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const team = teams.find((t) => t.key === e.target.value);
                if (team && team.key !== value.key) onChange(team);
            }}
            options={teams.map((team) => ({
                label: team.abbreviation,
                value: team.key
            }))}
            value={value.key}
        />
    </div>
);

export default TeamSelect;
