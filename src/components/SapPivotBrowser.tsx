import React, { useState, useMemo, useEffect } from 'react';
import {
  Table,
  Search,
} from 'lucide-react';
import { AlvField, ProgramSpec } from '../types/sap';
import { SapGuiTheme, SAP_GUI_THEMES } from '../data/sapGuiThemes';
import { useLanguage } from '../contexts/LanguageContext';

interface SapPivotBrowserProps {
  spec: ProgramSpec;
  theme?: SapGuiTheme;
  onDrilldown?: (tcode: string, value: string) => void;
}

export interface PivotFieldDef {
  key: string;
  fieldname: string;
  coltext: string;
  art: 'DIM' | 'MEASURE' | 'TEXT';
  datatype: AlvField['datatype'];
  decimals?: number;
  drilldownTcode?: string;
  checked: boolean;
  order: number;
}

const DEFAULT_PIVOT_FIELDS: PivotFieldDef[] = [
  { key: 'RLDNR', fieldname: 'RLDNR', coltext: 'Ledger', art: 'DIM', datatype: 'CHAR', checked: true, order: 1 },
  { key: 'GJAHR', fieldname: 'GJAHR', coltext: 'Fiscal Year', art: 'DIM', datatype: 'NUMC', checked: true, order: 2 },
  { key: 'BUKRS', fieldname: 'BUKRS', coltext: 'Company Code', art: 'DIM', datatype: 'CHAR', checked: true, order: 3 },
  { key: 'HKONT', fieldname: 'HKONT', coltext: 'G/L Account', art: 'DIM', datatype: 'CHAR', drilldownTcode: 'FS00', checked: true, order: 4 },
  { key: 'WAERS', fieldname: 'WAERS', coltext: 'Currency', art: 'DIM', datatype: 'CUKY', checked: true, order: 5 },
  { key: 'DMBTR', fieldname: 'DMBTR', coltext: 'Amount (Local Curr.)', art: 'MEASURE', datatype: 'CURR', decimals: 2, checked: true, order: 6 },
  { key: 'LINES', fieldname: 'LINES', coltext: 'Line Items (Count)', art: 'MEASURE', datatype: 'INT4', checked: true, order: 7 },
  { key: 'TXT50', fieldname: 'TXT50', coltext: 'G/L Account Name', art: 'TEXT', datatype: 'CHAR', checked: false, order: 8 },
  { key: 'BELNR', fieldname: 'BELNR', coltext: 'Document No.', art: 'DIM', datatype: 'CHAR', checked: false, order: 9 },
  { key: 'BLART', fieldname: 'BLART', coltext: 'Doc Type', art: 'DIM', datatype: 'CHAR', checked: false, order: 10 },
  { key: 'KOSTL', fieldname: 'KOSTL', coltext: 'Cost Center', art: 'DIM', datatype: 'CHAR', checked: false, order: 11 },
  { key: 'PRCTR', fieldname: 'PRCTR', coltext: 'Profit Center', art: 'DIM', datatype: 'CHAR', checked: false, order: 12 },
];

