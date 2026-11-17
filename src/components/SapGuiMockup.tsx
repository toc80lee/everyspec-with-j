import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Play,
  ArrowLeft,
  Search,
  Filter,
  FileSpreadsheet,
  Printer,
  X,
  ChevronDown,
  Info,
  Layers,
  SlidersHorizontal,
  Table,
  Check,
  Plus,
  Sparkles,
  Loader2,
  Palette,
  Settings,
  Save,
  Bookmark,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { ProgramSpec, AlvField, SelectionParameter, AlvErrorLog } from '../types/sap';
import { authorizedFetch } from '../utils/authorizedFetch';
import { SapMultipleSelectionModal } from './SapMultipleSelectionModal';
import { DrilldownModal } from './DrilldownModal';
import { AlvDetailModal } from './AlvDetailModal';
import { AlvToolbar } from './AlvToolbar';
import { SapPivotBrowser } from './SapPivotBrowser';
import { SapTreeAlvSimulator } from './SapTreeAlvSimulator';
import { SapThemeSettingsModal } from './SapThemeSettingsModal';
import { SapF4ValueHelpModal } from './SapF4ValueHelpModal';
import { SapAlvFilterModal, AlvColumnFilter } from './SapAlvFilterModal';
import { SapAlvLayoutModal } from './SapAlvLayoutModal';
import { SapBusinessGraphicModal } from './SapBusinessGraphicModal';
import {
  SapGuiTheme,
  SAP_GUI_THEMES,
  DEFAULT_SAP_THEME,
  loadSavedSapTheme,
  saveSapTheme,
} from '../data/sapGuiThemes';
import { DEFAULT_ALV_TOOLBAR_BUTTONS } from '../data/defaultToolbarButtons';
import { downloadFile } from '../utils/specExport';
import { getSapColorHex } from './SapColorSearchHelpModal';
import {
  AlvLayoutConfigState,
  SelectionVariant,
  deleteSelectionVariant,
  filterRowsBySelectionParams,
  getSelectionVariants,
  saveSelectionVariant,
  validateAlvEdits,
  validateSelectionParams,
} from '../utils/sapSimulatorHelpers';
import { isReadOnlyCommonSpec } from '../utils/projectStorage';
import { useLanguage } from '../contexts/LanguageContext';
import { useConfirmDialog } from '../contexts/ConfirmDialogContext';

interface SapGuiMockupProps {
  spec: ProgramSpec;
  onUpdateSpec?: (updated: ProgramSpec) => void;
  isReadOnly?: boolean;
  currentTheme?: SapGuiTheme;
  onSelectTheme?: (theme: SapGuiTheme) => void;
  mockDataTrigger?: number;
}

interface StatusSummary {
  statusKey: string;
  count: number;
  label: string;
  iconType: 'DOC' | 'GREEN' | 'YELLOW' | 'RED' | 'FOLDER' | 'OTHER';
}

/**
 * SAP ALV Color Code interpreter
 * Format: C<color><intensified><inverse>
 * e.g., C300: yellow bg, C310: light yellow bg, C301: yellow text, C100: key blue
 */
export const getSapAlvCellStyle = (
  emphasize?: string,
  isKey = false,
  isSelected = false,
  isZebra = false,
  isEditable = false
): { bg: string; text: string; style?: React.CSSProperties } => {
  if (isSelected) {
    return { bg: 'bg-[#fff5cc]', text: 'text-slate-900 font-bold' };
  }
  // Editable fields: white background per requirement
  if (isEditable) {
    return { bg: 'bg-white', text: 'text-slate-900' };
  }
  if (isKey) {
    return { bg: 'bg-[#bce0fd]', text: 'text-slate-900 font-semibold' };
  }
  if (!emphasize) {
    return {
      bg: isZebra ? 'bg-[#f4f7fb]' : 'bg-white',
      text: 'text-slate-800',
    };
  }

  // Standard SAP ALV Color Codes (C100 ~ C711)
  const hex = getSapColorHex(emphasize);
  if (hex && hex.bg && hex.bg !== 'transparent') {
    return {
      bg: '',
      text: '',
      style: { backgroundColor: hex.bg, color: hex.text },
    };
  }

  return {
    bg: isZebra ? 'bg-[#f4f7fb]' : 'bg-white',
    text: 'text-slate-800',
  };
};

/**
 * Intelligent deterministic SAP mock data generator
 * Used as high-reliability fallback when offline or field types are updated
 */
const generateDeterministicSapMockRows = (fields: AlvField[], rowCount = 5): Record<string, any>[] => {
  const result: Record<string, any>[] = [];
  const partnerNames = [
    '(주)삼성전자 수원공장',
    '현대모비스 남양연구소',
    'LG에너지솔루션 오창공장',
    'SK하이닉스 이천캠퍼스',
    '포스코 포항제철소',
  ];
  const amounts = [45000000, 38200000, 19800000, 52400000, 14500000];

  for (let r = 0; r < rowCount; r++) {
    const row: Record<string, any> = {};
    fields.forEach((f) => {
      const fn = f.fieldname.toUpperCase();
      if (fn === 'ZICON' || fn === 'STATUS' || fn === 'LIGHTS') {
        row[f.fieldname] = r === 2 ? '2' : r === 4 ? '3' : '1';
      } else if (fn.includes('VBELN') || fn.includes('DOC_NO') || fn.includes('DOCNO')) {
        row[f.fieldname] = `00100000${45 + r}`;
      } else if (fn.includes('EBELN')) {
        row[f.fieldname] = `450001928${r}`;
      } else if (fn.includes('BELNR')) {
        row[f.fieldname] = `100000001${r}`;
      } else if (f.datatype === 'DATS' || fn.includes('DATE') || fn.includes('ERDAT') || fn.includes('BUDAT')) {
        row[f.fieldname] = `2026.10.${String(10 + r * 3).padStart(2, '0')}`;
      } else if (
        f.datatype === 'CURR' ||
        f.datatype === 'DEC' ||
        fn.includes('AMOUNT') ||
        fn.includes('NETWR') ||
        fn.includes('DMBTR') ||
        fn.includes('NETPR')
      ) {
        row[f.fieldname] = amounts[r % amounts.length];
      } else if (
        fn.includes('WAERK') ||
        fn.includes('WAERS') ||
        fn.includes('CURRENCY') ||
        fn.includes('HWAER')
      ) {
        row[f.fieldname] = 'KRW';
      } else if (
        fn.includes('NAME') ||
        fn.includes('PARTNER') ||
        fn.includes('KUNNR') ||
        fn.includes('LIFNR')
      ) {
        row[f.fieldname] = partnerNames[r % partnerNames.length];
      } else if (fn.includes('MATNR')) {
        row[f.fieldname] = `MAT-PART-00${r + 1}`;
      } else if (fn.includes('MENGE') || fn.includes('KWMENG')) {
        row[f.fieldname] = (r + 1) * 25;
      } else if (fn.includes('MEINS') || fn.includes('VRKME')) {
        row[f.fieldname] = 'EA';
      } else if (f.datatype === 'NUMC') {
        row[f.fieldname] = String(r + 1).padStart(f.outputlen || 4, '0');
      } else {
        row[f.fieldname] = `${f.coltext || f.fieldname} ${r + 1}`;
      }
    });
    result.push(row);
  }
  return result;
};

