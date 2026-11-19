import Link, { Props as LinkProps } from '@renderer/components/Link/Link';
import List from '@renderer/components/List/List';

interface Props {
    actionItems: LinkProps[];
}

const TableActionBar = ({ actionItems }: Props) => {
    const items = actionItems.map((item) => <Link key={item.key} {...item} />);

    return (
        <List
            direction='horizontal'
            divider='solid'
            gap='5'
            items={items}
            scrollable
        />
    );
};

export default TableActionBar;
