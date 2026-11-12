import { useEffect, useRef } from 'react';
import type { ScheduleWeek } from '../../scheduleModel';
import styles from './WeekBar.module.css';

interface Props {
    weeks: readonly ScheduleWeek[];
    // Games per week, in the same order as `weeks`
    counts: readonly number[];
    selected: number;
    onSelect: (index: number) => void;
}

// Every week from seasonWeekData.json in order, N/A and empty weeks included
const WeekBar: React.FC<Props> = ({
    weeks,
    counts,
    selected,
    onSelect
}: Props) => {
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
                const count = counts[week.index] ?? 0;
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
                        {count > 0 && (
                            <span
                                aria-label={`${count} games`}
                                className={styles.count}
                                data-count={count}
                            >
                                {count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default WeekBar;
