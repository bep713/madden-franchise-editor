import React, {
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { createPortal } from 'react-dom';
import Fuse from 'fuse.js';
import Autocomplete from '../Autocomplete/Autocomplete';
import Button from '../Button/Button';
import Textbox from '../Textbox/Textbox';
import {
    bin2dec,
    calculateReferenceBinary,
    parseReference
} from '@renderer/utils/references';
import { placePopover } from '@renderer/utils/popover';
import styles from './ReferenceEditor.module.css';

interface AnchorRect {
    top: number;
    bottom: number;
    left: number;
    width: number;
    height: number;
}

interface Props {
    anchorRect: AnchorRect;
    onChange: (binary: string) => void;
    onClose: () => void;
    tables: { id: number; name: string }[];
    value: string;
}

const MAX_OPTIONS = 300;
const NULL_LABEL = 'no table - null value';

const ReferenceEditor: React.FC<Props> = ({
    anchorRect,
    onChange,
    onClose,
    tables,
    value
}) => {
    const initial = parseReference(value);
    const [tableId, setTableId] = useState(initial?.tableId ?? 0);
    const [row, setRow] = useState(initial?.recordIndex ?? 0);
    const [binary, setBinary] = useState(value ?? '');
    const [tableText, setTableText] = useState<string | null>(null);
    const [showOptions, setShowOptions] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const popoverRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useLayoutEffect(() => {
        const el = popoverRef.current;
        const size = el
            ? { width: el.offsetWidth, height: el.offsetHeight }
            : { width: 0, height: 0 };
        setPos(
            placePopover(anchorRect, size, {
                width: window.innerWidth,
                height: window.innerHeight
            })
        );
    }, [anchorRect]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                onCloseRef.current();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    const searchable = useMemo(
        () => [
            { id: 0, name: NULL_LABEL + ' null empty 0' },
            ...tables.map((t) => ({ id: t.id, name: t.name }))
        ],
        [tables]
    );
    const fuse = useMemo(
        () => new Fuse(searchable, { keys: ['id', 'name'], threshold: 0.3 }),
        [searchable]
    );
    const nameById = useMemo(
        () => new Map(tables.map((t) => [t.id, t.name])),
        [tables]
    );

    const labelFor = (id: number): string => {
        if (id === 0) return NULL_LABEL;
        const name = nameById.get(id);
        return name === undefined ? String(id) : id + ' - ' + name;
    };

    const options = useMemo(() => {
        const matches =
            tableText && tableText.trim()
                ? fuse.search(tableText.trim()).map((r) => r.item)
                : searchable;
        return matches.slice(0, MAX_OPTIONS).map((t) => ({
            value: String(t.id),
            label: t.id === 0 ? NULL_LABEL : t.id + ' - ' + t.name
        }));
    }, [fuse, searchable, tableText]);

    const updateFromTableRow = (t: number, r: number): void => {
        setTableId(t);
        setRow(r);
        setBinary(calculateReferenceBinary(t, r));
    };

    const onBinaryChange = (b: string): void => {
        setBinary(b);
        if (/^[01]{32}$/.test(b)) {
            setTableId(bin2dec(b.substring(2, 15)));
            setRow(bin2dec(b.substring(16)));
        }
    };

    return createPortal(
        <>
            <div
                className={styles.underlay}
                data-testid='reference-editor-underlay'
                onClick={onClose}
            />
            <div
                className={styles.highlight}
                style={{
                    top: anchorRect.top,
                    left: anchorRect.left,
                    width: anchorRect.width,
                    height: anchorRect.height
                }}
            />
            <div
                aria-label='Edit cell reference'
                className={styles.popover}
                ref={popoverRef}
                role='dialog'
                style={{ top: pos.top, left: pos.left }}
            >
                <div className={styles.header}>
                    <span className={styles.title}>Edit cell reference</span>
                    <Button aria-label='Close' onClick={onClose} type='ghost'>
                        X
                    </Button>
                </div>
                <Autocomplete
                    label='Table'
                    onFocus={() => setShowOptions(true)}
                    onOptionSelect={(option) => {
                        updateFromTableRow(Number(option.value), row);
                        setTableText(null);
                        setShowOptions(false);
                    }}
                    onShowOptionsChange={setShowOptions}
                    onTextChange={(t) => {
                        setTableText(t);
                        setShowOptions(true);
                    }}
                    options={options}
                    showOptions={showOptions}
                    text={tableText ?? labelFor(tableId)}
                />
                <Textbox
                    label='Row Index'
                    min={0}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        const n = Math.max(0, parseInt(e.target.value, 10) || 0);
                        updateFromTableRow(tableId, n);
                    }}
                    text={String(row)}
                    type='number'
                />
                <Textbox
                    label='Binary'
                    maxLength={32}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        onBinaryChange(e.target.value)
                    }
                    text={binary}
                />
                <Button onClick={() => onChange(binary)} type='primary'>
                    Change
                </Button>
            </div>
        </>,
        document.body
    );
};

export default ReferenceEditor;
