import React from 'react';
import styles from './Text.module.css';
import classNames from 'classnames';

interface Props {
    weight?: 'bold' | 'light' | 'medium' | 'normal';
    emphasis?: boolean;
    children: React.ReactNode;
    typography?:
        'body' | 'labelLarge' | 'labelXLarge' | 'label2XLarge' | 'labelSmall';
}

const Text: React.FC<Props> = ({
    children,
    emphasis,
    typography = 'body',
    weight = 'normal'
}) => (
    <span
        className={classNames(styles[typography], {
            [styles.bold]: weight === 'bold',
            [styles.light]: weight === 'light',
            [styles.medium]: weight === 'medium',
            [styles.emphasis]: emphasis
        })}
    >
        {children}
    </span>
);

export default Text;
