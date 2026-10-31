import React, { useEffect, useState } from 'react';
import Modal from '@renderer/components/Modal/Modal';
import Button from '@renderer/components/Button/Button';
import { OpenMode, getOpenMode } from '@renderer/utils/openMode';
import type { RecordReference } from '@shared/types';
import styles from './ReferencesModal.module.scss';

interface Props {
    fileId: string;
    table: { tableId: number; name: string };
    recordIndex: number;
    // A picked row; the parent closes the modal
    onOpen: (reference: RecordReference, mode: OpenMode) => void;
    onClose: () => void;
}

type LoadState =
    | { status: 'loading' }
    | { status: 'error'; error: string }
    | { status: 'loaded'; references: RecordReference[] };

// v4's referenceViewerService: the records that reference this one, one row
// per referencing record
const ReferencesModal: React.FC<Props> = ({
    fileId,
    table,
    recordIndex,
    onOpen,
    onClose
}) => {
    const [state, setState] = useState<LoadState>({ status: 'loading' });
    const { tableId } = table;

    useEffect(() => {
        let active = true;
        window.franchiseAPI
            .getReferencesToRecord(fileId, tableId, recordIndex)
            .then(
                (result) =>
                    'error' in result
                        ? { status: 'error' as const, error: result.error }
                        : {
                              status: 'loaded' as const,
                              references: result.data ?? []
                          },
                (error: unknown) => ({
                    status: 'error' as const,
                    error: (error as Error)?.message || String(error)
                })
            )
            .then((next) => {
                if (active) {
                    setState(next);
                }
            });
        return () => {
            active = false;
        };
    }, [fileId, tableId, recordIndex]);

    let body: React.ReactNode;
    if (state.status === 'loading') {
        body = <p>Finding references...</p>;
    } else if (state.status === 'error') {
        body = <p>Failed to load references: {state.error}</p>;
    } else if (state.references.length === 0) {
        body = <p>No references.</p>;
    } else {
        body = (
            <ul className={styles.list}>
                {state.references.map((reference, index) => (
                    <li key={index}>
                        <button
                            className={styles.reference}
                            data-field-name={reference.fieldName}
                            data-record-index={reference.recordIndex}
                            data-table-id={reference.tableId}
                            onAuxClick={(e) => {
                                if (e.button === 1) {
                                    onOpen(reference, 'background');
                                }
                            }}
                            onClick={(e) => onOpen(reference, getOpenMode(e))}
                            // No autoscroll on a middle-click
                            onMouseDown={(e) => {
                                if (e.button === 1) {
                                    e.preventDefault();
                                }
                            }}
                            type='button'
                        >
                            <span>
                                ({reference.tableId}) {reference.name}
                            </span>
                            <span className={styles.detail}>
                                Record #{reference.recordIndex}
                                {reference.fieldName
                                    ? ` · ${reference.fieldName}`
                                    : ''}
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
        );
    }

    return (
        <Modal
            className={styles.dialog}
            headerAction={
                <Button aria-label='Close' onClick={onClose} type='ghost'>
                    X
                </Button>
            }
            onClose={onClose}
            onUnderlayClick={onClose}
            title='References'
        >
            <div className={styles.body}>
                <p className={styles.header}>
                    The following tables reference{' '}
                    <strong>
                        ({table.tableId}) {table.name} - Record #{recordIndex}:
                    </strong>
                </p>
                {body}
            </div>
        </Modal>
    );
};

export default ReferencesModal;
