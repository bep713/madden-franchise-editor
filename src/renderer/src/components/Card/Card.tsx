import React from 'react';
import cx from 'classnames';
import Layout from '../Layout/Layout';
import Text from '../Text/Text';

import styles from './Card.module.css';

interface Props {
    border?: 'black' | 'silver' | 'none';
    children: React.ReactNode;
    elevation?: 'none' | 'default';
    header?: {
        title?: string;
        titleContent?: React.ReactNode;
        leftAsset?: React.ReactNode;
        rightAsset?: React.ReactNode;
    };
    hover?: boolean;
    onClick?: () => void;
}

const BORDER_CLASSES = {
    black: styles.blackBorder,
    silver: styles.silverBorder,
    none: styles.noBorder
};

const Card: React.FC<Props> = ({
    border = 'none',
    children,
    elevation = 'default',
    header: { leftAsset, title, titleContent, rightAsset } = {},
    hover,
    onClick
}) => (
    <div
        className={cx(styles.card, BORDER_CLASSES[border], {
            [styles.elevation]: elevation === 'default',
            [styles.hover]: hover,
            [styles.clickable]: !!onClick
        })}
        onClick={onClick}
    >
        {(title || titleContent) && (
            <div className={styles.header}>
                <Layout
                    direction='row'
                    alignItems='center'
                    justifyContent='space-between'
                >
                    <Layout direction='row' alignItems='center' columnGap='2'>
                        {leftAsset}
                        {!titleContent && title && (
                            <Text typography='labelLarge'>{title}</Text>
                        )}
                        {titleContent}
                    </Layout>
                    {rightAsset}
                </Layout>
            </div>
        )}
        {children}
    </div>
);

export default Card;
