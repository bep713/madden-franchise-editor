import React from 'react';
import cx from 'classnames';
import styles from './StatusBar.module.css';

interface Props {
    severity?: 'info' | 'error';
    text: string;
}

const StatusBar: React.FC<Props> = ({ severity = 'info', text }) => (
    <div className={cx(styles.statusBar, styles[severity])}>{text}</div>
);

export default StatusBar;
