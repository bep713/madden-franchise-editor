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
            'data-action': TableActions[TableActions.EXPORT],
            key: TableActions.EXPORT,
            leftAsset: <Export />,
            onClick: () => onActionClick(TableActions.EXPORT),
            text: 'Export'
        },
        {
            color: 'black',
            'data-action': TableActions[TableActions.IMPORT],
            key: TableActions.IMPORT,
            leftAsset: <Import />,
            onClick: () => onActionClick(TableActions.IMPORT),
            text: 'Import'
        },
        {
            color: 'black',
            'data-action': TableActions[TableActions.TOGGLE_HEX],
            key: TableActions.TOGGLE_HEX,
            leftAsset: <Switch />,
            onClick: () => onActionClick(TableActions.TOGGLE_HEX),
            text: 'Hex/Decimal'
        }
    ];

    return <TableActionBar actionItems={items} />;
};

export default ExpressionEditorActionBar;
