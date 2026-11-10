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
          "--ag-background-color": "var(--grid-background)",
          "--ag-foreground-color": "var(--grid-foreground)",
          "--ag-header-background-color": "var(--grid-header-background)",
          "--ag-header-foreground-color": "var(--grid-header-foreground)",
          "--ag-border-color": "var(--grid-border)",
          "--ag-odd-row-background-color": "var(--grid-odd-row)",
          "--ag-row-hover-color": "var(--grid-row-hover)",
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
