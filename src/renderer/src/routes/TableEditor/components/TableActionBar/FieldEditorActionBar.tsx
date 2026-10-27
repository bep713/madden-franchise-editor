import TableActionBar from './TableActionBar';
import { Props as LinkProps } from '@renderer/components/Link/Link';

import Export from '@assets/icons/export.svg?react';
import Import from '@assets/icons/import.svg?react';
import Jump from '@assets/icons/jump.svg?react';
import Pushpin from '@assets/icons/pushpin.svg?react';
import Switch from '@assets/icons/switchOrientation.svg?react';

export enum TableActions {
    EXPORT,
    IMPORT,
    PIN,
    JUMP_TO_COLUMN,
    SWITCH_ORIENTATION
}

interface Props {
    isPinned: boolean;
    onActionClick: (action: number) => void;
}

const FieldEditorActionBar = ({ isPinned, onActionClick }: Props) => {
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
            'data-action': TableActions[TableActions.PIN],
            key: TableActions.PIN,
            leftAsset: <Pushpin />,
            onClick: () => onActionClick(TableActions.PIN),
            text: isPinned ? 'Unpin' : 'Pin'
        },
        {
            color: 'black',
            'data-action': TableActions[TableActions.JUMP_TO_COLUMN],
            key: TableActions.JUMP_TO_COLUMN,
            leftAsset: <Jump />,
            onClick: () => onActionClick(TableActions.JUMP_TO_COLUMN),
            text: 'Jump to column'
        },
        {
            color: 'black',
            'data-action': TableActions[TableActions.SWITCH_ORIENTATION],
            key: TableActions.SWITCH_ORIENTATION,
            leftAsset: <Switch />,
            onClick: () => onActionClick(TableActions.SWITCH_ORIENTATION),
            text: 'Switch orientation'
        }
    ];

    return <TableActionBar actionItems={items} />;
};

export default FieldEditorActionBar;
