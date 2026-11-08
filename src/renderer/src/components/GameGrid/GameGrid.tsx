import cx from 'classnames';
import styles from './GameGrid.module.css';

interface Props {
    children: React.ReactNode;
    className?: string;
    'data-testid'?: string;
}

const GameGrid: React.FC<Props> = ({
    children,
    className,
    'data-testid': testId
}: Props) => (
    <div className={cx(styles.grid, className)} data-testid={testId}>
        {children}
    </div>
);

export default GameGrid;
