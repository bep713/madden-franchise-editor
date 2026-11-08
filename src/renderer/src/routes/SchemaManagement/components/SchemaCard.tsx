import type { FileMetadata, GameVersion, SchemaEntry } from '@shared/types';
import Card from '@renderer/components/Card/Card';
import GameIcon from '@renderer/components/GameIcon/GameIcon';
import Layout from '@renderer/components/Layout/Layout';
import Link from '@renderer/components/Link/Link';
import List from '@renderer/components/List/List';
import Text from '@renderer/components/Text/Text';
import Bundled from '@assets/icons/bundled.svg?react';
import Check from '@assets/icons/check.svg?react';
import Trash from '@assets/icons/trash.svg?react';
import { isLoaded } from '../schemaList';

import styles from './SchemaCard.module.css';

const BUNDLED_HINT = 'Bundled schema - cannot delete';
const ACTIVE_HINT = 'Active schema - cannot delete';

interface Props {
    // None for the Other card
    game?: GameVersion;
    title: string;
    schemas: SchemaEntry[];
    labelFor: (entry: SchemaEntry) => string;
    // The open file's, if any. Names are links only with a file open.
    metadata?: FileMetadata;
    onLoad: (entry: SchemaEntry) => void;
    onDelete: (entry: SchemaEntry) => void;
}

const SchemaCard: React.FC<Props> = ({
    game,
    title,
    schemas,
    labelFor,
    metadata,
    onLoad,
    onDelete
}: Props) => {
    const items = schemas.map((entry) => {
        const label = labelFor(entry);
        const loaded = isLoaded(entry, metadata);
        return (
            <div
                className={styles.row}
                data-loaded={loaded || undefined}
                data-name={label}
                key={entry.path}
            >
                <Layout
                    alignItems='center'
                    columnGap='2'
                    direction='row'
                    justifyContent='space-between'
                >
                    {metadata && !loaded ? (
                        <Link onClick={() => onLoad(entry)} text={label} />
                    ) : (
                        <Text weight={loaded ? 'bold' : 'normal'}>{label}</Text>
                    )}
                    {entry.source === 'custom' && !loaded && (
                        <button
                            aria-label={`Delete ${label}`}
                            className={styles.delete}
                            data-action='delete-schema'
                            onClick={() => onDelete(entry)}
                            title='Delete'
                            type='button'
                        >
                            <Trash />
                        </button>
                    )}
                    {/* These sit where the trash would, to say why there is none */}
                    {entry.source === 'custom' && loaded && (
                        <span
                            aria-label={ACTIVE_HINT}
                            className={styles.active}
                            data-testid='active-schema'
                            role='img'
                            title={ACTIVE_HINT}
                        >
                            <Check />
                        </span>
                    )}
                    {entry.source === 'bundled' && (
                        <span
                            aria-label={BUNDLED_HINT}
                            className={styles.bundled}
                            data-testid='bundled-schema'
                            role='img'
                            title={BUNDLED_HINT}
                        >
                            <Bundled />
                        </span>
                    )}
                </Layout>
            </div>
        );
    });

    return (
        <Card
            data-testid='schema-card'
            header={{
                leftAsset: game ? <GameIcon game={game} /> : undefined,
                title
            }}
        >
            <List direction='vertical' gap='2' items={items} />
        </Card>
    );
};

export default SchemaCard;
