import React from 'react';
import cx from 'classnames';
import baseStyles from '../BaseFormInput/BaseFormInput.module.css';

import BaseFormInput, {
    BaseProps as BaseFormInputProps
} from '../BaseFormInput/BaseFormInput';

interface Props extends BaseFormInputProps {
    className?: string;
    id?: string;
    placeholder?: string;
    text: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
}

const Textbox: React.FC<Props> = ({
    className,
    direction = 'vertical',
    errorMessage,
    id,
    label,
    leftAsset,
    placeholder,
    state = 'default',
    text,
    ...props
}) => {
    return (
        <BaseFormInput
            direction={direction}
            errorMessage={errorMessage}
            input={
                <input
                    className={cx(baseStyles.inputElement, className)}
                    id={id}
                    placeholder={placeholder}
                    value={text}
                    {...props}
                />
            }
            label={label}
            leftAsset={leftAsset}
            state={state}
        />
    );
};

export default Textbox;
