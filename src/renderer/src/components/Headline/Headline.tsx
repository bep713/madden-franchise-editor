import React from 'react';
import cx from 'classnames';
import styles from './Headline.module.css';

interface Props {
    size?: 'default' | 'small';
    subtext?: string | React.ReactNode;
    text: string | React.ReactNode;
}

const Headline: React.FC<Props> = ({ size = 'default', subtext, text }) => (
    <header
        className={cx(styles.headline, styles[size], {
            [styles.subtext]: subtext
        })}
    >
        <h1 className={cx(styles.header)}>{text}</h1>
        <span className={styles.subtext}>{subtext}</span>
    </header>
);

export default Headline;
