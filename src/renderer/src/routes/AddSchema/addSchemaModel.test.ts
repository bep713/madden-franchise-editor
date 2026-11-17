import { describe, expect, it } from 'vitest';
import games from '@data/games.json';
import {
    EMPTY_REQUEST,
    OTHER_GAME,
    addPaths,
    confirmation,
    currentGame,
    fieldText,
    gameOptions,
    list,
    removePath,
    sourceHint,
    splitProblems,
    summaryLine,
    type GameEntry
} from './addSchemaModel';
import { describeChanges, describeProblem } from './describeProblem';
import { M27, generatePlan, gzPlan, option } from './testPlans';

const GAMES = games as GameEntry[];

describe('addSchemaModel', () => {
    describe('paths', () => {
        it('adds new paths in order, ignoring case and separators', () => {
            expect(
                addPaths(['C:\\a\\MAIN.FTX'], ['c:/a/main.ftx', 'C:\\a\\B.FTX'])
            ).toEqual(['C:\\a\\MAIN.FTX', 'C:\\a\\B.FTX']);
        });

        it('removes a path ignoring case', () => {
            expect(
                removePath(['C:\\a\\X.FTX', 'C:\\a\\Y.FTX'], 'c:\\A\\x.ftx')
            ).toEqual(['C:\\a\\Y.FTX']);
        });
    });

    describe('fieldText', () => {
        it('shows what was typed, even when it is invalid or empty', () => {
            expect(fieldText('abc', option(900))).toBe('abc');
            expect(fieldText('', option(900))).toBe('');
        });

        it("shows the plan's value without an override", () => {
            expect(fieldText(undefined, option(900))).toBe('900');
            expect(fieldText(undefined, option<number>(null))).toBe('');
            expect(fieldText(undefined, undefined)).toBe('');
        });
    });

    describe('gameOptions', () => {
        const labels = (opts: { label: string }[]) => opts.map((o) => o.label);

        it('lists candidates first, then games.json, then Other game…', () => {
            const plan = generatePlan({
                gameCandidates: [{ gameType: 'college', gameYear: 27 }, M27]
            });
            const opts = gameOptions(plan, GAMES, M27);
            expect(labels(opts).slice(0, 2)).toEqual(['CFB 27', 'Madden 27']);
            expect(labels(opts)).toContain('Madden 19');
            expect(opts[opts.length - 1]).toEqual({
                label: 'Other game…',
                value: OTHER_GAME
            });
            // Each game once
            expect(labels(opts).filter((l) => l === 'Madden 27')).toHaveLength(
                1
            );
        });

        it('labels a detected game outside games.json by its prefix', () => {
            const m28 = { gameType: 'madden', gameYear: 28 } as const;
            const opts = gameOptions(
                generatePlan({ gameCandidates: [m28] }),
                GAMES,
                m28
            );
            expect(opts[0]).toEqual({ label: 'M28', value: 'madden-28' });
        });

        it('adds the current game and a placeholder when needed', () => {
            const c30 = { gameType: 'college', gameYear: 30 } as const;
            expect(labels(gameOptions(null, GAMES, c30))).toContain('C30');
            expect(gameOptions(null, GAMES, null)[0].label).toBe(
                'Choose a game'
            );
        });
    });

    describe('currentGame', () => {
        it('prefers a valid override over the plan', () => {
            const plan = generatePlan();
            expect(
                currentGame(
                    {
                        ...EMPTY_REQUEST,
                        overrides: { game: { gameType: 'college', year: '27' } }
                    },
                    plan
                )
            ).toEqual({ gameType: 'college', gameYear: 27 });
            expect(
                currentGame(
                    {
                        ...EMPTY_REQUEST,
                        overrides: { game: { gameType: 'college', year: '2x' } }
                    },
                    plan
                )
            ).toEqual(M27);
        });
    });

    it('words each option source', () => {
        expect(sourceHint(option(900))).toBe('From MAIN.FTX');
        expect(sourceHint(option(900, { source: 'gz-meta' }))).toBe(
            'From file meta'
        );
        expect(sourceHint(option(900, { source: 'file-name' }))).toBe(
            'From file name'
        );
        expect(
            sourceHint(
                option(900, { source: 'open-file', from: 'CAREER-TEST' })
            )
        ).toBe('Guessed from CAREER-TEST');
        expect(sourceHint(option<number>(null))).toBeNull();
    });

    it('puts row problems on their row', () => {
        const rowProblem = {
            code: 'not-a-schema',
            severity: 'blocking',
            path: 'c:\\ftx\\notes.txt'
        } as const;
        const orphan = { ...rowProblem, path: 'C:\\gone.txt' };
        const general = {
            code: 'game-required',
            severity: 'blocking'
        } as const;
        const { byPath, general: rest } = splitProblems(
            [rowProblem, orphan, general],
            ['C:\\ftx\\notes.txt']
        );
        expect(byPath.get('C:\\ftx\\notes.txt')).toEqual([rowProblem]);
        expect(rest).toEqual([orphan, general]);
    });

    describe('summaryLine', () => {
        it('prompts for files without a plan', () => {
            expect(summaryLine(null)).toMatch(/^Add an entry FTX/);
        });

        it('counts the includes for generate', () => {
            expect(summaryLine(generatePlan())).toBe(
                'Generates M27_900_1.gz from 1 entry file and 1 include.'
            );
        });

        it('is conditional while a problem blocks', () => {
            const plan = generatePlan({
                canAdd: false,
                problems: [{ code: 'version-required', severity: 'blocking' }]
            });
            expect(summaryLine(plan)).toBe(
                'Will generate M27_900_1.gz from 1 entry file and 1 include once the problems above are fixed.'
            );
        });

        it('says when a gz gets its meta written or replaces a copy', () => {
            const plan = gzPlan({
                problems: [
                    {
                        code: 'meta-written',
                        severity: 'info',
                        changes: [{ field: 'major', from: null, to: 468 }]
                    }
                ],
                target: {
                    ...gzPlan().target!,
                    replaces: [{ path: 'C:\\old.gz', loadedBy: [] }]
                }
            });
            expect(summaryLine(plan)).toBe(
                'Copies C27_468_2.gz and writes its meta, replacing your custom copy.'
            );
        });

        it('asks to fix problems when there is no target', () => {
            expect(
                summaryLine(generatePlan({ target: null, canAdd: false }))
            ).toBe('Fix the problems above to add the schema.');
        });
    });

    describe('confirmation', () => {
        const replaces = [
            { path: 'C:\\userData\\schemas\\M27_900_1.gz', loadedBy: [] }
        ];

        it('needs none for a clean add', () => {
            expect(confirmation(generatePlan())).toBeNull();
        });

        it('names the missing includes', () => {
            expect(
                confirmation(generatePlan({ missing: ['NESTED.FTX'] }))
            ).toEqual({
                message: 'Generate without NESTED.FTX?',
                detail: "Tables in that file won't be in the schema.",
                button: 'Generate'
            });
        });

        it('names the replaced copy', () => {
            const ask = confirmation(
                generatePlan({
                    target: { ...generatePlan().target!, replaces }
                })
            );
            expect(ask?.message).toBe('Replace your custom M27 900.1?');
            expect(ask?.detail).toContain(replaces[0].path);
            expect(ask?.button).toBe('Replace');
        });

        it('lists both in one message', () => {
            const ask = confirmation(
                generatePlan({
                    missing: ['A.FTX', 'B.FTX'],
                    target: { ...generatePlan().target!, replaces }
                })
            );
            expect(ask?.message).toBe(
                'Replace your custom M27 900.1 and generate without A.FTX and B.FTX?'
            );
            expect(ask?.detail).toContain("Tables in those files won't");
            expect(ask?.detail).toContain('Undo restores it');
        });
    });

    describe('list', () => {
        it('joins names with commas and "and"', () => {
            expect(list([])).toBe('');
            expect(list(['A'])).toBe('A');
            expect(list(['A', 'B', 'C'])).toBe('A, B and C');
        });

        it('counts the names past five', () => {
            const names = Array.from({ length: 1205 }, (_, i) => `F${i}`);
            expect(list(names)).toBe('F0, F1, F2, F3, F4 and 1,200 more');
        });

        it('keeps the confirmation short for many missing includes', () => {
            const missing = Array.from({ length: 3000 }, (_, i) => `F${i}`);
            expect(confirmation(generatePlan({ missing }))?.message).toBe(
                'Generate without F0, F1, F2, F3, F4 and 2,995 more?'
            );
        });
    });

    describe('describeProblem', () => {
        it('words warnings as advice before Add and as done after', () => {
            const guessed = {
                code: 'version-guessed',
                severity: 'warning',
                files: ['CAREER-TEST']
            } as const;
            expect(describeProblem(guessed, 'plan')).toContain(
                'Check it before adding'
            );
            expect(describeProblem(guessed, 'result')).toBe(
                'The version was guessed from CAREER-TEST.'
            );
            expect(
                describeProblem(
                    {
                        code: 'missing-includes-accepted',
                        severity: 'warning',
                        files: ['NESTED.FTX']
                    },
                    'result'
                )
            ).toBe('Generated without NESTED.FTX.');
        });

        it('shows meta changes as Game and Version', () => {
            expect(
                describeChanges([
                    { field: 'gameType', from: null, to: 'madden' },
                    { field: 'gameYear', from: null, to: 27 },
                    { field: 'major', from: null, to: 620 },
                    { field: 'minor', from: null, to: 0 }
                ])
            ).toBe('Game: none → M27, Version: none → 620.0');
        });
    });
});
