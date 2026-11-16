import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Copy,
  Check,
  RotateCcw,
  CheckSquare,
  Square,
  ClipboardPaste,
  HelpCircle,
  X,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronsDown,
  ChevronsUp,
} from 'lucide-react';
import { AlvLayout } from '../types/sap';
import { copyTsvToClipboard, parseSpreadsheetText } from '../utils/spreadsheetClipboard';
import { InspectableSelect } from './InspectableSelect';
import { useLanguage } from '../contexts/LanguageContext';

export interface AlvLayoutSpreadsheetProps {
  layout: AlvLayout;
  onChange: (updatedLayout: AlvLayout) => void;
  isReadOnly?: boolean;
}

interface LayoutItemConfig {
  key: string;
  category: string;
  name: string;
  description: string;
  detailHint?: string;
  type: 'boolean' | 'string' | 'select';
  options?: { value: string; label: string }[];
  defaultValue: any;
  placeholder?: string;
}

export const LAYOUT_ITEMS_CONFIG: LayoutItemConfig[] = [
  // 1. Display & Appearance
  {
    key: 'ZEBRA',
    category: 'Display & Appearance',
    name: 'ZEBRA',
    description: 'Striped alternating row background (Zebra pattern)',
    detailHint: "Applies alternating row colors in list output and preview (gs_layo-zebra = 'X').",
    type: 'boolean',
    defaultValue: true,
  },
  {
    key: 'SMALLTITLE',
    category: 'Display & Appearance',
    name: 'SMALLTITLE',
    description: 'Match grid title font size to column headers',
    detailHint: 'Sets the ALV title size to match the smaller column header font.',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'NO_HEADERS',
    category: 'Display & Appearance',
    name: 'NO_HEADERS',
    description: 'Hide column headers',
    detailHint: 'Hides the top column title header row in the grid.',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'NO_HGRIDLN',
    category: 'Display & Appearance',
    name: 'NO_HGRIDLN',
    description: 'Hide horizontal grid lines',
    detailHint: 'Hides horizontal divider lines between rows.',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'NO_VGRIDLN',
    category: 'Display & Appearance',
    name: 'NO_VGRIDLN',
    description: 'Hide vertical grid lines',
    detailHint: 'Hides vertical divider lines between columns.',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'NO_TOOLBAR',
    category: 'Display & Appearance',
    name: 'NO_TOOLBAR',
    description: 'Hide ALV top toolbar',
    detailHint: 'Completely hides both standard and custom ALV toolbars.',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'NO_ROWMARK',
    category: 'Display & Appearance',
    name: 'NO_ROWMARK',
    description: 'Hide row selection mark buttons',
    detailHint: 'Hides row selector buttons at the start of each row (Selection modes A/D).',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'GRID_TITLE',
    category: 'Display & Appearance',
    name: 'GRID_TITLE',
    description: 'Grid title text (between grid control and toolbar)',
    detailHint: 'Title text displayed between the grid control and toolbar (Char 70).',
    type: 'string',
    defaultValue: 'New ALV Grid Report',
    placeholder: 'e.g., Sales Order Status Report',
  },

  // 2. Columns & Sorting
  {
    key: 'CWIDTH_OPT',
    category: 'Columns & Sorting',
    name: 'CWIDTH_OPT',
    description: 'Optimize column width to fit headers and cell values',
    detailHint: 'Automatically adjusts column widths based on header and cell content length.',
    type: 'boolean',
    defaultValue: true,
  },
  {
    key: 'SGL_CLK_HD',
    category: 'Columns & Sorting',
    name: 'SGL_CLK_HD',
    description: 'Enable single-click sorting on column headers',
    detailHint: 'Sorts immediately on header click (1st click ascending, 2nd click descending).',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'NO_MERGING',
    category: 'Columns & Sorting',
    name: 'NO_MERGING',
    description: 'Disable cell merging when sorted',
    detailHint: 'Keeps consecutive cells with identical values separate when sorting.',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'KEYHOT',
    category: 'Columns & Sorting',
    name: 'KEYHOT',
    description: 'Make all key fields clickable hotspots',
    detailHint: 'Turns all key columns into single-click links triggering HOTSPOT_CLICK.',
    type: 'boolean',
    defaultValue: false,
  },

  // 3. Totals & Calculations
  {
    key: 'TOTALS_BEF',
    category: 'Totals & Calculations',
    name: 'TOTALS_BEF',
    description: 'Display totals row at the top of the list',
    detailHint: 'Places total rows at the top first row instead of the bottom.',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'NO_TOTLINE',
    category: 'Totals & Calculations',
    name: 'NO_TOTLINE',
    description: 'Hide grand total and show subtotals only',
    detailHint: 'Suppresses the grand total row while keeping subtotal lines.',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'NO_TOTARR',
    category: 'Totals & Calculations',
    name: 'NO_TOTARR',
    description: 'Hide range arrows on total/subtotal rows',
    detailHint: 'Disables auxiliary arrow icons displayed on total rows.',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'NO_TOTEXP',
    category: 'Totals & Calculations',
    name: 'NO_TOTEXP',
    description: 'Hide expand/collapse icons on subtotals',
    detailHint: 'Hides hierarchy expand/collapse toggles next to subtotal lines.',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'NUMC_TOTAL',
    category: 'Totals & Calculations',
    name: 'NUMC_TOTAL',
    description: 'Allow totals calculation on NUMC fields',
    detailHint: 'Enables summation on numeric text (NUMC) columns.',
    type: 'boolean',
    defaultValue: false,
  },
  {
    key: 'TOTALS_ONLY',
    category: 'Totals & Calculations',
    name: 'TOTALS_ONLY',
    description: 'Show total lines only (hide detail rows)',
    detailHint: 'Hides individual detail rows and summarizes only subtotal/total lines.',
    type: 'boolean',
    defaultValue: false,
  },

  // 4. Selection Mode & Detail Popup
  {
    key: 'SEL_MODE',
    category: 'Selection Mode & Detail',
    name: 'SEL_MODE',
    description: 'Selection mode (A: Multi Row/Col, B: Single Row, C: Multi Row, D: Cell, SPACE: Default)',
    detailHint: 'Defines how users select rows, columns, or cells inside the grid.',
    type: 'select',
    options: [
      { value: 'A', label: 'A: Multiple Rows & Columns' },
      { value: 'B', label: 'B: Single Row Selection' },
      { value: 'C', label: 'C: Multiple Rows Selection' },
      { value: 'D', label: 'D: Cell Selection' },
      { value: 'SPACE', label: 'SPACE: Default Mode' },
    ],
    defaultValue: 'A',
  },
  {
    key: 'DETAILTITL',
    category: 'Selection Mode & Detail',
    name: 'DETAILTITL',
    description: 'Detail popup window title',
    detailHint: 'Header title for the row detail (&DETAIL) modal (Char 30).',
    type: 'string',
    defaultValue: '',
    placeholder: 'e.g., Detail Data View',
  },
  {
    key: 'DETAILINIT',
    category: 'Selection Mode & Detail',
    name: 'DETAILINIT',
    description: 'Show initial/empty fields in detail popup',
    detailHint: 'Displays blank or zero-value fields inside the row detail popup.',
    type: 'boolean',
    defaultValue: false,
  },

  // 5. Color & Style Tables
  {
    key: 'INFO_FNAME',
    category: 'Color & Style Fields',
    name: 'INFO_FNAME',
    description: 'Row color field name (Char 4, e.g., LINECOLOR)',
    detailHint: '4-character field storing row color codes (e.g., C310, C500).',
    type: 'string',
    defaultValue: '',
    placeholder: 'e.g., LINECOLOR',
  },
  {
    key: 'CTAB_FNAME',
    category: 'Color & Style Fields',
    name: 'CTAB_FNAME',
    description: 'Cell color table field name (LVC_T_SCOL, e.g., CELLCOLOR)',
    detailHint: 'Internal table field name for per-cell color styling (LVC_T_SCOL).',
    type: 'string',
    defaultValue: '',
    placeholder: 'e.g., CELLCOLOR',
  },
  {
    key: 'STYLEFNAME',
    category: 'Color & Style Fields',
    name: 'STYLEFNAME',
    description: 'Cell style table field name (LVC_T_STYL, e.g., CELLSTYLE)',
    detailHint: 'Internal table field name for button/edit cell styles (LVC_T_STYL).',
    type: 'string',
    defaultValue: '',
    placeholder: 'e.g., CELLSTYLE',
  },
  {
    key: 'EXCP_FNAME',
    category: 'Color & Style Fields',
    name: 'EXCP_FNAME',
    description: 'Exception traffic light field (Lights, e.g., ZICON or LIGHTS)',
    detailHint: 'Field holding status light values (1-Red, 2-Yellow, 3-Green).',
    type: 'string',
    defaultValue: 'ZICON',
    placeholder: 'e.g., ZICON',
  },
  {
    key: 'EXCP_LED',
    category: 'Color & Style Fields',
    name: 'EXCP_LED',
    description: 'Use circular LED style for exception lights',
    detailHint: 'Displays exception status indicators as modern circular LEDs.',
    type: 'boolean',
    defaultValue: true,
  },
  {
    key: 'SHOW_ROW_NUMBERS',
    category: 'Color & Style Fields',
    name: 'SHOW_ROW_NUMBERS',
    description: 'Display row numbers (No.) on the left',
    detailHint: 'Shows a 1-based sequence number column at the start of the ALV grid.',
    type: 'boolean',
    defaultValue: true,
  },
];

