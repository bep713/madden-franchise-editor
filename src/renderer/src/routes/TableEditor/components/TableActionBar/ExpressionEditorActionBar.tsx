import TableActionBar from './TableActionBar';
import { Props as LinkProps } from '@renderer/components/Link/Link';

import Export from '@assets/icons/export.svg?react';
import Import from '@assets/icons/import.svg?react';
import Spacing from '@assets/icons/spacing.svg?react';
import Switch from '@assets/icons/switchOrientation.svg?react';

export enum TableActions {
    EXPORT,
    IMPORT,
    TOGGLE_HEX,
    TOGGLE_SPACING
}

interface Props {
    // Labels Switch spacing with the spacing it switches to
    compact: boolean;
    onActionClick: (action: number) => void;
}

const ExpressionEditorActionBar = ({ compact, onActionClick }: Props) => {
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
        },
        {
            color: 'black',
            'data-action': TableActions[TableActions.TOGGLE_SPACING],
            key: TableActions.TOGGLE_SPACING,
            leftAsset: <Spacing />,
            onClick: () => onActionClick(TableActions.TOGGLE_SPACING),
            text: compact
                ? 'Switch to default spacing'
                : 'Switch to compact spacing'
        }
    ];

    return <TableActionBar actionItems={items} />;
};

export default ExpressionEditorActionBar;
