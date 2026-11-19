import TableListItem from '../TableListItem';

const meta = {
    component: TableListItem,
    tags: ['autodocs'],
    title: 'Components/TableListItem'
};

export default meta;

export const Base = {
    args: {
        table: {
            id: 4097,
            name: 'OverallPercentage',
            selected: false
        },
        emphasisText: 'Perc'
    }
};

export const Pinned = {
    args: {
        table: {
            id: 4220,
            name: 'Player',
            pinned: true,
            selected: false
        }
    }
};
