import Card from '../Card';
import Text from '../../Text/Text';

const meta = {
    component: Card,
    parameters: {
        backgrounds: {
            default: 'Gray'
        }
    },
    tags: ['autodocs'],
    title: 'Components/Card'
};

export default meta;

const childText = <Text typography='body'>Card text</Text>;

export const Base = {
    args: {
        children: childText
    }
};

export const Header = {
    args: {
        children: childText,
        header: {
            leftAsset: (
                <img height={36} width={36} src='https://placecats.com/36/36' />
            ),
            title: 'Title',
            rightAsset: (
                <img height={36} width={36} src='https://placecats.com/36/36' />
            )
        }
    }
};

export const NoElevation = {
    args: {
        children: childText,
        elevation: 'none'
    }
};
