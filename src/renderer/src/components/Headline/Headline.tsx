import React from 'react';
import cx from 'classnames';
import styles from './Headline.module.css';

interface Props {
    // Right-aligned, e.g. icon buttons
    actions?: React.ReactNode;
    size?: 'default' | 'small';
    subtext?: string | React.ReactNode;
    text: string | React.ReactNode;
}

const Headline: React.FC<Props> = ({
    actions,
    size = 'default',
    subtext,
    text
}) => (
    <header
        className={cx(styles.headline, styles[size], {
            [styles.subtext]: subtext
        })}
    >
        <h1 className={cx(styles.header)}>{text}</h1>
        <span className={styles.subtext}>{subtext}</span>
        {actions && <div className={styles.actions}>{actions}</div>}
    </header>
);

export default Headline;
