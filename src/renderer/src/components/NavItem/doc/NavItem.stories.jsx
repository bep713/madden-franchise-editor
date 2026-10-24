import NavItem from '../NavItem';

const meta = {
    component: NavItem,
    tags: ['autodocs'],
    title: 'Components/NavItem'
};

export default meta;

export const Base = {
    args: {
        text: 'Home'
    }
};

export const Selected = {
    args: {
        text: 'Home',
        selected: true
    }
};

export const Closable = {
    args: {
        closable: true,
        text: 'Home'
    }
};

export const Icon = {
    args: {
        closable: true,
        leftAsset: <img src="https://placecats.com/16/16'" />,
        text: 'Home'
    }
};
