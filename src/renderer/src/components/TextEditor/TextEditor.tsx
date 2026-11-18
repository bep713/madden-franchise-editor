import React from 'react';
import { Editor } from '@monaco-editor/react';
import useColorScheme from '@renderer/hooks/useColorScheme';

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
    const scheme = useColorScheme();
    return (
        <Editor
            language={language}
            onChange={onChange}
            options={{
                readOnly: isReadOnly
            }}
            theme={scheme === 'dark' ? 'vs-dark' : 'vs'}
            value={value}
        />
    );
};

export default TextEditor;
