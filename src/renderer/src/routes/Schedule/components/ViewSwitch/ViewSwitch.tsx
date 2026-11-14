import type { ScheduleView } from '../../scheduleModel';
import styles from './ViewSwitch.module.css';

interface Props {
    views: readonly { value: ScheduleView; label: string }[];
    value: ScheduleView;
    onChange: (view: ScheduleView) => void;
}

// A segmented control for the orange header
const ViewSwitch: React.FC<Props> = ({ views, value, onChange }: Props) => (
    <div aria-label='View' className={styles.switch} role='group'>
        {views.map((view) => (
            <button
                aria-pressed={view.value === value}
                className={styles.option}
                data-view={view.value}
                key={view.value}
                onClick={() => {
                    if (view.value !== value) onChange(view.value);
                }}
                type='button'
            >
                {view.label}
            </button>
        ))}
    </div>
);

export default ViewSwitch;
