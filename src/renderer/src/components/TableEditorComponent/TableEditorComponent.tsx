import React, { useEffect, useRef } from 'react';
import cx from 'classnames';

import { HotTable, HotTableClass } from '@handsontable/react';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';
import { registerAllModules } from 'handsontable/registry';
import { FranchiseTableModel, TableField } from '@shared/types';

import styles from './TableEditorComponent.module.css';

registerAllModules();

interface Props {
    isInverted?: boolean;
    table: Pick<FranchiseTableModel, 'records'>;
}

const TableEditorComponent: React.FC<Props> = ({
    isInverted,
    table
}: Props) => {
    const hotRef = useRef<HotTableClass>(null);
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
    }, []);

    const headers = Object.keys(table.records?.[0]?.fields || {}).map(
        (key: string) => key
    );
    const data = isInverted
        ? (table?.records || []).reduce(
              (
                  accum: string[][],
                  cur: { fields?: { [key: string]: TableField } }
              ) => {
                  Object.values(cur.fields || {}).forEach(
                      (field: TableField, index: number) => {
                          if (!accum[index]) {
                              accum[index] = [field.name];
                          }

                          accum[index].push(field.value);
                      }
                  );

                  return accum;
              },
              []
          )
        : (table?.records || []).map((r) => r.fields || []);

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
                              ...(table?.records || []).map(
                                  (_val, index) => `Record ${index + 1}`
                              )
                          ]
                }
                columns={
                    !isInverted
                        ? Object.keys(table?.records?.[0]?.fields || {}).map(
                              (key: string) => ({
                                  data: `${key}.value` // Maps data value from record object to table cell
                              })
                          )
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
