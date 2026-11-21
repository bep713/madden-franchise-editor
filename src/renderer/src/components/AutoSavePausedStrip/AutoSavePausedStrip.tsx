import Close from '@assets/icons/close.svg?react';
import Button from '../Button/Button';
import styles from './AutoSavePausedStrip.module.css';

// changed: a File Changed notification; missing: File Missing
type Props = {
    autoSave: boolean;
    fileName: string;
    onCopy: () => void;
    // Hides the bar only; the change stays unresolved. Auto-save off only.
    onHide: () => void;
} & (
    | { reason: 'changed'; onLoad: () => void; onKeep: () => void }
    | { reason: 'missing'; onPutBack: () => void }
);

// Shown under the tab bar while the open file has an unresolved change made
// outside the editor. With auto-save on, auto-save waits on the choice and the
// bar can't be hidden.
const AutoSavePausedStrip: React.FC<Props> = (props: Props) => {
    const { autoSave, fileName, onCopy, onHide, reason } = props;
    return (
        <div
            className={styles.strip}
            data-reason={reason}
            data-testid='auto-save-paused'
            role='status'
        >
            <div className={styles.text}>
                <p className={styles.message}>
                    {reason === 'missing'
                        ? `${fileName} was deleted or moved outside the editor.`
                        : `${fileName} was changed outside the editor. Which version do you want to keep?`}
                </p>
                {autoSave && (
                    <p className={styles.message}>
                        Auto-save is paused until you choose.
                    </p>
                )}
            </div>
            <div className={styles.actions}>
                <Button className={styles.action} onClick={onCopy}>
                    Save mine as a copy…
                </Button>
                {props.reason === 'missing' ? (
                    <Button className={styles.action} onClick={props.onPutBack}>
                        Put it back
                    </Button>
                ) : (
                    <>
                        <Button
                            className={styles.action}
                            onClick={props.onLoad}
                        >
                            Load the new version
                        </Button>
                        <Button
                            className={styles.action}
                            onClick={props.onKeep}
                        >
                            Keep my version
                        </Button>
                    </>
                )}
                {!autoSave && (
                    <button
                        aria-label='Hide'
                        className={styles.hide}
                        data-action='hide-bar'
                        onClick={onHide}
                        type='button'
                    >
                        <Close aria-hidden='true' />
                    </button>
                )}
            </div>
        </div>
    );
};

export default AutoSavePausedStrip;
