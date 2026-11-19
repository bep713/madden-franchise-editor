// Bundled URLs keyed by path relative to src/renderer/src (e.g. 'assets/game-icons/M19.PNG').
const iconUrls: Record<string, string> = Object.fromEntries(
    Object.entries(
        import.meta.glob<string>('../../assets/game-icons/*.PNG', {
            eager: true,
            query: '?url',
            import: 'default'
        })
    ).map(([path, url]) => [path.replace('../../', ''), url])
);

interface Props {
    game: {
        iconPath: string;
        shortTitle: string;
    };
}

const GameIcon: React.FC<Props> = ({ game }: Props) => {
    const src = iconUrls[game.iconPath];

    if (!src) {
        return null;
    }

    return (
        <img
            alt={`${game.shortTitle} icon`}
            height={36}
            loading='lazy'
            src={src}
            width={36}
        />
    );
};

export default GameIcon;
