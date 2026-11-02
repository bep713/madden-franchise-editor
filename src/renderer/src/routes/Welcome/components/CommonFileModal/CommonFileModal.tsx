import React, { useState } from 'react';
import Modal from '@renderer/components/Modal/Modal';
import Button from '@renderer/components/Button/Button';
import Dropdown from '@renderer/components/Dropdown/Dropdown';
import { fieldOptions, TYPE_KEY, YEAR_KEY } from './commonFileOptions';
import styles from './CommonFileModal.module.css';

export interface CommonFileChoice {
    gameYear: number;
    gameType: string;
    saveAsDefault: boolean;
}

interface Props {
    initialYear: string;
    initialType: string;
    onConfirm: (choice: CommonFileChoice) => void;
    // Escape, the underlay or X. The file isn't opened.
    onClose: () => void;
}

// v4's ftcModalService prompt: common files don't record their game year or
// type, so the user picks them before the file is parsed.
const CommonFileModal: React.FC<Props> = ({
    initialYear,
    initialType,
    onConfirm,
    onClose
}) => {
    const [year, setYear] = useState(initialYear);
    const [type, setType] = useState(initialType);
    const [saveAsDefault, setSaveAsDefault] = useState(false);

    return (
        <Modal
            className={styles.dialog}
            headerAction={
                <Button aria-label='Close' onClick={onClose} type='ghost'>
                    X
                </Button>
            }
            onClose={onClose}
            title='Set File Parameters'
        >
            <div className={styles.body}>
                <p>
                    This file uses the <strong>franchise-common</strong> format
                    and cannot detect game year or game type automatically.
                    Select values to continue.
                </p>
                <Dropdown
                    label='Game Year'
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setYear(e.target.value)
                    }
                    options={fieldOptions(YEAR_KEY)}
                    value={year}
                />
                <Dropdown
                    label='Game Type'
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                        setType(e.target.value)
                    }
                    options={fieldOptions(TYPE_KEY)}
                    value={type}
                />
                <label className={styles.checkbox}>
                    <input
                        checked={saveAsDefault}
                        onChange={(e) => setSaveAsDefault(e.target.checked)}
                        type='checkbox'
                    />
                    Make these my default choices
                </label>
                <Button
                    onClick={() =>
                        onConfirm({
                            gameYear: parseInt(year, 10),
                            gameType: type,
                            saveAsDefault
                        })
                    }
                    type='primary'
                >
                    Confirm
                </Button>
            </div>
        </Modal>
    );
};

export default CommonFileModal;
