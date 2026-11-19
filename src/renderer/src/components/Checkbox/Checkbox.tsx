import React from 'react';
import styles from './Checkbox.module.css';

interface Props {
    checked: boolean;
    description?: React.ReactNode;
    disabled?: boolean;
    label: string;
    onChange: (checked: boolean) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

// A native checkbox in its label, so its accessible name is the label
const Checkbox: React.FC<Props> = ({
    checked,
    description,
    disabled = false,
    label,
    onChange,
    ...props
}) => (
    <label className={styles.checkbox}>
        <input
            checked={checked}
            className={styles.input}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            type='checkbox'
            {...props}
        />
        <span className={styles.text}>
            <span className={styles.label}>{label}</span>
            {description && (
                <span className={styles.description}>{description}</span>
            )}
        </span>
    </label>
);

export default Checkbox;
