import React from 'react';
import cx from 'classnames';
import styles from './Divider.module.css';

interface Props {
    style?: 'solid' | 'dashed';
    type?: 'horizontal' | 'vertical';
}

const Divider: React.FC<Props> = ({ style = 'solid', type = 'horizontal' }) => {
    return <div className={cx(styles.divider, styles[style], styles[type])} />;
};

export default Divider;
