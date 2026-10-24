import Loader from '@renderer/components/Loader/Loader';
import { useCallback, useState } from 'react';

interface Props {
    initialShow?: boolean;
    initialMessage?: string;
}

export interface TableOptions {
    message?: string;
    show?: boolean;
}

export type LoaderOptionsSetter = (options: TableOptions) => void;

export default function useLoader({ initialShow, initialMessage }: Props = {}) {
    const [message, setMessage] = useState<string>(initialMessage || '');
    const [show, setShow] = useState<boolean>(initialShow || false);

    const setOptions: LoaderOptionsSetter = useCallback(
        ({ message, show }: TableOptions) => {
            if (message !== undefined) setMessage(message);
            if (show !== undefined) setShow(show);
        },
        [setMessage, setShow]
    );

    const loader = show && <Loader message={message} />;

    return {
        loader,
        setOptions
    };
}
