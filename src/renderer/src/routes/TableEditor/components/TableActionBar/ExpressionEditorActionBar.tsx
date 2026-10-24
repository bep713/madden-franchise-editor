import TableActionBar from './TableActionBar';
import { Props as LinkProps } from '@renderer/components/Link/Link';

import Export from '@assets/icons/export.svg?react';
import Import from '@assets/icons/import.svg?react';
import Switch from '@assets/icons/switchOrientation.svg?react';

export enum TableActions {
    EXPORT,
    IMPORT,
    TOGGLE_HEX
}

interface Props {
    onActionClick: (action: number) => void;
}

const ExpressionEditorActionBar = ({ onActionClick }: Props) => {
    const items: LinkProps[] = [
        {
            color: 'black',
            key: TableActions.EXPORT,
            leftAsset: <Export />,
            onClick: () => onActionClick(TableActions.EXPORT),
            text: 'Export'
        },
        {
            color: 'black',
            key: TableActions.IMPORT,
            leftAsset: <Import />,
            onClick: () => onActionClick(TableActions.IMPORT),
            text: 'Import'
        },
        {
            color: 'black',
            key: TableActions.TOGGLE_HEX,
            leftAsset: <Switch />,
            onClick: () => onActionClick(TableActions.TOGGLE_HEX),
            text: 'Hex/Decimal'
        }
    ];

    return <TableActionBar actionItems={items} />;
};

export default ExpressionEditorActionBar;
