import React from 'react';
import cx from 'classnames';
import styles from './List.module.css';

import type { Gap } from '../Layout/Layout';
import Divider from '../Divider/Divider';

interface Props {
    direction?: 'horizontal' | 'vertical';
    divider?: 'none' | 'solid';
    dividerOnEnd?: boolean;
    gap?: Gap;
    items: string[] | React.ReactNode[];
    scrollable?: boolean;
    style?: 'none' | 'bullet' | 'numbered';
    type?: 'ordered' | 'unordered';
}

const GAP_CLASSES = {
    none: styles.gapNone,
    '05': styles.gap05,
    '1': styles.gap1,
    '2': styles.gap2,
    '3': styles.gap3,
    '4': styles.gap4,
    '5': styles.gap5,
    '6': styles.gap6,
    '8': styles.gap8,
    '12': styles.gap12,
    '16': styles.gap16
};

const List: React.FC<Props> = ({
    direction = 'horizontal',
    divider = 'none',
    dividerOnEnd = false,
    gap = '3',
    items,
    scrollable = false,
    style = 'none',
    type = 'unordered'
}) => {
    const ListComponent = type === 'unordered' ? 'ul' : 'ol';
    const showDivider = divider === 'solid';
    return (
        <ListComponent
            className={cx(styles.list, GAP_CLASSES[gap], {
                [styles.horizontal]: direction === 'horizontal',
                [styles.numbered]: style === 'numbered',
                [styles.bullet]: style === 'bullet',
                [styles.scrollable]: scrollable
            })}
        >
            {items.map((item, index) => (
                <React.Fragment key={index}>
                    <li className={styles.item}>
                        {item}
                    </li>
                    {showDivider &&
                        (dividerOnEnd || index < items.length - 1) && (
                            <li className={styles.divider}>
                                <Divider
                                    type={
                                        direction === 'horizontal'
                                            ? 'vertical'
                                            : 'horizontal'
                                    }
                                />
                            </li>
                        )}
                </React.Fragment>
            ))}
        </ListComponent>
    );
};

export default List;
