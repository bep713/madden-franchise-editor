import React, { useEffect, useRef } from 'react';
import cx from 'classnames';

import { HotTable, HotTableRef } from '@handsontable/react-wrapper';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';
import { registerAllModules } from 'handsontable/registry';
import { TableColumn, TableData } from '@shared/types';

import styles from './TableEditorComponent.module.css';

registerAllModules();

interface Props {
    isInverted?: boolean;
    table: Pick<TableData, 'records'> & {
        // The column type and enum stay on `headers` for later cell editors
        headers: Pick<TableColumn, 'name'>[];
    };
}

const TableEditorComponent: React.FC<Props> = ({
    isInverted,
    table
}: Props) => {
    const hotRef = useRef<HotTableRef>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Handle window resizing so that the table always takes up the entire remaining space.
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentBoxSize) {
                    const size = entry.contentBoxSize[0];
                    hotRef?.current?.hotInstance?.updateSettings({
                        height: size.blockSize,
                        width: size.inlineSize
                    });
                }
            }
        });

        if (wrapperRef.current) {
            observer.observe(wrapperRef.current);
        }

        return () => observer.disconnect();
    }, []);

    const headers = table.headers.map((header) => header.name);
    const data = isInverted
        ? headers.map((name) => [
              name,
              ...table.records.map((record) => record[name])
          ])
        : table.records;

    return (
        <div className={styles.wrapper} ref={wrapperRef}>
            <HotTable
                autoWrapCol={true}
                autoWrapRow={true}
                className={cx(styles.table, {
                    [styles.inverted]: isInverted
                })}
                colHeaders={
                    !isInverted
                        ? headers
                        : [
                              'Field Name',
                              ...table.records.map(
                                  (_val, index) => `Record ${index + 1}`
                              )
                          ]
                }
                columns={
                    !isInverted
                        ? headers.map((name) => ({ data: name }))
                        : undefined
                }
                data={data}
                height='100%'
                licenseKey='non-commercial-and-evaluation' // for non-commercial use only
                manualColumnResize={true}
                ref={hotRef}
                rowHeaders={!isInverted}
                themeName='ht-theme-main'
                width='100%'
            />
        </div>
    );
};

export default TableEditorComponent;
