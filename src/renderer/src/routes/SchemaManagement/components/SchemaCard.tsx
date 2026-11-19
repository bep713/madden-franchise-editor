import type { FileMetadata, GameVersion, SchemaEntry } from '@shared/types';
import Card from '@renderer/components/Card/Card';
import GameIcon from '@renderer/components/GameIcon/GameIcon';
import Layout from '@renderer/components/Layout/Layout';
import Link from '@renderer/components/Link/Link';
import List from '@renderer/components/List/List';
import Text from '@renderer/components/Text/Text';
import Bundled from '@assets/icons/bundled.svg?react';
import Check from '@assets/icons/check.svg?react';
import Eye from '@assets/icons/eye.svg?react';
import Trash from '@assets/icons/trash.svg?react';
import { isLoaded, samePath } from '../schemaList';

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
    // A file waits for a schema: every name is a link, loaded or not
    picking?: boolean;
    onLoad: (entry: SchemaEntry) => void;
    onDelete: (entry: SchemaEntry) => void;
    // Shows an eye on every row that opens the schema's fields
    onView?: (entry: SchemaEntry) => void;
    // The schema the viewer shows, if any
    viewingPath?: string;
}

const SchemaCard: React.FC<Props> = ({
    game,
    title,
    schemas,
    labelFor,
    metadata,
    picking = false,
    onLoad,
    onDelete,
    onView,
    viewingPath
}: Props) => {
    const items = schemas.map((entry) => {
        const label = labelFor(entry);
        const loaded = isLoaded(entry, metadata);
        const viewing = !!onView && samePath(entry.path, viewingPath);
        return (
            <div
                className={styles.row}
                data-loaded={loaded || undefined}
                data-name={label}
                data-viewing={viewing || undefined}
                key={entry.path}
            >
                <Layout
                    alignItems='center'
                    columnGap='2'
                    direction='row'
                    justifyContent='space-between'
                >
                    {picking || (metadata && !loaded) ? (
                        <Link onClick={() => onLoad(entry)} text={label} />
                    ) : (
                        <Text weight={loaded ? 'bold' : 'normal'}>{label}</Text>
                    )}
                    <span className={styles.icons}>
                        {onView && (
                            <button
                                aria-label={`View ${label}`}
                                className={
                                    viewing
                                        ? `${styles.view} ${styles.viewing}`
                                        : styles.view
                                }
                                data-action='view-schema'
                                onClick={() => onView(entry)}
                                title='View fields'
                                type='button'
                            >
                                <Eye />
                            </button>
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
                    </span>
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
