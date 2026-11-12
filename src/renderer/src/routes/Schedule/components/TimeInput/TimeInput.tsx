import { useEffect, useRef, useState } from 'react';
import Textbox from '@renderer/components/Textbox/Textbox';
import { formatTime12, parseTime12 } from '../../scheduleModel';
import styles from './TimeInput.module.css';

interface Props {
    // Minutes since midnight
    minutes: number;
    onChange: (minutes: number) => void;
    'aria-label': string;
}

// A 12-hour time ("8:20 PM"), committed on Enter or blur
const TimeInput: React.FC<Props> = ({
    minutes,
    onChange,
    'aria-label': ariaLabel
}: Props) => {
    const [text, setText] = useState(() => formatTime12(minutes));
    const [invalid, setInvalid] = useState(false);
    // Typed in since it got focus; a re-read then leaves the text alone
    const dirtyRef = useRef(false);
    const focusedRef = useRef(false);

    useEffect(() => {
        if (focusedRef.current && dirtyRef.current) return;
        setText(formatTime12(minutes));
        setInvalid(false);
    }, [minutes]);

    const revert = (): void => {
        dirtyRef.current = false;
        setText(formatTime12(minutes));
        setInvalid(false);
    };

    // false: the text isn't a time
    const commit = (): boolean => {
        const parsed = parseTime12(text);
        if (parsed === null) {
            setInvalid(true);
            return false;
        }
        dirtyRef.current = false;
        setInvalid(false);
        setText(formatTime12(parsed));
        if (parsed !== minutes) onChange(parsed);
        return true;
    };

    return (
        <div className={styles.timeInput}>
            <Textbox
                aria-invalid={invalid || undefined}
                aria-label={ariaLabel}
                onBlur={() => {
                    focusedRef.current = false;
                    if (!commit()) revert();
                }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    dirtyRef.current = true;
                    setText(e.target.value);
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
                state={invalid ? 'error' : 'default'}
                text={text}
                title='A time like 8:20 PM'
            />
        </div>
    );
};

export default TimeInput;