const DEFAULT_ACDOCA_ROWS: Record<string, any>[] = [
  { RLDNR: '0L', GJAHR: '2016', BUKRS: '0001', HKONT: '113202', WAERS: 'EUR', DMBTR: -1783.10, LINES: 6, TXT50: 'Deutsche Bank / 보통예금', BELNR: '0100000001', BLART: 'SA', KOSTL: '1000', PRCTR: 'P100' },
  { RLDNR: '0L', GJAHR: '2016', BUKRS: '0001', HKONT: '140000', WAERS: 'EUR', DMBTR: 247.75, LINES: 9, TXT50: 'Forderungen LL / 매출채권', BELNR: '0100000002', BLART: 'RV', KOSTL: '1000', PRCTR: 'P100' },
  { RLDNR: '0L', GJAHR: '2016', BUKRS: '0001', HKONT: '159000', WAERS: 'EUR', DMBTR: 500.00, LINES: 7, TXT50: 'Sonst. Forderungen / 미수금', BELNR: '0100000003', BLART: 'SA', KOSTL: '1000', PRCTR: 'P100' },
  { RLDNR: '0L', GJAHR: '2016', BUKRS: '0001', HKONT: '160000', WAERS: 'EUR', DMBTR: 2285.00, LINES: 5, TXT50: 'Verbindlichk. LL / 매입채무', BELNR: '0100000004', BLART: 'RE', KOSTL: '1000', PRCTR: 'P100' },
  { RLDNR: '0L', GJAHR: '2016', BUKRS: '0001', HKONT: '191100', WAERS: 'EUR', DMBTR: -10720.00, LINES: 16, TXT50: 'WE/RE Verrechnung / 미착품정산', BELNR: '0100000005', BLART: 'WE', KOSTL: '1000', PRCTR: 'P100' },
  { RLDNR: '0L', GJAHR: '2017', BUKRS: '0001', HKONT: '89000', WAERS: 'EUR', DMBTR: -10000.00, LINES: 1, TXT50: 'Materialaufwand / 원재료비', BELNR: '0100000006', BLART: 'WA', KOSTL: '1100', PRCTR: 'P200' },
  { RLDNR: '0L', GJAHR: '2017', BUKRS: '0001', HKONT: '113202', WAERS: 'EUR', DMBTR: -1816.10, LINES: 5, TXT50: 'Deutsche Bank / 보통예금', BELNR: '0100000007', BLART: 'SA', KOSTL: '1000', PRCTR: 'P100' },
  { RLDNR: '0L', GJAHR: '2017', BUKRS: '0001', HKONT: '140000', WAERS: 'EUR', DMBTR: 119.00, LINES: 1, TXT50: 'Forderungen LL / 매출채권', BELNR: '0100000008', BLART: 'RV', KOSTL: '1000', PRCTR: 'P100' },
  { RLDNR: '0L', GJAHR: '2017', BUKRS: '0001', HKONT: '146100', WAERS: 'EUR', DMBTR: -2517.00, LINES: 1, TXT50: 'Geleistete Anzahlung / 선급금', BELNR: '0100000009', BLART: 'KZ', KOSTL: '1000', PRCTR: 'P100' },
  { RLDNR: '0L', GJAHR: '2017', BUKRS: '0001', HKONT: '159000', WAERS: 'EUR', DMBTR: 0.00, LINES: 2, TXT50: 'Sonst. Forderungen / 미수금', BELNR: '0100000010', BLART: 'SA', KOSTL: '1000', PRCTR: 'P100' },
  { RLDNR: '0L', GJAHR: '2017', BUKRS: '0001', HKONT: '191100', WAERS: 'EUR', DMBTR: 200.00, LINES: 5, TXT50: 'WE/RE Verrechnung / 미착품정산', BELNR: '0100000011', BLART: 'WE', KOSTL: '1000', PRCTR: 'P100' },
  { RLDNR: '0L', GJAHR: '2018', BUKRS: '0001', HKONT: '113109', WAERS: 'EUR', DMBTR: 2000.00, LINES: 1, TXT50: 'Commerzbank / 당좌예금', BELNR: '0100000012', BLART: 'SA', KOSTL: '1000', PRCTR: 'P100' },
  { RLDNR: '0L', GJAHR: '2018', BUKRS: '0001', HKONT: '140000', WAERS: 'EUR', DMBTR: 13010.00, LINES: 7, TXT50: 'Forderungen LL / 매출채권', BELNR: '0100000013', BLART: 'RV', KOSTL: '1000', PRCTR: 'P100' },
  { RLDNR: '0L', GJAHR: '2019', BUKRS: '0001', HKONT: '113101', WAERS: 'EUR', DMBTR: 63000.00, LINES: 2, TXT50: 'Festgeld / 정기예금', BELNR: '0100000014', BLART: 'SA', KOSTL: '1000', PRCTR: 'P100' },
  { RLDNR: '0L', GJAHR: '2019', BUKRS: '0001', HKONT: '113102', WAERS: 'EUR', DMBTR: 9801.24, LINES: 8, TXT50: 'Postbank / 보통예금', BELNR: '0100000015', BLART: 'SA', KOSTL: '1000', PRCTR: 'P100' },
  { RLDNR: '0L', GJAHR: '2019', BUKRS: '0001', HKONT: '113108', WAERS: 'EUR', DMBTR: 40000.00, LINES: 1, TXT50: 'Tagesgeld / 단기금융상품', BELNR: '0100000016', BLART: 'SA', KOSTL: '1000', PRCTR: 'P100' },
];

