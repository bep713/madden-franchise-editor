import React, { useState } from 'react';
import Modal from '../Modal/Modal';
import Button from '../Button/Button';
import TextEditor from '../TextEditor/TextEditor';
import styles from './BlobEditorModal.module.css';

interface Props {
    onApply: (json: string) => void;
    onClose: () => void;
    value: unknown;
}

const initialText = (value: unknown): string => {
    let parsed: unknown = {};
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value) ?? {};
        } catch {
            parsed = {};
        }
    }
    return JSON.stringify(parsed, null, 2);
};

const BlobEditorModal: React.FC<Props> = ({ onApply, onClose, value }) => {
    const [text, setText] = useState(() => initialText(value));
    const [error, setError] = useState<string | null>(null);

    const apply = (): void => {
        let json: string;
        try {
            json = JSON.stringify(JSON.parse(text));
        } catch (e) {
            setError(`Invalid JSON: ${(e as Error).message}`);
            return;
        }
        onApply(json);
    };

    return (
        <Modal
            className={styles.dialog}
            headerAction={
                <Button onClick={apply} type='primary'>
                    Apply Changes
                </Button>
            }
            onClose={onClose}
            onUnderlayClick={apply}
            title='Edit Blob Data'
        >
            <div className={styles.editor}>
                <TextEditor
                    language='plaintext'
                    onChange={(v) => {
                        setText(v ?? '');
                        setError(null);
                    }}
                    value={text}
                />
            </div>
            {error && (
                <div className={styles.error} role='alert'>
                    {error}
                </div>
            )}
        </Modal>
    );
};

export default BlobEditorModal;
