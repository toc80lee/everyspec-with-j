import React, { useState, useMemo, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plane,
  Folder,
  FolderOpen,
  Building2,
  FileText,
  Search,
  Table as TableIcon,
  X,
  Info,
} from 'lucide-react';
import { ProgramSpec, AlvField } from '../types/sap';
import { SapGuiTheme } from '../data/sapGuiThemes';
import { getSapColorHex } from './SapColorSearchHelpModal';
import { AlvToolbar } from './AlvToolbar';
import { useLanguage } from '../contexts/LanguageContext';

interface SapTreeAlvSimulatorProps {
  spec: ProgramSpec;
  theme: SapGuiTheme;
  onDrilldown?: (tcode: string, val: string) => void;
}

const KNOWN_CARRIER_NAMES: Record<string, string> = {
  AA: 'American Airlines',
  AZ: 'Alitalia',
  DL: 'Delta Air Lines',
  LH: 'Lufthansa',
  KE: 'Korean Air',
  OZ: 'Asiana Airlines',
};

const DEFAULT_SFLIGHT_CATALOG: AlvField[] = [
  { id: 'f1', col_pos: 1, fieldname: 'CARRID', coltext: 'ID', datatype: 'CHAR', outputlen: 3, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: 'C100' },
  { id: 'f2', col_pos: 2, fieldname: 'CONNID', coltext: 'No.', datatype: 'NUMC', outputlen: 4, just: 'C', key: true, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '' },
  { id: 'f3', col_pos: 3, fieldname: 'FLDATE', coltext: 'Flight Date', datatype: 'DATS', outputlen: 10, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '' },
  { id: 'f4', col_pos: 4, fieldname: 'PRICE', coltext: 'Airfare', datatype: 'CURR', outputlen: 15, decimals: 2, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '' },
  { id: 'f5', col_pos: 5, fieldname: 'CURRENCY', coltext: 'Curr.', datatype: 'CUKY', outputlen: 5, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '' },
  { id: 'f6', col_pos: 6, fieldname: 'PLANETYPE', coltext: 'Plane Type', datatype: 'CHAR', outputlen: 10, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '' },
  { id: 'f7', col_pos: 7, fieldname: 'SEATSMAX', coltext: 'Capacity', datatype: 'INT4', outputlen: 6, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '' },
  { id: 'f8', col_pos: 8, fieldname: 'SEATSOCC', coltext: 'Occupied', datatype: 'INT4', outputlen: 6, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '' },
];

const DEFAULT_SFLIGHT_ROWS: Record<string, any>[] = [
  { CARRID: 'AA', CONNID: '0017', FLDATE: '2015.01.15', PRICE: 422.94, CURRENCY: 'USD', PLANETYPE: '747-400', SEATSMAX: 385, SEATSOCC: 370 },
  { CARRID: 'AA', CONNID: '0064', FLDATE: '2015.01.20', PRICE: 422.94, CURRENCY: 'USD', PLANETYPE: 'A310-300', SEATSMAX: 280, SEATSOCC: 255 },
  { CARRID: 'AA', CONNID: '0555', FLDATE: '2015.02.01', PRICE: 380.0, CURRENCY: 'USD', PLANETYPE: '747-400', SEATSMAX: 385, SEATSOCC: 380 },
  { CARRID: 'AA', CONNID: '0788', FLDATE: '2015.02.14', PRICE: 450.5, CURRENCY: 'USD', PLANETYPE: 'A310-300', SEATSMAX: 280, SEATSOCC: 270 },
  { CARRID: 'AZ', CONNID: '0788', FLDATE: '2015.03.01', PRICE: 650.0, CURRENCY: 'EUR', PLANETYPE: '747-400', SEATSMAX: 385, SEATSOCC: 310 },
  { CARRID: 'AZ', CONNID: '0789', FLDATE: '2015.03.15', PRICE: 620.0, CURRENCY: 'EUR', PLANETYPE: 'A310-300', SEATSMAX: 280, SEATSOCC: 260 },
  { CARRID: 'DL', CONNID: '0106', FLDATE: '2015.01.10', PRICE: 890.0, CURRENCY: 'USD', PLANETYPE: '747-400', SEATSMAX: 385, SEATSOCC: 375 },
  { CARRID: 'DL', CONNID: '0107', FLDATE: '2015.01.22', PRICE: 910.0, CURRENCY: 'USD', PLANETYPE: '747-400', SEATSMAX: 385, SEATSOCC: 360 },
];

