import { describe, expect, it } from 'vitest';
import teamData from '@data/teamData.json';
import {
    calculateReferenceBinary,
    parseReference
} from '@renderer/utils/references';
import {
    SCHEDULE_DAYS,
    SCHEDULE_WEEKS,
    applyGameEdit,
    buildGames,
    buildTeams,
    editWrites,
    formatTime12,
    gamesInWeek,
    parseTime12,
    weekGameCounts,
    type ScheduleGame
} from './scheduleModel';

const TEAM_TABLE_ID = 7000;
const SEASON_GAME_TABLE_ID = 4100;
const NULL_REF = '0'.repeat(32);

const teamRecords = [
    { ShortName: 'ARI', LongName: 'St. Louis', DisplayName: 'Cardinals' },
    { ShortName: 'ATL', LongName: 'Atlanta', DisplayName: 'Falcons' },
    { ShortName: 'ZZZ', LongName: 'Custom', DisplayName: 'Team' },
    { ShortName: 'XXX', LongName: '', DisplayName: '' }
];

const teams = buildTeams(teamRecords, [3]);
const byAbbr = (abbr: string) => teams.find((t) => t.abbreviation === abbr)!;

const ref = (row: number, tableId = TEAM_TABLE_ID) =>
    calculateReferenceBinary(tableId, row);

function game(overrides: Record<string, unknown> = {}) {
    return {
        HomeTeam: ref(0),
        AwayTeam: ref(1),
        TimeOfDay: 780,
        HomeScore: 0,
        AwayScore: 0,
        SeasonWeek: 0,
        SeasonGameNum: 0,
        SeasonYear: 2,
        DayOfWeek: 'Sunday',
        SeasonWeekType: 'RegularSeason',
        IsPractice: false,
        GameStatus: 'Unplayed',
        ...overrides
    };
}

describe('buildTeams', () => {
    it('matches alternate names, keeps custom teams and skips empty rows', () => {
        expect(teams).toEqual([
            {
                key: 'ARI',
                abbreviation: 'ARI',
                city: 'Arizona',
                nickname: 'Cardinals',
                logoPath: 'img/team-logos/nfl/cardinals.PNG',
                referenceIndex: 0,
                custom: false
            },
            {
                key: 'ATL',
                abbreviation: 'ATL',
                city: 'Atlanta',
                nickname: 'Falcons',
                logoPath: 'img/team-logos/nfl/falcons.PNG',
                referenceIndex: 1,
                custom: false
            },
            {
                key: 'ZZZ',
                abbreviation: 'ZZZ',
                city: 'Custom',
                nickname: 'Team',
                referenceIndex: 2,
                custom: true
            }
        ]);
    });

    it('gives colliding abbreviations unique keys and sorts by abbreviation', () => {
        const result = buildTeams([
            {
                ShortName: 'NE',
                LongName: 'New England',
                DisplayName: 'Patriots'
            },
            { ShortName: 'ARI', LongName: 'Phoenix', DisplayName: 'Cardinals' },
            { ShortName: 'ARI', LongName: 'Arizona', DisplayName: 'Cardinals' }
        ]);
        expect(result.map((t) => t.key)).toEqual(['ARI#1', 'ARI#2', 'NE']);
    });

    it('leaves the imported teamData unchanged', () => {
        const before = structuredClone(teamData);
        buildTeams(teamRecords);
        buildTeams([
            { ShortName: 'NEW', LongName: 'New', DisplayName: 'Team' }
        ]);
        expect(teamData).toEqual(before);
    });
});

