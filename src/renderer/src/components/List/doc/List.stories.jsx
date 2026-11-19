import List from '../List';

const meta = {
    component: List,
    tags: ['autodocs'],
    title: 'Components/List'
};

export default meta;

export const Horizontal = {
    args: {
        direction: 'horizontal',
        items: ['Item 1', 'Item 2', 'Item 3'],
        type: 'unordered'
    }
};

export const Vertical = {
    args: {
        direction: 'vertical',
        items: ['Item 1', 'Item 2', 'Item 3'],
        type: 'unordered'
    }
};

export const Divider = {
    args: {
        divider: 'solid',
        items: ['Item 1', 'Item 2', 'Item 3'],
        type: 'unordered'
    }
};

export const VerticalDivider = {
    args: {
        direction: 'vertical',
        divider: 'solid',
        items: ['Item 1', 'Item 2', 'Item 3'],
        type: 'unordered'
    }
};

export const DividerOnEnd = {
    args: {
        divider: 'solid',
        dividerOnEnd: true,
        items: ['Item 1', 'Item 2', 'Item 3'],
        type: 'unordered'
    }
};

export const Ordered = {
    args: {
        items: ['Item 1', 'Item 2', 'Item 3'],
        type: 'ordered'
    }
};

export const OrderedNumbered = {
    args: {
        items: ['Item 1', 'Item 2', 'Item 3'],
        style: 'numbered',
        type: 'ordered'
    }
};

export const Bulleted = {
    args: {
        items: ['Item 1', 'Item 2', 'Item 3'],
        style: 'bullet',
        type: 'unordered'
    }
};
