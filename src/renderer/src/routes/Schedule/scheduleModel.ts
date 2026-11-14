// The schedule page's data model: pure functions over readTableData records.
// Ported from v4's FranchiseSchedule.js / FranchiseGame.js, without changing
// the imported JSON (v4 did, so teams leaked between files).
import type { CellWrite } from '@shared/types/franchise';
import teamData from '@data/teamData.json';
import dayOfWeekData from '@data/dayOfWeekData.json';
import seasonWeekData from '@data/seasonWeekData.json';
import {
    calculateReferenceBinary,
    parseReference
} from '@renderer/utils/references';

export interface ScheduleTeam {
    // Unique per team in a load: the abbreviation, plus `#row` when it collides
    key: string;
    abbreviation: string;
    city: string;
    nickname: string;
    // teamData.json path (img/team-logos/...). Custom teams have none.
    logoPath?: string;
    // Row in the Team table
    referenceIndex: number;
    custom: boolean;
}

export interface ScheduleDay {
    // The DayOfWeek enum name (e.g. "Monday")
    name: string;
    abbreviation: string;
}

export interface ScheduleWeek {
    // Position in seasonWeekData.json
    index: number;
    abbreviation: string;
    weekName: string;
    weekIndex: number;
    // Missing for N/A, which never has games
    seasonWeekType?: string;
}

export interface ScheduleGame {
    recordIndex: number;
    homeTeam: ScheduleTeam;
    awayTeam: ScheduleTeam;
    day?: ScheduleDay;
    // Minutes since midnight
    timeOfDay: number;
    homeScore: number;
    awayScore: number;
    played: boolean;
    seasonWeek: number;
    seasonWeekType: string;
}

export interface Schedule {
    teams: ScheduleTeam[];
    games: ScheduleGame[];
    weeks: ScheduleWeek[];
    seasonGameTableId: number;
    teamTableId: number;
}

export type ScheduleView = 'default' | 'compact';

export const SCHEDULE_VIEWS: readonly { value: ScheduleView; label: string }[] =
    [
        { value: 'default', label: 'Default' },
        { value: 'compact', label: 'Table' }
    ];

export type GameSide = 'home' | 'away';

export type GameEdit =
    | { kind: 'team'; side: GameSide; team: ScheduleTeam }
    | { kind: 'day'; day: ScheduleDay }
    | { kind: 'time'; minutes: number };

type TableRecord = Record<string, unknown>;

// v4's fields, plus GameStatus for `played`
export const SEASON_GAME_FIELDS = [
    'AwayTeam',
    'HomeTeam',
    'TimeOfDay',
    'HomeScore',
    'AwayScore',
    'SeasonWeek',
    'SeasonGameNum',
    'SeasonYear',
    'DayOfWeek',
    'SeasonWeekType',
    'IsPractice',
    'GameStatus'
];

export const TEAM_FIELDS = ['ShortName', 'LongName', 'DisplayName'];

const NULL_REFERENCE = '0'.repeat(32);
const MINUTES_PER_DAY = 24 * 60;

// GameStatus members of a finished game (M19-M27 schemas). FirstComplete_
// and LastComplete_ share values with AwayWon and Tied.
const COMPLETE_STATUSES: ReadonlySet<string> = new Set([
    'AwayWon',
    'HomeWon',
    'Tied',
    'FirstComplete_',
    'LastComplete_'
]);

export const SCHEDULE_DAYS: readonly ScheduleDay[] = dayOfWeekData.days.map(
    (day) => ({ name: day.name, abbreviation: day.abbreviation })
);

export const SCHEDULE_WEEKS: readonly ScheduleWeek[] = seasonWeekData.weeks.map(
    (week, index) => ({
        index,
        abbreviation: week.abbreviation,
        weekName: week.weekName,
        weekIndex: week.weekIndex,
        ...('seasonWeekType' in week && week.seasonWeekType
            ? { seasonWeekType: week.seasonWeekType }
            : {})
    })
);

