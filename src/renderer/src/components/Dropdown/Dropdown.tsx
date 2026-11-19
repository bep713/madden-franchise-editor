import React from 'react';
import cx from 'classnames';
import baseStyles from '../BaseFormInput/BaseFormInput.module.css';
import styles from './Dropdown.module.css';

import BaseFormInput, {
    BaseProps as BaseFormInputProps
} from '../BaseFormInput/BaseFormInput';

interface Props extends BaseFormInputProps {
    id?: string;
    options: {
        label: string;
        selected?: boolean;
        value: string;
    }[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

const Dropdown: React.FC<Props> = ({
    direction = 'vertical',
    errorMessage,
    id,
    label,
    leftAsset,
    options,
    state = 'default',
    variant,
    ...props
}) => {
    return (
        <BaseFormInput
            direction={direction}
            errorMessage={errorMessage}
            input={
                <select
                    className={cx(baseStyles.inputElement, styles.dropdown)}
                    id={id}
                    {...props}
                >
                    {options.map((option) => (
                        <option
                            key={option.value}
                            selected={option.selected}
                            value={option.value}
                        >
                            {option.label}
                        </option>
                    ))}
                </select>
            }
            label={label}
            leftAsset={leftAsset}
            state={state}
            variant={variant}
        />
    );
};

export default Dropdown;
