import { File, GameFileList } from '@shared/types/files';
import Card from '../Card/Card';
import List from '../List/List';
import Link from '../Link/Link';
import styles from './GameFilesCard.module.css';
import GameIcon from '../GameIcon/GameIcon';
import Folder from '@assets/icons/folder.svg?react';

interface GameFileCardProps {
    files: GameFileList;
    onDirectoryClick?: () => void;
    onFileClick: (r: File) => void;
}

const GameFileCard: React.FC<GameFileCardProps> = ({
    files,
    onDirectoryClick,
    onFileClick
}: GameFileCardProps) => {
    const items = files.files.slice(0, 7).map((file) => (
        // eslint-disable-next-line react/jsx-key
        <Link text={file.name} onClick={() => onFileClick(file)} />
    ));

    return (
        <Card
            header={{
                leftAsset: <GameIcon game={files.game} />,
                rightAsset: (
                    <Folder
                        aria-label='Directory icon'
                        className={styles.directory}
                        height={16}
                        onClick={onDirectoryClick}
                        role='img'
                        width={16}
                    />
                ),
                title: `${files.game.shortTitle} Saves`
            }}
        >
            <List direction='vertical' gap='2' items={items} />
        </Card>
    );
};

export default GameFileCard;