function asNumber(value: unknown): number {
    return typeof value === 'number' ? value : Number(value) || 0;
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

export function buildTeams(
    teamRecords: readonly TableRecord[],
    emptyIndices: Iterable<number> = []
): ScheduleTeam[] {
    const empty = new Set(emptyIndices);
    const teams: Omit<ScheduleTeam, 'key'>[] = [];

    teamRecords.forEach((record, row) => {
        if (empty.has(row)) return;
        const longName = asString(record.LongName);
        const displayName = asString(record.DisplayName);
        const fullName = `${longName} ${displayName}`;
        const match = teamData.teams.find((team) =>
            team.nameMatchList.includes(fullName)
        );
        teams.push(
            match
                ? {
                      abbreviation: match.abbreviation,
                      city: match.city,
                      nickname: match.nickname,
                      logoPath: match.logoPath,
                      referenceIndex: row,
                      custom: false
                  }
                : {
                      abbreviation: asString(record.ShortName),
                      city: longName,
                      nickname: displayName,
                      referenceIndex: row,
                      custom: true
                  }
        );
    });

    const counts = new Map<string, number>();
    for (const team of teams) {
        counts.set(team.abbreviation, (counts.get(team.abbreviation) ?? 0) + 1);
    }

    return teams
        .map((team) => ({
            ...team,
            key:
                (counts.get(team.abbreviation) ?? 0) > 1
                    ? `${team.abbreviation}#${team.referenceIndex}`
                    : team.abbreviation
        }))
        .sort((a, b) => {
            if (a.abbreviation !== b.abbreviation) {
                return a.abbreviation < b.abbreviation ? -1 : 1;
            }
            return a.referenceIndex - b.referenceIndex;
        });
}

export interface BuildGamesInput {
    seasonGameRecords: readonly TableRecord[];
    emptyIndices?: Iterable<number>;
    teams: readonly ScheduleTeam[];
    teamTableId: number;
    gameYear: number;
    // Required to filter games below M21
    seasonYear?: number;
}

export function buildGames({
    seasonGameRecords,
    emptyIndices = [],
    teams,
    teamTableId,
    gameYear,
    seasonYear
}: BuildGamesInput): { games: ScheduleGame[]; skipped: number } {
    const empty = new Set(emptyIndices);
    const teamsByRow = new Map(
        teams.map((team) => [team.referenceIndex, team])
    );
    const games: ScheduleGame[] = [];
    let skipped = 0;

    // undefined: null reference (hidden, not counted). null: unresolvable.
    const resolveTeam = (value: unknown): ScheduleTeam | null | undefined => {
        if (value === NULL_REFERENCE) return undefined;
        const ref = parseReference(value);
        if (!ref || ref.tableId !== teamTableId) return null;
        return teamsByRow.get(ref.recordIndex) ?? null;
    };

    seasonGameRecords.forEach((record, recordIndex) => {
        if (empty.has(recordIndex) || record.IsPractice) return;
        if (gameYear < 21 && record.SeasonYear !== seasonYear) return;

        const homeTeam = resolveTeam(record.HomeTeam);
        const awayTeam = resolveTeam(record.AwayTeam);
        if (homeTeam === null || awayTeam === null) {
            skipped++;
            return;
        }
        if (!homeTeam || !awayTeam) return;

        const homeScore = asNumber(record.HomeScore);
        const awayScore = asNumber(record.AwayScore);
        const status = record.GameStatus;
        const day = SCHEDULE_DAYS.find((d) => d.name === record.DayOfWeek);

        games.push({
            recordIndex,
            homeTeam,
            awayTeam,
            ...(day ? { day } : {}),
            timeOfDay: asNumber(record.TimeOfDay),
            homeScore,
            awayScore,
            played:
                typeof status === 'string' && status !== ''
                    ? COMPLETE_STATUSES.has(status)
                    : homeScore > 0 || awayScore > 0,
            seasonWeek: asNumber(record.SeasonWeek),
            seasonWeekType: asString(record.SeasonWeekType)
        });
    });

    return { games, skipped };
}

export function gamesInWeek(
    games: readonly ScheduleGame[],
    week: ScheduleWeek
): ScheduleGame[] {
    if (!week.seasonWeekType) return [];
    return games.filter(
        (game) =>
            game.seasonWeek === week.weekIndex &&
            game.seasonWeekType === week.seasonWeekType
    );
}

// Week types where every team is expected to play, so a missing team is on bye
const BYE_WEEK_TYPES: ReadonlySet<string> = new Set([
    'PreSeason',
    'RegularSeason'
]);

// Teams with a game of this week's type somewhere in the season but none
// this week. Team rows that never play (Pro Bowl, free agents) aren't listed.
export function byeTeams(
    games: readonly ScheduleGame[],
    week: ScheduleWeek
): ScheduleTeam[] {
    if (!week.seasonWeekType || !BYE_WEEK_TYPES.has(week.seasonWeekType)) {
        return [];
    }
    const thisWeek = gamesInWeek(games, week);
    if (thisWeek.length === 0) return [];

    const playing = new Set<string>();
    for (const game of thisWeek) {
        playing.add(game.homeTeam.key);
        playing.add(game.awayTeam.key);
    }
    const candidates = new Map<string, ScheduleTeam>();
    for (const game of games) {
        if (game.seasonWeekType !== week.seasonWeekType) continue;
        for (const team of [game.homeTeam, game.awayTeam]) {
            if (!playing.has(team.key)) candidates.set(team.key, team);
        }
    }
    return [...candidates.values()].sort((a, b) =>
        a.key < b.key ? -1 : a.key > b.key ? 1 : 0
    );
}

export function editWrites(
    schedule: Pick<Schedule, 'seasonGameTableId' | 'teamTableId'>,
    game: Pick<ScheduleGame, 'recordIndex'>,
    edit: GameEdit
): CellWrite[] {
    const cell = (fieldName: string, value: unknown): CellWrite => ({
        tableId: schedule.seasonGameTableId,
        recordIndex: game.recordIndex,
        fieldName,
        value
    });
    switch (edit.kind) {
        case 'team':
            return [
                cell(
                    edit.side === 'home' ? 'HomeTeam' : 'AwayTeam',
                    calculateReferenceBinary(
                        schedule.teamTableId,
                        edit.team.referenceIndex
                    )
                )
            ];
        case 'day':
            return [cell('DayOfWeek', edit.day.name)];
        case 'time':
            return [cell('TimeOfDay', edit.minutes)];
    }
}

// The optimistic local copy of a game after an edit
export function applyGameEdit(
    game: ScheduleGame,
    edit: GameEdit
): ScheduleGame {
    switch (edit.kind) {
        case 'team':
            return edit.side === 'home'
                ? { ...game, homeTeam: edit.team }
                : { ...game, awayTeam: edit.team };
        case 'day':
            return { ...game, day: edit.day };
        case 'time':
            return { ...game, timeOfDay: edit.minutes };
    }
}

// Minutes since midnight → an <input type="time"> value ("20:20")
export function minutesToTimeValue(minutes: number): string {
    const total =
        ((Math.trunc(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) %
        MINUTES_PER_DAY;
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// An <input type="time"> value ("20:20", or "20:20:00" with seconds) →
// minutes. null when empty (a segment was cleared) or malformed.
export function timeValueToMinutes(value: string): number | null {
    const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value);
    if (!match) return null;
    const hours = Number(match[1]);
    const mins = Number(match[2]);
    if (hours > 23 || mins > 59) return null;
    return hours * 60 + mins;
}