// Map attribute key to actual AlvLayout property name
// Map attribute key to actual AlvLayout property name
const ALV_KEY_MAP: Record<string, keyof AlvLayout> = {
  ZEBRA: 'zebra',
  SMALLTITLE: 'smalltitle',
  NO_HEADERS: 'no_headers',
  NO_HGRIDLN: 'no_hgridln',
  NO_VGRIDLN: 'no_vgridln',
  NO_TOOLBAR: 'no_toolbar',
  NO_ROWMARK: 'no_rowmark',
  GRID_TITLE: 'grid_title',
  CWIDTH_OPT: 'cwidth_opt',
  SGL_CLK_HD: 'sgl_clk_hd',
  NO_MERGING: 'no_merging',
  KEYHOT: 'keyhot',
  TOTALS_BEF: 'totals_bef',
  NO_TOTLINE: 'no_totline',
  NO_TOTARR: 'no_totarr',
  NO_TOTEXP: 'no_totexp',
  NUMC_TOTAL: 'numc_total',
  TOTALS_ONLY: 'totals_only',
  SEL_MODE: 'sel_mode',
  DETAILTITL: 'detailtitl',
  DETAILINIT: 'detailinit',
  INFO_FNAME: 'info_fname',
  CTAB_FNAME: 'ctab_fname',
  STYLEFNAME: 'stylefname',
  EXCP_FNAME: 'excp_fname',
  EXCP_LED: 'excp_led',
  SHOW_ROW_NUMBERS: 'show_row_numbers',
};

const CANONICAL_ATTR_NAMES = Object.keys(ALV_KEY_MAP);

// Normalize any user-pasted or Excel-edited attribute name (case-insensitive, ignores spaces/underscores/hyphens)
function normalizeAttrName(input: any): string | null {
  if (input === undefined || input === null) return null;
  const raw = String(input).trim().toUpperCase();
  if (ALV_KEY_MAP[raw]) return raw;
  const stripped = raw.replace(/[\s_\-]/g, '');
  for (const name of CANONICAL_ATTR_NAMES) {
    if (name.replace(/[\s_\-]/g, '') === stripped) {
      return name;
    }
  }
  return null;
}

// Map of canonical attribute name to known description substring for separating description from value
const ATTR_DESCRIPTION_MAP = new Map<string, string>();
LAYOUT_ITEMS_CONFIG.forEach((i) => {
  ATTR_DESCRIPTION_MAP.set(i.name, i.description.trim().toLowerCase());
});