export const SapGuiMockup: React.FC<SapGuiMockupProps> = ({
  spec,
  onUpdateSpec,
  isReadOnly = false,
  currentTheme: propTheme,
  onSelectTheme: propSelectTheme,
  mockDataTrigger,
}) => {
  const { t } = useLanguage();
  const { confirmDelete } = useConfirmDialog();
  const isSpecReadOnly = Boolean(
    isReadOnly || isReadOnlyCommonSpec(spec) || spec.is_system === true
  );
  const [simSpec, setSimSpec] = useState<ProgramSpec>(spec);

  useEffect(() => {
    setSimSpec(spec);
  }, [spec]);

  const commitSimUpdate = (updater: (prev: ProgramSpec) => ProgramSpec) => {
    setSimSpec((prev) => {
      const next = updater(prev);
      if (!isSpecReadOnly && onUpdateSpec) {
        onUpdateSpec(next);
      }
      return next;
    });
  };

  // Screen mode: 'alv' (ALV Grid Output) or 'selection' (Selection Screen)
  const [screenMode, setScreenMode] = useState<'alv' | 'selection'>('alv');

  // Interactive Data & Filter state
  const [rows, setRows] = useState<Record<string, any>[]>(simSpec.mock_rows || []);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(0);
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [showTotals, setShowTotals] = useState<boolean>(true);

  // Column Text Mode: 'coltext' (필드 카탈로그 텍스트) <-> 'fieldname' (내부 테이블 필드명)
  const [columnTextMode, setColumnTextMode] = useState<'coltext' | 'fieldname'>('coltext');

  // Multiple Column Selection for Excel-like contiguous dragging, Ctrl/Shift click, Multi-Sort, and &TOTAL (RFQ v1.10 Page 2)
  const [selectedColumnFields, setSelectedColumnFields] = useState<string[]>([]);
  const isDraggingColumnRef = useRef<boolean>(false);
  const dragAnchorFieldRef = useRef<string | null>(null);
  const lastClickedFieldRef = useRef<string | null>(null);

  // Multi-column sort state
  const [sortColumns, setSortColumns] = useState<{ fieldname: string; asc: boolean }[]>([]);

  // Cell selection state for SEL_MODE 'D'
  const [selectedCell, setSelectedCell] = useState<{ rIdx: number; fieldname: string } | null>(null);

  // Setup window mouseup listener to finish drag selection
  useEffect(() => {
    const handleWindowMouseUp = () => {
      isDraggingColumnRef.current = false;
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, []);

  // Column Width Optimization (gs_layo-cwidth_opt)
  const [isOptimizedWidth, setIsOptimizedWidth] = useState<boolean>(simSpec.layout?.cwidth_opt ?? true);

  // Synchronize Column Width Optimization with simSpec.layout in real-time
  useEffect(() => {
    if (simSpec.layout?.cwidth_opt !== undefined) {
      setIsOptimizedWidth(simSpec.layout.cwidth_opt);
    }
  }, [simSpec.layout?.cwidth_opt]);

  // Status (Sta.) Active Multi-Select Filters: default state has all statuses selected
  const [selectedStatusFilters, setSelectedStatusFilters] = useState<string[]>([
    '1',
    '2',
    '3',
    'DOC',
    'FOLDER',
  ]);

  // Toggle single status filter in multi-select mode
  const handleToggleStatusFilter = (statusKey: string) => {
    setSelectedStatusFilters((prev) => {
      const exists = prev.includes(statusKey);
      const next = exists ? prev.filter((k) => k !== statusKey) : [...prev, statusKey];
      setStatusMessage({
        text: exists
          ? t(`Status [${statusKey}] filter removed.`, `상태 [${statusKey}] 필터가 해제되었습니다.`)
          : t(`Status [${statusKey}] filter applied.`, `상태 [${statusKey}] 필터가 적용되었습니다.`),
        type: 'S',
      });
      return next;
    });
  };

  // Error Log sub-window visibility (defaults to true if simSpec has error_logs)
  const [showErrorLog, setShowErrorLog] = useState<boolean>(
    !!(simSpec.error_logs && simSpec.error_logs.length > 0)
  );

  // Status Bar message (displayed in bottom fixed status bar, preventing ALV Grid shifts)
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'S' | 'W' | 'E' }>({
    text: t(
      `Data loaded (${simSpec.mock_rows?.length || 0} rows displayed)`,
      `데이터 로드 완료 (${simSpec.mock_rows?.length || 0}건 조회됨)`
    ),
    type: 'S',
  });

  // SAP GUI Theme State (Blue Crystal, Belize, Quartz)
  const [localTheme, setLocalTheme] = useState<SapGuiTheme>(() => loadSavedSapTheme());

  const currentTheme = propTheme || localTheme;
  const [isThemeSettingsOpen, setIsThemeSettingsOpen] = useState<boolean>(false);

  const handleSelectTheme = (newTheme: SapGuiTheme) => {
    saveSapTheme(newTheme);
    if (propSelectTheme) {
      propSelectTheme(newTheme);
    } else {
      setLocalTheme(newTheme);
    }
    setStatusMessage({
      text: t(
        `SAP GUI Theme changed to [${SAP_GUI_THEMES[newTheme].name}] (${SAP_GUI_THEMES[newTheme].releaseBadge}).`,
        `SAP GUI 테마가 [${SAP_GUI_THEMES[newTheme].name}] (${SAP_GUI_THEMES[newTheme].releaseBadge})로 변경되었습니다.`
      ),
      type: 'S',
    });
  };

  const themeInfo = SAP_GUI_THEMES[currentTheme] || SAP_GUI_THEMES[DEFAULT_SAP_THEME];
  const themeStyles = themeInfo.styles;

  // Modals & Interactive Simulator State
  const [activeParamForMulti, setActiveParamForMulti] = useState<SelectionParameter | null>(null);
  const [f4Target, setF4Target] = useState<{ param: SelectionParameter; side: 'low' | 'high' } | null>(null);
  const [drilldownInfo, setDrilldownInfo] = useState<{
    tcode: string;
    fieldValue: string;
    fieldName: string;
    fieldLabel: string;
    rowRecord: Record<string, any>;
  } | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [isGeneratingMockData, setIsGeneratingMockData] = useState<boolean>(false);

  // Selection Screen Variant, Validation & Filtering
  const [selectionVariants, setSelectionVariants] = useState<SelectionVariant[]>(() =>
    getSelectionVariants(simSpec.program_id)
  );
  const [activeVariantName, setActiveVariantName] = useState<string>('');
  const [isSavingVariant, setIsSavingVariant] = useState<boolean>(false);
  const [variantNameDraft, setVariantNameDraft] = useState<string>('');
  const [obligatoryErrorIds, setObligatoryErrorIds] = useState<string[]>([]);
  const [isSelectionFilterActive, setIsSelectionFilterActive] = useState<boolean>(false);
  const [appliedSelectionNames, setAppliedSelectionNames] = useState<string[]>([]);
  const [selectionTotalsOnlyHint, setSelectionTotalsOnlyHint] = useState<boolean>(false);

  // ALV Edit & Save Validation Protocol
  const [dirtyCells, setDirtyCells] = useState<Set<string>>(new Set());
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [runtimeErrorLogs, setRuntimeErrorLogs] = useState<AlvErrorLog[]>([]);

  // ALV Filter / Find Modal & State (replaces window.prompt)
  const [columnFilter, setColumnFilter] = useState<AlvColumnFilter>({
    fieldname: '__ALL__',
    operator: 'contains',
    value: '',
  });
  const [filterModalState, setFilterModalState] = useState<{
    open: boolean;
    mode: 'find' | 'filter';
    target: 'header' | 'item';
  }>({ open: false, mode: 'filter', target: 'header' });
  const [findTerm, setFindTerm] = useState<string>('');
  const [findMatchIdx, setFindMatchIdx] = useState<number>(-1);

  // ALV Layout Variant & Subtotal Break & Business Graphics
  const [layoutOverride, setLayoutOverride] = useState<AlvLayoutConfigState | null>(null);
  const [activeLayoutVariantName, setActiveLayoutVariantName] = useState<string | null>(null);
  const [isLayoutModalOpen, setIsLayoutModalOpen] = useState<boolean>(false);
  const [isGraphicModalOpen, setIsGraphicModalOpen] = useState<boolean>(false);

  // Reset spec-scoped simulator overrides when switching specs
  useEffect(() => {
    setSelectionVariants(getSelectionVariants(spec.program_id));
    setActiveVariantName('');
    setObligatoryErrorIds([]);
    setIsSelectionFilterActive(false);
    setAppliedSelectionNames([]);
    setSelectionTotalsOnlyHint(false);
    setDirtyCells(new Set());
    setCellErrors({});
    setRuntimeErrorLogs([]);
    setLayoutOverride(null);
    setActiveLayoutVariantName(null);
    setColumnFilter({ fieldname: '__ALL__', operator: 'contains', value: '' });
    setFilterQuery('');
  }, [spec.id, spec.program_id]);

  // Effective Field Catalog & Layout options (combining simSpec + simulator Layout Variant)
  const effectiveFieldCatalog = useMemo(() => {
    if (!layoutOverride) return simSpec.field_catalog;
    const byName = new Map(simSpec.field_catalog.map((f) => [f.fieldname, f]));
    const ordered: AlvField[] = [];
    layoutOverride.visibleFields.forEach((fn) => {
      const f = byName.get(fn);
      if (f) ordered.push(f);
    });
    return ordered.length > 0 ? ordered : simSpec.field_catalog;
  }, [simSpec.field_catalog, layoutOverride]);

  const effectiveSubtotalField = layoutOverride?.subtotalField || null;
  const effectiveZebra = layoutOverride ? layoutOverride.zebra : !!simSpec.layout?.zebra;
  const effectiveNoHgrid = layoutOverride ? layoutOverride.no_hgridln : !!simSpec.layout?.no_hgridln;
  const effectiveNoVgrid = layoutOverride ? layoutOverride.no_vgridln : !!simSpec.layout?.no_vgridln;
  const effectiveTotalsOnly = selectionTotalsOnlyHint || !!simSpec.layout?.totals_only;
  const hasEditableFields = useMemo(
    () =>
      simSpec.field_catalog.some((f) => !!f.edit) ||
      !!simSpec.item_grid?.field_catalog?.some((f) => !!f.edit),
    [simSpec.field_catalog, simSpec.item_grid]
  );

  // Generate realistic mock data using Gemini AI via server-side endpoint with smart fallback
  const handleGenerateAiMockData = async () => {
    if (!simSpec.field_catalog || simSpec.field_catalog.length === 0) {
      setStatusMessage({
        text: t(
          'Warning: Field catalog is empty. Please configure fields first.',
          '경고: 필드 카탈로그가 비어 있습니다. 필드를 먼저 설정해 주세요.'
        ),
        type: 'W',
      });
      return;
    }

    setIsGeneratingMockData(true);
    setStatusMessage({
      text: t(
        'Requesting Gemini AI to generate realistic SAP records...',
        'Gemini AI에 SAP 샘플 데이터 생성을 요청 중입니다...'
      ),
      type: 'S',
    });

    try {
      const response = await authorizedFetch('/api/generate-mock-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_catalog: simSpec.field_catalog,
          module: simSpec.module,
          title: simSpec.title,
          business_purpose: simSpec.business_purpose,
          count: 5,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `Server error (${response.status})`);
      }
      if (data && Array.isArray(data.rows) && data.rows.length > 0) {
        setRows(data.rows);
        commitSimUpdate((prev) => ({
          ...prev,
          mock_rows: data.rows,
        }));
        setStatusMessage({
          text: t(
            `Success: Generated ${data.rows.length} realistic SAP records via Gemini AI.`,
            `완료: Gemini AI로 SAP 샘플 데이터 ${data.rows.length}건이 생성되었습니다.`
          ),
          type: 'S',
        });
        return;
      }
      throw new Error(data?.error || 'Empty response from AI server');
    } catch (err: any) {
      console.warn('AI mock data generation fallback:', err);
      // Deterministic realistic SAP fallback based on field catalog
      const fallbackRows = generateDeterministicSapMockRows(simSpec.field_catalog, 5);
      setRows(fallbackRows);
      commitSimUpdate((prev) => ({
        ...prev,
        mock_rows: fallbackRows,
      }));
      setStatusMessage({
        text: t(
          `Populated ${fallbackRows.length} realistic SAP records based on field catalog types.`,
          `필드 카탈로그 유형 기준으로 SAP 샘플 데이터 ${fallbackRows.length}건이 채워졌습니다.`
        ),
        type: 'S',
      });
    } finally {
      setIsGeneratingMockData(false);
    }
  };

  // Trigger AI Mock data generation when requested from TopNav
  const prevTriggerRef = useRef(mockDataTrigger);
  useEffect(() => {
    if (mockDataTrigger && mockDataTrigger > (prevTriggerRef.current || 0)) {
      handleGenerateAiMockData();
    }
    prevTriggerRef.current = mockDataTrigger;
  }, [mockDataTrigger]);

  // Sync rows when simSpec changes
  useEffect(() => {
    setRows(simSpec.mock_rows || []);
    if (simSpec.error_logs && simSpec.error_logs.length > 0) {
      setShowErrorLog(true);
    }
  }, [simSpec.mock_rows, simSpec.error_logs]);

  // Column Text Mode Toggle: Coltext <-> Fieldname (RFQ v1.09 Page 3)
  const handleToggleColumnText = () => {
    setColumnTextMode((prev) => {
      const next = prev === 'coltext' ? 'fieldname' : 'coltext';
      setStatusMessage({
        text: next === 'fieldname'
          ? t('ALV headers switched to technical fieldnames.', 'ALV 헤더를 기술 필드명(Fieldname)으로 전환했습니다.')
          : t('ALV headers switched to field catalog labels.', 'ALV 헤더를 필드 카탈로그 텍스트(Coltext)로 전환했습니다.'),
        type: 'S',
      });
      return next;
    });
  };

  // Column Selection Handlers (RFQ v1.10 Page 2):
  // Dragging across headers selects contiguous columns, Ctrl+Click toggles, Shift+Click ranges
  const handleColumnHeaderMouseDown = (fieldname: string, e: React.MouseEvent) => {
    e.preventDefault();
    const catalogFields = simSpec.field_catalog.map((f) => f.fieldname);

    // Single Click Header Sort (SGL_CLK_HD = 'X')
    if (simSpec.layout?.sgl_clk_hd && !e.ctrlKey && !e.shiftKey) {
      const fieldDef = simSpec.field_catalog.find((f) => f.fieldname === fieldname);
      if (!fieldDef?.sort_enable) {
        setStatusMessage({
          text: t(
            `Column [${fieldname}] cannot be sorted because ENABLE is unchecked in Sort settings.`,
            `정렬 설정에서 ENABLE이 해제되어 [${fieldname}] 컬럼을 정렬할 수 없습니다.`
          ),
          type: 'W',
        });
        return;
      }
      if (sortField === fieldname) {
        if (sortAsc) {
          setSortAsc(false);
          setSortColumns([{ fieldname, asc: false }]);
          setStatusMessage({
            text: t(`[SGL_CLK_HD] Sorted [${fieldname}] descending.`, `[SGL_CLK_HD] [${fieldname}] 내림차순 정렬됨.`),
            type: 'S',
          });
        } else {
          setSortField(null);
          setSortColumns([]);
          setStatusMessage({
            text: t(`[SGL_CLK_HD] Cleared sort on [${fieldname}].`, `[SGL_CLK_HD] [${fieldname}] 정렬이 해제되었습니다.`),
            type: 'S',
          });
        }
      } else {
        setSortField(fieldname);
        setSortAsc(true);
        setSortColumns([{ fieldname, asc: true }]);
        setStatusMessage({
          text: t(`[SGL_CLK_HD] Sorted [${fieldname}] ascending.`, `[SGL_CLK_HD] [${fieldname}] 오름차순 정렬됨.`),
          type: 'S',
        });
      }
    }

    // If SEL_MODE is 'B' (Row selection only), column selection is disabled
    if (simSpec.layout?.sel_mode === 'B') {
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      // Ctrl + Click: toggle individual column
      setSelectedColumnFields((prev) => {
        const next = prev.includes(fieldname)
          ? prev.filter((k) => k !== fieldname)
          : [...prev, fieldname];
        setStatusMessage({
          text: prev.includes(fieldname)
            ? t(`Column [${fieldname}] deselected (${next.length} selected).`, `컬럼 [${fieldname}] 선택 해제 (${next.length}개 선택됨).`)
            : t(`Column [${fieldname}] selected (${next.length} selected).`, `컬럼 [${fieldname}] 선택 (${next.length}개 선택됨).`),
          type: 'S',
        });
        return next;
      });
      lastClickedFieldRef.current = fieldname;
      dragAnchorFieldRef.current = fieldname;
      isDraggingColumnRef.current = false;
    } else if (e.shiftKey && lastClickedFieldRef.current) {
      // Shift + Click: select contiguous range from last clicked column
      const idx1 = catalogFields.indexOf(lastClickedFieldRef.current);
      const idx2 = catalogFields.indexOf(fieldname);
      if (idx1 !== -1 && idx2 !== -1) {
        const start = Math.min(idx1, idx2);
        const end = Math.max(idx1, idx2);
        const range = catalogFields.slice(start, end + 1);
        setSelectedColumnFields(range);
        setStatusMessage({
          text: t(
            `Selected column range: ${catalogFields[start]} - ${catalogFields[end]} (${range.length}).`,
            `컬럼 범위 선택됨: ${catalogFields[start]} - ${catalogFields[end]} (${range.length}개).`
          ),
          type: 'S',
        });
      }
      isDraggingColumnRef.current = false;
    } else {
      // Regular Click or Drag Start
      setSelectedColumnFields([fieldname]);
      lastClickedFieldRef.current = fieldname;
      dragAnchorFieldRef.current = fieldname;
      isDraggingColumnRef.current = true;
      setStatusMessage({
        text: t(
          `Column [${fieldname}] selected. Drag to multi-select or use toolbar sort/totals.`,
          `컬럼 [${fieldname}] 선택됨. 드래그하여 다중 선택하거나 툴바 정렬/합계를 사용하세요.`
        ),
        type: 'S',
      });
    }
  };

  const handleColumnHeaderMouseEnter = (fieldname: string) => {
    if (!isDraggingColumnRef.current || !dragAnchorFieldRef.current) return;
    const catalogFields = simSpec.field_catalog.map((f) => f.fieldname);
    const idx1 = catalogFields.indexOf(dragAnchorFieldRef.current);
    const idx2 = catalogFields.indexOf(fieldname);
    if (idx1 !== -1 && idx2 !== -1) {
      const start = Math.min(idx1, idx2);
      const end = Math.max(idx1, idx2);
      const range = catalogFields.slice(start, end + 1);
      setSelectedColumnFields(range);
    }
  };

  // Multi-column sorting helper
  const handleMultiSort = (fields: string[], asc: boolean) => {
    setSortColumns(fields.map((f) => ({ fieldname: f, asc })));
    setSortField(fields[0] || null);
    setSortAsc(asc);
  };

  // Column Width Optimization: gs_layo-cwidth_opt (RFQ v1.09 & v1.10 Page 1)
  const handleOptimizeWidth = () => {
    const nextVal = !isOptimizedWidth;
    setIsOptimizedWidth(nextVal);
    commitSimUpdate((prev) =>
      prev.layout
        ? {
            ...prev,
            layout: {
              ...prev.layout,
              cwidth_opt: nextVal,
            },
          }
        : prev
    );
    setStatusMessage({
      text: nextVal
        ? t('Column width optimization (cwidth_opt = X) enabled.', '컬럼 너비 최적화(cwidth_opt = X)가 활성화되었습니다.')
        : t('Column width optimization disabled (restored outputlen widths).', '컬럼 너비 최적화가 해제되었습니다(outputlen 너비 복원).'),
      type: 'S',
    });
  };

  // &TOTAL Button: Calculate total for selected column(s) (RFQ v1.10 Page 2)
  const handleToggleTotals = () => {
    if (selectedColumnFields.length > 0) {
      const allSummed = selectedColumnFields.every(
        (fname) => simSpec.field_catalog.find((f) => f.fieldname === fname)?.do_sum
      );
      const nextDoSum = !allSummed;
      commitSimUpdate((prev) => ({
        ...prev,
        field_catalog: prev.field_catalog.map((f) =>
          selectedColumnFields.includes(f.fieldname) ? { ...f, do_sum: nextDoSum } : f
        ),
      }));
      setShowTotals(true);
      setStatusMessage({
        text: nextDoSum
          ? t(
              `Totals (&TOTAL) enabled for ${selectedColumnFields.length} selected column(s).`,
              `선택된 ${selectedColumnFields.length}개 컬럼의 합계(&TOTAL)가 활성화되었습니다.`
            )
          : t(
              `Totals (&TOTAL) cleared for ${selectedColumnFields.length} selected column(s).`,
              `선택된 ${selectedColumnFields.length}개 컬럼의 합계(&TOTAL)가 해제되었습니다.`
            ),
        type: 'S',
      });
      return;
    }
    setShowTotals((prev) => !prev);
    setStatusMessage({
      text: !showTotals
        ? t('ALV totals row shown.', 'ALV 합계 행이 표시되었습니다.')
        : t('ALV totals row hidden.', 'ALV 합계 행이 숨겨졌습니다.'),
      type: 'S',
    });
  };

  // Visual character width helper to calculate tight, authentic SAP ALV column shrink widths (RFQ v1.10 Page 1)
  const getVisualWidth = (str: string) => {
    let w = 0;
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      // Hangul / CJK characters take ~12px
      if (
        (code >= 0x1100 && code <= 0x11ff) ||
        (code >= 0x3130 && code <= 0x318f) ||
        (code >= 0xac00 && code <= 0xd7af)
      ) {
        w += 12;
      } else {
        // ASCII, digits, punctuation take ~7.2px
        w += 7.2;
      }
    }
    return w;
  };

  // Calculate dynamic column width matching SAP ALV gs_layo-cwidth_opt
  const getColumnWidth = (field: AlvField, isItem = false) => {
    if (!isOptimizedWidth) {
      return Math.max(field.outputlen * 8 + 16, 45);
    }
    // Special compact width for icon / status / checkbox columns
    if (
      field.checkbox ||
      field.fieldname === 'ZICON' ||
      field.fieldname === 'LIGHTS' ||
      field.icon_type === 'LIGHTS' ||
      field.icon_type === 'DOC'
    ) {
      return 42;
    }

    const headerText =
      columnTextMode === 'fieldname' ? field.fieldname : field.coltext || field.fieldname;
    const targetRows = isItem ? itemRows : displayedRows;

    let maxVisual = getVisualWidth(headerText);
    const sampleLimit = Math.min(targetRows.length, 40);
    for (let i = 0; i < sampleLimit; i++) {
      const valStr = String(targetRows[i]?.[field.fieldname] ?? '');
      if (valStr) {
        const valWidth = getVisualWidth(valStr);
        if (valWidth > maxVisual) {
          maxVisual = valWidth;
        }
      }
    }
    // Also consider totals sum value if do_sum is active
    if (field.do_sum) {
      const sumVal = isItem ? itemTotals[field.fieldname] : totals[field.fieldname];
      if (sumVal !== undefined && sumVal !== null) {
        const sumStr = Number(sumVal || 0).toLocaleString();
        const sumWidth = getVisualWidth(sumStr);
        if (sumWidth > maxVisual) {
          maxVisual = sumWidth;
        }
      }
    }

    // Shrink tight to cell content and headers exactly matching content width (RFQ v1.12)
    return Math.max(Math.ceil(maxVisual + 20), 45);
  };

  // Find the Sta. (Status) field in Field Catalog
  const statusField = useMemo(() => {
    return simSpec.field_catalog.find(f =>
      f.fieldname === 'ZICON' ||
      f.fieldname === 'STATUS' ||
      f.fieldname === 'LIGHTS' ||
      f.coltext === '상태' ||
      f.coltext.toLowerCase().includes('sta') ||
      f.icon_type === 'DOC' ||
      f.icon_type === 'LIGHTS'
    );
  }, [simSpec.field_catalog]);

  // Calculate unique Sta. status counts dynamically from current grid rows
  const statusSummaries = useMemo<StatusSummary[]>(() => {
    if (!statusField) return [];
    const countsMap: Record<string, number> = {};

    rows.forEach(r => {
      const raw = r[statusField.fieldname];
      if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
        const val = String(raw).trim();
        countsMap[val] = (countsMap[val] || 0) + 1;
      }
    });

    return Object.entries(countsMap).map(([key, count]) => {
      let iconType: StatusSummary['iconType'] = 'OTHER';
      let label = key;

      if (key === 'DOC') {
        iconType = 'DOC';
        label = t('Doc', '문서');
      } else if (key === '1' || key.toLowerCase() === 'green') {
        iconType = 'GREEN';
        label = t('OK', '정상');
      } else if (key === '2' || key.toLowerCase() === 'yellow') {
        iconType = 'YELLOW';
        label = t('Pending', '대기');
      } else if (key === '3' || key.toLowerCase() === 'red') {
        iconType = 'RED';
        label = t('Error', '오류');
      } else if (key === 'FOLDER') {
        iconType = 'FOLDER';
        label = t('Folder', '폴더');
      }

      return {
        statusKey: key,
        count,
        label,
        iconType,
      };
    });
  }, [statusField, rows, t]);

  // Sorting
  const handleSort = (fieldname: string, asc = true) => {
    setSortColumns([{ fieldname, asc }]);
    setSortField(fieldname);
    setSortAsc(asc);
  };

  // Selection Screen Execution (F8): Obligatory check + Filter ALV Rows
  const handleExecuteSelection = () => {
    const validation = validateSelectionParams(simSpec.selection_params);
    if (!validation.valid) {
      setObligatoryErrorIds(validation.missingIds);
      setScreenMode('selection');
      setStatusMessage({
        text: t(
          `Fill out all required entry fields: ${validation.missingLabels.join(', ')}`,
          `필수 입력 필드를 모두 채워주세요: ${validation.missingLabels.join(', ')}`
        ),
        type: 'E',
      });
      return;
    }

    setObligatoryErrorIds([]);
    const result = filterRowsBySelectionParams(
      rows,
      simSpec.selection_params,
      simSpec.field_catalog
    );
    setIsSelectionFilterActive(true);
    setAppliedSelectionNames(result.appliedParams);
    setSelectionTotalsOnlyHint(result.summaryModeHint);
    setScreenMode('alv');
    setSelectedRowIndex(result.filteredRows.length > 0 ? 0 : null);
    setStatusMessage({
      text:
        result.appliedParams.length > 0
          ? t(
              `Executed (${result.appliedParams.join(', ')}): ${result.filteredRows.length} of ${rows.length} record(s) matched.`,
              `실행 완료 (${result.appliedParams.join(', ')}): 전체 ${rows.length}건 중 ${result.filteredRows.length}건 조회됨.`
            )
          : t(
              `Executed: ${rows.length} record(s) displayed.`,
              `실행 완료: ${rows.length}건 조회됨.`
            ),
      type: result.filteredRows.length === 0 && rows.length > 0 ? 'W' : 'S',
    });
  };

  // ALV Editable Data Check & Save Protocol
  const handleSaveAlvEdits = () => {
    const validation = validateAlvEdits(
      rows,
      simSpec.field_catalog,
      dirtyCells.size > 0 ? dirtyCells : undefined
    );
    if (validation.errors.length > 0) {
      setCellErrors(validation.cellErrors);
      setRuntimeErrorLogs(validation.errors);
      setShowErrorLog(true);
      setStatusMessage({
        text: t(
          `Validation failed: ${validation.errors.length} error(s) found. Check Error Log.`,
          `검증 실패: ${validation.errors.length}건의 오류가 발견되었습니다. 오류 로그를 확인하세요.`
        ),
        type: 'E',
      });
      return;
    }

    const updatedCount = dirtyCells.size;
    setCellErrors({});
    setRuntimeErrorLogs([]);
    setDirtyCells(new Set());
    setShowErrorLog(false);
    commitSimUpdate((prev) => ({ ...prev, mock_rows: rows }));
    setStatusMessage({
      text:
        updatedCount > 0
          ? t(
              `Data saved (${updatedCount} modified cell(s) committed).`,
              `데이터 저장 완료 (수정된 ${updatedCount}개 셀 반영).`
            )
          : t(
              'Data verified and saved (no validation errors).',
              '데이터 검증 및 저장 완료 (오류 없음).'
            ),
      type: 'S',
    });
  };

  // Toggle Group Subtotals (&SUBTOTAL)
  const handleToggleSubtotals = () => {
    if (effectiveSubtotalField) {
      setLayoutOverride((prev) => ({
        visibleFields: prev?.visibleFields || simSpec.field_catalog.map((f) => f.fieldname),
        subtotalField: null,
        zebra: prev?.zebra ?? !!simSpec.layout?.zebra,
        cwidth_opt: prev?.cwidth_opt ?? isOptimizedWidth,
        no_hgridln: prev?.no_hgridln ?? !!simSpec.layout?.no_hgridln,
        no_vgridln: prev?.no_vgridln ?? !!simSpec.layout?.no_vgridln,
      }));
      setStatusMessage({
        text: t(
          'ALV group subtotals cleared (Grand total only).',
          'ALV 그룹 소계가 해제되었습니다 (총합계만 표시).'
        ),
        type: 'S',
      });
      return;
    }

    const candidate =
      selectedColumnFields.find((fn) => {
        const f = simSpec.field_catalog.find((c) => c.fieldname === fn);
        return f && !f.do_sum && !f.checkbox;
      }) ||
      simSpec.field_catalog.find((f) => f.sort_enable && !f.do_sum)?.fieldname ||
      simSpec.field_catalog.find(
        (f) =>
          !f.do_sum &&
          !f.checkbox &&
          f.fieldname !== 'ZICON' &&
          f.fieldname !== 'LIGHTS' &&
          f.fieldname !== 'STATUS' &&
          !f.key
      )?.fieldname ||
      simSpec.field_catalog[0]?.fieldname;

    if (!candidate) return;

    handleMultiSort([candidate], true);
    setShowTotals(true);
    setLayoutOverride((prev) => ({
      visibleFields: prev?.visibleFields || simSpec.field_catalog.map((f) => f.fieldname),
      subtotalField: candidate,
      zebra: prev?.zebra ?? !!simSpec.layout?.zebra,
      cwidth_opt: prev?.cwidth_opt ?? isOptimizedWidth,
      no_hgridln: prev?.no_hgridln ?? !!simSpec.layout?.no_hgridln,
      no_vgridln: prev?.no_vgridln ?? !!simSpec.layout?.no_vgridln,
    }));
    const colLabel =
      simSpec.field_catalog.find((f) => f.fieldname === candidate)?.coltext || candidate;
    setStatusMessage({
      text: t(
        `Subtotals grouped by [${colLabel}] (${candidate}).`,
        `[${colLabel}] (${candidate}) 기준으로 소계가 그룹화되었습니다.`
      ),
      type: 'S',
    });
  };

  // Filter & Sorted rows
  const displayedRows = useMemo(() => {
    let result = [...rows];

    // 1. Selection Screen execution filter (when Execute F8 was run)
    if (isSelectionFilterActive) {
      result = filterRowsBySelectionParams(
        result,
        simSpec.selection_params,
        simSpec.field_catalog
      ).filteredRows;
    }

    // 2. Sta. status multi-select filter: only rows matching one of the selected statuses are shown
    if (statusField && selectedStatusFilters) {
      result = result.filter(row => {
        const val = String(row[statusField.fieldname] || '').trim();
        if (!val) return true;
        return selectedStatusFilters.includes(val);
      });
    }

    // 3. Column / Text Filter query
    const activeFilterVal = columnFilter.value.trim() || filterQuery.trim();
    if (activeFilterVal) {
      const q = activeFilterVal.toLowerCase();
      const targetCol = columnFilter.fieldname;
      const op = columnFilter.operator;
      result = result.filter((row) => {
        const candidates =
          targetCol && targetCol !== '__ALL__'
            ? [row[targetCol]]
            : Object.values(row);
        return candidates.some((v) => {
          const str = String(v ?? '').toLowerCase();
          if (op === 'equals') return str === q;
          if (op === 'gt') return Number(str.replace(/,/g, '')) > Number(q.replace(/,/g, ''));
          if (op === 'lt') return Number(str.replace(/,/g, '')) < Number(q.replace(/,/g, ''));
          return str.includes(q);
        });
      });
    }

    // 4. Column sort:
    if (sortColumns.length > 0) {
      result.sort((a, b) => {
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
    } else if (sortField) {
      result.sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortAsc ? valA - valB : valB - valA;
        }
        return sortAsc
          ? String(valA || '').localeCompare(String(valB || ''))
          : String(valB || '').localeCompare(String(valA || ''));
      });
    } else {
      // Pre-configured enabledSortFields from simSpec Sort tab
      const enabledSortFields = simSpec.field_catalog.filter(f => !!f.sort_enable);
      if (enabledSortFields.length > 0) {
        const sortedEnabledFields = [...enabledSortFields].sort((a, b) => {
          const sposA = typeof a.spos === 'number' && !isNaN(a.spos) ? a.spos : 999;
          const sposB = typeof b.spos === 'number' && !isNaN(b.spos) ? b.spos : 999;
          return sposA - sposB;
        });

        result.sort((a, b) => {
          for (const ef of sortedEnabledFields) {
            const valA = a[ef.fieldname];
            const valB = b[ef.fieldname];
            const isDesc = !!ef.sort_down;
            let cmp = 0;
            if (typeof valA === 'number' && typeof valB === 'number') {
              cmp = isDesc ? valB - valA : valA - valB;
            } else {
              cmp = isDesc
                ? String(valB ?? '').localeCompare(String(valA ?? ''))
                : String(valA ?? '').localeCompare(String(valB ?? ''));
            }
            if (cmp !== 0) return cmp;
          }
          return 0;
        });
      }
    }
    return result;
  }, [
    rows,
    isSelectionFilterActive,
    simSpec.selection_params,
    selectedStatusFilters,
    statusField,
    filterQuery,
    columnFilter,
    sortField,
    sortAsc,
    sortColumns,
    simSpec.field_catalog,
  ]);

  // Totals calculations for DO_SUM fields
  const totals = useMemo(() => {
    const sumMap: Record<string, number> = {};
    simSpec.field_catalog.forEach(f => {
      if (f.do_sum) {
        sumMap[f.fieldname] = displayedRows.reduce((acc, row) => {
          const val = Number(row[f.fieldname]) || 0;
          return acc + val;
        }, 0);
      }
    });
    return sumMap;
  }, [simSpec.field_catalog, displayedRows]);

  // Master-Detail ALV Resolution (Sample Type 02)
  const isMasterDetail = simSpec.sample_type === '02' && !!simSpec.item_grid;
  const foreignKey = simSpec.item_grid?.foreign_key || 'VBELN';
  const selectedHeaderRow =
    selectedRowIndex !== null && displayedRows[selectedRowIndex]
      ? displayedRows[selectedRowIndex]
      : displayedRows[0];
  const selectedHeaderKey = selectedHeaderRow
    ? selectedHeaderRow[foreignKey] || selectedHeaderRow.DOC_NO || selectedHeaderRow.VBELN
    : null;

  const [selectedItemRowIndex, setSelectedItemRowIndex] = useState<number | null>(0);

  const itemRows = useMemo(() => {
    if (!simSpec.item_grid?.mock_rows) return [];
    if (!selectedHeaderKey) return simSpec.item_grid.mock_rows;
    const filtered = simSpec.item_grid.mock_rows.filter(
      (r) => String(r[foreignKey] || '').trim() === String(selectedHeaderKey).trim()
    );
    return filtered.length > 0 ? filtered : simSpec.item_grid.mock_rows;
  }, [simSpec.item_grid?.mock_rows, foreignKey, selectedHeaderKey]);

  const [itemSortField, setItemSortField] = useState<string | null>(null);
  const [itemSortAsc, setItemSortAsc] = useState<boolean>(true);
  const [itemFilterQuery, setItemFilterQuery] = useState<string>('');
  const [showItemTotals, setShowItemTotals] = useState<boolean>(true);
  const [selectedItemStatusFilters, setSelectedItemStatusFilters] = useState<string[]>(['1', '2', '3', 'DOC']);

  const itemStatusField = useMemo(() => {
    return simSpec.item_grid?.field_catalog?.find(
      (f) => f.fieldname === 'ZICON' || f.fieldname === 'STATUS' || f.icon_type === 'LIGHTS'
    );
  }, [simSpec.item_grid?.field_catalog]);

  const itemStatusSummaries = useMemo<StatusSummary[]>(() => {
    if (!itemStatusField || !simSpec.item_grid?.mock_rows) return [];
    const countsMap: Record<string, number> = {};

    itemRows.forEach((r) => {
      const raw = r[itemStatusField.fieldname];
      const val = raw !== undefined && raw !== null ? String(raw).trim() : '';
      if (!val) return;
      countsMap[val] = (countsMap[val] || 0) + 1;
    });

    return Object.entries(countsMap).map(([key, count]) => {
      let iconType: StatusSummary['iconType'] = 'OTHER';
      let label = key;
      if (key === 'DOC') {
        iconType = 'DOC';
        label = t('Doc', '문서');
      } else if (key === '1' || key.toLowerCase() === 'green') {
        iconType = 'GREEN';
        label = t('OK', '정상');
      } else if (key === '2' || key.toLowerCase() === 'yellow') {
        iconType = 'YELLOW';
        label = t('Pending', '대기');
      } else if (key === '3' || key.toLowerCase() === 'red') {
        iconType = 'RED';
        label = t('Error', '오류');
      } else if (key === 'FOLDER') {
        iconType = 'FOLDER';
        label = t('Folder', '폴더');
      }
      return { statusKey: key, count, label, iconType };
    });
  }, [itemStatusField, itemRows, simSpec.item_grid?.mock_rows, t]);

  const displayedItemRows = useMemo(() => {
    let result = [...itemRows];

    if (itemStatusField && selectedItemStatusFilters.length > 0) {
      result = result.filter((row) => {
        const val = String(row[itemStatusField.fieldname] || '').trim();
        if (!val) return true;
        return selectedItemStatusFilters.includes(val);
      });
    }

    if (itemFilterQuery.trim()) {
      const q = itemFilterQuery.toLowerCase();
      result = result.filter((row) =>
        Object.values(row).some((v) => String(v).toLowerCase().includes(q))
      );
    }

    if (itemSortField) {
      result.sort((a, b) => {
        const va = a[itemSortField];
        const vb = b[itemSortField];
        if (typeof va === 'number' && typeof vb === 'number') {
          return itemSortAsc ? va - vb : vb - va;
        }
        return itemSortAsc
          ? String(va || '').localeCompare(String(vb || ''))
          : String(vb || '').localeCompare(String(va || ''));
      });
    }

    return result;
  }, [itemRows, itemStatusField, selectedItemStatusFilters, itemFilterQuery, itemSortField, itemSortAsc]);

  const handleExportItemCsv = () => {
    if (!simSpec.item_grid) return;
    const headers = simSpec.item_grid.field_catalog.map((f) => `"${f.coltext}"`).join(',');
    const dataRows = displayedItemRows.map((row) =>
      simSpec.item_grid!.field_catalog
        .map((f) => {
          const val = row[f.fieldname];
          return val !== undefined && val !== null ? `"${String(val).replace(/"/g, '""')}"` : '""';
        })
        .join(',')
    );
    const csvContent = '\uFEFF' + [headers, ...dataRows].join('\n');
    downloadFile(`${simSpec.program_id}_ITEMS.csv`, csvContent, 'text/csv;charset=utf-8;');
    setStatusMessage({ text: t('Item grid exported to CSV.', '품목 그리드가 CSV로 내보내졌습니다.'), type: 'S' });
  };

  const itemTotals = useMemo(() => {
    if (!simSpec.item_grid?.field_catalog) return {};
    const sumMap: Record<string, number> = {};
    simSpec.item_grid.field_catalog.forEach((f) => {
      if (f.do_sum) {
        sumMap[f.fieldname] = displayedItemRows.reduce((acc, row) => {
          const val = Number(row[f.fieldname]) || 0;
          return acc + val;
        }, 0);
      }
    });
    return sumMap;
  }, [simSpec.item_grid?.field_catalog, displayedItemRows]);

  // Cycle Sta. status on click to test dynamic button generation
  const handleCycleStatus = (rowIndex: number, fieldname: string) => {
    const targetRow = displayedRows[rowIndex] || rows[rowIndex];
    const realIndex = rows.indexOf(targetRow);
    const actualIdx = realIndex !== -1 ? realIndex : rowIndex;
    const current = String(rows[actualIdx]?.[fieldname] || '');
    let nextVal = '';
    if (current === '') nextVal = 'DOC';
    else if (current === 'DOC') nextVal = '1';
    else if (current === '1') nextVal = '2';
    else if (current === '2') nextVal = '3';
    else if (current === '3') nextVal = '';
    else nextVal = 'DOC';

    const updated = [...rows];
    updated[actualIdx] = { ...updated[actualIdx], [fieldname]: nextVal };
    setRows(updated);
    commitSimUpdate((prev) => ({ ...prev, mock_rows: updated }));
    setStatusMessage({
      text: t(
        `Row ${rowIndex + 1} Sta. updated to [${nextVal || 'None'}].`,
        `${rowIndex + 1}행 상태가 [${nextVal || '없음'}](으)로 변경되었습니다.`
      ),
      type: 'S',
    });
  };

  // Find Next cycling across displayedRows
  const handleFindInRows = (termOverride?: string) => {
    const q = (termOverride !== undefined ? termOverride : findTerm).trim().toLowerCase();
    if (!q) {
      setFilterModalState({ open: true, mode: 'find', target: 'header' });
      return;
    }
    setFindTerm(q);
    const matchingIndices = displayedRows
      .map((row, idx) =>
        Object.values(row).some((v) => String(v ?? '').toLowerCase().includes(q)) ? idx : -1
      )
      .filter((idx) => idx !== -1);

    if (matchingIndices.length === 0) {
      setStatusMessage({
        text: t(`No occurrences of "${q}" found.`, `"${q}"에 일치하는 항목을 찾을 수 없습니다.`),
        type: 'W',
      });
      return;
    }

    const nextPos = matchingIndices.findIndex((i) => i > findMatchIdx);
    const targetRowIdx = nextPos !== -1 ? matchingIndices[nextPos] : matchingIndices[0];
    setFindMatchIdx(targetRowIdx);
    setSelectedRowIndex(targetRowIdx);
    setStatusMessage({
      text: t(
        `Match found at row ${targetRowIdx + 1} (${matchingIndices.length} match(es) for "${q}").`,
        `${targetRowIdx + 1}행에서 일치 항목을 찾았습니다 ("${q}" 총 ${matchingIndices.length}건).`
      ),
      type: 'S',
    });
  };

  // Cell editing (tracks dirty cells & clears field error on re-edit)
  const handleCellEdit = (rowIndex: number, fieldname: string, newVal: any) => {
    const targetRow = displayedRows[rowIndex] || rows[rowIndex];
    const realIndex = rows.indexOf(targetRow);
    const idxToUpdate = realIndex !== -1 ? realIndex : rowIndex;
    const updated = [...rows];
    updated[idxToUpdate] = { ...updated[idxToUpdate], [fieldname]: newVal };
    setRows(updated);

    const cellKey = `${idxToUpdate}:${fieldname}`;
    setDirtyCells((prev) => {
      const next = new Set(prev);
      next.add(cellKey);
      return next;
    });
    if (cellErrors[cellKey]) {
      setCellErrors((prev) => {
        const next = { ...prev };
        delete next[cellKey];
        return next;
      });
    }
  };

  // Checkbox toggle (mapped cleanly from displayedRows index to underlying rows)
  const handleCheckboxToggle = (rowIndex: number) => {
    const targetRow = displayedRows[rowIndex] || rows[rowIndex];
    const realIndex = rows.indexOf(targetRow);
    const actualIdx = realIndex !== -1 ? realIndex : rowIndex;
    if (actualIdx < 0 || actualIdx >= rows.length) return;
    const updated = [...rows];
    updated[actualIdx] = {
      ...updated[actualIdx],
      CHECKBOX: !updated[actualIdx].CHECKBOX,
    };
    setRows(updated);
  };

  // Interactive Editable ALV / BAPI Custom Toolbar Execution Simulation
  const handleCustomToolbarAction = (btn: { function: string; text: string }) => {
    const fnUpper = (btn.function || '').toUpperCase();
    const label = btn.text || btn.function;

    const statusField =
      simSpec.field_catalog.find((f) =>
        ['ZICON', 'LIGHTS', 'STATUS'].includes(f.fieldname.toUpperCase())
      )?.fieldname ||
      (rows.some((r) => r.ZICON !== undefined)
        ? 'ZICON'
        : rows.some((r) => r.LIGHTS !== undefined)
        ? 'LIGHTS'
        : rows.some((r) => r.STATUS !== undefined)
        ? 'STATUS'
        : undefined);

    const messageField = simSpec.field_catalog.find((f) =>
      ['MSG', 'MESSAGE', 'STATUS_MSG', 'BAPI_MSG', 'ERR_MSG', 'REMARK'].includes(
        f.fieldname.toUpperCase()
      )
    )?.fieldname;

    if (fnUpper.includes('SAVE') && !statusField) {
      handleSaveAlvEdits();
      return;
    }

    const hasCheckboxCol = simSpec.field_catalog.some((f) => f.checkbox);
    let targetRealIndices: number[] = [];

    if (hasCheckboxCol) {
      rows.forEach((r, idx) => {
        if (r.CHECKBOX === true || r.CHECKBOX === 'X') {
          targetRealIndices.push(idx);
        }
      });
    }

    if (targetRealIndices.length === 0 && selectedRowIndex !== null && displayedRows[selectedRowIndex]) {
      const idx = rows.indexOf(displayedRows[selectedRowIndex]);
      if (idx !== -1) targetRealIndices.push(idx);
    }

    if (targetRealIndices.length === 0) {
      setStatusMessage({
        text: t(`[${label}] Check or select a row first.`, `[${label}] 먼저 행을 체크하거나 선택해 주세요.`),
        type: 'W',
      });
      return;
    }

    const isReset =
      fnUpper.includes('RESET') || fnUpper.includes('CANCEL') || fnUpper.includes('CLEAR');

    if (isReset) {
      const nextRows = rows.map((row, idx) => {
        if (!targetRealIndices.includes(idx)) return row;
        return {
          ...row,
          ...(statusField ? { [statusField]: '2' } : {}),
          ...(messageField ? { [messageField]: '' } : {}),
        };
      });
      setRows(nextRows);
      setCellErrors({});
      setRuntimeErrorLogs([]);
      setShowErrorLog(false);
      commitSimUpdate((prev) => ({ ...prev, mock_rows: nextRows }));
      setStatusMessage({
        text: t(
          `[${label}] Reset ${targetRealIndices.length} row(s) to Warning.`,
          `[${label}] ${targetRealIndices.length}건이 대기 상태로 초기화되었습니다.`
        ),
        type: 'S',
      });
      return;
    }

    // Validate editable values on target rows
    const validation = validateAlvEdits(rows, simSpec.field_catalog);
    const targetIndexSet = new Set(targetRealIndices);
    const failedRowIdxSet = new Set<number>();
    const rowFirstErrorMap = new Map<number, string>();

    const targetErrors: AlvErrorLog[] = [];
    Object.entries(validation.cellErrors).forEach(([cellKey, errMsg]) => {
      const colonIdx = cellKey.indexOf(':');
      const rIdx = Number(cellKey.slice(0, colonIdx));
      if (!Number.isNaN(rIdx) && targetIndexSet.has(rIdx)) {
        failedRowIdxSet.add(rIdx);
        if (!rowFirstErrorMap.has(rIdx)) {
          rowFirstErrorMap.set(rIdx, errMsg);
        }
      }
    });
    validation.errors.forEach((err) => {
      const m = err.id.match(/^err-(?:len-)?(\d+)-/);
      const rIdx = m ? Number(m[1]) : -1;
      if (targetIndexSet.has(rIdx)) {
        targetErrors.push(err);
      }
    });

    // Also check for blank required editable fields (excluding checkboxes/status/message)
    const editableTextFields = simSpec.field_catalog.filter(
      (f) =>
        f.edit &&
        !f.checkbox &&
        f.fieldname !== statusField &&
        f.fieldname !== messageField
    );
    const missingRequiredCellErrors: Record<string, string> = {};
    const extraLogs: AlvErrorLog[] = [];

    targetRealIndices.forEach((realIdx) => {
      editableTextFields.forEach((f) => {
        const raw = rows[realIdx]?.[f.fieldname];
        if (f.key && (raw === undefined || raw === null || String(raw).trim() === '')) {
          const msg = t(
            `Row ${realIdx + 1}: Required key field ${f.coltext || f.fieldname} is blank.`,
            `${realIdx + 1}행: 필수 키 필드 ${f.coltext || f.fieldname} 값이 비어 있습니다.`
          );
          missingRequiredCellErrors[`${realIdx}:${f.fieldname}`] = msg;
          failedRowIdxSet.add(realIdx);
          if (!rowFirstErrorMap.has(realIdx)) {
            rowFirstErrorMap.set(realIdx, msg);
          }
          extraLogs.push({
            id: `err-req-${realIdx}-${f.fieldname}`,
            type: 'E',
            col_name: f.coltext || f.fieldname,
            message: msg,
          });
        }
      });
    });

    const combinedLogs = [...targetErrors, ...extraLogs];
    if (combinedLogs.length > 0) {
      const nextRows = rows.map((row, idx) => {
        if (!targetIndexSet.has(idx)) return row;
        if (failedRowIdxSet.has(idx)) {
          return {
            ...row,
            ...(statusField ? { [statusField]: '3' } : {}),
            ...(messageField ? { [messageField]: rowFirstErrorMap.get(idx) || t('Validation error', '검증 오류') } : {}),
          };
        }
        return {
          ...row,
          ...(statusField ? { [statusField]: '1' } : {}),
          ...(messageField ? { [messageField]: `BAPI validated (${label})` } : {}),
        };
      });
      setRows(nextRows);
      setCellErrors({ ...validation.cellErrors, ...missingRequiredCellErrors });
      setRuntimeErrorLogs(combinedLogs);
      setShowErrorLog(true);
      setStatusMessage({
        text: t(
          `[${label}] ${combinedLogs.length} input/BAPI validation error(s). Check Error Log.`,
          `[${label}] 입력/BAPI 검증 오류 ${combinedLogs.length}건이 발생했습니다. 오류 로그를 확인하세요.`
        ),
        type: 'E',
      });
      return;
    }

    // Success: turn status light green ('1') and set processed message column
    const nextRows = rows.map((row, idx) => {
      if (!targetRealIndices.includes(idx)) return row;
      return {
        ...row,
        ...(statusField ? { [statusField]: '1' } : {}),
        ...(messageField ? { [messageField]: `BAPI processed (${label})` } : {}),
      };
    });
    setRows(nextRows);
    setCellErrors({});
    setRuntimeErrorLogs([]);
    setDirtyCells(new Set());
    setShowErrorLog(false);
    commitSimUpdate((prev) => ({ ...prev, mock_rows: nextRows }));
    setStatusMessage({
      text: t(
        `[${label}] (${btn.function}) ${targetRealIndices.length} row(s) processed (Status: OK).`,
        `[${label}] (${btn.function}) ${targetRealIndices.length}건 처리 완료 (상태: 정상).`
      ),
      type: 'S',
    });
  };

  // Export ALV to CSV / Excel
  const handleExportCsv = () => {
    const headers = simSpec.field_catalog.map(f => `"${f.coltext}"`).join(',');
    const dataRows = displayedRows.map(row => {
      return simSpec.field_catalog
        .map(f => {
          const val = row[f.fieldname];
          return val !== undefined && val !== null ? `"${String(val).replace(/"/g, '""')}"` : '""';
        })
        .join(',');
    });
    const csvContent = '\uFEFF' + [headers, ...dataRows].join('\n');
    downloadFile(`${simSpec.program_id}_DATA.csv`, csvContent, 'text/csv;charset=utf-8;');
    setStatusMessage({ text: t('ALV grid exported to CSV.', 'ALV 그리드가 CSV로 내보내졌습니다.'), type: 'S' });
  };

  // Render Sta. Icon in Toolbar or Cell
  const renderStatusIcon = (iconType: StatusSummary['iconType']) => {
    if (iconType === 'DOC') {
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-slate-700 fill-white stroke-slate-700 stroke-1 drop-shadow-2xs">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    }
    if (iconType === 'GREEN') {
      return <span className="w-3 h-3 rounded-full bg-emerald-500 border border-emerald-700 shadow-xs inline-block" />;
    }
    if (iconType === 'YELLOW') {
      return <span className="w-3 h-3 rounded-full bg-amber-400 border border-amber-600 shadow-xs inline-block" />;
    }
    if (iconType === 'RED') {
      return <span className="w-3 h-3 rounded-full bg-rose-500 border border-rose-700 shadow-xs inline-block" />;
    }
    if (iconType === 'FOLDER') {
      return (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-[#f6c342] stroke-[#c98e16] stroke-1 drop-shadow-2xs">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    }
    return <span className="text-[10px] font-bold text-slate-700 font-mono">●</span>;
  };

  return (
    <div className={`flex flex-col h-full rounded-xl overflow-hidden shadow-xl font-sans select-none relative border transition-colors duration-200 ${themeStyles.containerBg} ${themeStyles.containerBorder}`}>
      {/* 1. SAP GUI Titlebar with Dynamic Theme */}
      <div
        className={`flex items-center justify-between px-3 py-1.5 border-b shadow-xs transition-colors duration-200 ${themeStyles.titleBarBorder}`}
        style={themeStyles.titleBarStyle}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Layers className={`w-4 h-4 shrink-0 opacity-90 ${themeStyles.titleBarText}`} aria-hidden="true" />
          <span className={`font-bold italic text-sm tracking-tight drop-shadow-xs truncate ${themeStyles.titleBarText}`}>
            {simSpec.title}
          </span>
        </div>

        <div className={`flex items-center gap-2 text-xs font-medium ${themeStyles.titleBarSubtext}`}>
          <span className="font-mono text-[11px] opacity-90">[{simSpec.program_id}]</span>
          <span className="opacity-40">|</span>
          <span>{simSpec.target_sap_release}</span>
        </div>
      </div>

      {/* 2. Standard Application Sub-Toolbar with Execute (F8), Save Edits & Active Filter Indicator */}
      <div className={`flex items-center justify-between px-3 py-1 border-b gap-2 flex-nowrap overflow-x-auto transition-colors duration-200 ${themeStyles.subToolbarBg} ${themeStyles.subToolbarBorder} ${themeStyles.subToolbarText}`}>
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          {/* SAP Iconic Clock with Green Checkmark (Execute F8 / Back F3) */}
          <button
            type="button"
            onClick={() => {
              if (screenMode === 'selection') {
                handleExecuteSelection();
              } else {
                setScreenMode('selection');
                setStatusMessage({ text: t('Switched to Selection Screen (F3).', '조회 조건 화면(F3)으로 전환되었습니다.'), type: 'S' });
              }
            }}
            title={screenMode === 'alv' ? t('Go to Selection Screen (F3)', '조회 조건 화면으로 이동 (F3)') : t('Execute (F8)', '실행 (F8)')}
            className="p-1 rounded bg-[#e8f1fa] hover:bg-white border border-[#9bbadb] text-slate-700 shadow-2xs flex items-center justify-center cursor-pointer shrink-0"
          >
            <div className="relative w-4 h-4 flex items-center justify-center">
              <div className="w-3.5 h-3.5 rounded-full border border-slate-600 bg-white" />
              <Check className="w-4 h-4 text-emerald-600 font-extrabold absolute -top-0.5 -right-0.5 drop-shadow-xs" strokeWidth={3.5} />
            </div>
          </button>

          {/* SAP Save / Validate Data button (Visible when editable fields exist or dirty cells exist) */}
          {screenMode === 'alv' && (hasEditableFields || dirtyCells.size > 0) && (
            <button
              type="button"
              onClick={handleSaveAlvEdits}
              title={
                dirtyCells.size > 0
                  ? t(`Validate & save ${dirtyCells.size} modified cell(s) (Ctrl+S)`, `수정된 ${dirtyCells.size}개 셀 검증 및 저장 (Ctrl+S)`)
                  : t('Validate & save grid edits', '그리드 편집 내용 검증 및 저장')
              }
              className={`px-2 py-0.5 rounded border text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-all shadow-2xs whitespace-nowrap shrink-0 ${
                dirtyCells.size > 0
                  ? 'bg-amber-100 border-amber-500 text-amber-900 hover:bg-amber-200'
                  : 'bg-white border-[#9bbadb] text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Save className={`w-3.5 h-3.5 ${dirtyCells.size > 0 ? 'text-amber-700' : 'text-blue-700'}`} />
              <span>{t('Save', '저장')}{dirtyCells.size > 0 ? ` (${dirtyCells.size})` : ''}</span>
            </button>
          )}

          {/* Checked Row Count Indicator when Checkbox Column Exists */}
          {screenMode === 'alv' && simSpec.field_catalog.some((f) => f.checkbox) && (
            <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-[10px] font-mono tabular-nums text-slate-700 whitespace-nowrap shrink-0">
              {rows.filter((r) => r.CHECKBOX === true || r.CHECKBOX === 'X').length} {t('selected', '건 선택')}
            </span>
          )}

          {/* Active Selection Screen Filter Indicator (Compact chip with tooltip) */}
          {screenMode === 'alv' && isSelectionFilterActive && (
            <div
              className="flex items-center gap-1 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded text-[10px] text-emerald-900 font-mono tabular-nums whitespace-nowrap shrink-0"
              title={t(
                `Active filters: ${appliedSelectionNames.length > 0 ? appliedSelectionNames.join(', ') : 'All'} (${displayedRows.length}/${rows.length})`,
                `적용된 필터: ${appliedSelectionNames.length > 0 ? appliedSelectionNames.join(', ') : '전체'} (${displayedRows.length}/${rows.length})`
              )}
            >
              <span>
                {t('Filter', '필터')} {displayedRows.length}/{rows.length}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsSelectionFilterActive(false);
                  setAppliedSelectionNames([]);
                  setSelectionTotalsOnlyHint(false);
                  setStatusMessage({ text: t('Selection screen filter cleared. Showing all rows.', '조회 조건 필터가 해제되어 전체 행을 표시합니다.'), type: 'S' });
                }}
                title={t('Clear Selection Filter', '조회 조건 필터 해제')}
                className="text-emerald-700 hover:text-red-700 font-bold cursor-pointer leading-none"
              >
                ×
              </button>
            </div>
          )}

          {/* Active Layout Variant Badge */}
          {screenMode === 'alv' && activeLayoutVariantName && activeLayoutVariantName !== '/STANDARD' && (
            <span
              className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-[10px] font-mono text-blue-800 whitespace-nowrap shrink-0"
              title={t(`Active ALV Layout Variant: ${activeLayoutVariantName}`, `적용된 ALV 레이아웃 변형: ${activeLayoutVariantName}`)}
            >
              {activeLayoutVariantName}
            </span>
          )}
        </div>

        {/* View Switcher: Selection vs ALV Grid */}
        <div className={`flex items-center gap-0.5 p-0.5 rounded border transition-colors duration-200 shrink-0 ${themeStyles.switcherContainerBg}`}>
          <button
            type="button"
            onClick={() => setScreenMode('selection')}
            title={t('Selection Screen', '조회 조건 화면')}
            className={`px-2 py-0.5 text-[11px] rounded transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              screenMode === 'selection'
                ? `${themeStyles.switcherActiveBg} font-semibold shadow-xs`
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>{t('Selection', '조회 조건')}</span>
          </button>
          <button
            type="button"
            onClick={() => setScreenMode('alv')}
            title={t('Main ALV Screen', '메인 ALV 화면')}
            className={`px-2 py-0.5 text-[11px] rounded transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              screenMode === 'alv'
                ? `${themeStyles.switcherActiveBg} font-semibold shadow-xs`
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3 h-3 text-blue-700" />
            <span>{t('Main ALV', '메인 ALV')}</span>
          </button>
        </div>
      </div>

      {/* 3. Authentic SAP ALV Toolbar with Dynamic Theme (Omitted for Sample Type 03 where it belongs to ALV Grid pane) */}
      {screenMode === 'alv' && !simSpec.layout?.no_toolbar && simSpec.sample_type !== '03' && (
        <AlvToolbar
          spec={simSpec}
          theme={currentTheme}
          statusSummaries={statusSummaries}
          selectedStatusFilters={selectedStatusFilters}
          onToggleStatusFilter={handleToggleStatusFilter}
          onOpenDetail={() => setIsDetailModalOpen(true)}
          onSort={(asc) => {
            const rawTargets = selectedColumnFields.length > 0
              ? selectedColumnFields
              : [sortField || simSpec.field_catalog[1]?.fieldname || simSpec.field_catalog[0]?.fieldname || ''].filter(Boolean);
            
            if (rawTargets.length === 0) {
              setStatusMessage({
                text: t('Select a column header first to sort.', '정렬할 컬럼 헤더를 먼저 선택하세요.'),
                type: 'W',
              });
              return;
            }

            handleMultiSort(rawTargets, asc);
            setStatusMessage({
              text: t(
                `Sorted by ${rawTargets.join(', ')} (${asc ? 'Ascending' : 'Descending'}).`,
                `${rawTargets.join(', ')} 기준으로 정렬되었습니다 (${asc ? '오름차순' : '내림차순'}).`
              ),
              type: 'S',
            });
          }}
          onFind={() => setFilterModalState({ open: true, mode: 'find', target: 'header' })}
          onFindNext={() => handleFindInRows()}
          onFilter={() => setFilterModalState({ open: true, mode: 'filter', target: 'header' })}
          filterQuery={columnFilter.value || filterQuery}
          onClearFilter={() => {
            setFilterQuery('');
            setColumnFilter({ fieldname: '__ALL__', operator: 'contains', value: '' });
            setStatusMessage({ text: t('ALV Grid filter cleared.', 'ALV 그리드 필터가 해제되었습니다.'), type: 'S' });
          }}
          onToggleTotals={handleToggleTotals}
          onToggleSubtotals={handleToggleSubtotals}
          onOpenLayout={() => setIsLayoutModalOpen(true)}
          onOpenGraphic={() => setIsGraphicModalOpen(true)}
          onToggleColumnText={handleToggleColumnText}
          onOptimizeWidth={handleOptimizeWidth}
          onExport={handleExportCsv}
          onPrint={() => window.print()}
          onInfo={() =>
            setStatusMessage({
              text: `Program ID: ${simSpec.program_id} | T-Code: ${simSpec.tcode} | Author: ${simSpec.author} | Module: ${simSpec.module}`,
              type: 'S',
            })
          }
          onCustomAction={(btn) => handleCustomToolbarAction(btn)}
          onGenerateMockData={handleGenerateAiMockData}
          isGeneratingMockData={isGeneratingMockData}
        />
      )}

      {/* 4. Main Body: ALV Grid or Selection Screen */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white relative">
        {screenMode === 'selection' ? (
          /* Selection Screen with Variant Bar, F4 Value Help, Titled Frame Boxes, Radio Groups & Execute F8 */
          <div
            onKeyDown={(e) => {
              if (e.key === 'F8') {
                e.preventDefault();
                handleExecuteSelection();
              }
            }}
            className={`flex-1 p-5 overflow-y-auto space-y-4 transition-colors duration-200 ${themeStyles.selectionBoxBg}`}
          >
            {/* Compact SAP Selection Variant & Action Bar */}
            <div className="max-w-2xl flex items-center justify-between gap-2 flex-wrap bg-white border border-slate-300 rounded px-3 py-1.5 shadow-2xs text-xs">
              <div className="flex items-center gap-2">
                <Bookmark className="w-3.5 h-3.5 text-blue-700" />
                <span className="font-semibold text-slate-700">{t('Variant:', '변형(Variant):')}</span>
                <select
                  value={activeVariantName}
                  onChange={(e) => {
                    const name = e.target.value;
                    setActiveVariantName(name);
                    if (!name) return;
                    const found = selectionVariants.find((v) => v.name === name);
                    if (found) {
                      commitSimUpdate((prev) => ({
                        ...prev,
                        selection_params: prev.selection_params.map((p) => {
                          const saved = found.values[p.name];
                          return saved
                            ? {
                                ...p,
                                low: saved.low ?? '',
                                high: saved.high ?? '',
                                multi_values: saved.multi_values || [],
                              }
                            : p;
                        }),
                      }));
                      setObligatoryErrorIds([]);
                      setStatusMessage({
                        text: t(`Selection Variant [${found.name}] loaded.`, `조회 변형 [${found.name}]을 불러왔습니다.`),
                        type: 'S',
                      });
                    }
                  }}
                  className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-mono min-w-[140px]"
                >
                  <option value="">{t('-- Select Variant --', '-- 변형 선택 --')}</option>
                  {selectionVariants.map((v) => (
                    <option key={v.id} value={v.name}>
                      {v.name} ({v.updatedAt})
                    </option>
                  ))}
                </select>
                {activeVariantName && (
                    <button
                      type="button"
                      onClick={async () => {
                        const found = selectionVariants.find((v) => v.name === activeVariantName);
                        if (!found) return;
                        const confirmed = await confirmDelete({
                          title: t('Delete Selection Variant', '조회 변형 삭제'),
                          message: t('Are you sure you want to delete this variant?', '삭제하시겠습니까?'),
                          targetName: found.name,
                        });
                        if (!confirmed) return;
                        const next = deleteSelectionVariant(simSpec.program_id, found.id);
                        setSelectionVariants(next);
                        setActiveVariantName('');
                        setStatusMessage({
                          text: t(`Variant [${found.name}] deleted.`, `변형 [${found.name}]이 삭제되었습니다.`),
                          type: 'S',
                        });
                      }}
                      title={t('Delete Selected Variant', '선택한 변형 삭제')}
                      className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                    >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {isSavingVariant ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={variantNameDraft}
                      onChange={(e) => setVariantNameDraft(e.target.value)}
                      placeholder="/CUS_VAR1"
                      autoFocus
                      className="w-28 border border-blue-400 rounded px-1.5 py-0.5 text-xs font-mono uppercase focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const raw = (variantNameDraft.trim() || '/VAR_01').toUpperCase();
                        const name = raw.startsWith('/') ? raw : `/${raw}`;
                        const values: SelectionVariant['values'] = {};
                        simSpec.selection_params.forEach((p) => {
                          values[p.name] = {
                            low: p.low,
                            high: p.high,
                            multi_values: p.multi_values,
                          };
                        });
                        const next = saveSelectionVariant(simSpec.program_id, {
                          id: `selvar-${Date.now()}`,
                          name,
                          updatedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                          values,
                        });
                        setSelectionVariants(next);
                        setActiveVariantName(name);
                        setIsSavingVariant(false);
                        setVariantNameDraft('');
                        setStatusMessage({
                          text: t(`Selection Variant [${name}] saved.`, `조회 변형 [${name}]이 저장되었습니다.`),
                          type: 'S',
                        });
                      }}
                      className="px-2 py-0.5 bg-blue-600 text-white rounded text-[11px] font-semibold cursor-pointer"
                    >
                      {t('Save', '저장')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSavingVariant(false);
                        setVariantNameDraft('');
                      }}
                      className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] cursor-pointer"
                    >
                      {t('Cancel', '취소')}
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsSavingVariant(true)}
                      title={t('Save Current Values as Variant', '현재 값을 변형으로 저장')}
                      className="px-2 py-0.5 bg-slate-50 hover:bg-blue-50 border border-slate-300 rounded text-[11px] font-medium text-slate-700 flex items-center gap-1 cursor-pointer"
                    >
                      <Save className="w-3 h-3 text-blue-700" />
                      <span>{t('Save Variant', '변형 저장')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        commitSimUpdate((prev) => ({
                          ...prev,
                          selection_params: prev.selection_params.map((p) => ({
                            ...p,
                            low:
                              p.kind === 'RADIOBUTTON' || p.kind === 'CHECKBOX'
                                ? p.default_val?.toUpperCase() === 'X'
                                  ? 'X'
                                  : ''
                                : p.default_val && p.default_val !== 'SY-DATUM'
                                ? p.default_val
                                : '',
                            high: '',
                            multi_values: [],
                          })),
                        }));
                        setActiveVariantName('');
                        setObligatoryErrorIds([]);
                        setStatusMessage({ text: t('Selection screen reset to default values.', '조회 조건이 기본값으로 초기화되었습니다.'), type: 'S' });
                      }}
                      title={t('Reset Selection Values to Defaults', '조회 조건 기본값으로 초기화')}
                      className="p-1 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded text-slate-600 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {(() => {
              type RenderSegment =
                | { type: 'box'; key: string; blockId: string; blockTitle: string; items: SelectionParameter[] }
                | { type: 'unboxed'; key: string; items: SelectionParameter[] };

              const segments: RenderSegment[] = [];
              const boxLookup = new Map<string, Extract<RenderSegment, { type: 'box' }>>();

              simSpec.selection_params.forEach((p, idx) => {
                const rawTitle = p.block_title?.trim() || '';
                const rawId = p.block_id?.trim() || '';
                if (rawTitle || rawId) {
                  const mapKey = rawId || `title_${rawTitle}`;
                  let seg = boxLookup.get(mapKey);
                  if (!seg) {
                    seg = {
                      type: 'box',
                      key: mapKey,
                      blockId: rawId || `b${boxLookup.size + 1}`,
                      blockTitle: rawTitle || rawId,
                      items: [],
                    };
                    boxLookup.set(mapKey, seg);
                    segments.push(seg);
                  }
                  seg.items.push(p);
                } else {
                  const last = segments[segments.length - 1];
                  if (last && last.type === 'unboxed') {
                    last.items.push(p);
                  } else {
                    segments.push({ type: 'unboxed', key: `unboxed_${idx}`, items: [p] });
                  }
                }
              });

              const isRadioChecked = (param: SelectionParameter): boolean => {
                if (param.kind !== 'RADIOBUTTON') return false;
                const grp = (param.radio_group || 'R1').toUpperCase();
                const groupPeers = simSpec.selection_params.filter(
                  (x) => x.kind === 'RADIOBUTTON' && (x.radio_group || 'R1').toUpperCase() === grp
                );
                const anyExplicitLow = groupPeers.some((x) => x.low === 'X');
                if (anyExplicitLow) {
                  return param.low === 'X';
                }
                const anyDefault = groupPeers.some((x) => x.default_val?.toUpperCase() === 'X');
                if (anyDefault) {
                  return param.default_val?.toUpperCase() === 'X';
                }
                return groupPeers[0]?.id === param.id;
              };

              const handleSelectRadio = (param: SelectionParameter) => {
                const grp = (param.radio_group || 'R1').toUpperCase();
                commitSimUpdate((prev) => ({
                  ...prev,
                  selection_params: prev.selection_params.map((p) => {
                    if (p.kind === 'RADIOBUTTON' && (p.radio_group || 'R1').toUpperCase() === grp) {
                      return { ...p, low: p.id === param.id ? 'X' : '' };
                    }
                    return p;
                  }),
                }));
              };

              const renderParamRow = (param: SelectionParameter) => {
                if (param.kind === 'RADIOBUTTON') {
                  const grp = (param.radio_group || 'R1').toUpperCase();
                  const checked = isRadioChecked(param);
                  return (
                    <div key={param.id} className="flex items-center text-xs gap-2.5 pl-4">
                      <label className="flex items-center gap-2 cursor-pointer select-none group">
                        <input
                          type="radio"
                          name={`sap_radio_${grp}`}
                          checked={checked}
                          onChange={() => handleSelectRadio(param)}
                          className="w-3.5 h-3.5 accent-blue-700 cursor-pointer"
                        />
                        <span className={`font-medium ${checked ? 'text-slate-900 font-semibold' : 'text-slate-700 group-hover:text-slate-900'}`}>
                          {param.text}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          ({param.name} · {grp})
                        </span>
                      </label>
                    </div>
                  );
                }

                if (param.kind === 'CHECKBOX') {
                  const checked =
                    param.low !== undefined ? param.low === 'X' : param.default_val?.toUpperCase() === 'X';
                  return (
                    <div key={param.id} className="flex items-center text-xs gap-2.5 pl-4">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const nextVal = e.target.checked ? 'X' : '';
                            commitSimUpdate((prev) => ({
                              ...prev,
                              selection_params: prev.selection_params.map((p) =>
                                p.id === param.id ? { ...p, low: nextVal } : p
                              ),
                            }));
                          }}
                          className="w-3.5 h-3.5 accent-blue-700 rounded cursor-pointer"
                        />
                        <span className="font-medium text-slate-800">{param.text}</span>
                      </label>
                    </div>
                  );
                }

                const hasMissingError = obligatoryErrorIds.includes(param.id);
                const multiCount = param.multi_values?.length || 0;

                return (
                  <div key={param.id} className="flex items-center text-xs gap-3">
                    <div className="w-48 text-right font-medium text-slate-700 flex items-center justify-end gap-1 shrink-0">
                      {param.obligatory && <span className="text-red-600 font-bold">*</span>}
                      <span>{param.text}</span>
                    </div>

                    <div className="flex items-center gap-1 flex-wrap">
                      <div className="relative flex items-center">
                        <input
                          type="text"
                          value={param.low || ''}
                          onChange={(e) => {
                            const nextVal = e.target.value;
                            if (hasMissingError) {
                              setObligatoryErrorIds((prev) => prev.filter((id) => id !== param.id));
                            }
                            commitSimUpdate((prev) => ({
                              ...prev,
                              selection_params: prev.selection_params.map((p) =>
                                p.id === param.id ? { ...p, low: nextVal } : p
                              ),
                            }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'F4') {
                              e.preventDefault();
                              setF4Target({ param, side: 'low' });
                            }
                          }}
                          placeholder={param.default_val || ''}
                          className={`w-32 bg-white border pl-2 pr-6 py-0.5 text-xs font-mono focus:outline-none shadow-inner ${
                            hasMissingError
                              ? 'border-red-600 ring-1 ring-red-500 bg-red-50/40'
                              : 'border-slate-400 focus:border-blue-600'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setF4Target({ param, side: 'low' })}
                          title={t('F4 Input Help', 'F4 입력 도움말')}
                          className="absolute right-0.5 p-0.5 text-slate-400 hover:text-blue-700 cursor-pointer"
                        >
                          <Search className="w-3 h-3" />
                        </button>
                      </div>
                      {param.kind === 'SELECT_OPTION' && (
                        <>
                          <span className="text-slate-500">~</span>
                          <div className="relative flex items-center">
                            <input
                              type="text"
                              value={param.high || ''}
                              onChange={(e) => {
                                const nextVal = e.target.value;
                                commitSimUpdate((prev) => ({
                                  ...prev,
                                  selection_params: prev.selection_params.map((p) =>
                                    p.id === param.id ? { ...p, high: nextVal } : p
                                  ),
                                }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'F4') {
                                  e.preventDefault();
                                  setF4Target({ param, side: 'high' });
                                }
                              }}
                              placeholder={t('To', '종료값')}
                              className="w-32 bg-white border border-slate-400 pl-2 pr-6 py-0.5 text-xs font-mono focus:outline-none focus:border-blue-600 shadow-inner"
                            />
                            <button
                              type="button"
                              onClick={() => setF4Target({ param, side: 'high' })}
                              title={t('F4 Input Help', 'F4 입력 도움말')}
                              className="absolute right-0.5 p-0.5 text-slate-400 hover:text-blue-700 cursor-pointer"
                            >
                              <Search className="w-3 h-3" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveParamForMulti(param)}
                            title={
                              multiCount > 0
                                ? t(`Multiple Selection (${multiCount} condition(s) active)`, `다중 선택 (${multiCount}개 조건 적용됨)`)
                                : t('Multiple Selection (Single / Ranges / Exclude)', '다중 선택 (단일값 / 범위 / 제외)')
                            }
                            className={`px-2 py-0.5 border font-bold text-xs cursor-pointer transition-colors ${
                              multiCount > 0
                                ? 'bg-emerald-100 border-emerald-600 text-emerald-800 hover:bg-emerald-200'
                                : 'bg-[#ece9d8] border-slate-400 hover:bg-white text-emerald-700'
                            }`}
                          >
                            ▶{multiCount > 0 ? ` ${multiCount}` : ''}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              };

              if (segments.length === 0) {
                return (
                  <div className={`border rounded p-6 shadow-xs max-w-2xl bg-white text-center text-xs text-slate-500 ${themeStyles.selectionBoxBorder}`}>
                    {t('No selection parameters defined. Add items in the Selection Screen tab.', '정의된 조회 조건이 없습니다. Selection Screen 탭에서 항목을 추가하세요.')}
                  </div>
                );
              }

              return (
                <>
                  {segments.map((seg, segIdx) =>
                    seg.type === 'box' ? (
                      <fieldset
                        key={seg.key}
                        className={`border rounded p-4 pt-2.5 shadow-xs max-w-2xl bg-white ${themeStyles.selectionBoxBorder}`}
                      >
                        <legend className="px-2 text-xs font-bold text-slate-800 flex items-center gap-2">
                          <span>{seg.blockTitle}</span>
                          <span className="font-mono text-[10px] font-normal text-slate-400">
                            BLOCK {seg.blockId.toUpperCase()}
                          </span>
                        </legend>
                        <div className="space-y-2.5 mt-1">{seg.items.map(renderParamRow)}</div>
                      </fieldset>
                    ) : (
                      <div key={seg.key || `unboxed-${segIdx}`} className="max-w-2xl px-4 py-2 space-y-2.5">
                        {seg.items.map(renderParamRow)}
                      </div>
                    )
                  )}

                  {/* Execute (F8) Action Bar inside Selection Screen */}
                  <div className="max-w-2xl flex items-center justify-between pt-1">
                    <span className="text-[11px] text-slate-500">
                      {t('Tip: Press', '팁: 입력란에서')}{' '}
                      <kbd className="px-1 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px]">F4</kbd>{' '}
                      {t('inside inputs for value help, or', '키로 값 도움말을 열거나')}{' '}
                      <kbd className="px-1 py-0.5 bg-white border border-slate-300 rounded font-mono text-[10px]">F8</kbd>{' '}
                      {t('to execute.', '키로 실행할 수 있습니다.')}
                    </span>
                    <button
                      type="button"
                      onClick={handleExecuteSelection}
                      className="px-3.5 py-1.5 bg-[#e8f1fa] hover:bg-white border border-[#9bbadb] text-slate-800 font-bold text-xs rounded shadow-2xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600" />
                      <span>{t('Execute (F8)', '실행 (F8)')}</span>
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        ) : (
          /* ALV Grid Container: Master-Detail Split or Single ALV or 04 Pivot Browser */
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {simSpec.sample_type === '04' ? (
              <SapPivotBrowser
                spec={simSpec}
                theme={currentTheme}
                onDrilldown={(tcode, val) => {
                  setDrilldownInfo({
                    tcode,
                    fieldValue: val,
                    fieldName: 'HKONT',
                    fieldLabel: 'G/L Account',
                    rowRecord: { HKONT: val },
                  });
                }}
              />
            ) : simSpec.sample_type === '03' ? (
              <SapTreeAlvSimulator
                spec={simSpec}
                theme={currentTheme}
                onDrilldown={(tcode, val) => {
                  setDrilldownInfo({
                    tcode,
                    fieldValue: val,
                    fieldName: 'CARRID',
                    fieldLabel: 'Carrier ID',
                    rowRecord: { CARRID: val },
                  });
                }}
              />
            ) : isMasterDetail && simSpec.item_grid ? (
              /* ============================================================= */
              /* MASTER-DETAIL ALV: TOP (HEADER) + BOTTOM (ITEM) PANE           */
              /* ============================================================= */
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* 1. TOP PANE: Header ALV Grid */}
                <div className="flex-[5] flex flex-col overflow-hidden border-b-2 border-[#9bbadb]">
                  {/* Header Grid Titlebar */}
                  <div className="bg-[#e4edf7] px-3 py-1.5 border-b border-[#9bbadb] text-xs font-bold text-slate-800 flex items-center justify-between shadow-2xs shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Table className="w-3.5 h-3.5 text-blue-800" />
                      <span>{simSpec.layout?.grid_title || t('Header ALV Grid', '헤더 ALV 그리드')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-slate-600 font-normal">
                      <span>SEL_MODE: {simSpec.layout?.sel_mode || 'A'}</span>
                      <span>|</span>
                      <span>{t('Total', '전체')}: {displayedRows.length}</span>
                      <span>|</span>
                      <span className="font-bold text-blue-800">{t('Selected', '선택')}: {selectedHeaderKey || '-'}</span>
                    </div>
                  </div>

                  {/* Header Grid Table */}
                  <div className="flex-1 overflow-auto bg-white">
                    <table className={`${isOptimizedWidth ? 'w-auto self-start' : 'w-full'} border-collapse text-xs font-sans whitespace-nowrap`}>
                      <thead className={`sticky top-0 z-10 ${themeStyles.gridHeaderBg} border-b ${themeStyles.gridHeaderBorder} ${themeStyles.gridHeaderText}`}>
                        <tr>
                          <th className={`w-8 px-1 py-1 border-r ${themeStyles.gridHeaderBorder} ${themeStyles.gridCornerBg} text-center`}>
                            <div className="w-3.5 h-3.5 mx-auto border border-slate-600 bg-white flex items-center justify-center">
                              <span className="text-[9px] text-blue-900 leading-none font-bold">▶</span>
                            </div>
                          </th>
                          {simSpec.field_catalog.map((field) => {
                            const isColSelected = selectedColumnFields.includes(field.fieldname);
                            const colWidth = getColumnWidth(field);
                            return (
                              <th
                                key={field.id || field.fieldname}
                                onMouseDown={(e) => handleColumnHeaderMouseDown(field.fieldname, e)}
                                onMouseEnter={() => handleColumnHeaderMouseEnter(field.fieldname)}
                                style={{ width: colWidth, minWidth: colWidth }}
                                className={`px-2 py-1.5 border-r ${themeStyles.gridHeaderBorder} text-left font-semibold text-xs cursor-pointer select-none transition-all ${
                                  isColSelected
                                    ? 'ring-2 ring-inset ring-blue-600 bg-blue-100 text-blue-950 font-bold'
                                    : field.key
                                    ? 'bg-[#bce0fd] text-slate-900'
                                    : `${themeStyles.gridHeaderBg} ${themeStyles.gridHeaderText}`
                                }`}
                                title={t('Click or drag to select columns (sort & totals)', '클릭 또는 드래그하여 컬럼 선택 (정렬 및 합계)')}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span>{columnTextMode === 'fieldname' ? field.fieldname : (field.coltext || field.fieldname)}</span>
                                  {sortColumns.some((sc) => sc.fieldname === field.fieldname) ? (
                                    <span className="text-blue-800 font-bold text-[10px]">
                                      {sortColumns.find((sc) => sc.fieldname === field.fieldname)?.asc ? '▲' : '▼'}
                                    </span>
                                  ) : sortField === field.fieldname ? (
                                    <span className="text-blue-800 font-bold text-[10px]">
                                      {sortAsc ? '▲' : '▼'}
                                    </span>
                                  ) : null}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {displayedRows.length === 0 ? (
                          <tr>
                            <td colSpan={simSpec.field_catalog.length + 1} className="py-8 text-center text-slate-500">
                              <p className="mb-2">{t('No header data available.', '헤더 데이터가 없습니다.')}</p>
                              <button
                                type="button"
                                onClick={handleGenerateAiMockData}
                                disabled={isGeneratingMockData}
                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                              >
                                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                                <span>{t('Generate Mock Data', '샘플 데이터 생성')}</span>
                              </button>
                            </td>
                          </tr>
                        ) : (
                          displayedRows.map((row, rIdx) => {
                            const isSelected = selectedRowIndex === rIdx;
                            const isZebra = !!simSpec.layout?.zebra && rIdx % 2 === 1;
                            return (
                              <tr
                                key={rIdx}
                                onClick={() => {
                                  setSelectedRowIndex(rIdx);
                                  setStatusMessage({
                                    text: t(
                                      `Header [${row[foreignKey] || row.DOC_NO || rIdx + 1}] selected (Item grid synced).`,
                                      `헤더 [${row[foreignKey] || row.DOC_NO || rIdx + 1}] 선택됨 (품목 그리드 동기화).`
                                    ),
                                    type: 'S',
                                  });
                                }}
                                className={`h-7 hover:bg-[#ebf3fb] cursor-pointer ${
                                  isSelected ? 'bg-[#fff5cc]' : isZebra ? 'bg-[#f4f7fb]' : 'bg-white'
                                }`}
                              >
                                <td className="w-8 px-1 py-1 h-7 text-center bg-[#d4d0c8] border-r border-[#9bbadb] border-t border-l border-[#f0ede6] border-b border-[#808080] font-mono text-[10px] text-slate-700 font-semibold select-none">
                                  {rIdx + 1}
                                </td>
                                {simSpec.field_catalog.map((field) => {
                                  const val = row[field.fieldname];
                                  const isKey = field.key;
                                  const isColSelected = selectedColumnFields.includes(field.fieldname);
                                  const colWidth = getColumnWidth(field);
                                  const isStatusCol =
                                    field.fieldname === 'ZICON' ||
                                    field.fieldname === 'STATUS' ||
                                    field.fieldname === 'LIGHTS' ||
                                    field.coltext === '상태';

                                  const cellStyle = getSapAlvCellStyle(
                                    field.emphasize,
                                    isKey,
                                    isSelected,
                                    isZebra,
                                    !!field.edit
                                  );

                                  const cellBg = isSelected
                                    ? 'bg-[#fff5cc]'
                                    : isColSelected
                                    ? 'bg-blue-50/80 font-medium'
                                    : cellStyle.bg;

                                  return (
                                    <td
                                      key={field.id || field.fieldname}
                                      style={{
                                        width: colWidth,
                                        minWidth: colWidth,
                                        ...(!isSelected && !isColSelected ? cellStyle.style : {}),
                                      }}
                                      onClick={(e) => {
                                        if (isStatusCol) {
                                          e.stopPropagation();
                                          handleCycleStatus(rIdx, field.fieldname);
                                        }
                                      }}
                                      className={`px-2 py-1 h-7 border-r border-[#d8d8d8] text-xs font-mono ${
                                        field.just === 'R'
                                          ? 'text-right'
                                          : field.just === 'C'
                                          ? 'text-center'
                                          : 'text-left'
                                      } ${cellBg} ${cellStyle.text} ${isColSelected && !isSelected ? 'border-x-blue-300' : ''}`}
                                    >
                                      {isStatusCol || val === '1' || val === '2' || val === '3' ? (
                                        <div className="flex items-center justify-center">
                                          {val === '1' || val === 1 ? (
                                            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 border border-emerald-700 shadow-xs inline-block" />
                                          ) : val === '2' || val === 2 ? (
                                            <span className="w-3.5 h-3.5 rounded-full bg-amber-400 border border-amber-600 shadow-xs inline-block" />
                                          ) : (
                                            <span className="w-3.5 h-3.5 rounded-full bg-rose-500 border border-rose-700 shadow-xs inline-block" />
                                          )}
                                        </div>
                                      ) : field.checkbox ? (
                                        <input
                                          type="checkbox"
                                          checked={!!val}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={() => handleCheckboxToggle(rIdx)}
                                          className="accent-blue-600"
                                        />
                                      ) : field.hotspot ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setDrilldownInfo({
                                              tcode: field.drilldown_tcode || 'VA03',
                                              fieldValue: String(val),
                                              fieldName: field.fieldname,
                                              fieldLabel: field.coltext,
                                              rowRecord: row,
                                            })
                                          }
                                          className="text-blue-700 hover:text-blue-900 underline font-semibold cursor-pointer"
                                        >
                                          {val !== undefined && val !== null ? String(val) : ''}
                                        </button>
                                      ) : field.edit ? (
                                        <input
                                          type="text"
                                          value={val !== undefined && val !== null ? String(val) : ''}
                                          onChange={(e) => handleCellEdit(rIdx, field.fieldname, e.target.value)}
                                          className="w-full bg-white border border-slate-300 focus:border-blue-500 focus:bg-white px-1 text-xs text-slate-900 rounded-none shadow-2xs"
                                        />
                                      ) : (
                                        <span>{val !== undefined && val !== null ? String(val) : ''}</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })
                        )}
                      </tbody>

                      {/* Header ALV Total Row: Yellow background (#ffffa0), height matching regular row h-7 (RFQ v1.12) */}
                      {showTotals && simSpec.field_catalog.some((f) => f.do_sum) && (
                        <tfoot className="sticky bottom-0 z-10 bg-[#ffffa0] border-t border-yellow-400 font-bold text-slate-900 shadow-xs">
                          <tr className="bg-[#ffffa0] text-slate-900 h-7">
                            <td className="w-8 px-1 py-1 h-7 text-center bg-yellow-200 border-r border-yellow-400 text-[10px] text-slate-900 font-bold select-none">
                              Σ
                            </td>
                            {simSpec.field_catalog.map((field) => {
                              const hasSum = !!field.do_sum;
                              const sumVal = totals[field.fieldname];
                              const colWidth = getColumnWidth(field);
                              const isColSelected = selectedColumnFields.includes(field.fieldname);
                              return (
                                <td
                                  key={field.id || field.fieldname}
                                  style={{ width: colWidth, minWidth: colWidth }}
                                  className={`px-2 py-1 h-7 border-r border-yellow-400 text-xs font-mono ${
                                    isColSelected ? 'bg-yellow-200 ring-1 ring-inset ring-blue-500' : 'bg-[#ffffa0]'
                                  } text-slate-900 ${
                                    hasSum ? 'text-right font-extrabold' : 'text-center'
                                  }`}
                                >
                                  {hasSum ? (
                                    <span className="font-extrabold text-slate-950">
                                      {Number(sumVal || 0).toLocaleString()}
                                    </span>
                                  ) : (
                                    ''
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* 2. BOTTOM PANE: Item ALV Grid */}
                <div className="flex-[5] flex flex-col overflow-hidden bg-white">
                  {/* Item Grid Titlebar */}
                  <div className="bg-[#e9f0f8] px-3 py-1.5 border-b border-[#9bbadb] text-xs font-bold text-slate-800 flex items-center justify-between shadow-2xs shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Table className="w-3.5 h-3.5 text-indigo-700" />
                      <span>{simSpec.item_grid.layout?.grid_title || t('Item ALV Grid', '품목 ALV 그리드')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-slate-600 font-normal">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-semibold border border-blue-200">
                        {t('Order', '오더')}: {selectedHeaderKey || t('All', '전체')} ({itemRows.length})
                      </span>
                      <span>|</span>
                      <span>SEL_MODE: {simSpec.item_grid.layout?.sel_mode || 'A'}</span>
                    </div>
                  </div>

                  {/* Item Grid ALV Toolbar (RFQ v1.07 Page 2 & 3) */}
                  <AlvToolbar
                    spec={{
                      ...simSpec,
                      toolbar_buttons:
                        simSpec.item_grid.toolbar_buttons && simSpec.item_grid.toolbar_buttons.length > 0
                          ? simSpec.item_grid.toolbar_buttons
                          : DEFAULT_ALV_TOOLBAR_BUTTONS,
                      custom_toolbar: simSpec.item_grid.custom_toolbar || [],
                      field_catalog: simSpec.item_grid.field_catalog,
                      mock_rows: displayedItemRows,
                    }}
                    theme={currentTheme}
                    statusSummaries={itemStatusSummaries}
                    selectedStatusFilters={selectedItemStatusFilters}
                    onToggleStatusFilter={(key) => {
                      setSelectedItemStatusFilters((prev) =>
                        prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
                      );
                    }}
                    onOpenDetail={() => {
                      setIsDetailModalOpen(true);
                    }}
                    onSort={(asc) => {
                      const fld = simSpec.item_grid?.field_catalog[2]?.fieldname || 'POSNR';
                      setItemSortField(fld);
                      setItemSortAsc(asc);
                    }}
                    onFind={() => setFilterModalState({ open: true, mode: 'find', target: 'item' })}
                    onFilter={() => setFilterModalState({ open: true, mode: 'filter', target: 'item' })}
                    filterQuery={itemFilterQuery}
                    onClearFilter={() => setItemFilterQuery('')}
                    onToggleTotals={() => setShowItemTotals(!showItemTotals)}
                    onExport={handleExportItemCsv}
                    onPrint={() => window.print()}
                    onInfo={() => {
                      setStatusMessage({
                        text: `Item Grid: ${simSpec.item_grid?.grid_name || 'Item ALV Grid'} | Key: ${foreignKey} | Rows: ${displayedItemRows.length}`,
                        type: 'S',
                      });
                    }}
                    onCustomAction={(btn) =>
                      setStatusMessage({
                        text: t(
                          `[Item ALV] Button [${btn.text}] (${btn.function}) executed.`,
                          `[품목 ALV] 버튼 [${btn.text}] (${btn.function}) 실행됨.`
                        ),
                        type: 'S',
                      })
                    }
                  />

                  {/* Item Grid Table */}
                  <div className="flex-1 overflow-auto bg-white">
                    <table className={`${isOptimizedWidth ? 'w-auto self-start' : 'w-full'} border-collapse text-xs font-sans whitespace-nowrap`}>
                      <thead className="sticky top-0 z-10 bg-[#d8e4f0] border-b border-[#9bbadb] text-slate-900">
                        <tr>
                          <th className="w-8 px-1 py-1 border-r border-[#9bbadb] bg-[#c8d8ea] text-center">
                            <div className="w-3.5 h-3.5 mx-auto border border-slate-600 bg-white flex items-center justify-center">
                              <span className="text-[9px] text-blue-900 leading-none font-bold">▶</span>
                            </div>
                          </th>
                          {simSpec.item_grid.field_catalog.map((field) => {
                            const colWidth = getColumnWidth(field, true);
                            return (
                              <th
                                key={field.id || field.fieldname}
                                style={{ width: colWidth, minWidth: colWidth }}
                                className={`px-2 py-1.5 border-r border-[#9bbadb] text-left font-semibold text-xs ${
                                  field.key ? 'bg-[#bce0fd] text-slate-900' : 'bg-[#d8e4f0] text-slate-900'
                                }`}
                              >
                                <span>{columnTextMode === 'fieldname' ? field.fieldname : (field.coltext || field.fieldname)}</span>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {displayedItemRows.length === 0 ? (
                          <tr>
                            <td colSpan={simSpec.item_grid.field_catalog.length + 1} className="py-8 text-center text-slate-400">
                              {t(
                                `No item rows found for order (${selectedHeaderKey || '-'}).`,
                                `오더(${selectedHeaderKey || '-'})에 해당하는 품목 데이터가 없습니다.`
                              )}
                            </td>
                          </tr>
                        ) : (
                          displayedItemRows.map((row, rIdx) => {
                            const isSelected = selectedItemRowIndex === rIdx;
                            const isZebra = !!simSpec.item_grid?.layout?.zebra && rIdx % 2 === 1;
                            return (
                              <tr
                                key={rIdx}
                                onClick={() => setSelectedItemRowIndex(rIdx)}
                                className={`h-7 hover:bg-[#ebf3fb] cursor-pointer ${
                                  isSelected ? 'bg-[#fff5cc]' : isZebra ? 'bg-[#f4f7fb]' : 'bg-white'
                                }`}
                              >
                                <td className="w-8 px-1 py-1 h-7 text-center bg-[#d4d0c8] border-r border-[#9bbadb] border-t border-l border-[#f0ede6] border-b border-[#808080] font-mono text-[10px] text-slate-700 font-semibold select-none">
                                  {rIdx + 1}
                                </td>
                                {simSpec.item_grid!.field_catalog.map((field) => {
                                  const val = row[field.fieldname];
                                  const isKey = field.key;
                                  const colWidth = getColumnWidth(field, true);
                                  const isStatusCol =
                                    field.fieldname === 'ZICON' ||
                                    field.fieldname === 'STATUS' ||
                                    field.fieldname === 'LIGHTS' ||
                                    field.coltext === '상태';

                                  const cellStyle = getSapAlvCellStyle(
                                    field.emphasize,
                                    isKey,
                                    isSelected,
                                    isZebra,
                                    !!field.edit
                                  );

                                  return (
                                    <td
                                      key={field.id || field.fieldname}
                                      style={{
                                        width: colWidth,
                                        minWidth: colWidth,
                                        ...(!isSelected ? cellStyle.style : {}),
                                      }}
                                      className={`px-2 py-1 h-7 border-r border-[#d8d8d8] text-xs font-mono ${
                                        field.just === 'R'
                                          ? 'text-right'
                                          : field.just === 'C'
                                          ? 'text-center'
                                          : 'text-left'
                                      } ${cellStyle.bg} ${cellStyle.text}`}
                                    >
                                      {isStatusCol || val === '1' || val === '2' || val === '3' ? (
                                        <div className="flex items-center justify-center">
                                          {val === '1' || val === 1 ? (
                                            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 border border-emerald-700 shadow-xs inline-block" />
                                          ) : val === '2' || val === 2 ? (
                                            <span className="w-3.5 h-3.5 rounded-full bg-amber-400 border border-amber-600 shadow-xs inline-block" />
                                          ) : (
                                            <span className="w-3.5 h-3.5 rounded-full bg-rose-500 border border-rose-700 shadow-xs inline-block" />
                                          )}
                                        </div>
                                      ) : field.hotspot ? (
                                        <span className="text-blue-700 underline font-semibold">
                                          {val !== undefined && val !== null ? String(val) : ''}
                                        </span>
                                      ) : field.edit ? (
                                        <input
                                          type="text"
                                          value={val !== undefined && val !== null ? String(val) : ''}
                                          onChange={(e) => {
                                            const nextVal = e.target.value;
                                            commitSimUpdate((prev) => {
                                              if (!prev.item_grid) return prev;
                                              const nextItemRows = prev.item_grid.mock_rows.map((mr) =>
                                                mr === row ? { ...mr, [field.fieldname]: nextVal } : mr
                                              );
                                              return {
                                                ...prev,
                                                item_grid: { ...prev.item_grid, mock_rows: nextItemRows },
                                              };
                                            });
                                            setStatusMessage({
                                              text: t(
                                                `Item row ${rIdx + 1} [${field.coltext}] updated.`,
                                                `품목 ${rIdx + 1}행 [${field.coltext}] 값이 수정되었습니다.`
                                              ),
                                              type: 'S',
                                            });
                                          }}
                                          className="w-full bg-white border border-slate-300 focus:border-blue-500 focus:bg-white px-1 text-xs text-slate-900 rounded-none shadow-2xs"
                                        />
                                      ) : (
                                        <span>{val !== undefined && val !== null ? String(val) : ''}</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })
                        )}
                      </tbody>

                      {/* Item Grid Total Row: Yellow background (#ffffa0), height matching regular row h-7 (RFQ v1.12) */}
                      {showItemTotals && simSpec.item_grid.field_catalog.some((f) => f.do_sum) && (
                        <tfoot className="sticky bottom-0 z-10 bg-[#ffffa0] border-t border-yellow-400 font-bold text-slate-900 shadow-xs">
                          <tr className="bg-[#ffffa0] text-slate-900 h-7">
                            <td className="w-8 px-1 py-1 h-7 text-center bg-yellow-200 border-r border-yellow-400 text-[10px] text-slate-900 font-bold select-none">
                              Σ
                            </td>
                            {simSpec.item_grid.field_catalog.map((field) => {
                              const hasSum = !!field.do_sum;
                              const sumVal = itemTotals[field.fieldname];
                              const colWidth = getColumnWidth(field, true);
                              return (
                                <td
                                  key={field.id || field.fieldname}
                                  style={{ width: colWidth, minWidth: colWidth }}
                                  className={`px-2 py-1 h-7 border-r border-yellow-400 text-xs font-mono bg-[#ffffa0] text-slate-900 ${
                                    hasSum ? 'text-right font-extrabold' : 'text-center'
                                  }`}
                                >
                                  {hasSum ? (
                                    <span className="font-extrabold text-slate-950">
                                      {Number(sumVal || 0).toLocaleString()}
                                    </span>
                                  ) : (
                                    ''
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              /* ============================================================= */
              /* STANDARD SINGLE ALV GRID                                      */
              /* ============================================================= */
              <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Real-time Layout Grid Title & Options Indicator */}
                {simSpec.layout?.grid_title && (
                  <div
                    className={`bg-[#e4edf7] ${
                      simSpec.layout.smalltitle
                        ? 'px-2 py-1 text-[11px] font-semibold'
                        : 'px-3 py-1.5 text-xs font-bold'
                    } border-b border-[#9bbadb] text-slate-800 flex items-center justify-between shadow-2xs shrink-0`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Table className={simSpec.layout.smalltitle ? 'w-3 h-3 text-blue-800' : 'w-3.5 h-3.5 text-blue-800'} />
                      <span>{simSpec.layout.grid_title}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-slate-600 font-normal">
                      <span>SEL_MODE: {simSpec.layout.sel_mode || 'A'}</span>
                      <span>|</span>
                      <span>Zebra: {effectiveZebra ? 'ON' : 'OFF'}</span>
                      {effectiveSubtotalField && (
                        <>
                          <span>|</span>
                          <span className="text-amber-800 font-bold">SUBTOT: {effectiveSubtotalField}</span>
                        </>
                      )}
                      <span>|</span>
                      <span>{t('Rows', '행')}: {displayedRows.length}</span>
                    </div>
                  </div>
                )}

                {/* Scrollable table canvas - keeps table content fit without horizontal stretching (RFQ v1.13) */}
                <div className="flex-1 overflow-auto bg-white">
                  <table className={`${isOptimizedWidth ? 'w-auto self-start' : 'w-full'} border-collapse text-xs font-sans whitespace-nowrap`}>
                  {/* Header Row */}
                  {!simSpec.layout?.no_headers && (
                    <thead className={`sticky top-0 z-10 ${themeStyles.gridHeaderBg} border-b ${themeStyles.gridHeaderBorder} ${themeStyles.gridHeaderText}`}>
                      <tr>
                        {!simSpec.layout?.no_rowmark && (
                          <th className={`w-8 px-1 py-1 ${!effectiveNoVgrid ? `border-r ${themeStyles.gridHeaderBorder}` : ''} ${themeStyles.gridCornerBg} text-center`}>
                            <div className="w-3.5 h-3.5 mx-auto border border-slate-600 bg-white flex items-center justify-center">
                              <span className="text-[9px] text-blue-900 leading-none font-bold">▶</span>
                            </div>
                          </th>
                        )}
                        {effectiveFieldCatalog.map((field) => {
                          const isKey = field.key;
                          const isColSelected = selectedColumnFields.includes(field.fieldname);
                          const colWidth = getColumnWidth(field);
                          return (
                            <th
                              key={field.id || field.fieldname}
                              onMouseDown={(e) => handleColumnHeaderMouseDown(field.fieldname, e)}
                              onMouseEnter={() => handleColumnHeaderMouseEnter(field.fieldname)}
                              style={{
                                width: colWidth,
                                minWidth: colWidth,
                              }}
                              className={`px-2 py-1.5 ${!effectiveNoVgrid ? `border-r ${themeStyles.gridHeaderBorder}` : ''} text-left font-semibold text-xs cursor-pointer select-none transition-all ${
                                isColSelected
                                  ? 'ring-2 ring-inset ring-blue-600 bg-blue-100 text-blue-950 font-bold'
                                  : isKey
                                  ? 'bg-[#bce0fd] text-slate-900'
                                  : `${themeStyles.gridHeaderBg} ${themeStyles.gridHeaderText}`
                              }`}
                              title={t('Click or drag to select columns (sort & totals)', '클릭 또는 드래그하여 컬럼 선택 (정렬 및 합계)')}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span>{columnTextMode === 'fieldname' ? field.fieldname : (field.coltext || field.fieldname)}</span>
                                {sortColumns.some((sc) => sc.fieldname === field.fieldname) ? (
                                  <span className="text-blue-800 font-bold text-[10px]">
                                    {sortColumns.find((sc) => sc.fieldname === field.fieldname)?.asc ? '▲' : '▼'}
                                  </span>
                                ) : sortField === field.fieldname ? (
                                  <span className="text-blue-800 font-bold text-[10px]">
                                    {sortAsc ? '▲' : '▼'}
                                  </span>
                                ) : null}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                  )}

                  {/* Body */}
                  <tbody className={effectiveNoHgrid ? '' : 'divide-y divide-slate-200'}>
                    {/* Top Totals Row: shown before data rows if totals_bef is active */}
                    {simSpec.layout?.totals_bef && !simSpec.layout?.no_totline && showTotals && effectiveFieldCatalog.some((f) => f.do_sum) && (
                      <tr className="bg-[#ffffa0] text-slate-900 h-7 border-b-2 border-yellow-500 font-bold shadow-xs">
                        {!simSpec.layout?.no_rowmark && (
                          <td className={`w-8 px-1 py-1 h-7 text-center bg-yellow-200 ${!effectiveNoVgrid ? 'border-r border-yellow-400' : ''} text-[10px] text-slate-900 font-bold select-none`}>
                            {!simSpec.layout?.no_totarr ? 'Σ' : ''}
                          </td>
                        )}
                        {effectiveFieldCatalog.map((field) => {
                          const hasSum = !!field.do_sum;
                          const sumVal = totals[field.fieldname];
                          const colWidth = getColumnWidth(field);
                          const isColSelected = selectedColumnFields.includes(field.fieldname);
                          return (
                            <td
                              key={field.id || field.fieldname}
                              style={{ width: colWidth, minWidth: colWidth }}
                              className={`px-2 py-1 h-7 ${!effectiveNoVgrid ? 'border-r border-yellow-400' : ''} text-xs font-mono ${
                                isColSelected ? 'bg-yellow-200 ring-1 ring-inset ring-blue-500' : 'bg-[#ffffa0]'
                              } text-slate-900 ${
                                hasSum ? 'text-right font-extrabold' : 'text-center'
                              }`}
                            >
                              {hasSum ? (
                                <span className="font-extrabold text-slate-950">
                                  {Number(sumVal || 0).toLocaleString()}
                                </span>
                              ) : (
                                ''
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    )}

                    {/* Data Rows (with optional Group Subtotal rows): hidden if effectiveTotalsOnly is active */}
                    {!effectiveTotalsOnly && (
                      displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={effectiveFieldCatalog.length + (simSpec.layout?.no_rowmark ? 0 : 1)} className="py-12 text-center text-slate-500">
                            <p className="mb-2">{t('No records found matching filters.', '필터 조건에 일치하는 데이터가 없습니다.')}</p>
                            <button
                              type="button"
                              onClick={handleGenerateAiMockData}
                              disabled={isGeneratingMockData}
                              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                              <span>{t('Generate Mock Data', '샘플 데이터 생성')}</span>
                            </button>
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((row, rIdx) => {
                          const isSelected = selectedRowIndex === rIdx;
                          const isZebra = effectiveZebra && rIdx % 2 === 1;
                          const realIdx = rows.indexOf(row);
                          const actualIdx = realIdx !== -1 ? realIdx : rIdx;

                          // Check if a subtotal break occurs right after this row
                          const currentGroupVal = effectiveSubtotalField ? String(row[effectiveSubtotalField] ?? '') : '';
                          const nextRow = displayedRows[rIdx + 1];
                          const nextGroupVal = effectiveSubtotalField && nextRow ? String(nextRow[effectiveSubtotalField] ?? '') : '';
                          const isGroupEnd = !!effectiveSubtotalField && (rIdx === displayedRows.length - 1 || currentGroupVal !== nextGroupVal);

                          let groupSums: Record<string, number> = {};
                          if (isGroupEnd && effectiveSubtotalField) {
                            const matchingGroupRows = displayedRows.filter(
                              (gr) => String(gr[effectiveSubtotalField] ?? '') === currentGroupVal
                            );
                            effectiveFieldCatalog.forEach((ef) => {
                              if (ef.do_sum) {
                                groupSums[ef.fieldname] = matchingGroupRows.reduce(
                                  (acc, gr) => acc + (Number(gr[ef.fieldname]) || 0),
                                  0
                                );
                              }
                            });
                          }

                          return (
                            <React.Fragment key={rIdx}>
                              <tr
                                onClick={() => {
                                  if (simSpec.layout?.sel_mode !== 'D') {
                                    setSelectedRowIndex(rIdx);
                                  }
                                }}
                                className={`h-7 hover:bg-[#ebf3fb] cursor-pointer ${
                                  isSelected ? 'bg-[#fff5cc]' : isZebra ? 'bg-[#f4f7fb]' : 'bg-white'
                                }`}
                              >
                                {!simSpec.layout?.no_rowmark && (
                                  <td className={`w-8 px-1 py-1 h-7 text-center bg-[#d4d0c8] ${!effectiveNoVgrid ? 'border-r border-[#9bbadb]' : ''} border-t border-l border-[#f0ede6] border-b border-[#808080] font-mono text-[10px] text-slate-700 font-semibold select-none`}>
                                    {simSpec.layout?.show_row_numbers ? (
                                      rIdx + 1
                                    ) : (
                                      <div className="w-2.5 h-2 bg-[#d4d0c8] mx-auto" />
                                    )}
                                  </td>
                                )}

                                {effectiveFieldCatalog.map((field) => {
                                  const val = row[field.fieldname];
                                  const isKey = field.key;
                                  const isColSelected = selectedColumnFields.includes(field.fieldname);
                                  const isCellSelected = simSpec.layout?.sel_mode === 'D' && selectedCell?.rIdx === rIdx && selectedCell?.fieldname === field.fieldname;
                                  const colWidth = getColumnWidth(field);
                                  const isHotspot = field.hotspot || (simSpec.layout?.keyhot && field.key);
                                  const isStatusCol =
                                    field.fieldname === 'ZICON' ||
                                    field.fieldname === 'STATUS' ||
                                    field.fieldname === 'LIGHTS' ||
                                    field.coltext === '상태' ||
                                    field.icon_type === 'DOC';

                                  const cellKey = `${actualIdx}:${field.fieldname}`;
                                  const cellErr = cellErrors[cellKey];
                                  const isDirty = dirtyCells.has(cellKey);

                                  const alignClass =
                                    field.just === 'R'
                                      ? 'text-right'
                                      : field.just === 'C'
                                      ? 'text-center'
                                      : 'text-left';

                                  const cellStyle = getSapAlvCellStyle(
                                    field.emphasize,
                                    isKey,
                                    isSelected,
                                    isZebra,
                                    !!field.edit
                                  );

                                  const cellBg = isCellSelected
                                    ? 'bg-blue-100/90'
                                    : isSelected
                                    ? 'bg-[#fff5cc]'
                                    : isColSelected
                                    ? 'bg-blue-50/80 font-medium'
                                    : cellStyle.bg;

                                  return (
                                    <td
                                      key={field.id || field.fieldname}
                                      style={{
                                        width: colWidth,
                                        minWidth: colWidth,
                                        ...(!isSelected && !isColSelected ? cellStyle.style : {}),
                                      }}
                                      onClick={(e) => {
                                        if (simSpec.layout?.sel_mode === 'D') {
                                          setSelectedCell({ rIdx, fieldname: field.fieldname });
                                        }
                                        if (isStatusCol) {
                                          e.stopPropagation();
                                          handleCycleStatus(rIdx, field.fieldname);
                                        }
                                      }}
                                      title={
                                        cellErr
                                          ? cellErr
                                          : isStatusCol
                                          ? t('Click to cycle Sta. status and refresh toolbar filter', '클릭하여 상태(Sta.)를 순환하고 툴바 필터를 갱신')
                                          : field.emphasize
                                          ? `SAP Color: ${field.emphasize}`
                                          : undefined
                                      }
                                      className={`px-2 py-1 h-7 ${!effectiveNoVgrid ? 'border-r border-[#d8d8d8]' : ''} text-xs font-mono ${alignClass} ${cellBg} ${cellStyle.text} ${
                                        isStatusCol ? 'cursor-pointer hover:brightness-95' : ''
                                      } ${isColSelected && !isSelected ? 'border-x-blue-300' : ''} ${
                                        isCellSelected ? 'ring-2 ring-inset ring-blue-600 font-bold' : ''
                                      }`}
                                    >
                                      {field.icon_type === 'DOC' || val === 'DOC' ? (
                                        <div className="flex items-center justify-center">
                                          <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-700 fill-white stroke-slate-700 stroke-1 drop-shadow-2xs">
                                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                            <polyline points="14 2 14 8 20 8" />
                                          </svg>
                                        </div>
                                      ) : field.icon_type === 'FOLDER' || val === 'FOLDER' ? (
                                        <div className="flex items-center justify-center">
                                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-[#f6c342] stroke-[#c98e16] stroke-1 drop-shadow-2xs">
                                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                          </svg>
                                        </div>
                                      ) : field.fieldname === 'ZICON' || field.fieldname === 'LIGHTS' || field.fieldname === 'STATUS' || val === '1' || val === '2' || val === '3' ? (
                                        <div className="flex items-center justify-center">
                                          {val === '1' || val === 1 ? (
                                            <span className="w-3.5 h-3.5 rounded-full bg-emerald-500 border border-emerald-700 shadow-xs inline-block" />
                                          ) : val === '2' || val === 2 ? (
                                            <span className="w-3.5 h-3.5 rounded-full bg-amber-400 border border-amber-600 shadow-xs inline-block" />
                                          ) : (
                                            <span className="w-3.5 h-3.5 rounded-full bg-rose-500 border border-rose-700 shadow-xs inline-block" />
                                          )}
                                        </div>
                                      ) : field.checkbox ? (
                                        <input
                                          type="checkbox"
                                          checked={!!val}
                                          onChange={() => handleCheckboxToggle(rIdx)}
                                          className="accent-blue-600"
                                        />
                                      ) : isHotspot ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setDrilldownInfo({
                                              tcode: field.drilldown_tcode || (field.key ? 'VA03' : 'KAH3'),
                                              fieldValue: String(val),
                                              fieldName: field.fieldname,
                                              fieldLabel: field.coltext,
                                              rowRecord: row,
                                            })
                                          }
                                          className="text-blue-700 hover:text-blue-900 underline font-semibold cursor-pointer"
                                        >
                                          {val !== undefined && val !== null ? String(val) : ''}
                                        </button>
                                      ) : field.edit ? (
                                        <input
                                          type="text"
                                          value={val !== undefined && val !== null ? String(val) : ''}
                                          onChange={(e) => handleCellEdit(rIdx, field.fieldname, e.target.value)}
                                          className={`w-full px-1 text-xs text-slate-900 rounded-none shadow-2xs focus:outline-none ${
                                            cellErr
                                              ? 'bg-red-50 border-2 border-red-600 text-red-900'
                                              : isDirty
                                              ? 'bg-amber-50 border border-amber-500'
                                              : 'bg-white border border-slate-300 focus:border-blue-500'
                                          }`}
                                        />
                                      ) : (
                                        <span>{val !== undefined && val !== null ? String(val) : ''}</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>

                              {/* SAP ALV Group Subtotal Row (&SUBTOTAL) */}
                              {isGroupEnd && effectiveSubtotalField && showTotals && effectiveFieldCatalog.some((f) => f.do_sum) && (
                                <tr className="bg-[#fff7bd] text-slate-900 h-7 border-y border-amber-300 font-semibold">
                                  {!simSpec.layout?.no_rowmark && (
                                    <td className={`w-8 px-1 py-1 h-7 text-center bg-amber-100 ${!effectiveNoVgrid ? 'border-r border-amber-300' : ''} text-[10px] text-amber-900 font-bold select-none`}>
                                      •
                                    </td>
                                  )}
                                  {effectiveFieldCatalog.map((field) => {
                                    const isSubCol = field.fieldname === effectiveSubtotalField;
                                    const hasSum = !!field.do_sum;
                                    const colWidth = getColumnWidth(field);
                                    return (
                                      <td
                                        key={`sub-${field.fieldname}`}
                                        style={{ width: colWidth, minWidth: colWidth }}
                                        className={`px-2 py-1 h-7 ${!effectiveNoVgrid ? 'border-r border-amber-300' : ''} text-xs font-mono ${
                                          hasSum ? 'text-right font-bold text-slate-950' : 'text-left text-amber-950'
                                        }`}
                                      >
                                        {isSubCol ? (
                                          <span className="text-[11px] font-sans font-bold">
                                            {t('Subtotal:', '소계:')} {currentGroupVal || t('(Blank)', '(공백)')}
                                          </span>
                                        ) : hasSum ? (
                                          Number(groupSums[field.fieldname] || 0).toLocaleString()
                                        ) : (
                                          ''
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })
                      )
                    )}
                  </tbody>

                  {/* Single ALV Total Row: Sticky bottom if !totals_bef. Height exactly matching regular row h-7 (RFQ v1.12) */}
                  {!simSpec.layout?.totals_bef && !simSpec.layout?.no_totline && showTotals && effectiveFieldCatalog.some((f) => f.do_sum) && (
                    <tfoot className="sticky bottom-0 z-10 bg-[#ffffa0] border-t border-yellow-400 font-bold text-slate-900 shadow-xs">
                      <tr className="bg-[#ffffa0] text-slate-900 h-7">
                        {!simSpec.layout?.no_rowmark && (
                          <td className={`w-8 px-1 py-1 h-7 text-center bg-yellow-200 ${!effectiveNoVgrid ? 'border-r border-yellow-400' : ''} text-[10px] text-slate-900 font-bold select-none`}>
                            {!simSpec.layout?.no_totarr ? 'Σ' : ''}
                          </td>
                        )}
                        {effectiveFieldCatalog.map((field) => {
                          const hasSum = !!field.do_sum;
                          const sumVal = totals[field.fieldname];
                          const colWidth = getColumnWidth(field);
                          const isColSelected = selectedColumnFields.includes(field.fieldname);
                          return (
                            <td
                              key={field.id || field.fieldname}
                              style={{ width: colWidth, minWidth: colWidth }}
                              className={`px-2 py-1 h-7 ${!effectiveNoVgrid ? 'border-r border-yellow-400' : ''} text-xs font-mono ${
                                isColSelected ? 'bg-yellow-200 ring-1 ring-inset ring-blue-500' : 'bg-[#ffffa0]'
                              } text-slate-900 ${
                                hasSum ? 'text-right font-extrabold' : 'text-center'
                              }`}
                            >
                              {hasSum ? (
                                <span className="font-extrabold text-slate-950">
                                  {Number(sumVal || 0).toLocaleString()}
                                </span>
                              ) : (
                                ''
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  )}
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 5. Error Log ALV Sub-Window - Displays live edit validation errors or simSpec error_logs */}
        {(() => {
          const activeErrorLogs = runtimeErrorLogs.length > 0 ? runtimeErrorLogs : (simSpec.error_logs || []);
          if (!showErrorLog || activeErrorLogs.length === 0) return null;
          return (
          <div className="absolute bottom-4 left-6 right-6 max-w-xl z-30 rounded border-2 border-red-500/80 shadow-2xl overflow-hidden bg-white">
            {/* Dark Blue Header matching screenshot */}
            <div
              className="flex items-center justify-between px-3 py-1.5 text-white"
              style={{
                background: 'linear-gradient(to right, #113366 0%, #1e4a88 100%)',
              }}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <div className="w-3.5 h-3.5 border border-white/80 rounded-2xs flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-white/60" />
                </div>
                <span>{t('Error Log', '오류 로그')} ({activeErrorLogs.length})</span>
              </div>
              <button
                type="button"
                onClick={() => setShowErrorLog(false)}
                className="hover:bg-white/20 p-0.5 rounded text-white cursor-pointer"
                aria-label={t('Close error log', '오류 로그 닫기')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Error Log Table with Red Selection Box */}
            <div className="overflow-x-auto border-t border-slate-300">
              <table className="w-full text-xs font-sans border-collapse">
                <thead className="bg-[#e4edf7] border-b border-[#a4bedb] text-slate-800 font-semibold text-[11px]">
                  <tr>
                    <th className="py-1 px-3 w-16 text-center border-r border-[#a4bedb] bg-[#e4edf7]">
                      {t('Type', '유형')}
                    </th>
                    <th className="py-1 px-3 w-28 text-left border-r border-[#a4bedb] bg-[#e4edf7]">
                      {t('Column', '컬럼')}
                    </th>
                    <th className="py-1 px-3 text-left bg-[#e4edf7]">
                      {t('Message Text', '메시지 내용')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {activeErrorLogs.map((err, idx) => (
                    <tr key={err.id || idx} className="hover:bg-red-50/50">
                      {/* Type: Red circular target error symbol */}
                      <td className="py-1 px-3 text-center border-r border-[#a4bedb] bg-white">
                        <div className="relative w-4 h-4 mx-auto flex items-center justify-center">
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-red-700 bg-red-600 flex items-center justify-center shadow-xs">
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          </div>
                        </div>
                      </td>

                      {/* Column: Yellow/Amber highlighted background */}
                      <td
                        className="py-1 px-3 border-r border-[#a4bedb] font-medium text-slate-900"
                        style={{
                          backgroundColor: '#ffde7a',
                        }}
                      >
                        {err.col_name}
                      </td>

                      {/* Message Text */}
                      <td className="py-1 px-3 text-slate-900 font-normal">
                        {err.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          );
        })()}
      </div>

      {/* 6. SAP Status Bar with Dynamic Theme */}
      <div className={`flex items-center justify-between px-3 py-1 border-t text-xs transition-colors duration-200 ${themeStyles.statusBarBg} ${themeStyles.statusBarBorder} ${themeStyles.statusBarText}`}>
        <div className="flex items-center gap-2">
          {statusMessage.type === 'S' ? (
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-emerald-700 inline-block shadow-2xs" />
          ) : (
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-rose-700 inline-block shadow-2xs" />
          )}
          <span className="font-medium">{statusMessage.text}</span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono opacity-80">
          <span>PRD (100)</span>
          <span className="opacity-40">|</span>
          <button
            type="button"
            onClick={() => setIsThemeSettingsOpen(true)}
            className="hover:underline cursor-pointer flex items-center gap-1 font-sans"
            title={t('Click to open SAP GUI Theme Settings', '클릭하여 SAP GUI 테마 설정 열기')}
          >
            <Palette className="w-3 h-3" />
            <span>{t('Theme:', '테마:')} {themeInfo.name}</span>
          </button>
          <span className="opacity-40">|</span>
          <span>cl_gui_alv_grid</span>
          <span className="opacity-40">|</span>
          <span>100%</span>
        </div>
      </div>

      {/* Modals */}
      {activeParamForMulti && (
        <SapMultipleSelectionModal
          param={activeParamForMulti}
          isOpen={!!activeParamForMulti}
          onClose={() => setActiveParamForMulti(null)}
          onApply={(low, high, items) => {
            const targetId = activeParamForMulti.id;
            commitSimUpdate((prev) => ({
              ...prev,
              selection_params: prev.selection_params.map((p) =>
                p.id === targetId ? { ...p, low, high, multi_values: items } : p
              ),
            }));
            setObligatoryErrorIds((prev) => prev.filter((id) => id !== targetId));
            setStatusMessage({
              text: t(
                `[${activeParamForMulti.text}] Multiple selection updated (${items.length} condition(s)).`,
                `[${activeParamForMulti.text}] 다중 선택이 업데이트되었습니다 (${items.length}개 조건).`
              ),
              type: 'S',
            });
          }}
        />
      )}

      {f4Target && (
        <SapF4ValueHelpModal
          isOpen={!!f4Target}
          param={f4Target.param}
          targetSide={f4Target.side}
          spec={simSpec}
          onClose={() => setF4Target(null)}
          onSelectValue={(val) => {
            const targetParamId = f4Target.param.id;
            const targetSide = f4Target.side;
            commitSimUpdate((prev) => ({
              ...prev,
              selection_params: prev.selection_params.map((p) =>
                p.id === targetParamId
                  ? { ...p, [targetSide]: val }
                  : p
              ),
            }));
            setObligatoryErrorIds((prev) => prev.filter((id) => id !== targetParamId));
            setStatusMessage({
              text: t(
                `F4 Value "${val}" assigned to ${f4Target.param.name}.`,
                `F4 값 "${val}"이(가) ${f4Target.param.name}에 입력되었습니다.`
              ),
              type: 'S',
            });
          }}
        />
      )}

      <SapAlvFilterModal
        isOpen={filterModalState.open}
        mode={filterModalState.mode}
        fieldCatalog={
          filterModalState.target === 'item'
            ? simSpec.item_grid?.field_catalog || []
            : simSpec.field_catalog
        }
        currentFilter={
          filterModalState.target === 'item'
            ? { fieldname: '__ALL__', operator: 'contains', value: itemFilterQuery }
            : columnFilter
        }
        onClose={() => setFilterModalState((prev) => ({ ...prev, open: false }))}
        onApplyFilter={(next) => {
          if (filterModalState.target === 'item') {
            setItemFilterQuery(next.value);
            setStatusMessage({
              text: next.value
                ? t(`Item Grid filtered by "${next.value}".`, `품목 그리드에 "${next.value}" 필터가 적용되었습니다.`)
                : t('Item Grid filter cleared.', '품목 그리드 필터가 해제되었습니다.'),
              type: 'S',
            });
          } else {
            setColumnFilter(next);
            setFilterQuery(next.fieldname === '__ALL__' ? next.value : `${next.fieldname}: ${next.value}`);
            setStatusMessage({
              text: next.value
                ? t(
                    `ALV Filter applied (${next.fieldname === '__ALL__' ? 'All columns' : next.fieldname} ${next.operator} "${next.value}").`,
                    `ALV 필터가 적용되었습니다 (${next.fieldname === '__ALL__' ? '전체 컬럼' : next.fieldname} ${next.operator} "${next.value}").`
                  )
                : t('ALV Filter cleared.', 'ALV 필터가 해제되었습니다.'),
              type: 'S',
            });
          }
        }}
        onFindText={(term) => {
          if (filterModalState.target === 'item') {
            setItemFilterQuery(term);
          } else {
            handleFindInRows(term);
          }
        }}
      />

      <SapAlvLayoutModal
        isOpen={isLayoutModalOpen}
        programId={simSpec.program_id}
        fieldCatalog={simSpec.field_catalog}
        currentConfig={
          layoutOverride || {
            visibleFields: simSpec.field_catalog.map((f) => f.fieldname),
            subtotalField: null,
            zebra: !!simSpec.layout?.zebra,
            cwidth_opt: isOptimizedWidth,
            no_hgridln: !!simSpec.layout?.no_hgridln,
            no_vgridln: !!simSpec.layout?.no_vgridln,
          }
        }
        onClose={() => setIsLayoutModalOpen(false)}
        onApplyConfig={(cfg, variantName) => {
          setLayoutOverride(cfg);
          setIsOptimizedWidth(cfg.cwidth_opt);
          if (cfg.subtotalField) {
            handleMultiSort([cfg.subtotalField], true);
            setShowTotals(true);
          }
          if (variantName) {
            setActiveLayoutVariantName(variantName === '/STANDARD' ? null : variantName);
          }
          setStatusMessage({
            text: variantName
              ? t(
                  `Layout variant [${variantName}] applied (${cfg.visibleFields.length} columns visible).`,
                  `레이아웃 변형 [${variantName}]이 적용되었습니다 (${cfg.visibleFields.length}개 컬럼 표시).`
                )
              : t(
                  `Layout updated (${cfg.visibleFields.length} columns visible).`,
                  `레이아웃이 업데이트되었습니다 (${cfg.visibleFields.length}개 컬럼 표시).`
                ),
            type: 'S',
          });
        }}
      />

      <SapBusinessGraphicModal
        isOpen={isGraphicModalOpen}
        title={simSpec.layout?.grid_title || simSpec.title}
        fieldCatalog={effectiveFieldCatalog}
        rows={displayedRows}
        onClose={() => setIsGraphicModalOpen(false)}
      />

      {drilldownInfo && (
        <DrilldownModal
          isOpen={!!drilldownInfo}
          onClose={() => setDrilldownInfo(null)}
          tcode={drilldownInfo.tcode}
          fieldValue={drilldownInfo.fieldValue}
          fieldName={drilldownInfo.fieldName}
          fieldLabel={drilldownInfo.fieldLabel}
          rowRecord={drilldownInfo.rowRecord}
        />
      )}

      {isDetailModalOpen && (
        <AlvDetailModal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          record={displayedRows[selectedRowIndex || 0] || null}
          fieldCatalog={effectiveFieldCatalog}
          rowIndex={selectedRowIndex || 0}
          totalRows={displayedRows.length}
          onPrevRow={() => setSelectedRowIndex(prev => Math.max(0, (prev || 0) - 1))}
          onNextRow={() => setSelectedRowIndex(prev => Math.min(displayedRows.length - 1, (prev || 0) + 1))}
        />
      )}

      {/* SAP GUI Theme Settings Modal */}
      <SapThemeSettingsModal
        isOpen={isThemeSettingsOpen}
        onClose={() => setIsThemeSettingsOpen(false)}
        currentTheme={currentTheme}
        onSelectTheme={handleSelectTheme}
      />
    </div>
  );
};
