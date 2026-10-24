interface Props {
    game: {
        iconPath: string;
        shortTitle: string;
    };
}

const GameIcon: React.FC<Props> = ({ game }: Props) => {
    return (
        <img
            alt={`${game.shortTitle} icon`}
            height={36}
            loading='lazy'
            src={`src/${game.iconPath}`}
            width={36}
        />
    );
};

export default GameIcon;
