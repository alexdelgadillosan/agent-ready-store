"use client";

import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
} from "ag-grid-community";

ModuleRegistry.registerModules([AllCommunityModule]);

export type DataGridProps = {
  rowData: unknown[];
  columnDefs: ColDef[];
  emptyText?: string;
};

export default function DataGrid({
  rowData,
  columnDefs,
  emptyText = "No rows yet.",
}: DataGridProps) {
  return (
    <div
      className="grid-wrap"
      style={
        {
          "--ag-background-color": "#0d1424",
          "--ag-foreground-color": "#e8eefc",
          "--ag-header-background-color": "#111a2e",
          "--ag-header-foreground-color": "#94a3b8",
          "--ag-border-color": "#1f2b44",
          "--ag-odd-row-background-color": "#0a1120",
          "--ag-row-hover-color": "#16213a",
          "--ag-font-family":
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          "--ag-font-size": "13px",
        } as React.CSSProperties
      }
    >
      <AgGridReact
        theme={themeQuartz}
        rowData={rowData}
        columnDefs={columnDefs}
        domLayout="autoHeight"
        suppressCellFocus
        overlayNoRowsTemplate={emptyText}
      />
    </div>
  );
}
