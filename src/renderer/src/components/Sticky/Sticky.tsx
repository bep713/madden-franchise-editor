import styles from './Sticky.module.css';

interface Props {
    children: React.ReactNode;
    placement?: 'bottom' | 'top';
}

const Sticky: React.FC<Props> = ({ children, placement = 'top' }: Props) => {
    return (
        <div
            className={styles.sticky}
            style={{
                bottom: placement === 'bottom' ? '0px' : undefined,
                top: placement === 'top' ? '0px' : undefined
            }}
        >
            {children}
        </div>
    );
};

export default Sticky;