describe('buildGames', () => {
    const build = (
        records: Record<string, unknown>[],
        gameYear = 22,
        seasonYear?: number,
        emptyIndices: number[] = []
    ) =>
        buildGames({
            seasonGameRecords: records,
            emptyIndices,
            teams,
            teamTableId: TEAM_TABLE_ID,
            gameYear,
            seasonYear
        });

    it('builds a game', () => {
        const { games, skipped } = build([game()]);
        expect(skipped).toBe(0);
        expect(games).toEqual([
            {
                recordIndex: 0,
                homeTeam: byAbbr('ARI'),
                awayTeam: byAbbr('ATL'),
                day: { name: 'Sunday', abbreviation: 'Sun' },
                timeOfDay: 780,
                homeScore: 0,
                awayScore: 0,
                played: false,
                seasonWeek: 0,
                seasonWeekType: 'RegularSeason'
            }
        ]);
    });

    it('skips practice and empty records', () => {
        const { games } = build(
            [game({ IsPractice: true }), game(), game()],
            22,
            undefined,
            [2]
        );
        expect(games.map((g) => g.recordIndex)).toEqual([1]);
    });

    it('filters by season year only below M21', () => {
        const records = [game({ SeasonYear: 1 }), game({ SeasonYear: 2 })];
        expect(build(records, 20, 2).games.map((g) => g.recordIndex)).toEqual([
            1
        ]);
        expect(build(records, 21, 2).games).toHaveLength(2);
    });

    it('skips and counts references to another table or a missing row', () => {
        const { games, skipped } = build([
            game({ HomeTeam: ref(0, TEAM_TABLE_ID + 1) }),
            game({ AwayTeam: ref(99) }),
            game({ AwayTeam: ref(3) }), // empty team row
            game()
        ]);
        expect(games.map((g) => g.recordIndex)).toEqual([3]);
        expect(skipped).toBe(3);
    });

    it('skips a null reference without counting it', () => {
        const { games, skipped } = build([game({ HomeTeam: NULL_REF })]);
        expect(games).toEqual([]);
        expect(skipped).toBe(0);
    });

    it('sets played from GameStatus, or from the score without one', () => {
        const { games } = build([
            game({ GameStatus: 'HomeWon', HomeScore: 21, AwayScore: 7 }),
            game({ GameStatus: 'Tied' }),
            game({ GameStatus: 'Unplayed' }),
            game({ GameStatus: undefined, AwayScore: 3 }),
            game({ GameStatus: undefined })
        ]);
        expect(games.map((g) => g.played)).toEqual([
            true,
            true,
            false,
            true,
            false
        ]);
    });

    it('leaves day unset for an unknown DayOfWeek', () => {
        expect(build([game({ DayOfWeek: 'Invalid_' })]).games[0].day).toBe(
            undefined
        );
    });
});

describe('weeks', () => {
    const week = (abbr: string) =>
        SCHEDULE_WEEKS.find((w) => w.abbreviation === abbr)!;
    const { games } = buildGames({
        seasonGameRecords: [
            game({ SeasonWeek: 0, SeasonWeekType: 'PreSeason' }),
            game({ SeasonWeek: 0, SeasonWeekType: 'RegularSeason' }),
            game({ SeasonWeek: 0, SeasonWeekType: 'RegularSeason' })
        ],
        teams,
        teamTableId: TEAM_TABLE_ID,
        gameYear: 22
    });

    it('lists all 28 weeks in order', () => {
        expect(SCHEDULE_WEEKS).toHaveLength(28);
        expect(SCHEDULE_WEEKS[0].abbreviation).toBe('P1');
        expect(SCHEDULE_WEEKS.map((w) => w.index)).toEqual([
            ...Array(28).keys()
        ]);
        expect(week('N/A').seasonWeekType).toBe(undefined);
    });

    it('keeps preseason and regular weeks with the same weekIndex apart', () => {
        expect(
            gamesInWeek(games, week('P1')).map((g) => g.recordIndex)
        ).toEqual([0]);
        expect(gamesInWeek(games, week('1')).map((g) => g.recordIndex)).toEqual(
            [1, 2]
        );
        expect(gamesInWeek(games, week('N/A'))).toEqual([]);
    });

    it('counts games per week', () => {
        const counts = weekGameCounts(games, SCHEDULE_WEEKS);
        expect(counts[week('P1').index]).toBe(1);
        expect(counts[week('1').index]).toBe(2);
        expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
    });
});