// Check if string matches boolean true
function parseBooleanFromExcel(str: any): boolean {
  if (str === true || str === 1) return true;
  if (!str) return false;
  const s = String(str).trim().toUpperCase();
  if (
    s === 'X' ||
    s === "'X'" ||
    s === '"X"' ||
    s === '1' ||
    s === 'TRUE' ||
    s === 'Y' ||
    s === 'YES' ||
    s === 'V' ||
    s === 'O' ||
    s === '체크' ||
    s === '적용' ||
    s === 'ON' ||
    s === 'T'
  ) {
    return true;
  }
  return false;
}

const CATEGORY_KO_MAP: Record<string, string> = {
  'Display & Appearance': '표시 및 외관',
  'Columns & Sorting': '컬럼 및 정렬',
  'Totals & Calculations': '합계 및 계산',
  'Selection Mode & Detail': '선택 모드 및 상세 팝업',
  'Color & Style Fields': '색상 및 스타일 필드',
};

const ITEM_KO_MAP: Record<
  string,
  {
    description: string;
    detailHint?: string;
    placeholder?: string;
    options?: Record<string, string>;
  }
> = {
  ZEBRA: {
    description: '줄무늬 교차 행 배경 (Zebra 패턴)',
    detailHint: "리스트 출력 및 미리보기에서 짝수/홀수 행 배경색을 교차 적용합니다 (gs_layo-zebra = 'X').",
  },
  SMALLTITLE: {
    description: '그리드 제목 글꼴 크기를 컬럼 헤더와 동일하게 설정',
    detailHint: 'ALV 제목 글꼴 크기를 작은 컬럼 헤더 크기에 맞춥니다.',
  },
  NO_HEADERS: {
    description: '컬럼 헤더 숨기기',
    detailHint: '그리드 상단의 컬럼 제목 헤더 행을 숨깁니다.',
  },
  NO_HGRIDLN: {
    description: '가로 구분선 숨기기',
    detailHint: '행 사이의 가로 구분선을 표시하지 않습니다.',
  },
  NO_VGRIDLN: {
    description: '세로 구분선 숨기기',
    detailHint: '컬럼 사이의 세로 구분선을 표시하지 않습니다.',
  },
  NO_TOOLBAR: {
    description: 'ALV 상단 툴바 숨기기',
    detailHint: '표준 및 사용자 정의 ALV 툴바를 모두 숨깁니다.',
  },
  NO_ROWMARK: {
    description: '행 선택 마크 버튼 숨기기',
    detailHint: '각 행 맨 앞의 행 선택 버튼을 숨깁니다 (선택 모드 A/D).',
  },
  GRID_TITLE: {
    description: '그리드 제목 텍스트 (그리드와 툴바 사이 표시)',
    detailHint: '그리드 컨트롤과 툴바 사이에 표시할 제목 텍스트입니다 (Char 70).',
    placeholder: '예: 판매오더 현황 조회',
  },
  CWIDTH_OPT: {
    description: '헤더 및 셀 값에 맞게 컬럼 너비 자동 최적화',
    detailHint: '헤더와 셀 데이터 길이에 따라 컬럼 너비를 자동으로 조정합니다.',
  },
  SGL_CLK_HD: {
    description: '컬럼 헤더 단일 클릭 정렬 활성화',
    detailHint: '헤더 클릭 시 즉시 정렬합니다 (1회 클릭 오름차순, 2회 클릭 내림차순).',
  },
  NO_MERGING: {
    description: '정렬 시 동일 값 셀 병합 비활성화',
    detailHint: '정렬된 컬럼에서 연속된 동일 값 셀을 병합하지 않고 개별 표시합니다.',
  },
  KEYHOT: {
    description: '모든 키(Key) 필드를 클릭 가능한 핫스팟으로 표시',
    detailHint: '모든 키 컬럼을 단일 클릭으로 HOTSPOT_CLICK을 유발하는 링크로 만듭니다.',
  },
  TOTALS_BEF: {
    description: '합계 행을 리스트 상단에 표시',
    detailHint: '총계 행을 하단이 아닌 첫 번째 상단 행에 배치합니다.',
  },
  NO_TOTLINE: {
    description: '총계(Grand Total)를 숨기고 소계만 표시',
    detailHint: '전체 총계 행은 숨기고 소계(Subtotal) 행만 유지합니다.',
  },
  NO_TOTARR: {
    description: '합계/소계 행의 범위 화살표 숨기기',
    detailHint: '합계 행에 표시되는 보조 화살표 아이콘을 비활성화합니다.',
  },
  NO_TOTEXP: {
    description: '소계 행의 펼치기/접기 아이콘 숨기기',
    detailHint: '소계 행 옆의 계층 펼치기/접기 토글 아이콘을 숨깁니다.',
  },
  NUMC_TOTAL: {
    description: 'NUMC 숫자형 문자 필드 합계 계산 허용',
    detailHint: '숫자 텍스트(NUMC) 컬럼에 대해 합계 집계를 허용합니다.',
  },
  TOTALS_ONLY: {
    description: '합계 라인만 표시 (개별 상세 행 숨김)',
    detailHint: '개별 데이터 행을 숨기고 소계 및 총계 라인만 요약 표시합니다.',
  },
  SEL_MODE: {
    description: '선택 모드 (A: 다중 행/열, B: 단일 행, C: 다중 행, D: 셀, SPACE: 기본값)',
    detailHint: '사용자가 그리드 내에서 행, 열 또는 셀을 선택하는 방식을 정의합니다.',
    options: {
      A: 'A: 다중 행 및 열 선택',
      B: 'B: 단일 행 선택',
      C: 'C: 다중 행 선택',
      D: 'D: 셀 선택',
      SPACE: 'SPACE: 기본 모드',
    },
  },
  DETAILTITL: {
    description: '상세 팝업 창 제목',
    detailHint: '행 상세 보기(&DETAIL) 모달의 헤더 제목입니다 (Char 30).',
    placeholder: '예: 상세 데이터 보기',
  },
  DETAILINIT: {
    description: '상세 팝업에 초기값/빈 필드도 표시',
    detailHint: '행 상세 팝업에서 공백 또는 0인 필드도 함께 표시합니다.',
  },
  INFO_FNAME: {
    description: '행 색상 필드명 (Char 4, 예: LINECOLOR)',
    detailHint: '행 단위 색상 코드(예: C310, C500)를 저장하는 4자리 필드명입니다.',
    placeholder: '예: LINECOLOR',
  },
  CTAB_FNAME: {
    description: '셀 색상 테이블 필드명 (LVC_T_SCOL, 예: CELLCOLOR)',
    detailHint: '셀별 색상 지정을 위한 인터널 테이블 필드명입니다 (LVC_T_SCOL).',
    placeholder: '예: CELLCOLOR',
  },
  STYLEFNAME: {
    description: '셀 스타일 테이블 필드명 (LVC_T_STYL, 예: CELLSTYLE)',
    detailHint: '버튼/편집 가능 여부 등 셀 스타일 제어용 필드명입니다 (LVC_T_STYL).',
    placeholder: '예: CELLSTYLE',
  },
  EXCP_FNAME: {
    description: '예외 신호등 필드명 (Lights, 예: ZICON 또는 LIGHTS)',
    detailHint: '상태 신호등 값(1-적색, 2-황색, 3-녹색)을 담는 필드명입니다.',
    placeholder: '예: ZICON',
  },
  EXCP_LED: {
    description: '예외 신호등에 원형 LED 스타일 사용',
    detailHint: '예외 상태 표시기를 원형 LED 아이콘으로 출력합니다.',
  },
  SHOW_ROW_NUMBERS: {
    description: '좌측 행 번호(No.) 표시',
    detailHint: 'ALV 그리드 좌측 끝에 1부터 시작하는 순번 컬럼을 표시합니다.',
  },
};

