import { useState } from 'react';
import type {
    AddSchemaOverrides,
    AddSchemaPlan,
    GameIdentity,
    GameType,
    PlannedOption
} from '@shared/types';
import Card from '@renderer/components/Card/Card';
import Dropdown from '@renderer/components/Dropdown/Dropdown';
import Textbox from '@renderer/components/Textbox/Textbox';
import {
    type GameEntry,
    NO_GAME,
    OTHER_GAME,
    fieldText,
    gameKey,
    gameLabel,
    gameOptions,
    parseGameKey,
    sourceHint
} from '../addSchemaModel';
import type { OverridePatch } from '../useAddSchema';

import styles from './OptionsCard.module.css';

interface Props {
    games: GameEntry[];
    // The game that will be saved, from a valid override or the plan
    game: GameIdentity | null;
    overrides: AddSchemaOverrides;
    plan: AddSchemaPlan | null;
    onOverride: (patch: OverridePatch, typed?: boolean) => void;
}

interface HintProps {
    field: string;
    option: PlannedOption<unknown> | undefined;
    overridden: boolean;
    detectedLabel: string | null;
    onUseDetected: () => void;
}

// Where a pre-filled value came from, or a way back to it once overridden
const OptionHint: React.FC<HintProps> = ({
    field,
    option,
    overridden,
    detectedLabel,
    onUseDetected
}: HintProps) => {
    if (overridden) {
        return detectedLabel ? (
            <button
                className={styles.useDetected}
                data-action={`use-detected-${field}`}
                onClick={onUseDetected}
                type='button'
            >
                Use {detectedLabel}
            </button>
        ) : null;
    }
    const hint = sourceHint(option);
    return hint ? (
        <span className={styles.hint} data-hint={field}>
            {hint}
        </span>
    ) : null;
};

const GAME_TYPES: { label: string; value: GameType }[] = [
    { label: 'Madden', value: 'madden' },
    { label: 'College', value: 'college' }
];

const OptionsCard: React.FC<Props> = ({
    games,
    game,
    overrides,
    plan,
    onOverride
}: Props) => {
    const [otherOpen, setOtherOpen] = useState(false);
    const options = plan?.options;
    const detectedGame = options?.game.detected ?? null;
    const other = overrides.game ?? {
        gameType: game?.gameType ?? 'madden',
        year: game ? String(game.gameYear) : ''
    };

    function selectGame(value: string): void {
        if (value === OTHER_GAME) {
            setOtherOpen(true);
            onOverride({ game: other });
            return;
        }
        setOtherOpen(false);
        const picked = parseGameKey(value);
        if (!picked) return;
        // Picking the detected game is the same as not overriding it
        const isDetected =
            !!detectedGame && gameKey(detectedGame) === gameKey(picked);
        onOverride({
            game: isDetected
                ? undefined
                : { gameType: picked.gameType, year: String(picked.gameYear) }
        });
    }

    function versionField(field: 'major' | 'minor', label: string) {
        const option = options?.[field];
        return (
            <div className={styles.field}>
                <Textbox
                    data-field={field}
                    inputMode='numeric'
                    label={label}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        onOverride({ [field]: event.target.value }, true)
                    }
                    text={fieldText(overrides[field], option)}
                />
                <OptionHint
                    detectedLabel={
                        option?.detected == null
                            ? null
                            : String(option.detected)
                    }
                    field={field}
                    onUseDetected={() => onOverride({ [field]: undefined })}
                    option={option}
                    overridden={overrides[field] !== undefined}
                />
            </div>
        );
    }

    return (
        <Card
            border='black'
            data-testid='schema-options'
            header={{ title: 'Options' }}
        >
            <div className={styles.field}>
                <Dropdown
                    data-field='game'
                    label='Game'
                    onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                        selectGame(event.target.value)
                    }
                    options={gameOptions(plan, games, game)}
                    value={
                        otherOpen ? OTHER_GAME : game ? gameKey(game) : NO_GAME
                    }
                />
                {otherOpen && (
                    <div className={styles.other} data-testid='other-game'>
                        <fieldset className={styles.gameTypes}>
                            <legend className={styles.legend}>Game type</legend>
                            {GAME_TYPES.map((type) => (
                                <label
                                    className={styles.radio}
                                    key={type.value}
                                >
                                    <input
                                        checked={other.gameType === type.value}
                                        name='other-game-type'
                                        onChange={() =>
                                            onOverride({
                                                game: {
                                                    ...other,
                                                    gameType: type.value
                                                }
                                            })
                                        }
                                        type='radio'
                                        value={type.value}
                                    />
                                    {type.label}
                                </label>
                            ))}
                        </fieldset>
                        <Textbox
                            data-field='game-year'
                            inputMode='numeric'
                            label='Year'
                            onChange={(
                                event: React.ChangeEvent<HTMLInputElement>
                            ) =>
                                onOverride(
                                    {
                                        game: {
                                            ...other,
                                            year: event.target.value
                                        }
                                    },
                                    true
                                )
                            }
                            placeholder='e.g. 28'
                            text={other.year}
                        />
                    </div>
                )}
                <OptionHint
                    detectedLabel={
                        detectedGame ? gameLabel(detectedGame, games) : null
                    }
                    field='game'
                    onUseDetected={() => {
                        setOtherOpen(false);
                        onOverride({ game: undefined });
                    }}
                    option={options?.game}
                    overridden={overrides.game !== undefined}
                />
            </div>
            {versionField('major', 'Major')}
            {versionField('minor', 'Minor')}
        </Card>
    );
};

export default OptionsCard;
