import cx from 'classnames';
import styles from './Banner.module.css';
import Close from '@assets/icons/close.svg?react';

export type BannerSeverity = 'info' | 'error' | 'success';

export interface BannerAction {
    label: string;
    onClick: () => void;
    primary?: boolean;
}

interface Props {
    actions?: BannerAction[];
    kind?: string;
    message: string;
    onBlur?: React.FocusEventHandler<HTMLDivElement>;
    onClose: () => void;
    onFocus?: React.FocusEventHandler<HTMLDivElement>;
    onPointerEnter?: React.PointerEventHandler<HTMLDivElement>;
    onPointerLeave?: React.PointerEventHandler<HTMLDivElement>;
    severity: BannerSeverity;
    visible: boolean;
}

// file-changed has three: Dismiss, Branch and save new, Reload
const MAX_ACTIONS = 3;

const Banner: React.FC<Props> = ({
    actions = [],
    kind,
    message,
    onBlur,
    onClose,
    onFocus,
    onPointerEnter,
    onPointerLeave,
    severity,
    visible
}: Props) => {
    return (
        <div
            className={cx(styles.banner, {
                [styles.visible]: visible,
                [styles.error]: severity === 'error',
                [styles.success]: severity === 'success'
            })}
            data-kind={kind}
            data-testid='banner'
            onBlur={onBlur}
            onFocus={onFocus}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            role={severity === 'error' ? 'alert' : 'status'}
        >
            <p className={styles.message}>{message}</p>
            <div className={styles.actions}>
                {actions.slice(0, MAX_ACTIONS).map((action) => (
                    <button
                        className={cx(styles.action, {
                            [styles.primary]: action.primary,
                            [styles.errorPrimary]: severity === 'error',
                            [styles.successPrimary]: severity === 'success'
                        })}
                        key={action.label}
                        onClick={() => {
                            action.onClick();
                            onClose();
                        }}
                        type='button'
                    >
                        {action.label}
                    </button>
                ))}
                <button
                    aria-label='Close'
                    className={styles.close}
                    onClick={onClose}
                    type='button'
                >
                    <Close aria-hidden='true' />
                </button>
            </div>
        </div>
    );
};

export default Banner;
