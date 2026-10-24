import Card from '@renderer/components/Card/Card';
import GameIcon from '@renderer/components/GameIcon/GameIcon';
import Link from '@renderer/components/Link/Link';
import List from '@renderer/components/List/List';
import Sticky from '@renderer/components/Sticky/Sticky';
import { FranchiseModel } from '@shared/types/franchise';

import styles from './GetStartedCard.module.css';

export enum GetStartedActions {
    MAKE_BACKUP_FILE = 'MAKE_BACKUP_FILE',
    OPEN_FILE = 'OPEN_FILE',
    OPEN_FILE_LOCATION = 'OPEN_FILE_LOCATION',
    OPEN_SCHEMA_MANAGEMENT = 'OPEN_SCHEMA_MANAGEMENT',
    OPEN_TABLE_EDITOR = 'OPEN_TABLE_EDITOR'
}

interface GetStartedCardProps {
    franchiseModel?: FranchiseModel | null;
    onActionClick: (action: GetStartedActions) => void;
}

const GetStartedCard: React.FC<GetStartedCardProps> = ({
    franchiseModel = null,
    onActionClick
}: GetStartedCardProps) => {
    const fileLoaded = !!franchiseModel;

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
        <Link
            key={GetStartedActions.OPEN_FILE_LOCATION}
            onClick={() => onActionClick(GetStartedActions.OPEN_FILE_LOCATION)}
            text='Open file location'
        />,
        <Link
            key={GetStartedActions.MAKE_BACKUP_FILE}
            onClick={() => onActionClick(GetStartedActions.MAKE_BACKUP_FILE)}
            text='Make backup file'
        />
    ];

    return (
        <Sticky placement='top'>
            <div className={styles.card}>
                <Card
                    border='black'
                    header={{
                        leftAsset:
                            fileLoaded && franchiseModel.game ? (
                                <GameIcon game={franchiseModel?.game} />
                            ) : undefined,
                        title: fileLoaded ? franchiseModel.name : 'Get Started'
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
