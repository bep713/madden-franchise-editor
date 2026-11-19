import SideNav from '../SideNav';

const meta = {
    component: SideNav,
    tags: ['autodocs'],
    title: 'Components/SideNav'
};

export default meta;

export const Base = {
    args: {
        items: [
            {
                leftAsset: (
                    <img
                        height={16}
                        width={16}
                        src='https://placecats.com/36/36'
                    />
                ),
                text: 'Open a file...'
            },
            {
                leftAsset: (
                    <img
                        height={16}
                        width={16}
                        src='https://placecats.com/36/36'
                    />
                ),
                text: 'Recent Files'
            },
            {
                leftAsset: (
                    <img
                        height={16}
                        width={16}
                        src='https://placecats.com/36/36'
                    />
                ),
                text: 'Game Saves'
            }
        ]
    }
};
