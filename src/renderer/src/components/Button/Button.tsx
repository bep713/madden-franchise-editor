import React from 'react';
import cx from 'classnames';
import styles from './Button.module.css';

interface Props {
    align?: 'left' | 'center' | 'right';
    as?: React.ElementType;
    children: React.ReactNode;
    state?: 'default' | 'disabled';
    stretch?: boolean;
    type?: 'primary' | 'secondary' | 'ghost';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

const Button: React.FC<Props> = ({
    align = 'center',
    as: Component = 'button',
    children,
    state = 'default',
    stretch = false,
    type = 'secondary',
    ...props
}) => (
    <Component
        className={cx(styles.button, styles[align], styles[type], {
            [styles.disabled]: state === 'disabled',
            [styles.stretch]: stretch
        })}
        {...props}
    >
        {children}
    </Component>
);

export default Button;
