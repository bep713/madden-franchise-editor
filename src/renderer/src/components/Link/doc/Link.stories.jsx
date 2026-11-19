import Link from '../Link';

const meta = {
    component: Link,
    tags: ['autodocs'],
    title: 'Components/Link'
};

export default meta;

export const Base = {
    args: {
        text: 'Open a file...'
    }
};

export const LeftAsset = {
    args: {
        leftAsset: (
            <img height={36} width={36} src='https://placecats.com/36/36' />
        ),
        text: 'Open a file...'
    }
};
