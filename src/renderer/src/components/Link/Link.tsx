import React from 'react';
import styles from './Link.module.css';
import cx from 'classnames';
import Layout from '../Layout/Layout';

export interface Props {
    as?: React.ElementType;
    color?: 'default' | 'black';
    leftAsset?: React.ReactNode;
    text: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

const Link: React.FC<Props> = ({
    as: Component = 'a',
    color = 'default',
    leftAsset,
    text,
    ...props
}) => (
    <Component className={cx(styles.link, styles[color])} {...props}>
        <Layout alignItems='center' columnGap='2' direction='row'>
            {leftAsset}
            {text}
        </Layout>
    </Component>
);

export default Link;
