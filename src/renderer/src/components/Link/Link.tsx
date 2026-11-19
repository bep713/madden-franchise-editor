import React from 'react';
import styles from './Link.module.css';
import cx from 'classnames';
import Layout from '../Layout/Layout';

export interface Props {
    as?: React.ElementType;
    color?: 'default' | 'black';
    // Muted, with no onClick
    disabled?: boolean;
    leftAsset?: React.ReactNode;
    onClick?: React.MouseEventHandler;
    text: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

const Link: React.FC<Props> = ({
    as: Component = 'a',
    color = 'default',
    disabled = false,
    leftAsset,
    onClick,
    text,
    ...props
}) => (
    <Component
        aria-disabled={disabled || undefined}
        className={cx(styles.link, styles[color], {
            [styles.disabled]: disabled
        })}
        onClick={disabled ? undefined : onClick}
        {...props}
    >
        <Layout alignItems='center' columnGap='2' direction='row'>
            {leftAsset}
            {text}
        </Layout>
    </Component>
);

export default Link;
