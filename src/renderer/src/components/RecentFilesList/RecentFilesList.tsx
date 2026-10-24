import { RecentFile } from '@shared/types/files';
import List from '../List/List';
import Text from '../Text/Text';
import Card from '../Card/Card';
import Layout from '../Layout/Layout';

interface RecentFilesListProps {
    files: RecentFile[];
    onClick: (r: RecentFile) => void;
}

const RecentFilesList: React.FC<RecentFilesListProps> = ({
    files,
    onClick
}: RecentFilesListProps) => {
    const items = files
        ?.filter((file) => file.lastAccessedTime)
        ?.sort((a, b) => (b.lastAccessedTime || 0) - (a.lastAccessedTime || 0))
        ?.slice(0, 7)
        ?.map((file, index) => (
            <Card
                border='silver'
                header={{
                    titleContent: (
                        <Layout alignItems='center' columnGap='2'>
                            <Text typography='labelLarge'>{file.name}</Text>
                            {file.gameYear && (
                                <Text typography='body' weight='light'>
                                    M{file.gameYear}
                                </Text>
                            )}
                        </Layout>
                    )
                }}
                hover
                key={index}
                onClick={() => onClick?.(file)}
            >
                <Text emphasis typography='body' weight='light'>
                    {file.basePath}
                </Text>
                {file.lastAccessedTime && (
                    <Text emphasis typography='body' weight='light'>
                        Last Accessed:{' '}
                        {new Date(file.lastAccessedTime).toLocaleString(
                            'en-US',
                            {
                                month: '2-digit',
                                day: '2-digit',
                                year: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                            }
                        )}
                    </Text>
                )}
            </Card>
        ));

    return files?.length > 0 ? (
        <List direction='horizontal' gap='1' items={items} scrollable />
    ) : (
        <div id='no-recent-files' data-testid='empty-list-message'>
            No recent files. When you open a file, it will appear here so you
            can access it later.
        </div>
    );
};

export default RecentFilesList;
