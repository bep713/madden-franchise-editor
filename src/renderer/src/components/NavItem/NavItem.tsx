import React from 'react';
import cx from 'classnames';
import styles from './NavItem.module.css';

import Layout from '../Layout/Layout';

interface Props {
    as: React.ElementType;
    closable?: boolean;
    closeButtonProps?: object;
    leftAsset?: React.ReactNode;
    selected?: boolean;
    text: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

const NavItem: React.FC<Props> = ({
    as: Component = 'a',
    closeButtonProps,
    closable = false,
    text,
    selected = false,
    ...props
}) => {
    return (
        <Component
            className={cx(styles.navItem, {
                [styles.selected]: selected
            })}
            {...props}
        >
            <Layout alignItems='center' direction='row' inline>
                <Layout
                    alignItems='center'
                    columnGap='1'
                    direction='row'
                    inline
                >
                    {props.leftAsset && (
                        <div className={styles.leftAsset}>
                            {props.leftAsset}
                        </div>
                    )}
                    {text}
                </Layout>
                {closable && (
                    <button
                        className={styles.closeButton}
                        {...closeButtonProps}
                    >
                        X
                    </button>
                )}
            </Layout>
        </Component>
    );
};

export default NavItem;
