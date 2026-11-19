// NFL logos, imported from v4's renderer/img so there is one copy
import type { ScheduleTeam } from './scheduleModel';

const modules = import.meta.glob<string>(
    '../../../../../renderer/img/team-logos/nfl/*.PNG',
    { eager: true, query: '?url', import: 'default' }
);

const fileName = (path: string): string =>
    (path.split('/').pop() ?? '').toLowerCase();

const urls = new Map(
    Object.entries(modules).map(([path, url]) => [fileName(path), url])
);

// undefined for custom teams and unknown files
export function logoUrl(
    team: Pick<ScheduleTeam, 'logoPath'>
): string | undefined {
    return team.logoPath ? urls.get(fileName(team.logoPath)) : undefined;
}
