import type { GzFacts } from '@shared/types';
import { type GameEntry, gameLabel } from '../addSchemaModel';

import styles from './GzFactsList.module.css';

interface Props {
    facts: GzFacts;
    fileName: string;
    games: GameEntry[];
    // null while a blocking problem leaves no target
    savesAs: string | null;
}

const NONE = 'None';

// What the ready .gz itself says, next to the Options card's chosen values
const GzFactsList: React.FC<Props> = ({
    facts,
    fileName,
    games,
    savesAs
}: Props) => {
    const meta = facts.fileMeta;
    const game =
        meta?.gameType && meta.gameYear !== null
            ? gameLabel(
                  { gameType: meta.gameType, gameYear: meta.gameYear },
                  games
              )
            : NONE;
    const version =
        meta && (meta.major !== null || meta.minor !== null)
            ? `${meta.major ?? '?'}.${meta.minor ?? '?'}`
            : NONE;
    const rows: [key: string, label: string, value: string][] = [
        ['file', 'File', fileName],
        ['format', 'Format', 'Compressed schema (.gz)'],
        ['tables', 'Tables', String(facts.tables)],
        ['game', 'Game in file', game],
        ['version', 'Version in file', version],
        ['database-name', 'Database name', meta?.databaseName || NONE],
        ['saves-as', 'Saves as', savesAs ?? '—']
    ];

    return (
        <dl aria-label='Schema file' className={styles.facts}>
            {rows.map(([key, label, value]) => (
                <div className={styles.fact} key={key}>
                    <dt>{label}</dt>
                    <dd data-fact={key}>{value}</dd>
                </div>
            ))}
        </dl>
    );
};

export default GzFactsList;
