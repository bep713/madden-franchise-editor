import type { FileMetadata, SchemaEntry } from '@shared/types';
import Card from '@renderer/components/Card/Card';
import Layout from '@renderer/components/Layout/Layout';
import Link from '@renderer/components/Link/Link';
import Text from '@renderer/components/Text/Text';
import Check from '@assets/icons/check.svg?react';
import Close from '@assets/icons/close.svg?react';
import { expectedLabel, matchesExpected } from '../schemaList';

import styles from './LoadedSchemaCard.module.css';

interface Props {
    metadata: FileMetadata;
    loadedLabel: string;
    // The schema to load for the expected version, when it isn't loaded
    expectedEntry: SchemaEntry | null;
    onLoad: (entry: SchemaEntry) => void;
}

const LoadedSchemaCard: React.FC<Props> = ({
    metadata,
    loadedLabel,
    expectedEntry,
    onLoad
}: Props) => {
    const match = matchesExpected(
        metadata.schemaList?.meta,
        metadata.expectedSchemaVersion
    );
    const expected = expectedLabel(metadata);

    return (
        <Card
            border='black'
            data-testid='loaded-schema'
            header={{
                leftAsset: (
                    <span
                        aria-label={
                            match
                                ? 'Matches the expected schema'
                                : 'Does not match the expected schema'
                        }
                        className={match ? styles.match : styles.mismatch}
                        data-status={match ? 'match' : 'mismatch'}
                        role='img'
                    >
                        {match ? <Check /> : <Close />}
                    </span>
                ),
                title: 'Loaded schema'
            }}
        >
            <Layout direction='column' rowGap='2'>
                <Layout columnGap='2' direction='row'>
                    <span className={styles.label}>
                        <Text>Loaded:</Text>
                    </span>
                    <span data-field='loaded'>
                        <Text weight='bold'>{loadedLabel}</Text>
                    </span>
                </Layout>
                <Layout columnGap='2' direction='row'>
                    <span className={styles.label}>
                        <Text>Expected:</Text>
                    </span>
                    <span data-field='expected'>
                        {expectedEntry ? (
                            <Link
                                data-action='load-expected'
                                onClick={() => onLoad(expectedEntry)}
                                text={expected}
                            />
                        ) : (
                            <Text>{expected}</Text>
                        )}
                    </span>
                </Layout>
            </Layout>
        </Card>
    );
};

export default LoadedSchemaCard;
