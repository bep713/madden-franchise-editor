import React, { useEffect, useRef } from 'react';
import cx from 'classnames';
import baseStyles from '../BaseFormInput/BaseFormInput.module.css';
import styles from './Autocomplete.module.css';

import BaseFormInput, {
    BaseProps as BaseFormInputProps
} from '../BaseFormInput/BaseFormInput';

import Button from '../Button/Button';
import List from '../List/List';

interface Option {
    id?: number | string;
    label: string;
    value: string;
}

interface Props extends BaseFormInputProps {
    id?: string;
    onBlur?: () => void;
    onFocus?: () => void;
    onOptionSelect?: (option: Option) => void;
    onShowOptionsChange?: (show: boolean) => void;
    onTextChange?: (text: string) => void;
    options: Option[];
    placeholder?: string;
    showOptions?: boolean;
    text: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

const Autocomplete: React.FC<Props> = ({
    direction = 'vertical',
    errorMessage,
    id,
    label,
    leftAsset,
    onBlur,
    onFocus,
    onOptionSelect,
    onShowOptionsChange,
    onTextChange,
    options,
    placeholder,
    showOptions = false,
    state = 'default',
    text = ''
}) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const optionListRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    // set on mousedown when a click on the input will open the options
    const openOnInputClickRef = useRef(false);
    const onShowOptionsChangeRef = useRef(onShowOptionsChange);
    useEffect(() => {
        onShowOptionsChangeRef.current = onShowOptionsChange;
    });

    const isInsideControl = (target: EventTarget | null): boolean =>
        !!dropdownRef.current?.contains(target as Node) ||
        !!optionListRef.current?.contains(target as Node);

    // Opens with the text selected, so a click and a keystroke replace it
    const openOptions = (): void => {
        inputRef.current?.focus();
        inputRef.current?.select();
        onShowOptionsChange?.(true);
    };

    const toggleOptions = (): void => {
        if (showOptions) {
            onShowOptionsChange?.(false);
        } else {
            openOptions();
        }
    };

    // Close the options on a click outside the autocomplete
    useEffect(() => {
        if (!showOptions) return;
        const onMouseDown = (e: MouseEvent): void => {
            if (!rootRef.current?.contains(e.target as Node)) {
                onShowOptionsChangeRef.current?.(false);
            }
        };
        document.addEventListener('mousedown', onMouseDown);
        return () => document.removeEventListener('mousedown', onMouseDown);
    }, [showOptions]);

    const optionItems = options.map((option) => (
        <Button
            align='left'
            key={option.id || option.value}
            onClick={() => onOptionSelect?.(option)}
            stretch
            type='ghost'
        >
            {option.label}
        </Button>
    ));

    return (
        <div
            id={id}
            className={styles.autocomplete}
            ref={rootRef}
            // the label toggles the options like the caret; cancel its default focus
            onClick={(e) => {
                if (isInsideControl(e.target)) return;
                e.preventDefault();
                toggleOptions();
            }}
        >
            <BaseFormInput
                direction={direction}
                errorMessage={showOptions ? undefined : errorMessage}
                input={
                    <div
                        className={styles.dropdown}
                        ref={dropdownRef}
                        onBlur={onBlur}
                        onFocus={onFocus}
                    >
                        <input
                            className={cx(
                                baseStyles.inputElement,
                                styles.inputElement
                            )}
                            id={id}
                            placeholder={placeholder}
                            ref={inputRef}
                            value={text}
                            onChange={(e) => onTextChange?.(e.target.value)}
                            // read before the focus, which may open the options
                            onMouseDown={() => {
                                openOnInputClickRef.current = !showOptions;
                            }}
                            onClick={() => {
                                if (!openOnInputClickRef.current) return;
                                openOnInputClickRef.current = false;
                                openOptions();
                            }}
                        />
                        <button
                            aria-expanded={showOptions}
                            aria-label='Toggle options'
                            className={styles.caret}
                            // keep focus where it is, so onFocus doesn't reopen the options
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={toggleOptions}
                            type='button'
                        />
                    </div>
                }
                label={label}
                leftAsset={leftAsset}
                state={state}
            />
            {showOptions && (
                <div className={styles.optionList} ref={optionListRef}>
                    <List
                        direction='vertical'
                        items={optionItems}
                        gap='none'
                        style='none'
                        type='unordered'
                    />
                </div>
            )}
        </div>
    );
};

export default Autocomplete;
