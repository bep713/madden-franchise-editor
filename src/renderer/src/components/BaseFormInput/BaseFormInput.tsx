import React from 'react';
import cx from 'classnames';
import styles from './BaseFormInput.module.css';

import Layout from '../Layout/Layout';

export interface BaseProps {
    direction?: 'horizontal' | 'vertical';
    errorMessage?: string;
    label?: string;
    leftAsset?: React.ReactNode;
    state?: 'default' | 'error';
    // borderless: no border or background until hovered or focused, for
    // inputs that sit inline in a layout (v4's Selectr look)
    variant?: 'default' | 'borderless';
}

interface Props extends BaseProps {
    input: React.ReactNode;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

const BaseFormInput: React.FC<Props> = ({
    direction = 'vertical',
    errorMessage,
    input,
    label,
    leftAsset,
    state = 'default',
    variant = 'default'
}) => {
    const isHorizontal = direction === 'horizontal';
    const element = (
        <div className={styles.inputWrapper}>
            <Layout alignItems='stretch' direction='column' rowGap='none'>
                <div
                    className={cx(styles.input, styles[state], {
                        [styles.leftAsset]: !!leftAsset,
                        [styles.borderless]: variant === 'borderless'
                    })}
                >
                    <Layout alignItems='center' direction='row' columnGap='2'>
                        {leftAsset}
                        {input}
                    </Layout>
                </div>
                {state === 'error' && errorMessage && (
                    <div className={styles.errorMessage}>{errorMessage}</div>
                )}
            </Layout>
        </div>
    );

    return (
        <div className={styles.wrapper}>
            {label ? (
                <label
                    className={cx(styles.labelWrapper, {
                        [styles.horizontal]: isHorizontal
                    })}
                >
                    <Layout
                        alignItems='stretch'
                        columnGap={isHorizontal ? '2' : 'none'}
                        direction={isHorizontal ? 'row' : 'column'}
                        justifyContent={
                            isHorizontal ? 'space-between' : 'start'
                        }
                        rowGap={isHorizontal ? 'none' : '1'}
                    >
                        <span className={styles.label}>{label}</span>
                        {element}
                    </Layout>
                </label>
            ) : (
                element
            )}
        </div>
    );
};

export default BaseFormInput;
