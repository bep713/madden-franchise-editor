import React from 'react';
import { Editor } from '@monaco-editor/react';

interface Props {
    language?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onChange?: (value: string | undefined, event: any) => void;
    isReadOnly?: boolean;
    value?: string;
}

const TextEditor: React.FC<Props> = ({
    language,
    onChange,
    isReadOnly,
    value
}: Props) => {
    return (
        <Editor
            language={language}
            onChange={onChange}
            options={{
                readOnly: isReadOnly
            }}
            value={value}
        />
    );
};

export default TextEditor;
