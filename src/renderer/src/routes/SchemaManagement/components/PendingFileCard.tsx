import Card from '@renderer/components/Card/Card';
import Layout from '@renderer/components/Layout/Layout';
import Link from '@renderer/components/Link/Link';
import Text from '@renderer/components/Text/Text';
import type { PendingOpen } from '@renderer/context/PendingOpenContext';
import { basename } from '@renderer/utils/path';
import { yearPrefix } from '../schemaList';

interface Props {
    pending: PendingOpen;
    onCancel: () => void;
}

// Takes the loaded schema card's place while a file waits for a schema
const PendingFileCard: React.FC<Props> = ({ pending, onCancel }: Props) => {
    const { game } = pending;

    return (
        <Card
            border='black'
            data-testid='pending-file'
            header={{ title: `Choose a schema for ${basename(pending.path)}` }}
        >
            <Layout direction='column' rowGap='2'>
                <span data-field='game'>
                    <Text>
                        {game
                            ? `No schema exists for ${yearPrefix(game.gameType, game.gameYear)}. Pick one below to open the file with it.`
                            : 'No schema exists for this game. Pick one below to open the file with it.'}
                    </Text>
                </span>
                <span>
                    <Link
                        data-action='cancel-pending'
                        onClick={onCancel}
                        text='Cancel'
                    />
                </span>
            </Layout>
        </Card>
    );
};

export default PendingFileCard;