describe('edits', () => {
    const schedule = {
        seasonGameTableId: SEASON_GAME_TABLE_ID,
        teamTableId: TEAM_TABLE_ID
    };
    const base = buildGames({
        seasonGameRecords: [game(), game()],
        teams,
        teamTableId: TEAM_TABLE_ID,
        gameYear: 22
    }).games[1] as ScheduleGame;
    const custom = byAbbr('ZZZ');
    const monday = SCHEDULE_DAYS[0];

    it('writes a team reference that round-trips', () => {
        const writes = editWrites(schedule, base, {
            kind: 'team',
            side: 'away',
            team: custom
        });
        expect(writes).toEqual([
            {
                tableId: SEASON_GAME_TABLE_ID,
                recordIndex: 1,
                fieldName: 'AwayTeam',
                value: '00110110101100000000000000000010'
            }
        ]);
        expect(parseReference(writes[0].value)).toEqual({
            tableId: TEAM_TABLE_ID,
            recordIndex: 2
        });
        expect(
            editWrites(schedule, base, {
                kind: 'team',
                side: 'home',
                team: custom
            })[0].fieldName
        ).toBe('HomeTeam');
    });

    it('writes the day name and the time in minutes', () => {
        expect(
            editWrites(schedule, base, { kind: 'day', day: monday })
        ).toEqual([
            {
                tableId: SEASON_GAME_TABLE_ID,
                recordIndex: 1,
                fieldName: 'DayOfWeek',
                value: 'Monday'
            }
        ]);
        expect(
            editWrites(schedule, base, { kind: 'time', minutes: 1220 })
        ).toEqual([
            {
                tableId: SEASON_GAME_TABLE_ID,
                recordIndex: 1,
                fieldName: 'TimeOfDay',
                value: 1220
            }
        ]);
    });

    it('applies edits to a copy', () => {
        expect(
            applyGameEdit(base, { kind: 'team', side: 'home', team: custom })
                .homeTeam
        ).toBe(custom);
        expect(
            applyGameEdit(base, { kind: 'team', side: 'away', team: custom })
                .awayTeam
        ).toBe(custom);
        expect(applyGameEdit(base, { kind: 'day', day: monday }).day).toBe(
            monday
        );
        expect(
            applyGameEdit(base, { kind: 'time', minutes: 5 }).timeOfDay
        ).toBe(5);
        expect(base.timeOfDay).toBe(780);
        expect(base.homeTeam).toBe(byAbbr('ARI'));
    });
});

describe('12-hour time', () => {
    it('formats', () => {
        expect(formatTime12(1220)).toBe('8:20 PM');
        expect(formatTime12(720)).toBe('12:00 PM');
        expect(formatTime12(5)).toBe('12:05 AM');
        expect(formatTime12(1440 + 60)).toBe('1:00 AM');
        expect(formatTime12(-60)).toBe('11:00 PM');
    });

    it.each([
        ['8:20 PM', 1220],
        ['8:20pm', 1220],
        ['8:20 p', 1220],
        [' 08:20 PM ', 1220],
        ['12:00 PM', 720],
        ['12:05 AM', 5],
        ['20:20', 1220],
        ['0:00', 0]
    ])('parses %j', (text, minutes) => {
        expect(parseTime12(text)).toBe(minutes);
    });

    it.each([
        '13:00 PM',
        '0:30 AM',
        '8:60 PM',
        '24:00',
        'abc',
        '',
        '8 PM',
        '8:20 xm'
    ])('rejects %j', (text) => {
        expect(parseTime12(text)).toBe(null);
    });

    it('round-trips every 5th minute of the day', () => {
        for (let minutes = 0; minutes < 1440; minutes += 5) {
            expect(parseTime12(formatTime12(minutes))).toBe(minutes);
        }
    });
});
