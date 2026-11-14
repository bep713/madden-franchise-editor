import { useEffect, useRef } from 'react';
import type { ScheduleWeek } from '../../scheduleModel';
import styles from './WeekBar.module.css';

interface Props {
    weeks: readonly ScheduleWeek[];
    selected: number;
    onSelect: (index: number) => void;
}

// Every week from seasonWeekData.json in order, N/A and empty weeks
// included. One row that scrolls on its own, like v4's.
const WeekBar: React.FC<Props> = ({ weeks, selected, onSelect }: Props) => {
    const barRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Not in jsdom
        barRef.current
            ?.querySelector<HTMLElement>(`[data-week="${selected}"]`)
            ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }, [selected]);

    const onKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 1 : -1;
        const next = Math.max(0, Math.min(selected + step, weeks.length - 1));
        if (next === selected) return;
        onSelect(next);
        barRef.current
            ?.querySelector<HTMLElement>(`[data-week="${next}"]`)
            ?.focus();
    };

    return (
        <div
            aria-label='Week'
            className={styles.bar}
            onKeyDown={onKeyDown}
            ref={barRef}
            role='toolbar'
        >
            {weeks.map((week) => {
                const isSelected = week.index === selected;
                return (
                    <button
                        aria-pressed={isSelected}
                        className={styles.week}
                        data-week={week.index}
                        key={week.index}
                        onClick={() => onSelect(week.index)}
                        tabIndex={isSelected ? 0 : -1}
                        title={week.weekName}
                        type='button'
                    >
                        {week.abbreviation}
                    </button>
                );
            })}
        </div>
    );
};

export default WeekBar;