function buildPivotFieldsFromSpec(spec: ProgramSpec): PivotFieldDef[] {
  const catalog = spec.field_catalog || [];
  if (catalog.length === 0) return DEFAULT_PIVOT_FIELDS;

  const isLegacyAcdocaSample =
    catalog.some((f) => f.fieldname === 'RLDNR') &&
    catalog.some((f) => f.fieldname === 'DMBTR');

  const defaultDims = new Set((spec.pivot_config?.default_dimensions || []).map((s) => s.toUpperCase()));
  const defaultMeasures = new Set((spec.pivot_config?.default_measures || []).map((s) => s.toUpperCase()));

  const result: PivotFieldDef[] = [];
  let dimCheckedCount = 0;

  catalog
    .filter((f) => !['ZICON', 'LIGHTS', 'CHECKBOX'].includes(f.fieldname.toUpperCase()))
    .forEach((f, idx) => {
      const fn = f.fieldname.toUpperCase();
      const isMeasure =
        f.do_sum || f.datatype === 'CURR' || f.datatype === 'DEC' || f.datatype === 'INT4' || defaultMeasures.has(fn);
      const isText =
        !isMeasure && (fn.includes('TXT') || fn.includes('NAME') || fn.includes('DESC'));
      const art: PivotFieldDef['art'] = isMeasure ? 'MEASURE' : isText ? 'TEXT' : 'DIM';

      let checked = false;
      if (defaultDims.size > 0 || defaultMeasures.size > 0) {
        checked = defaultDims.has(fn) || defaultMeasures.has(fn);
      } else if (isMeasure) {
        checked = true;
      } else if (!isText && dimCheckedCount < 4) {
        checked = true;
        dimCheckedCount += 1;
      }

      result.push({
        key: f.fieldname,
        fieldname: f.fieldname,
        coltext: f.coltext || f.fieldname,
        art,
        datatype: f.datatype,
        decimals: f.decimals ?? (f.datatype === 'CURR' ? 2 : undefined),
        drilldownTcode: f.hotspot ? f.drilldown_tcode : undefined,
        checked,
        order: idx + 1,
      });
    });

  // Always ensure at least one count measure if the catalog had zero measures
  if (!result.some((r) => r.art === 'MEASURE')) {
    result.push({
      key: 'ROW_CNT',
      fieldname: 'ROW_CNT',
      coltext: 'Record Count',
      art: 'MEASURE',
      datatype: 'INT4',
      checked: true,
      order: result.length + 1,
    });
  }

  // If this is the ACDOCA sample (e.g. ZRALV0040), append remaining exploration fields if absent
  if (isLegacyAcdocaSample) {
    const existing = new Set(result.map((r) => r.key.toUpperCase()));
    DEFAULT_PIVOT_FIELDS.forEach((df) => {
      if (!existing.has(df.key.toUpperCase())) {
        result.push({ ...df, checked: false, order: result.length + 1 });
      }
    });
  }

  return result;
}

