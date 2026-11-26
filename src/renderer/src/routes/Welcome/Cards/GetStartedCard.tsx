import Card from '@renderer/components/Card/Card';
import GameIcon from '@renderer/components/GameIcon/GameIcon';
import Layout from '@renderer/components/Layout/Layout';
import Link from '@renderer/components/Link/Link';
import List from '@renderer/components/List/List';
import Sticky from '@renderer/components/Sticky/Sticky';
import Text from '@renderer/components/Text/Text';
import { OpenFranchiseFile } from '@renderer/context/FranchiseFileContext';
import { SCHEDULE_KEY } from '@renderer/tabs/editorTabs';
import { getNavigationItems } from '@data/navigation';
import { basename } from '@renderer/utils/path';
import { FileType } from '@shared/types/franchise';
import {
    fieldOptions,
    TYPE_KEY
} from '../components/CommonFileModal/commonFileOptions';

import styles from './GetStartedCard.module.css';

export enum GetStartedActions {
    CHANGE_FILE_PARAMETERS = 'CHANGE_FILE_PARAMETERS',
    OPEN_FILE = 'OPEN_FILE',
    OPEN_FILE_LOCATION = 'OPEN_FILE_LOCATION',
    OPEN_SCHEDULE_EDITOR = 'OPEN_SCHEDULE_EDITOR',
    OPEN_SCHEMA_MANAGEMENT = 'OPEN_SCHEMA_MANAGEMENT',
    OPEN_TABLE_EDITOR = 'OPEN_TABLE_EDITOR'
}

interface GetStartedCardProps {
    openFile?: OpenFranchiseFile | null;
    onActionClick: (action: GetStartedActions) => void;
}

// e.g. "College Football (CFB) 27", for a year and type with no games.json entry
function gameTypeLabel({ metadata }: OpenFranchiseFile): string {
    const gameType = metadata.type?.gameType || 'madden';
    const label =
        fieldOptions(TYPE_KEY).find((option) => option.value === gameType)
            ?.label ?? gameType;
    return `${label} ${metadata.gameYear}`;
}

const GetStartedCard: React.FC<GetStartedCardProps> = ({
    openFile = null,
    onActionClick
}: GetStartedCardProps) => {
    const fileLoaded = !!openFile;

    const openFileLink = (
        <Link
            key={GetStartedActions.OPEN_FILE}
            onClick={() => onActionClick(GetStartedActions.OPEN_FILE)}
            text={fileLoaded ? 'Open a different file' : 'Open a file...'}
        />
    );

    const franchiseActions = [
        <Link
            key={GetStartedActions.OPEN_TABLE_EDITOR}
            onClick={() => onActionClick(GetStartedActions.OPEN_TABLE_EDITOR)}
            text='Open the table editor'
        />,
        // Only Madden franchise files have a schedule
        openFile &&
            getNavigationItems(openFile.metadata).some(
                (item) => item.id === SCHEDULE_KEY
            ) && (
                <Link
                    key={GetStartedActions.OPEN_SCHEDULE_EDITOR}
                    onClick={() =>
                        onActionClick(GetStartedActions.OPEN_SCHEDULE_EDITOR)
                    }
                    text='Open the schedule editor'
                />
            ),
        <Link
            key={GetStartedActions.OPEN_SCHEMA_MANAGEMENT}
            onClick={() =>
                onActionClick(GetStartedActions.OPEN_SCHEMA_MANAGEMENT)
            }
            text='Open schema management'
        />,
        openFileLink,
        openFile?.path && (
            <Link
                key={GetStartedActions.OPEN_FILE_LOCATION}
                onClick={() =>
                    onActionClick(GetStartedActions.OPEN_FILE_LOCATION)
                }
                text='Open file location'
            />
        )
    ].filter((item) => !!item);

    // Common files are opened with a chosen year and type, so show them next
    // to the name with a link to change them
    const commonFileTitle = openFile?.path &&
        openFile.metadata.format === FileType.COMMON && (
            <Layout alignItems='center' columnGap='2'>
                <Text typography='labelLarge'>{basename(openFile.path)}</Text>
                <span className={styles.fileParameters}>
                    <Text typography='body' weight='light'>
                        {openFile.game?.title ?? gameTypeLabel(openFile)}
                    </Text>
                </span>
                <Link
                    data-action='change-file-parameters'
                    onClick={() =>
                        onActionClick(GetStartedActions.CHANGE_FILE_PARAMETERS)
                    }
                    text='Change'
                />
            </Layout>
        );

    return (
        <Sticky placement='top'>
            <div className={styles.card}>
                <Card
                    border='black'
                    data-testid='get-started-card'
                    header={{
                        leftAsset: openFile?.game ? (
                            <GameIcon game={openFile.game} />
                        ) : undefined,
                        titleContent: commonFileTitle || undefined,
                        title: openFile
                            ? openFile.path
                                ? basename(openFile.path)
                                : `${openFile.game?.abbreviation ?? `M${openFile.metadata.gameYear}`} file`
                            : 'Get Started'
                    }}
                >
                    <div className={styles.horizontalList}>
                        <List
                            direction='horizontal'
                            divider='solid'
                            gap='5'
                            items={
                                fileLoaded ? franchiseActions : [openFileLink]
                            }
                            scrollable
                        />
                    </div>
                </Card>
            </div>
        </Sticky>
    );
};

export default GetStartedCard;
