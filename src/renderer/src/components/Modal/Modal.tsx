import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import cx from 'classnames';
import styles from './Modal.module.css';

interface Props {
    children: React.ReactNode;
    className?: string;
    headerAction?: React.ReactNode;
    onClose: () => void;
    onUnderlayClick?: () => void;
    title: string;
}

const Modal: React.FC<Props> = ({
    children,
    className,
    headerAction,
    onClose,
    onUnderlayClick,
    title
}) => {
    const titleId = useId();
    const onCloseRef = React.useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                onCloseRef.current();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    return createPortal(
        <>
            <div
                className={styles.underlay}
                data-testid='modal-underlay'
                onClick={() => (onUnderlayClick ?? onClose)()}
            />
            <div
                aria-labelledby={titleId}
                aria-modal='true'
                className={cx(styles.dialog, className)}
                role='dialog'
            >
                <div className={styles.header}>
                    <h2 className={styles.title} id={titleId}>
                        {title}
                    </h2>
                    {headerAction}
                </div>
                <div className={styles.content}>{children}</div>
            </div>
        </>,
        document.body
    );
};

export default Modal;
