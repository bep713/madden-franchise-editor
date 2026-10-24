import Button from '../Button';

const meta = {
    component: Button,
    tags: ['autodocs'],
    title: 'Components/Button'
};

export default meta;

export const Primary = {
    args: {
        children: 'Add schema',
        state: 'default',
        type: 'primary'
    }
};

export const Secondary = {
    args: {
        children: 'Add schema',
        state: 'default',
        type: 'secondary'
    }
};

export const Ghost = {
    args: {
        children: 'Add schema',
        state: 'default',
        type: 'ghost'
    }
};

export const Stretch = {
    args: {
        children: 'Add schema',
        state: 'default',
        stretch: true,
        type: 'primary'
    }
};

export const StretchAlign = {
    args: {
        align: 'left',
        children: 'Add schema',
        state: 'default',
        stretch: true,
        type: 'primary'
    }
};

export const Disabled = {
    args: {
        children: 'Add schema',
        state: 'disabled'
    }
};
