import Card from '@renderer/components/Card/Card';
import Link from '@renderer/components/Link/Link';
import List from '@renderer/components/List/List';

interface Props {
    onAddSchema: () => void;
    onOpenDirectory: () => void;
    onRefresh: () => void;
    onViewLoaded?: () => void;
}

// Not sticky itself: the page sticks it together with the loaded card
const SchemaActionBar: React.FC<Props> = ({
    onAddSchema,
    onOpenDirectory,
    onRefresh,
    onViewLoaded
}: Props) => (
    <Card
        border='black'
        data-testid='schema-action-bar'
        header={{ title: 'Schemas' }}
    >
        <List
            direction='horizontal'
            divider='solid'
            gap='5'
            items={[
                ...(onViewLoaded
                    ? [
                          <Link
                              data-action='view-loaded-schema'
                              key='view-loaded-schema'
                              onClick={onViewLoaded}
                              text='View loaded schema'
                          />
                      ]
                    : []),
                <Link
                    data-action='open-schema-directory'
                    key='open-schema-directory'
                    onClick={onOpenDirectory}
                    text='Open schema directory'
                />,
                <Link
                    data-action='refresh-schemas'
                    key='refresh-schemas'
                    onClick={onRefresh}
                    text='Refresh schema list'
                />,
                <Link
                    data-action='add-schema'
                    key='add-schema'
                    onClick={onAddSchema}
                    text='Add schema'
                />,
                // TODO: Scan for schemas gets its own plan
                <Link disabled key='scan-schemas' text='Scan for schemas' />
            ]}
            scrollable
        />
    </Card>
);

export default SchemaActionBar;
