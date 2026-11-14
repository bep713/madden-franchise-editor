import { useEffect, useRef, useState } from 'react';
import Textbox from '@renderer/components/Textbox/Textbox';
import { minutesToTimeValue, timeValueToMinutes } from '../../scheduleModel';
import styles from './TimeInput.module.css';

interface Props {
    // Minutes since midnight
    minutes: number;
    onChange: (minutes: number) => void;
    'aria-label': string;
}

// A native time input, like v4's. Committed on Enter or blur rather than on
// change, which fires per segment and would write the file each time.
const TimeInput: React.FC<Props> = ({
    minutes,
    onChange,
    'aria-label': ariaLabel
}: Props) => {
    const [value, setValue] = useState(() => minutesToTimeValue(minutes));
    // Changed since it got focus; a re-read then leaves the value alone
    const dirtyRef = useRef(false);
    const focusedRef = useRef(false);

    useEffect(() => {
        if (focusedRef.current && dirtyRef.current) return;
        setValue(minutesToTimeValue(minutes));
    }, [minutes]);

    const revert = (): void => {
        dirtyRef.current = false;
        setValue(minutesToTimeValue(minutes));
    };

    // An empty value (a cleared segment) reverts and writes nothing
    const commit = (): void => {
        const parsed = timeValueToMinutes(value);
        if (parsed === null) {
            revert();
            return;
        }
        dirtyRef.current = false;
        if (parsed !== minutes) onChange(parsed);
    };

    return (
        <div className={styles.timeInput}>
            <Textbox
                aria-label={ariaLabel}
                onBlur={() => {
                    focusedRef.current = false;
                    commit();
                }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    dirtyRef.current = true;
                    setValue(e.target.value);
                }}
                onFocus={() => {
                    focusedRef.current = true;
                }}
                onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        commit();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        revert();
                    }
                }}
                step={60}
                text={value}
                type='time'
            />
        </div>
    );
};

export default TimeInput;
