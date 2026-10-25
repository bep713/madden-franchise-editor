import Card from '@renderer/components/Card/Card';
import GameIcon from '@renderer/components/GameIcon/GameIcon';
import Link from '@renderer/components/Link/Link';
import List from '@renderer/components/List/List';
import Sticky from '@renderer/components/Sticky/Sticky';
import { OpenFranchiseFile } from '@renderer/context/FranchiseFileContext';
import { basename } from '@renderer/utils/path';

import styles from './GetStartedCard.module.css';

export enum GetStartedActions {
    MAKE_BACKUP_FILE = 'MAKE_BACKUP_FILE',
    OPEN_FILE = 'OPEN_FILE',
    OPEN_FILE_LOCATION = 'OPEN_FILE_LOCATION',
    OPEN_SCHEMA_MANAGEMENT = 'OPEN_SCHEMA_MANAGEMENT',
    OPEN_TABLE_EDITOR = 'OPEN_TABLE_EDITOR'
}

interface GetStartedCardProps {
    openFile?: OpenFranchiseFile | null;
    onActionClick: (action: GetStartedActions) => void;
}

const GetStartedCard: React.FC<GetStartedCardProps> = ({
    openFile = null,
    onActionClick
}: GetStartedCardProps) => {
    const fileLoaded = !!openFile;

    const items = [
        <Link
            key={GetStartedActions.OPEN_FILE}
            onClick={() => onActionClick(GetStartedActions.OPEN_FILE)}
            text={fileLoaded ? 'Open a different file...' : 'Open a file...'}
        />
    ];

    const franchiseActions = [
        <Link
            key={GetStartedActions.OPEN_TABLE_EDITOR}
            onClick={() => onActionClick(GetStartedActions.OPEN_TABLE_EDITOR)}
            text='Open the table editor'
        />,
        <Link
            key={GetStartedActions.OPEN_SCHEMA_MANAGEMENT}
            onClick={() =>
                onActionClick(GetStartedActions.OPEN_SCHEMA_MANAGEMENT)
            }
            text='Open schema management'
        />,
        // The path is unknown after a renderer reload
        openFile?.path && (
            <Link
                key={GetStartedActions.OPEN_FILE_LOCATION}
                onClick={() =>
                    onActionClick(GetStartedActions.OPEN_FILE_LOCATION)
                }
                text='Open file location'
            />
        ),
        <Link
            key={GetStartedActions.MAKE_BACKUP_FILE}
            onClick={() => onActionClick(GetStartedActions.MAKE_BACKUP_FILE)}
            text='Make backup file'
        />
    ].filter((item) => !!item);

    return (
        <Sticky placement='top'>
            <div className={styles.card}>
                <Card
                    border='black'
                    header={{
                        leftAsset: openFile?.game ? (
                            <GameIcon game={openFile.game} />
                        ) : undefined,
                        title: openFile
                            ? openFile.path
                                ? basename(openFile.path)
                                : `M${openFile.metadata.gameYear} file`
                            : 'Get Started'
                    }}
                >
                    <div className={styles.horizontalList}>
                        <List
                            direction='horizontal'
                            divider='solid'
                            gap='5'
                            items={
                                fileLoaded
                                    ? items.concat(franchiseActions)
                                    : items
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
