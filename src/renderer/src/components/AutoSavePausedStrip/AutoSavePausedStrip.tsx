import Button from '../Button/Button';
import styles from './AutoSavePausedStrip.module.css';

interface Props {
    fileName: string;
    onBranch: () => void;
    onReload: () => void;
}

// Shown under the tab bar while auto-save waits on a file changed outside
// the editor. It has no close button: the File Changed notification decides.
const AutoSavePausedStrip: React.FC<Props> = ({
    fileName,
    onBranch,
    onReload
}: Props) => (
    <div className={styles.strip} data-testid='auto-save-paused' role='status'>
        <p className={styles.message}>
            Auto-save is paused: {fileName} was changed outside the editor.
        </p>
        <div className={styles.actions}>
            <Button className={styles.action} onClick={onReload}>
                Reload
            </Button>
            <Button className={styles.action} onClick={onBranch}>
                Branch and save new
            </Button>
        </div>
    </div>
);

export default AutoSavePausedStrip;