export const AlvLayoutSpreadsheet: React.FC<AlvLayoutSpreadsheetProps> = ({
  layout,
  onChange,
  isReadOnly = false,
}) => {
  const { lang, t } = useLanguage();
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [pasteModalText, setPasteModalText] = useState('');
  const [pasteModalError, setPasteModalError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Category expand/collapse toggle state: default all collapsed per RFQ v1.12
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  const handleExpandAll = () => {
    const all: Record<string, boolean> = {};
    groupedCategories.forEach((g) => {
      all[g.category] = true;
    });
    setExpandedCategories(all);
  };

  const handleCollapseAll = () => {
    setExpandedCategories({});
  };

  // Auto-clear toast
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Group items by category to calculate rowspans
  const groupedCategories = useMemo(() => {
    const map = new Map<string, LayoutItemConfig[]>();
    LAYOUT_ITEMS_CONFIG.forEach((item) => {
      const list = map.get(item.category) || [];
      list.push(item);
      map.set(item.category, list);
    });
    return Array.from(map.entries()).map(([category, items]) => ({
      category,
      items,
      count: items.length,
    }));
  }, []);

  // Get current value from layout object
  const getItemValue = (item: LayoutItemConfig): any => {
    const propKey = ALV_KEY_MAP[item.name];
    if (!propKey) return undefined;
    const val = (layout as any)[propKey];
    return val !== undefined ? val : item.defaultValue;
  };

  // Update a single item
  const handleUpdateItem = (item: LayoutItemConfig, value: any) => {
    if (isReadOnly) return;
    const propKey = ALV_KEY_MAP[item.name];
    if (!propKey) return;
    const next = { ...layout, [propKey]: value };
    onChange(next);
  };

  // Toggle boolean property
  const handleToggleBoolean = (item: LayoutItemConfig) => {
    if (isReadOnly) return;
    if (item.type !== 'boolean') return;
    const current = !!getItemValue(item);
    handleUpdateItem(item, !current);
  };

  // Apply parsed spreadsheet matrix to layout
  const applySpreadsheetMatrix = (matrix: string[][]): number => {
    if (isReadOnly) return 0;
    if (!matrix || matrix.length === 0) return 0;

    let updatedCount = 0;
    const nextLayout: any = { ...layout };

    // 1. Detect header row if present
    let headerAttrCol = -1;
    let headerValCol = -1;
    let dataStartRow = 0;

    const firstRow = matrix[0] || [];
    firstRow.forEach((cell, idx) => {
      const u = cell.trim().toUpperCase();
      if (
        u === 'ATTRIBUTE' ||
        u === 'FIELD NAME' ||
        u === 'FIELDNAME' ||
        u === '속성명' ||
        u === '속성' ||
        u === 'FIELD' ||
        u === 'PROPERTY'
      ) {
        headerAttrCol = idx;
      }
      if (
        u === 'VALUE' ||
        u === 'SETTING' ||
        u === '설정값' ||
        u === '설정' ||
        u === 'VALUE / SETTING' ||
        u === '값'
      ) {
        headerValCol = idx;
      }
    });

    if (headerAttrCol !== -1 && headerValCol !== -1) {
      dataStartRow = 1; // skip recognized header row
    }

    // 2. Map attributes and values from matrix rows
    const nameMap = new Map<string, string>(); // Canonical attribute name -> raw value string

    for (let r = dataStartRow; r < matrix.length; r++) {
      const row = matrix[r];
      if (!row || row.length === 0) continue;

      // Case A: Explicit Header Row detected
      if (headerAttrCol !== -1 && headerValCol !== -1) {
        const rawAttr = row[headerAttrCol] || '';
        const attrName = normalizeAttrName(rawAttr);
        if (attrName) {
          const val = row[headerValCol] !== undefined ? row[headerValCol] : '';
          nameMap.set(attrName, String(val).trim());
          continue;
        }
      }

      // Case B: Search row columns for any cell matching a known ALV attribute name
      let foundAttrCol = -1;
      let matchedName: string | null = null;

      for (let c = 0; c < row.length; c++) {
        const candidate = normalizeAttrName(row[c]);
        if (candidate) {
          foundAttrCol = c;
          matchedName = candidate;
          break;
        }
      }

      if (matchedName && foundAttrCol !== -1) {
        let val = '';

        if (foundAttrCol === 1) {
          // Standard 4-column: [Category, Attribute, Description, Value]
          if (row.length >= 4) {
            val = row[3] ?? '';
          } else if (row.length === 3) {
            // [Category, Attribute, Value]
            val = row[2] ?? '';
          } else {
            val = '';
          }
        } else if (foundAttrCol === 0) {
          if (row.length >= 3) {
            // [Attribute, Description, Value]
            val = row[row.length - 1] ?? '';
          } else if (row.length === 2) {
            // Either [Attribute, Value] or [Attribute, Description]
            const secondCell = (row[1] ?? '').trim();
            const knownDesc = ATTR_DESCRIPTION_MAP.get(matchedName) || '';
            const isDescription = knownDesc && secondCell && (
              knownDesc.includes(secondCell.toLowerCase()) ||
              secondCell.toLowerCase().includes(knownDesc.slice(0, 10))
            );

            if (isDescription) {
              val = ''; // It was just the description text, value omitted/empty
            } else {
              val = secondCell; // Second cell is the actual value
            }
          } else {
            val = '';
          }
        } else {
          // Attribute found at column index > 1
          val = row[row.length - 1] ?? '';
        }

        nameMap.set(matchedName, String(val).trim());
      }
    }

    if (nameMap.size > 0) {
      // Attribute-based update: match by Attribute property name
      nameMap.forEach((valStr, attrName) => {
        const itemConfig = LAYOUT_ITEMS_CONFIG.find((i) => i.name === attrName);
        if (!itemConfig) return;
        const propKey = ALV_KEY_MAP[attrName];
        if (!propKey) return;

        if (itemConfig.type === 'boolean') {
          nextLayout[propKey] = parseBooleanFromExcel(valStr);
          updatedCount++;
        } else if (itemConfig.type === 'select') {
          const trimmed = valStr.trim().toUpperCase();
          if (trimmed === 'A' || trimmed.startsWith('A')) {
            nextLayout[propKey] = 'A';
          } else if (trimmed === 'B' || trimmed.startsWith('B')) {
            nextLayout[propKey] = 'B';
          } else if (trimmed === 'C' || trimmed.startsWith('C')) {
            nextLayout[propKey] = 'C';
          } else if (trimmed === 'D' || trimmed.startsWith('D')) {
            nextLayout[propKey] = 'D';
          } else {
            nextLayout[propKey] = 'SPACE';
          }
          updatedCount++;
        } else {
          nextLayout[propKey] = valStr.trim();
          updatedCount++;
        }
      });
    } else {
      // Positional fallback update based on selected row (or starting from index 0)
      let effectiveMatrix = [...matrix];
      if (effectiveMatrix.length > 0) {
        const c0 = (effectiveMatrix[0][0] || '').trim().toUpperCase();
        if (c0 === 'VALUE' || c0 === 'SETTING' || c0 === '설정값' || c0 === '값') {
          effectiveMatrix = effectiveMatrix.slice(1);
        }
      }

      const startRow = selectedRowIndex !== null ? selectedRowIndex : 0;
      effectiveMatrix.forEach((cells, offset) => {
        const targetIdx = startRow + offset;
        if (targetIdx >= LAYOUT_ITEMS_CONFIG.length) return;
        const itemConfig = LAYOUT_ITEMS_CONFIG[targetIdx];
        const propKey = ALV_KEY_MAP[itemConfig.name];
        if (!propKey) return;

        // Take value from last column (or cell 0 if single column copied)
        const cellVal = cells[cells.length - 1] ?? cells[0] ?? '';

        if (itemConfig.type === 'boolean') {
          nextLayout[propKey] = parseBooleanFromExcel(cellVal);
          updatedCount++;
        } else if (itemConfig.type === 'select') {
          const trimmed = String(cellVal).trim().toUpperCase();
          if (trimmed === 'A' || trimmed.startsWith('A')) {
            nextLayout[propKey] = 'A';
          } else if (trimmed === 'B' || trimmed.startsWith('B')) {
            nextLayout[propKey] = 'B';
          } else if (trimmed === 'C' || trimmed.startsWith('C')) {
            nextLayout[propKey] = 'C';
          } else if (trimmed === 'D' || trimmed.startsWith('D')) {
            nextLayout[propKey] = 'D';
          } else {
            nextLayout[propKey] = 'SPACE';
          }
          updatedCount++;
        } else {
          nextLayout[propKey] = String(cellVal).trim();
          updatedCount++;
        }
      });
    }

    if (updatedCount > 0) {
      onChange(nextLayout);
      setToastMessage(
        t(
          `Applied spreadsheet data (${updatedCount} attributes updated).`,
          `스프레드시트 데이터를 적용했습니다 (${updatedCount}개 속성 업데이트).`
        )
      );
    }

    return updatedCount;
  };

  // Keyboard navigation & space to toggle
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // If active element is an input or select, don't hijack keyboard navigation
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLSelectElement) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedRowIndex((prev) => (prev === null ? 0 : Math.min(LAYOUT_ITEMS_CONFIG.length - 1, prev + 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedRowIndex((prev) => (prev === null ? 0 : Math.max(0, prev - 1)));
    } else if ((e.key === ' ' || e.key === 'Enter') && !isReadOnly) {
      if (selectedRowIndex !== null && LAYOUT_ITEMS_CONFIG[selectedRowIndex]) {
        const item = LAYOUT_ITEMS_CONFIG[selectedRowIndex];
        if (item.type === 'boolean') {
          e.preventDefault();
          handleToggleBoolean(item);
        }
      }
    }
  };

  // Direct paste on the spreadsheet container
  const handleContainerPaste = (e: React.ClipboardEvent) => {
    if (isReadOnly) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text || !text.trim()) return;

    const matrix = parseSpreadsheetText(text);
    if (matrix.length === 0) return;

    e.preventDefault();
    applySpreadsheetMatrix(matrix);
  };

  // Copy entire table to Excel TSV
  const handleCopyTableToExcel = async () => {
    const lines: string[] = ['Category\tAttribute\tDescription\tValue'];

    LAYOUT_ITEMS_CONFIG.forEach((item) => {
      const val = getItemValue(item);
      let valStr = '';
      if (item.type === 'boolean') {
        valStr = val ? 'X' : '';
      } else {
        valStr = String(val || '');
      }
      lines.push(`${item.category}\t${item.name}\t${item.description}\t${valStr}`);
    });

    const success = await copyTsvToClipboard(lines.join('\n'));
    if (success) {
      setCopyFeedback(true);
      setToastMessage(
        t('Copied layout table to clipboard (TSV).', '레이아웃 테이블을 클립보드에 복사했습니다 (TSV).')
      );
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  };

  // Quick reset to defaults
  const handleResetDefaults = () => {
    if (isReadOnly) return;
    const next: any = { ...layout };
    LAYOUT_ITEMS_CONFIG.forEach((item) => {
      const propKey = ALV_KEY_MAP[item.name];
      if (propKey) {
        next[propKey] = item.defaultValue;
      }
    });
    onChange(next);
    setToastMessage(
      t('Restored SAP standard layout defaults.', 'SAP 표준 레이아웃 기본값으로 복원했습니다.')
    );
  };

  // Quick toggle all booleans
  const handleToggleAllBooleans = (check: boolean) => {
    if (isReadOnly) return;
    const next: any = { ...layout };
    let count = 0;
    LAYOUT_ITEMS_CONFIG.forEach((item) => {
      if (item.type === 'boolean') {
        const propKey = ALV_KEY_MAP[item.name];
        if (propKey) {
          next[propKey] = check;
          count++;
        }
      }
    });
    onChange(next);
    setToastMessage(
      check
        ? t('Checked all boolean attributes.', '모든 체크박스 속성을 선택했습니다.')
        : t('Unchecked all boolean attributes.', '모든 체크박스 속성을 해제했습니다.')
    );
  };
  // Live detection of ALV attributes in pasteModalText
  const detectedAttrSummary = useMemo(() => {
    if (!pasteModalText.trim()) return null;
    const matrix = parseSpreadsheetText(pasteModalText);
    if (matrix.length === 0) return null;
    const detected: string[] = [];
    matrix.forEach((row) => {
      for (const cell of row) {
        const norm = normalizeAttrName(cell);
        if (norm && !detected.includes(norm)) {
          detected.push(norm);
        }
      }
    });
    return {
      count: detected.length,
      list: detected,
      rowCount: matrix.length,
    };
  }, [pasteModalText]);

  // Apply paste modal
  const handleApplyPasteModal = () => {
    if (!pasteModalText.trim()) return;
    setPasteModalError(null);
    const matrix = parseSpreadsheetText(pasteModalText);
    const updated = applySpreadsheetMatrix(matrix);
    if (updated > 0) {
      setPasteModalOpen(false);
      setPasteModalText('');
      setPasteModalError(null);
    } else {
      setPasteModalError(
        t(
          'No recognized ALV attributes found. Verify that Attribute names (e.g., ZEBRA, GRID_TITLE) and values are included.',
          '인식된 ALV 속성이 없습니다. Attribute 이름(예: ZEBRA, GRID_TITLE)과 값이 포함되어 있는지 확인해 주세요.'
        )
      );
    }
  };

  return (
    <div
      ref={tableRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPaste={handleContainerPaste}
      className="space-y-4 font-sans focus:outline-none"
    >
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-20 right-8 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs font-medium flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2 duration-200">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Action Controls Bar (Boxless to match Field Catalog / Sort / Toolbar tabs) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Configure the Layout
          </h3>
          <p className="text-xs text-slate-500">
            {t(
              'Configure CL_GUI_ALV_GRID appearance, column width optimization, sorting, totals, selection mode, and color control parameters (LVC_S_LAYO).',
              'CL_GUI_ALV_GRID 외관, 컬럼 너비 최적화, 정렬, 합계, 선택 모드 및 색상 제어 파라미터(LVC_S_LAYO)를 설정합니다.'
            )}
          </p>
        </div>

        {/* Action Buttons (Icon-Only per RFQ v1.14) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleCopyTableToExcel}
            className="p-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 hover:text-blue-700 border border-slate-300 rounded-md transition-colors flex items-center justify-center shadow-2xs cursor-pointer"
            title={t('Copy to Excel', '엑셀로 복사')}
            aria-label={t('Copy to Excel', '엑셀로 복사')}
          >
            {copyFeedback ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Copy className="w-4 h-4 text-blue-600" />
            )}
          </button>

          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => !isReadOnly && setPasteModalOpen(true)}
            className="p-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 hover:text-emerald-700 border border-slate-300 rounded-md transition-colors flex items-center justify-center shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('Paste from Excel', '엑셀에서 붙여넣기')}
            aria-label={t('Paste from Excel', '엑셀에서 붙여넣기')}
          >
            <ClipboardPaste className="w-4 h-4 text-emerald-600" />
          </button>

          <button
            type="button"
            disabled={isReadOnly}
            onClick={handleResetDefaults}
            className="p-2 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 hover:text-slate-900 border border-slate-300 rounded-md transition-colors flex items-center justify-center shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('Reset Defaults', '기본값 복원')}
            aria-label={t('Reset Defaults', '기본값 복원')}
          >
            <RotateCcw className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Spreadsheet Instructions Banner */}
      <div className="flex items-center justify-between text-xs bg-blue-50/70 border border-blue-200/80 rounded-lg px-3 py-2 text-blue-900">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            {lang === 'ko' ? (
              <>
                <strong>스프레드시트 붙여넣기 지원:</strong> 엑셀에서 셀을 복사(Ctrl+C)한 뒤 표 안에서 <strong>Ctrl+V</strong>를 누르면 값이 바로 적용됩니다.
              </>
            ) : (
              <>
                <strong>Spreadsheet Paste Supported:</strong> Copy cells from Excel (Ctrl+C) and press <strong>Ctrl+V</strong> directly inside this table to apply values.
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleExpandAll}
            className="p-1.5 rounded hover:bg-white text-blue-700 hover:text-blue-900 border border-blue-200 bg-white/70 transition-colors shadow-2xs cursor-pointer"
            title={t('Expand All Categories', '모든 분류 펼치기')}
            aria-label={t('Expand All Categories', '모든 분류 펼치기')}
          >
            <ChevronsDown className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="p-1.5 rounded hover:bg-white text-blue-700 hover:text-blue-900 border border-blue-200 bg-white/70 transition-colors shadow-2xs cursor-pointer"
            title={t('Collapse All Categories', '모든 분류 접기')}
            aria-label={t('Collapse All Categories', '모든 분류 접기')}
          >
            <ChevronsUp className="w-3.5 h-3.5" />
          </button>
          <div className="h-4 w-px bg-blue-300 mx-1" />
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => handleToggleAllBooleans(true)}
            className="p-1.5 rounded hover:bg-white text-blue-700 hover:text-blue-900 border border-blue-200 bg-white/70 transition-colors shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('Check All', '전체 선택')}
            aria-label={t('Check All', '전체 선택')}
          >
            <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
          </button>
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => handleToggleAllBooleans(false)}
            className="p-1.5 rounded hover:bg-white text-slate-600 hover:text-slate-900 border border-blue-200 bg-white/70 transition-colors shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={t('Uncheck All', '전체 해제')}
            aria-label={t('Uncheck All', '전체 해제')}
          >
            <Square className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Main Spreadsheet Table */}
      <div className="border border-slate-300 rounded-xl overflow-hidden bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse font-sans">
            <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-semibold text-[11px] select-none">
              <tr>
                <th
                  className="py-2.5 px-2 text-center w-10 bg-slate-200 border-r border-slate-300 text-slate-500 font-mono text-[10px]"
                  title={t('Spreadsheet Row Number / Toggle', '스프레드시트 행 번호 / 토글')}
                >
                  fx
                </th>
                <th className="py-2.5 px-3 w-52 border-r border-slate-300 font-bold">
                  {t('Category', '분류')}
                </th>
                <th className="py-2.5 px-3 w-44 border-r border-slate-300 font-mono font-bold">
                  Attribute
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300 font-bold">
                  {t('Description', '설명')}
                </th>
                <th className="py-2.5 px-3 text-center w-48 font-bold">
                  {t('Value / Setting', '값 / 설정')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {groupedCategories.map(({ category, items }) => {
                const isExpanded = !!expandedCategories[category];
                const displayCategory = lang === 'ko' ? (CATEGORY_KO_MAP[category] || category) : category;

                return (
                  <React.Fragment key={category}>
                    {/* Category Summary Row (Clicking toggles hide/show fields) */}
                    <tr
                      onClick={() => toggleCategory(category)}
                      className="bg-slate-100/90 hover:bg-blue-50/80 cursor-pointer border-y border-slate-300 select-none transition-colors group"
                      title={
                        isExpanded
                          ? t(`Click to collapse ${category}`, `클릭하여 ${displayCategory} 접기`)
                          : t(`Click to expand ${category}`, `클릭하여 ${displayCategory} 펼치기`)
                      }
                    >
                      <td className="py-2.5 px-2 text-center bg-slate-200 border-r border-slate-300 text-slate-600 font-mono text-[10px]">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 mx-auto text-blue-600 group-hover:scale-110 transition-transform" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 mx-auto text-slate-500 group-hover:text-blue-600 group-hover:scale-110 transition-transform" />
                        )}
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-300 font-bold text-slate-900">
                        <span className="font-bold text-slate-900 text-xs">{displayCategory}</span>
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-300"></td>
                      <td className="py-2.5 px-3 border-r border-slate-300"></td>
                      <td className="py-2.5 px-3 text-center text-xs">
                        <div className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-slate-200 text-slate-600 group-hover:text-blue-700 transition-colors">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-blue-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-blue-600" />
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Attribute Rows (Only shown when category is expanded) */}
                    {isExpanded &&
                      items.map((item) => {
                        const globalIdx = LAYOUT_ITEMS_CONFIG.findIndex((i) => i.name === item.name);
                        const isSelected = selectedRowIndex === globalIdx;
                        const val = getItemValue(item);
                        const koMeta = ITEM_KO_MAP[item.name];
                        const displayDesc = lang === 'ko' && koMeta ? koMeta.description : item.description;
                        const displayHint = lang === 'ko' && koMeta?.detailHint ? koMeta.detailHint : item.detailHint;
                        const displayPlaceholder = lang === 'ko' && koMeta?.placeholder ? koMeta.placeholder : item.placeholder;

                        return (
                          <tr
                            key={item.name}
                            onClick={() => setSelectedRowIndex(globalIdx)}
                            className={`transition-colors ${
                              isSelected
                                ? 'bg-blue-50/70 ring-1 ring-inset ring-blue-500'
                                : 'hover:bg-slate-50/80 bg-white'
                            }`}
                          >
                            {/* 1. Row Number */}
                            <td
                              className={`py-2 px-1 text-center font-mono font-bold text-[10px] border-r border-slate-300 select-none ${
                                isSelected ? 'bg-blue-200 text-blue-900' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {globalIdx + 1}
                            </td>

                            {/* 2. Category Column (Clicking toggles/collapses category) */}
                            <td
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleCategory(category);
                              }}
                              className="py-2 px-3 border-r border-slate-200 text-slate-700 cursor-pointer hover:bg-blue-100/60 select-none"
                              title={t('Click to collapse category', '클릭하여 분류 접기')}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800 border border-slate-300">
                                  {displayCategory}
                                </span>
                              </div>
                            </td>

                            {/* 3. Field Name Column (ALWAYS ENGLISH per RFQ v1.29) */}
                            <td className="py-2 px-3 border-r border-slate-200 font-mono font-bold text-blue-950 text-[11px]">
                              <span className="bg-blue-50 text-blue-900 border border-blue-200 px-1.5 py-0.5 rounded">
                                {item.name}
                              </span>
                            </td>

                            {/* 4. Description Column */}
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-800">
                              <div className="font-semibold text-slate-900">
                                {displayDesc}
                              </div>
                              {displayHint && (
                                <div className="text-[11px] text-slate-500 mt-0.5 font-normal">
                                  {displayHint}
                                </div>
                              )}
                            </td>

                            {/* 5. Value / Setting Column */}
                            <td className="py-1.5 px-3 text-center align-middle">
                              {item.type === 'boolean' ? (
                                <div
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isReadOnly) return;
                                    handleToggleBoolean(item);
                                  }}
                                  className={`flex items-center justify-center py-1 ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={!!val}
                                    disabled={isReadOnly}
                                    onChange={(e) => handleUpdateItem(item, e.target.checked)}
                                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                  />
                                  <span
                                    className={`ml-2 font-mono text-[11px] font-bold ${
                                      val ? 'text-blue-700' : 'text-slate-400'
                                    }`}
                                  >
                                    {val ? 'X' : ''}
                                  </span>
                                </div>
                              ) : item.type === 'select' ? (
                                <InspectableSelect
                                  isReadOnly={isReadOnly}
                                  value={String(val || 'A')}
                                  onChange={(e) => handleUpdateItem(item, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  aria-label={item.name}
                                  className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs"
                                >
                                  {item.options?.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {lang === 'ko' && koMeta?.options?.[opt.value]
                                        ? koMeta.options[opt.value]
                                        : opt.label}
                                    </option>
                                  ))}
                                </InspectableSelect>
                              ) : (
                                <input
                                  type="text"
                                  value={String(val || '')}
                                  readOnly={isReadOnly}
                                  placeholder={displayPlaceholder || ''}
                                  onChange={(e) => handleUpdateItem(item, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-medium text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs read-only:bg-slate-50 read-only:text-slate-600"
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paste Modal for Excel */}
      {pasteModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-5">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 font-sans">
            {/* Modal Header */}
            <div className="px-5 py-3.5 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between shrink-0 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">
                    {t('Paste Layout (LVC_S_LAYO) Attributes from Excel', '엑셀에서 레이아웃 (LVC_S_LAYO) 속성 붙여넣기')}
                  </h3>
                  <p className="text-[11px] text-blue-200">
                    {t('Paste a copied range (Ctrl+C) from Excel or Google Sheets below.', '엑셀 또는 구글 시트에서 복사(Ctrl+C)한 범위를 아래에 붙여넣으세요.')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPasteModalOpen(false)}
                aria-label={t('Close', '닫기')}
                title={t('Close', '닫기')}
                className="p-1 rounded-md text-blue-200 hover:text-white hover:bg-blue-600/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Guide & Status */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs space-y-2">
              <p className="text-slate-700">
                {lang === 'ko' ? (
                  <>
                    속성명(예: <strong>ZEBRA</strong>, <strong>GRID_TITLE</strong>, <strong>CWIDTH_OPT</strong>)과 값(<strong>X</strong>, 텍스트 또는 공백)을 포함해 붙여넣으세요.
                  </>
                ) : (
                  <>
                    Include attribute names (e.g., <strong>ZEBRA</strong>, <strong>GRID_TITLE</strong>, <strong>CWIDTH_OPT</strong>) and values (<strong>X</strong>, text, or blank).
                  </>
                )}
              </p>
              {detectedAttrSummary && detectedAttrSummary.count > 0 && (
                <div className="px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-md text-[11px] text-emerald-800 flex items-center gap-1.5 font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>
                    {t('Detected attributes:', '감지된 속성:')} <strong>{detectedAttrSummary.count}</strong>
                    <span className="text-emerald-600 ml-1 font-mono text-[10px]">
                      ({detectedAttrSummary.list.slice(0, 6).join(', ')}
                      {detectedAttrSummary.list.length > 6 ? ` +${detectedAttrSummary.list.length - 6}${t(' more', '개 더')}` : ''})
                    </span>
                  </span>
                </div>
              )}
              {detectedAttrSummary && detectedAttrSummary.count === 0 && (
                <div className="px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-800 flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    {lang === 'ko' ? (
                      <>
                        감지된 속성이 없습니다. 엑셀의 <strong>Attribute</strong> 열을 포함해 주세요.
                      </>
                    ) : (
                      <>
                        No attributes detected. Include the <strong>Attribute</strong> column from Excel.
                      </>
                    )}
                  </span>
                </div>
              )}
              {pasteModalError && (
                <div className="px-2.5 py-1.5 bg-rose-50 border border-rose-200 rounded-md text-[11px] text-rose-800 flex items-center gap-1.5 font-medium">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  <span>{pasteModalError}</span>
                </div>
              )}
            </div>

            {/* Textarea */}
            <div className="p-4 flex-1 overflow-y-auto">
              <textarea
                rows={9}
                value={pasteModalText}
                onChange={(e) => {
                  setPasteModalText(e.target.value);
                  if (pasteModalError) setPasteModalError(null);
                }}
                placeholder={`Example:\nCategory\tAttribute\tDescription\tValue\nDisplay & Appearance\tZEBRA\tStriped pattern\tX\nDisplay & Appearance\tGRID_TITLE\tGrid title\tSales Report\nColumns & Sorting\tCWIDTH_OPT\tOptimize width\tX\nSelection Mode & Detail\tSEL_MODE\tSelection mode\tA`}
                className="w-full h-48 p-3 font-mono text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50 resize-none"
                autoFocus
              />
            </div>

            {/* Modal Actions */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setPasteModalOpen(false);
                  setPasteModalError(null);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer transition-colors"
              >
                {t('Cancel', '취소')}
              </button>
              <button
                type="button"
                onClick={handleApplyPasteModal}
                disabled={!pasteModalText.trim()}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer transition-colors disabled:opacity-40 flex items-center gap-1.5 shadow-xs"
              >
                <Check className="w-4 h-4" />
                <span>{t('Apply Attributes', '속성 적용')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
