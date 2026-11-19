import Divider from '../Divider';

const meta = {
    component: Divider,
    tags: ['autodocs'],
    title: 'Components/Divider'
};

export default meta;

export const Horizontal = {
    args: {
        style: 'solid',
        type: 'horizontal'
    }
};

export const Vertical = {
    args: {
        style: 'solid',
        type: 'vertical'
    }
};

export const Dashed = {
    args: {
        style: 'dashed',
        type: 'horizontal'
    }
};
