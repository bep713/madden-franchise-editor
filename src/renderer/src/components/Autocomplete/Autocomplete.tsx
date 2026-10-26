import React from 'react';
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
    onTextChange,
    options,
    placeholder,
    showOptions = false,
    state = 'default',
    text = ''
}) => {
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
        <div id={id} className={styles.autocomplete}>
            <BaseFormInput
                direction={direction}
                errorMessage={showOptions ? undefined : errorMessage}
                input={
                    <div
                        className={styles.dropdown}
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
                            value={text}
                            onChange={(e) => onTextChange?.(e.target.value)}
                        />
                        <button className={styles.caret} />
                    </div>
                }
                label={label}
                leftAsset={leftAsset}
                state={state}
            />
            {showOptions && (
                <div className={styles.optionList}>
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