export const SapTreeAlvSimulator: React.FC<SapTreeAlvSimulatorProps> = ({
  spec,
  theme,
  onDrilldown,
}) => {
  const { t } = useLanguage();
  const [selectedNode, setSelectedNode] = useState<string>(
    spec.tree_config?.default_selected_node || 'ALL'
  );
  const [isRootExpanded, setIsRootExpanded] = useState<boolean>(true);
  const [isGroupExpanded, setIsGroupExpanded] = useState<boolean>(true);

  const [selectedColumnFields, setSelectedColumnFields] = useState<string[]>([]);
  const [sortColumns, setSortColumns] = useState<{ fieldname: string; asc: boolean }[]>([]);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [isFilterBarOpen, setIsFilterBarOpen] = useState<boolean>(false);
  const [showTotals, setShowTotals] = useState<boolean>(true);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(0);
  const [detailModalRow, setDetailModalRow] = useState<Record<string, any> | null>(null);
  const [columnTextMode, setColumnTextMode] = useState<'coltext' | 'fieldname'>('coltext');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Dynamic Catalog: prefer item_grid.field_catalog, then spec.field_catalog, then SFLIGHT demo fallback
  const itemCatalog: AlvField[] = useMemo(() => {
    if (spec.item_grid?.field_catalog && spec.item_grid.field_catalog.length > 0) {
      return spec.item_grid.field_catalog;
    }
    if (spec.field_catalog && spec.field_catalog.length > 0) {
      return spec.field_catalog;
    }
    return DEFAULT_SFLIGHT_CATALOG;
  }, [spec.item_grid?.field_catalog, spec.field_catalog]);

  // Dynamic Rows: prefer item_grid.mock_rows, then spec.mock_rows, then SFLIGHT demo fallback
  const rawItemRows = useMemo(() => {
    if (spec.item_grid?.mock_rows && spec.item_grid.mock_rows.length > 0) {
      return spec.item_grid.mock_rows;
    }
    if (spec.mock_rows && spec.mock_rows.length > 0) {
      return spec.mock_rows;
    }
    return DEFAULT_SFLIGHT_ROWS;
  }, [spec.item_grid?.mock_rows, spec.mock_rows]);

  // Resolve dynamic tree hierarchy grouping field & label field
  const groupField = useMemo(() => {
    const configured = spec.tree_config?.group_field?.trim().toUpperCase();
    if (configured && itemCatalog.some((f) => f.fieldname.toUpperCase() === configured)) {
      return itemCatalog.find((f) => f.fieldname.toUpperCase() === configured)!.fieldname;
    }
    const skipStatusFields = new Set(['ZICON', 'LIGHTS', 'STATUS', 'CHECKBOX', 'BOX']);
    const headerGroupCandidates = (spec.field_catalog || []).filter(
      (f) => !skipStatusFields.has(f.fieldname.toUpperCase()) && (f.key || f.datatype === 'CHAR')
    );
    for (const hf of headerGroupCandidates) {
      const matchInItems = itemCatalog.find((f) => f.fieldname.toUpperCase() === hf.fieldname.toUpperCase());
      if (matchInItems) return matchInItems.fieldname;
    }
    const keyField = itemCatalog.find(
      (f) => f.key && !skipStatusFields.has(f.fieldname.toUpperCase())
    );
    if (keyField) return keyField.fieldname;
    const firstDim = itemCatalog.find(
      (f) => !skipStatusFields.has(f.fieldname.toUpperCase()) && f.datatype !== 'CURR' && f.datatype !== 'DEC'
    );
    return firstDim?.fieldname || itemCatalog[0]?.fieldname || 'CARRID';
  }, [spec.tree_config?.group_field, spec.field_catalog, itemCatalog]);

  const groupLabelField = useMemo(() => {
    const configured = spec.tree_config?.group_label_field?.trim().toUpperCase();
    if (configured && itemCatalog.some((f) => f.fieldname.toUpperCase() === configured)) {
      return itemCatalog.find((f) => f.fieldname.toUpperCase() === configured)!.fieldname;
    }
    const textCandidate = itemCatalog.find((f) => {
      const fn = f.fieldname.toUpperCase();
      return (
        fn !== groupField.toUpperCase() &&
        (fn.includes('NAME') ||
          fn.includes('TEXT') ||
          fn.includes('TXT') ||
          fn.includes('DESC') ||
          fn === 'PLANETYPE')
      );
    });
    return textCandidate?.fieldname || null;
  }, [spec.tree_config?.group_label_field, itemCatalog, groupField]);

  // Reset selected node and sort columns when spec changes
  useEffect(() => {
    const defNode = spec.tree_config?.default_selected_node || 'ALL';
    setSelectedNode(defNode);
    const defaultSort = itemCatalog[1]?.fieldname || itemCatalog[0]?.fieldname || groupField;
    setSelectedColumnFields([defaultSort]);
    setSortColumns([{ fieldname: defaultSort, asc: true }]);
    setFilterQuery('');
  }, [spec.id, spec.program_id, groupField]);

  // Dynamically aggregated tree leaf nodes from rawItemRows
  const treeNodes = useMemo(() => {
    const nodeMap = new Map<string, { id: string; label: string; count: number }>();
    rawItemRows.forEach((row) => {
      const rawVal = row[groupField];
      const id = rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== ''
        ? String(rawVal).trim()
        : t('(Empty)', '(빈 값)');
      const existing = nodeMap.get(id);
      if (existing) {
        existing.count += 1;
      } else {
        let label = '';
        if (groupField.toUpperCase() === 'CARRID' && KNOWN_CARRIER_NAMES[id]) {
          label = KNOWN_CARRIER_NAMES[id];
        } else if (groupLabelField && row[groupLabelField]) {
          label = String(row[groupLabelField]);
        }
        nodeMap.set(id, { id, label, count: 1 });
      }
    });
    return Array.from(nodeMap.values());
  }, [rawItemRows, groupField, groupLabelField]);

  // Keep selectedNode valid if dataset changed
  useEffect(() => {
    if (selectedNode !== 'ALL' && !treeNodes.some((n) => n.id === selectedNode)) {
      setSelectedNode('ALL');
    }
  }, [treeNodes, selectedNode]);

  // Filtered & sorted rows
  const displayedRows = useMemo(() => {
    let list = [...rawItemRows];

    if (selectedNode !== 'ALL') {
      list = list.filter((r) => {
        const val = r[groupField] !== undefined && r[groupField] !== null ? String(r[groupField]).trim() : t('(Empty)', '(빈 값)');
        return val === selectedNode;
      });
    }

    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      list = list.filter((r) => Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q)));
    }

    if (sortColumns.length > 0) {
      list.sort((a, b) => {
        for (const sc of sortColumns) {
          const valA = a[sc.fieldname];
          const valB = b[sc.fieldname];
          let cmp = 0;
          if (typeof valA === 'number' && typeof valB === 'number') {
            cmp = sc.asc ? valA - valB : valB - valA;
          } else {
            cmp = sc.asc
              ? String(valA ?? '').localeCompare(String(valB ?? ''))
              : String(valB ?? '').localeCompare(String(valA ?? ''));
          }
          if (cmp !== 0) return cmp;
        }
        return 0;
      });
    }

    return list;
  }, [rawItemRows, selectedNode, groupField, filterQuery, sortColumns]);

  const handleSort = (asc: boolean) => {
    const targets =
      selectedColumnFields.length > 0
        ? selectedColumnFields
        : [itemCatalog[0]?.fieldname || groupField];
    setSortColumns(targets.map((f) => ({ fieldname: f, asc })));
  };

  const handleToggleColumn = (fieldname: string, isShift: boolean) => {
    if (isShift) {
      setSelectedColumnFields((prev) =>
        prev.includes(fieldname) ? prev.filter((f) => f !== fieldname) : [...prev, fieldname]
      );
    } else {
      setSelectedColumnFields([fieldname]);
    }
  };

  const totals = useMemo(() => {
    const sumMap: Record<string, number> = {};
    itemCatalog.forEach((f) => {
      if (f.do_sum) {
        sumMap[f.fieldname] = displayedRows.reduce((acc, row) => {
          const val = Number(row[f.fieldname]) || 0;
          return acc + val;
        }, 0);
      }
    });
    return sumMap;
  }, [itemCatalog, displayedRows]);

  const firstSummaryLabelField = useMemo(() => {
    const nonSum = itemCatalog.find((f) => !f.do_sum);
    return nonSum?.fieldname || itemCatalog[0]?.fieldname;
  }, [itemCatalog]);

  const handleExportCsv = () => {
    if (displayedRows.length === 0) return;
    const headers = itemCatalog.map((c) => (columnTextMode === 'coltext' ? c.coltext || c.fieldname : c.fieldname));
    const csvLines = [headers.join(',')];
    displayedRows.forEach((r) => {
      const rowValues = itemCatalog.map((c) => {
        const val = r[c.fieldname] ?? '';
        return `"${String(val).replace(/"/g, '""')}"`;
      });
      csvLines.push(rowValues.join(','));
    });
    const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${spec.program_id || 'TREE_ALV'}_data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const rootLabel =
    spec.tree_config?.root_label ||
    (groupField.toUpperCase() === 'CARRID' ? 'AIRPLANE' : spec.layout?.grid_title || spec.title || 'ROOT');
  const gridTitle =
    spec.item_grid?.layout?.grid_title ||
    spec.layout?.grid_title ||
    `${spec.title || 'ALV Detail Grid'} (${groupField})`;

  const renderNodeIcon = (isSelected: boolean) => {
    const iconType = spec.tree_config?.node_icon || (groupField.toUpperCase() === 'CARRID' ? 'plane' : 'folder');
    const cls = `w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-blue-700'}`;
    if (iconType === 'plane') return <Plane className={cls} />;
    if (iconType === 'building') return <Building2 className={cls} />;
    if (iconType === 'doc') return <FileText className={cls} />;
    return <Folder className={cls} />;
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-[#f4f7fb] text-slate-800 font-sans text-xs select-none">
      {/* LEFT PANE: Dynamic SAP Tree Control (CL_GUI_ALV_TREE) */}
      <div className="w-72 shrink-0 border-r-2 border-[#9bbadb] bg-white flex flex-col overflow-hidden">
        <div className="px-3 py-2 bg-[#d7e4f2] border-b border-[#9bbadb] flex items-center justify-between font-bold text-slate-800 text-[11px] shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Folder className="w-3.5 h-3.5 text-blue-700 shrink-0" />
            <span className="truncate">{t('ALV Tree Hierarchy', 'ALV 트리 계층 구조')}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsRootExpanded(true);
                setIsGroupExpanded(true);
              }}
              title={t('Expand All', '모두 펼치기')}
              className="px-1.5 py-0.5 bg-white border border-[#9bbadb] hover:bg-blue-50 text-[10px] rounded cursor-pointer"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setIsGroupExpanded(false)}
              title={t('Collapse', '접기')}
              className="px-1.5 py-0.5 bg-white border border-[#9bbadb] hover:bg-blue-50 text-[10px] rounded cursor-pointer"
            >
              -
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 bg-[#fafbfd] font-mono text-[11px]">
          <div className="mb-1">
            <div
              onClick={() => {
                setIsRootExpanded(!isRootExpanded);
                setSelectedNode('ALL');
              }}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                selectedNode === 'ALL'
                  ? 'bg-[#bce0fd] font-bold text-blue-950 border border-blue-400'
                  : 'hover:bg-slate-100 text-slate-800'
              }`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsRootExpanded(!isRootExpanded);
                }}
                className="p-0.5 text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                {isRootExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              {renderNodeIcon(false)}
              <span className="font-bold truncate">{rootLabel}</span>
              <span className="text-[10px] text-slate-500 font-sans ml-auto tabular-nums">({rawItemRows.length})</span>
            </div>

            {isRootExpanded && (
              <div className="ml-4 pl-2 border-l border-slate-300 mt-1 space-y-1">
                <div
                  onClick={() => setIsGroupExpanded(!isGroupExpanded)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-slate-100 text-slate-700 font-semibold"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsGroupExpanded(!isGroupExpanded);
                    }}
                    className="p-0.5 text-slate-500 cursor-pointer"
                  >
                    {isGroupExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  </button>
                  {isGroupExpanded ? (
                    <FolderOpen className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  )}
                  <span className="truncate">{groupField}</span>
                </div>

                {isGroupExpanded && (
                  <div className="ml-4 pl-2 border-l border-slate-300 space-y-0.5">
                    {treeNodes.map((node) => {
                      const isSelected = selectedNode === node.id;
                      return (
                        <div
                          key={node.id}
                          onClick={() => setSelectedNode(node.id)}
                          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-[11px] transition-all ${
                            isSelected
                              ? 'bg-[#005a9c] text-white font-bold shadow-xs'
                              : 'hover:bg-blue-50 text-slate-800'
                          }`}
                        >
                          {renderNodeIcon(isSelected)}
                          <span className="font-bold tracking-wider shrink-0">{node.id}</span>
                          {node.label && (
                            <span className={`text-[10px] truncate ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                              {node.label}
                            </span>
                          )}
                          <span
                            className={`ml-auto text-[9px] px-1.5 py-0.2 rounded tabular-nums shrink-0 ${
                              isSelected ? 'bg-blue-900 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {node.count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-2 bg-[#f0f4f8] border-t border-[#9bbadb] text-[10px] text-slate-600 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <span>{t(`Selected Node (${groupField}):`, `선택 노드 (${groupField}):`)}</span>
            <span className="font-bold font-mono text-blue-900 truncate">
              {selectedNode === 'ALL' ? t('ALL', '전체') : selectedNode}
            </span>
          </div>
        </div>
      </div>

      {/* RIGHT PANE: Dynamic Detail ALV Grid */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        <div className="px-3 py-1.5 bg-[#e4edf7] border-b border-[#9bbadb] flex items-center justify-between text-xs font-bold text-slate-800 shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <TableIcon className="w-3.5 h-3.5 text-blue-800 shrink-0" />
            <span className="truncate">{gridTitle}</span>
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-900 rounded font-mono text-[10px] shrink-0">
              {selectedNode === 'ALL' ? t('All Nodes', '전체 노드') : `${groupField}: ${selectedNode}`}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-600 font-normal shrink-0 tabular-nums">
            <span>{t('Rows:', '행 수:')} {displayedRows.length}</span>
            <span>|</span>
            <span>{t('Sort Col:', '정렬 컬럼:')} {selectedColumnFields.join(', ') || '-'}</span>
          </div>
        </div>

        <div className="shrink-0 border-b border-[#9bbadb]">
          <AlvToolbar
            spec={{
              ...spec,
              field_catalog: itemCatalog,
              layout: spec.item_grid?.layout || spec.layout,
              toolbar_buttons: spec.item_grid?.toolbar_buttons || spec.toolbar_buttons,
            }}
            theme={theme}
            statusSummaries={[]}
            selectedStatusFilters={[]}
            onToggleStatusFilter={() => {}}
            onOpenDetail={() => {
              if (selectedRowIndex !== null && displayedRows[selectedRowIndex]) {
                setDetailModalRow(displayedRows[selectedRowIndex]);
              }
            }}
            onSort={(asc) => handleSort(asc)}
            onFilter={() => setIsFilterBarOpen((prev) => !prev)}
            filterQuery={filterQuery}
            onClearFilter={() => {
              setFilterQuery('');
              setIsFilterBarOpen(false);
            }}
            onToggleTotals={() => setShowTotals(!showTotals)}
            onExport={handleExportCsv}
            onPrint={() => window.print()}
            onInfo={() => {
              setStatusNotice(
                t(
                  `Tree ALV [${spec.program_id}] • Key: ${groupField} = ${selectedNode} • ${displayedRows.length} row(s)`,
                  `트리 ALV [${spec.program_id}] • 키: ${groupField} = ${selectedNode} • ${displayedRows.length}건`
                )
              );
              setTimeout(() => setStatusNotice(null), 4000);
            }}
            onToggleColumnText={() =>
              setColumnTextMode((prev) => (prev === 'coltext' ? 'fieldname' : 'coltext'))
            }
            onOptimizeWidth={() => {}}
          />
        </div>

        {isFilterBarOpen && (
          <div className="px-3 py-1.5 bg-blue-50 border-b border-blue-200 flex items-center gap-2 shrink-0">
            <Search className="w-3.5 h-3.5 text-blue-700 shrink-0" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={t('Search tree grid columns...', '트리 그리드 컬럼 검색...')}
              className="flex-1 bg-white border border-blue-300 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                className="text-[11px] text-slate-500 hover:text-slate-800 px-1.5 py-0.5 cursor-pointer"
              >
                {t('Clear', '초기화')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsFilterBarOpen(false)}
              className="text-slate-500 hover:text-slate-800 p-0.5 cursor-pointer"
              aria-label={t('Close filter bar', '필터 바 닫기')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {statusNotice && (
          <div className="px-3 py-1 bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-[11px] flex items-center gap-1.5 shrink-0">
            <Info className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span>{statusNotice}</span>
          </div>
        )}

        {/* ALV Grid Table */}
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full border-collapse font-sans text-[11px]">
            <thead>
              <tr className="sticky top-0 z-10 bg-[#e4edf7] border-b-2 border-[#9bbadb] divide-x divide-[#9bbadb]">
                <th className="w-10 px-1 py-1.5 text-center font-bold text-slate-700 bg-[#d7e4f2]">#</th>
                {itemCatalog.map((col) => {
                  const isSelected = selectedColumnFields.includes(col.fieldname);
                  const isSorted = sortColumns.some((s) => s.fieldname === col.fieldname);
                  const sortInfo = sortColumns.find((s) => s.fieldname === col.fieldname);
                  const headerTitle =
                    columnTextMode === 'coltext' ? col.coltext || col.fieldname : col.fieldname;

                  return (
                    <th
                      key={col.fieldname}
                      onClick={(e) => handleToggleColumn(col.fieldname, e.shiftKey)}
                      className={`px-3 py-1.5 font-bold cursor-pointer transition-colors whitespace-nowrap ${
                        isSelected
                          ? 'bg-blue-100 text-blue-950 ring-2 ring-inset ring-blue-600'
                          : col.key
                          ? 'bg-[#bce0fd] text-slate-900'
                          : 'bg-[#e4edf7] text-slate-800 hover:bg-blue-50'
                      }`}
                      style={{
                        textAlign: col.just === 'R' ? 'right' : col.just === 'C' ? 'center' : 'left',
                      }}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span>{headerTitle}</span>
                        {isSorted && (
                          <span className="text-blue-800 font-bold text-[10px]">
                            {sortInfo?.asc ? '▲' : '▼'}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={itemCatalog.length + 1} className="py-12 text-center text-slate-400">
                    {t('No records match the selected node.', '선택한 노드에 해당하는 데이터가 없습니다.')}
                  </td>
                </tr>
              ) : (
                displayedRows.map((row, rIdx) => {
                  const isRowSelected = selectedRowIndex === rIdx;

                  return (
                    <tr
                      key={`${selectedNode}-${rIdx}`}
                      onClick={() => setSelectedRowIndex(rIdx)}
                      onDoubleClick={() => setDetailModalRow(row)}
                      className={`cursor-pointer transition-colors divide-x divide-slate-200 ${
                        isRowSelected
                          ? 'bg-[#fff5cc]'
                          : rIdx % 2 === 1
                          ? 'bg-[#f4f7fb]'
                          : 'bg-white hover:bg-blue-50/50'
                      }`}
                    >
                      <td className="w-10 px-1 py-1 text-center font-mono text-[10px] text-slate-500 bg-[#e4edf7]/50 tabular-nums">
                        {rIdx + 1}
                      </td>

                      {itemCatalog.map((col) => {
                        const val = row[col.fieldname];
                        const isColSelected = selectedColumnFields.includes(col.fieldname);
                        const isHotspot = col.hotspot;
                        const colorHex = col.emphasize ? getSapColorHex(col.emphasize) : null;

                        const alignClass =
                          col.just === 'R'
                            ? 'text-right'
                            : col.just === 'C'
                            ? 'text-center'
                            : 'text-left';

                        return (
                          <td
                            key={col.fieldname}
                            style={
                              !isRowSelected && !isColSelected && colorHex && colorHex.bg !== 'transparent'
                                ? { backgroundColor: colorHex.bg, color: colorHex.text }
                                : undefined
                            }
                            className={`px-3 py-1 font-mono tabular-nums whitespace-nowrap ${alignClass} ${
                              isRowSelected
                                ? 'bg-[#fff5cc] text-slate-900 font-medium'
                                : isColSelected
                                ? 'bg-blue-50/80 font-medium'
                                : col.key
                                ? 'bg-[#bce0fd]/40 font-semibold'
                                : ''
                            }`}
                          >
                            {isHotspot ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (col.drilldown_tcode && onDrilldown) {
                                    onDrilldown(col.drilldown_tcode, String(val ?? ''));
                                  } else {
                                    setDetailModalRow(row);
                                  }
                                }}
                                className="underline text-blue-700 font-bold hover:text-blue-900 cursor-pointer"
                              >
                                {String(val ?? '')}
                              </button>
                            ) : typeof val === 'number' && col.decimals !== undefined ? (
                              val.toLocaleString(undefined, {
                                minimumFractionDigits: col.decimals,
                                maximumFractionDigits: col.decimals,
                              })
                            ) : typeof val === 'number' && (col.datatype === 'CURR' || col.datatype === 'DEC') ? (
                              val.toLocaleString()
                            ) : (
                              String(val ?? '')
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>

            {showTotals && displayedRows.length > 0 && (
              <tfoot>
                <tr className="sticky bottom-0 z-10 bg-[#e0ecf8] font-bold border-t-2 border-[#9bbadb] divide-x divide-[#9bbadb]">
                  <td className="px-1 py-1.5 text-center text-blue-900 font-bold bg-[#d7e4f2]">∑</td>
                  {itemCatalog.map((col) => {
                    const alignClass =
                      col.just === 'R'
                        ? 'text-right'
                        : col.just === 'C'
                        ? 'text-center'
                        : 'text-left';

                    if (col.do_sum && totals[col.fieldname] !== undefined) {
                      const sumVal = totals[col.fieldname];
                      return (
                        <td key={col.fieldname} className={`px-3 py-1.5 font-mono tabular-nums text-blue-900 ${alignClass}`}>
                          {col.decimals !== undefined
                            ? sumVal.toLocaleString(undefined, {
                                minimumFractionDigits: col.decimals,
                                maximumFractionDigits: col.decimals,
                              })
                            : sumVal.toLocaleString()}
                        </td>
                      );
                    }
                    if (col.fieldname === firstSummaryLabelField) {
                      return (
                        <td key={col.fieldname} className="px-3 py-1.5 text-blue-900 font-bold whitespace-nowrap">
                          {t(`Total (${displayedRows.length})`, `합계 (${displayedRows.length}건)`)}
                        </td>
                      );
                    }
                    return <td key={col.fieldname} className="px-3 py-1.5 text-slate-400"></td>;
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="px-3 py-1 bg-[#d7e4f2] border-t border-[#9bbadb] text-[10px] text-slate-700 flex items-center justify-between shrink-0 font-sans">
          <span>
            {selectedNode === 'ALL'
              ? t(`All ${groupField} rows (${displayedRows.length})`, `전체 ${groupField} 데이터 (${displayedRows.length}건)`)
              : t(`[${groupField} = ${selectedNode}] ${displayedRows.length} row(s) loaded`, `[${groupField} = ${selectedNode}] ${displayedRows.length}건 로드됨`)}
          </span>
          <span className="font-mono text-slate-600">{t('Double click row to view record detail', '행을 더블 클릭하여 레코드 상세 보기')}</span>
        </div>
      </div>

      {/* Dynamic Record Detail Modal */}
      {detailModalRow && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-300 w-full max-w-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-[#005a9c] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                {renderNodeIcon(true)}
                <span className="font-bold text-xs">
                  {t('Record Detail:', '레코드 상세:')} {groupField} = {String(detailModalRow[groupField] ?? '-')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalRow(null)}
                className="text-white/80 hover:text-white text-sm font-bold cursor-pointer"
                aria-label={t('Close detail', '상세 닫기')}
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-3 font-sans text-xs max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-2.5 bg-slate-50 p-3 rounded border border-slate-200">
                {itemCatalog.map((col) => (
                  <div key={col.fieldname} className="min-w-0">
                    <span className="text-slate-500 text-[10px] block truncate">
                      {col.coltext || col.fieldname} ({col.fieldname})
                    </span>
                    <p className="font-bold font-mono text-slate-900 truncate">
                      {detailModalRow[col.fieldname] !== undefined && detailModalRow[col.fieldname] !== null
                        ? String(detailModalRow[col.fieldname])
                        : '-'}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setDetailModalRow(null)}
                  className="px-4 py-1.5 bg-[#005a9c] text-white rounded font-bold hover:bg-blue-800 cursor-pointer text-xs"
                >
                  {t('Close', '닫기')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