export const SapPivotBrowser: React.FC<SapPivotBrowserProps> = ({
  spec,
  theme = 'blue_crystal',
  onDrilldown,
}) => {
  const { lang, t } = useLanguage();
  const _currentTheme = SAP_GUI_THEMES[theme] || SAP_GUI_THEMES.blue_crystal;

  const [activeTab, setActiveTab] = useState<'columns' | 'layouts' | 'actions' | 'history'>('columns');
  const [fields, setFields] = useState<PivotFieldDef[]>(() => buildPivotFieldsFromSpec(spec));
  const [fieldSearch, setFieldSearch] = useState('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    setFields(buildPivotFieldsFromSpec(spec));
  }, [spec.id, spec.program_id, spec.field_catalog, spec.pivot_config]);

  const rawRows = useMemo(() => {
    if (spec.mock_rows && spec.mock_rows.length > 0) {
      return spec.mock_rows;
    }
    return DEFAULT_ACDOCA_ROWS;
  }, [spec.mock_rows]);

  const checkedDimFields = useMemo(
    () => fields.filter((f) => f.checked && (f.art === 'DIM' || f.art === 'TEXT')),
    [fields]
  );
  const checkedMeasureFields = useMemo(
    () => fields.filter((f) => f.checked && f.art === 'MEASURE'),
    [fields]
  );
  const allMeasureFields = useMemo(
    () => fields.filter((f) => f.art === 'MEASURE'),
    [fields]
  );
  const checkedFields = useMemo(() => fields.filter((f) => f.checked), [fields]);

  const handleToggleField = (key: string) => {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? { ...f, checked: !f.checked } : f))
    );
    setStatusNotice(
      t(
        `Field [${key}] toggled: Group By & Sum dynamically recalculated.`,
        `필드 [${key}] 전환됨: Group By 및 합계가 실시간으로 재계산되었습니다.`
      )
    );
    setTimeout(() => setStatusNotice(null), 3000);
  };

  const applyPreset = (keysToEnable: string[]) => {
    setFields((prev) =>
      prev.map((f) => ({
        ...f,
        checked: keysToEnable.includes(f.key),
      }))
    );
    setStatusNotice(
      t(
        `Preset [${keysToEnable.join(', ')}] applied.`,
        `프리셋 [${keysToEnable.join(', ')}]이 적용되었습니다.`
      )
    );
    setTimeout(() => setStatusNotice(null), 3000);
  };

  // True Dynamic Group By & Sum Aggregation Engine
  const pivotResult = useMemo(() => {
    const grandTotals: Record<string, number> = {};
    allMeasureFields.forEach((m) => {
      grandTotals[m.key] = rawRows.reduce((acc, r) => {
        if (m.key === 'ROW_CNT') return acc + 1;
        const raw = r[m.key];
        if (raw === undefined && (m.key === 'LINES' || m.key === 'CNT')) return acc + 1;
        return acc + (Number(raw) || 0);
      }, 0);
    });

    if (checkedDimFields.length === 0) {
      return {
        rows: [
          {
            rowKey: 'ALL_SUMMARY',
            dimValues: {} as Record<string, any>,
            measures: { ...grandTotals },
            rawCount: rawRows.length,
          },
        ],
        grandTotals,
      };
    }

    interface GroupAgg {
      rowKey: string;
      dimValues: Record<string, any>;
      measures: Record<string, number>;
      rawCount: number;
    }

    const groupMap = new Map<string, GroupAgg>();

    rawRows.forEach((row) => {
      const compKey = checkedDimFields
        .map((f) => String(row[f.key] ?? ''))
        .join('___');

      if (!groupMap.has(compKey)) {
        const dimValues: Record<string, any> = {};
        checkedDimFields.forEach((f) => {
          dimValues[f.key] = row[f.key];
        });
        const initialMeasures: Record<string, number> = {};
        allMeasureFields.forEach((m) => {
          initialMeasures[m.key] = 0;
        });

        groupMap.set(compKey, {
          rowKey: compKey,
          dimValues,
          measures: initialMeasures,
          rawCount: 0,
        });
      }

      const item = groupMap.get(compKey)!;
      allMeasureFields.forEach((m) => {
        if (m.key === 'ROW_CNT') {
          item.measures[m.key] += 1;
        } else if (row[m.key] === undefined && (m.key === 'LINES' || m.key === 'CNT')) {
          item.measures[m.key] += 1;
        } else {
          item.measures[m.key] += Number(row[m.key]) || 0;
        }
      });
      item.rawCount += 1;
    });

    const firstSortDim = checkedDimFields[0]?.key;
    const rows = Array.from(groupMap.values()).sort((a, b) => {
      if (firstSortDim) {
        const sA = String(a.dimValues[firstSortDim] || '');
        const sB = String(b.dimValues[firstSortDim] || '');
        if (sA !== sB) return sA.localeCompare(sB);
      }
      return a.rowKey.localeCompare(b.rowKey);
    });

    return { rows, grandTotals };
  }, [rawRows, checkedDimFields, allMeasureFields]);

  const formatMeasureValue = (num: number, field: PivotFieldDef) => {
    if (field.datatype === 'INT4' || field.key === 'LINES' || field.key === 'ROW_CNT') {
      return Math.round(num).toLocaleString();
    }
    const decimals = field.decimals ?? 2;
    const isNeg = num < 0;
    const abs = Math.abs(num);
    const parts = abs.toFixed(decimals).split('.');
    const withCommas = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const formatted = decimals > 0 ? `${withCommas}.${parts[1]}` : withCommas;
    return isNeg ? `${formatted}-` : formatted;
  };

  // Dynamic Layout Presets derived from spec.pivot_config or field catalog
  const layoutPresets = useMemo(() => {
    if (spec.pivot_config?.preset_layouts && spec.pivot_config.preset_layouts.length > 0) {
      return spec.pivot_config.preset_layouts;
    }
    const dims = fields.filter((f) => f.art === 'DIM').map((f) => f.key);
    const texts = fields.filter((f) => f.art === 'TEXT').map((f) => f.key);
    const measures = fields.filter((f) => f.art === 'MEASURE').map((f) => f.key);

    return [
      {
        name: '/SUMMARY_TOP2',
        badge: t('Compact', '요약'),
        desc: t(
          `Primary 2 Dimensions (${dims.slice(0, 2).join(', ') || 'All'})`,
          `주요 2개 차원 (${dims.slice(0, 2).join(', ') || '전체'})`
        ),
        keys: [...dims.slice(0, 2), ...measures],
      },
      {
        name: '/STANDARD',
        badge: t('Standard', '표준'),
        desc: t('Standard Dimensions & Aggregated Measures', '표준 차원 및 집계 측정값'),
        keys: [...dims.slice(0, 4), ...measures],
      },
      {
        name: '/DETAILED_ALL',
        badge: t('Full Breakdown', '전체 상세'),
        desc: t('All Dimensions, Texts, and Measures', '모든 차원, 텍스트 및 측정값'),
        keys: [...dims, ...texts, ...measures],
      },
    ];
  }, [spec.pivot_config?.preset_layouts, fields, t]);

  const sqlSourceTable = useMemo(() => {
    if (spec.pivot_config?.source_table_or_cds) return spec.pivot_config.source_table_or_cds.toUpperCase();
    if (spec.cds_view_table) return spec.cds_view_table.toUpperCase();
    const refTbl = (spec.field_catalog || []).find((f) => f.ref_table)?.ref_table;
    return (refTbl || 'ACDOCA').toUpperCase();
  }, [spec.pivot_config?.source_table_or_cds, spec.cds_view_table, spec.field_catalog]);

  const primaryKeyField = fields.find((f) => f.art === 'DIM')?.key;

  return (
    <div className="flex flex-col h-full bg-[#f4f7fb] overflow-hidden font-sans border border-[#9bbadb] shadow-sm select-none">
      {/* Top Mini Bar */}
      <div className="bg-[#d8e4f0] px-3 py-1.5 border-b border-[#9bbadb] flex items-center justify-between shrink-0 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <Table className="w-4 h-4 text-blue-900" />
          <span className="font-bold text-slate-900 text-[13px]">
            {spec.title || t('Pivot Browser', '피벗 브라우저')}
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-bold border border-blue-200">
            04 (Pivot Browser)
          </span>
          <span className="text-[11px] font-mono font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-300">
            [{spec.program_id || 'ZRALV0040'}]
          </span>
          <span className="text-[11px] text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-300 font-mono tabular-nums">
            {t('Rows:', '행 수:')} <strong className="text-blue-900">{pivotResult.rows.length}</strong>
          </span>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT MAIN AREA: Result Pivot Grid */}
        <div className="flex-[7] flex flex-col bg-white overflow-hidden border-r border-[#9bbadb]">
          <div className="bg-[#e9f0f8] px-2.5 py-1 border-b border-[#9bbadb] flex items-center justify-between text-xs shrink-0 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-mono font-bold text-slate-700 px-1.5 py-0.5 bg-white border border-slate-300 rounded shrink-0">
                Group By Sum
              </span>
              <span className="text-[11px] text-slate-600 truncate">
                {t('Dimensions:', '차원:')}{' '}
                <strong className="text-blue-900 font-mono">
                  {checkedDimFields.length > 0
                    ? checkedDimFields.map((f) => f.coltext).join(', ')
                    : t('(All Records Sum)', '(전체 레코드 합계)')}
                </strong>
              </span>
            </div>

            <div className="text-[11px] text-slate-600 font-mono tabular-nums shrink-0">
              {t('Aggregated Rows:', '집계 행:')} <strong className="text-blue-900">{pivotResult.rows.length}</strong>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full border-collapse text-xs font-sans whitespace-nowrap">
              <thead className="sticky top-0 z-10 bg-[#d8e4f0] border-b border-[#9bbadb] text-slate-900 shadow-2xs">
                <tr>
                  <th className="w-8 px-1 py-1.5 border-r border-[#9bbadb] bg-[#c8d8ea] text-center">
                    <div className="w-3.5 h-3.5 mx-auto border border-slate-600 bg-white flex items-center justify-center">
                      <span className="text-[9px] text-blue-900 font-bold">▶</span>
                    </div>
                  </th>
                  {checkedFields.map((field) => {
                    const isMeasure = field.art === 'MEASURE';
                    return (
                      <th
                        key={field.key}
                        className={`px-2.5 py-1.5 border-r border-[#9bbadb] font-semibold text-xs ${
                          isMeasure ? 'text-right' : 'text-left'
                        } ${field.key === primaryKeyField ? 'bg-[#bce0fd]' : 'bg-[#d8e4f0]'}`}
                      >
                        <div className={`flex items-center gap-1 ${isMeasure ? 'justify-end' : 'justify-between'}`}>
                          <span>{field.coltext}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {pivotResult.rows.map((row, rIdx) => (
                  <tr key={row.rowKey} className="hover:bg-blue-50/70 transition-colors bg-white font-mono text-xs">
                    <td className="w-8 px-1 py-1.5 text-center bg-[#f0f4f8] border-r border-[#d8d8d8] text-[11px] font-bold text-slate-600 tabular-nums">
                      {rIdx + 1}
                    </td>

                    {checkedFields.map((field) => {
                      const isMeasure = field.art === 'MEASURE';
                      const drillTcode = field.drilldownTcode;
                      const val = isMeasure
                        ? row.measures[field.key] || 0
                        : row.dimValues[field.key];

                      return (
                        <td
                          key={field.key}
                          onClick={() => {
                            if (drillTcode && onDrilldown && val !== undefined) {
                              onDrilldown(drillTcode, String(val));
                            }
                          }}
                          className={`px-2.5 py-1.5 border-r border-[#d8d8d8] tabular-nums ${
                            isMeasure
                              ? 'text-right font-medium'
                              : field.key === primaryKeyField
                              ? 'bg-[#eaf4fd] text-center font-bold text-blue-950'
                              : 'text-center font-semibold text-slate-800'
                          } ${
                            drillTcode
                              ? 'text-blue-700 hover:text-blue-900 underline font-semibold cursor-pointer'
                              : ''
                          }`}
                        >
                          {isMeasure ? formatMeasureValue(Number(val) || 0, field) : String(val ?? '')}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>

              <tfoot className="sticky bottom-0 bg-[#ffffa0] border-t-2 border-yellow-400 font-mono text-xs font-extrabold text-slate-900 shadow-xs">
                <tr className="h-7 leading-normal">
                  <td className="w-8 px-1 py-1 text-center bg-[#fff888] border-r border-yellow-400 font-bold text-slate-800 h-7 select-none">
                    Σ
                  </td>
                  {checkedFields.map((field) => {
                    const isMeasure = field.art === 'MEASURE';
                    return (
                      <td
                        key={field.key}
                        className={`px-2 py-1 border-r border-yellow-300 h-7 leading-normal tabular-nums ${
                          isMeasure ? 'text-right font-extrabold text-slate-900' : 'text-center'
                        }`}
                      >
                        {isMeasure ? (
                          <span className="text-slate-950 font-extrabold">
                            {formatMeasureValue(pivotResult.grandTotals[field.key] || 0, field)}
                          </span>
                        ) : (
                          ''
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* RIGHT DOCKING SIDE PANEL */}
        <div className="flex-[4] flex flex-col bg-white overflow-hidden shadow-inner">
          <div className="bg-[#e2edf8] border-b border-[#9bbadb] flex items-center justify-between px-2 pt-1.5 shrink-0">
            <div className="flex items-center gap-1">
              {[
                { id: 'columns' as const, label: t('Columns', '컬럼') },
                { id: 'layouts' as const, label: t('Layouts', '레이아웃') },
                { id: 'actions' as const, label: t('Actions', 'SQL 동작') },
                { id: 'history' as const, label: t('History', '이력') },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1 text-xs font-semibold rounded-t transition-colors cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-white text-blue-900 border-t border-l border-r border-[#9bbadb] shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#f0f4f9] px-2.5 py-1.5 border-b border-[#9bbadb] flex items-center justify-between gap-1 text-xs shrink-0">
            <span className="text-[11px] font-semibold text-slate-600">{t('Select Dimensions & Measures', '차원 및 측정값 선택')}</span>
            <div className="relative">
              <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1.5" />
              <input
                type="text"
                placeholder={t('Search field...', '필드 검색...')}
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                className="bg-white border border-slate-300 rounded pl-6 pr-2 py-0.5 text-[11px] w-28 focus:w-36 transition-all text-slate-800"
              />
            </div>
          </div>

          {activeTab === 'columns' && (
            <div className="flex-1 overflow-auto p-1 bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[#e9f0f8] border-b border-[#9bbadb] text-[10px] uppercase font-bold text-slate-700 sticky top-0 z-5">
                  <tr>
                    <th className="px-2 py-1 w-10 text-center">{t('Type', '유형')}</th>
                    <th className="px-2 py-1">{t('Field Name', '필드명')}</th>
                    <th className="px-2 py-1 text-center w-12">{t('Visible', '표시')}</th>
                    <th className="px-2 py-1">{t('Field Description', '필드 설명')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {fields
                    .filter((f) => {
                      if (!fieldSearch.trim()) return true;
                      const q = fieldSearch.toLowerCase();
                      return (
                        f.key.toLowerCase().includes(q) ||
                        f.coltext.toLowerCase().includes(q)
                      );
                    })
                    .map((field) => (
                      <tr
                        key={field.key}
                        onClick={() => handleToggleField(field.key)}
                        className={`hover:bg-blue-50/70 cursor-pointer transition-colors ${
                          field.checked ? 'bg-blue-50/40' : 'bg-white'
                        }`}
                      >
                        <td className="px-2 py-1 text-center">
                          <span
                            className={`w-2.5 h-2.5 rounded-full inline-block ${
                              field.art === 'DIM'
                                ? 'bg-blue-600'
                                : field.art === 'MEASURE'
                                ? 'bg-emerald-600'
                                : 'bg-slate-400'
                            }`}
                            title={field.art === 'DIM' ? t('Dimension', '차원 (Dimension)') : field.art === 'MEASURE' ? t('Measure (SUM)', '측정값 (SUM)') : t('Text Attribute', '텍스트 속성')}
                          />
                        </td>
                        <td className="px-2 py-1 font-bold text-slate-800">{field.fieldname}</td>
                        <td className="px-2 py-1 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={field.checked}
                            onChange={() => handleToggleField(field.key)}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-2 py-1 font-sans text-slate-700 text-[11px] truncate max-w-44">
                          {field.coltext}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'layouts' && (
            <div className="flex-1 p-3 text-xs space-y-3 bg-white overflow-auto">
              <span className="font-bold text-slate-800 block text-xs">{t('Saved Layout Variants:', '저장된 레이아웃 변형:')}</span>
              <div className="space-y-2 font-sans">
                {layoutPresets.map((l) => (
                  <div
                    key={l.name}
                    onClick={() => applyPreset(l.keys)}
                    className="p-2 border border-slate-200 rounded hover:border-blue-500 hover:bg-blue-50/60 cursor-pointer transition-all shadow-2xs group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-blue-900 font-mono group-hover:text-blue-700">
                        {l.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                        {l.badge}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 mt-1">{l.desc}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{l.keys.join(', ')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'actions' && (
            <div className="flex-1 p-3 text-xs space-y-3 bg-white overflow-auto font-sans">
              <span className="font-bold text-slate-800 block text-xs">{t('Dynamic Open SQL Engine Query:', '동적 Open SQL 엔진 쿼리:')}</span>
              <pre className="p-2.5 bg-slate-900 text-emerald-400 rounded text-[11px] font-mono leading-relaxed overflow-x-auto shadow-inner border border-slate-800">
{`SELECT ${checkedDimFields.length > 0 ? checkedDimFields.map((f) => f.key).join(',\n       ') : '*'}${
  checkedMeasureFields.length > 0
    ? (checkedDimFields.length > 0 ? ',\n       ' : '') +
      checkedMeasureFields
        .map((m) =>
          m.key === 'LINES' || m.key === 'ROW_CNT'
            ? `COUNT(*) AS ${m.key}`
            : `SUM(${m.key}) AS ${m.key}`
        )
        .join(',\n       ')
    : ''
}
  FROM ${sqlSourceTable}${
  checkedDimFields.length > 0
    ? `\n GROUP BY ${checkedDimFields.map((f) => f.key).join(', ')};`
    : ';'
}`}
              </pre>
              <div className="text-[11px] text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded border border-slate-200">
                <div className="font-semibold text-slate-800">{t('Dynamic Group By Summary:', '동적 Group By 요약:')}</div>
                <p>
                  {lang === 'ko' ? (
                    <>선택한 차원이 <strong>{sqlSourceTable}</strong>의 <strong>GROUP BY</strong> 푸시다운으로 컴파일됩니다. 원본 {rawRows.length}건이 <strong>{pivotResult.rows.length}개 그룹</strong>으로 집계되었습니다.</>
                  ) : (
                    <>Checked dimensions compile into <strong>GROUP BY</strong> pushdown on <strong>{sqlSourceTable}</strong>. {rawRows.length} source rows aggregated into <strong>{pivotResult.rows.length} groups</strong>.</>
                  )}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="flex-1 p-3 text-xs space-y-2 bg-white overflow-auto font-mono text-[11px]">
              <div className="text-slate-500 pb-1 border-b">{t('Activity History:', '실행 이력:')}</div>
              <div className="text-emerald-700">● {t(`Dynamic Group By executed (${pivotResult.rows.length} rows)`, `동적 Group By 실행됨 (${pivotResult.rows.length}행)`)}</div>
              <div className="text-blue-700">● {t(`Source Dataset: ${sqlSourceTable} (${rawRows.length} raw records)`, `원본 데이터셋: ${sqlSourceTable} (원본 ${rawRows.length}건)`)}</div>
              <div className="text-slate-600">● {t(`Active Measures: ${checkedMeasureFields.map((m) => m.key).join(', ') || 'None'}`, `활성 측정값: ${checkedMeasureFields.map((m) => m.key).join(', ') || '없음'}`)}</div>
            </div>
          )}

          <div className="bg-[#e9f0f8] px-3 py-1.5 border-t border-[#9bbadb] text-[11px] text-slate-600 flex items-center justify-between shrink-0 font-sans">
            <span>{t('Selected Columns:', '선택된 컬럼:')} <strong>{checkedFields.length}</strong></span>
            <div className="text-[10px] text-slate-500 font-mono">
              {t('Engine:', '엔진:')} SAP Open SQL ({sqlSourceTable})
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="px-3 py-1 bg-[#d8e4f0] border-t border-[#9bbadb] flex items-center justify-between text-xs font-mono shrink-0 text-slate-700">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-xs shrink-0" />
          <span className="font-medium">
            {statusNotice || t(`${pivotResult.rows.length} aggregated group row(s) loaded.`, `집계된 그룹 행 ${pivotResult.rows.length}건이 로드되었습니다.`)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>T-Code: {spec.tcode || 'ZRALV0040'}</span>
          <span>|</span>
          <span>{spec.target_sap_release || 'SAP S/4HANA 2023'}</span>
        </div>
      </div>
    </div>
  );
};
