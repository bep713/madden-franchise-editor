import Button from '../Button/Button';
import styles from './AutoSavePausedStrip.module.css';

// changed: a File Changed notification (Reload); missing: File Missing
// (Save here)
type Props = { fileName: string; onBranch: () => void } & (
    | { reason: 'changed'; onReload: () => void }
    | { reason: 'missing'; onSaveHere: () => void }
);

// Shown under the tab bar while auto-save waits on a file changed, deleted or
// moved outside the editor. It has no close button: the notification decides.
const AutoSavePausedStrip: React.FC<Props> = (props: Props) => {
    const { fileName, onBranch, reason } = props;
    return (
        <div
            className={styles.strip}
            data-reason={reason}
            data-testid='auto-save-paused'
            role='status'
        >
            <p className={styles.message}>
                Auto-save is paused: {fileName} was{' '}
                {reason === 'missing'
                    ? 'deleted or moved outside the editor.'
                    : 'changed outside the editor.'}
            </p>
            <div className={styles.actions}>
                {props.reason === 'missing' ? (
                    <Button
                        className={styles.action}
                        onClick={props.onSaveHere}
                    >
                        Save here
                    </Button>
                ) : (
                    <Button className={styles.action} onClick={props.onReload}>
                        Reload
                    </Button>
                )}
                <Button className={styles.action} onClick={onBranch}>
                    {reason === 'missing'
                        ? 'Save as new'
                        : 'Branch and save new'}
                </Button>
            </div>
        </div>
    );
};

export default AutoSavePausedStrip;
