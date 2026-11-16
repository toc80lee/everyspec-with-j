import React, { useState, useRef, useEffect } from 'react';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Check,
  Search,
  Copy,
  Layers,
  Sparkles,
  Bookmark,
  Save,
  Settings,
  X,
} from 'lucide-react';
import { AlvToolbarButton, ProgramSpec, CustomToolbarVariant } from '../types/sap';
import { DEFAULT_ALV_TOOLBAR_BUTTONS } from '../data/defaultToolbarButtons';
import { SapToolbarIcon } from './AlvToolbar';
import {
  getToolbarVariants,
  saveUserToolbarVariant,
  deleteUserToolbarVariant,
} from '../utils/toolbarVariantStorage';
import {
  exportToolbarButtonsToTsv,
  copyTsvToClipboard,
  parseSpreadsheetText,
  CellRange,
  isCellInRange,
  extractCellRangeTsv,
  isTruthy,
} from '../utils/spreadsheetClipboard';
import { InspectableSelect } from './InspectableSelect';
import { useLanguage } from '../contexts/LanguageContext';

interface ToolbarEditorProps {
  spec: ProgramSpec;
  onChange: (updatedButtons: AlvToolbarButton[]) => void;
  isReadOnly?: boolean;
}

export const ToolbarEditor: React.FC<ToolbarEditorProps> = ({
  spec,
  onChange,
  isReadOnly = false,
}) => {
  const { lang, t } = useLanguage();
  const buttons = spec.toolbar_buttons && spec.toolbar_buttons.length > 0
    ? spec.toolbar_buttons
    : DEFAULT_ALV_TOOLBAR_BUTTONS;

  const [activeTab, setActiveTab] = useState<'standard' | 'custom'>('custom');
  const [searchQuery, setSearchQuery] = useState('');

  // Variant management state (Custom Toolbar only per RFQ v1.16)
  const [variants, setVariants] = useState<CustomToolbarVariant[]>(() => getToolbarVariants());
  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [newVariantId, setNewVariantId] = useState('');
  const [newVariantName, setNewVariantName] = useState('');
  const [newVariantDesc, setNewVariantDesc] = useState('');
  const [variantToast, setVariantToast] = useState<string | null>(null);

  const handleSelectVariant = (variantId: string) => {
    if (isReadOnly) return;
    setSelectedVariantId(variantId);
    const found = variants.find((v) => v.id === variantId);
    if (!found) return;

    const loadedButtons: AlvToolbarButton[] = found.buttons.map((b, i) => ({
      ...b,
      id: `btn-var-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
      is_standard: false,
    }));

    onChange([...standardButtons, ...loadedButtons]);
    setVariantToast(
      t(
        `Loaded variant '${found.id}' (${found.name}) — ${loadedButtons.length} custom buttons.`,
        `변형 '${found.id}' (${found.name})을 불러왔습니다 — 사용자 정의 버튼 ${loadedButtons.length}개.`
      )
    );
    setTimeout(() => setVariantToast(null), 3000);
  };

  const handleSaveVariant = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!newVariantId.trim()) return;

    const cleanId = newVariantId.trim().toUpperCase();
    const cleanName = newVariantName.trim() || cleanId;

    const toSave: CustomToolbarVariant = {
      id: cleanId,
      name: cleanName,
      description: newVariantDesc.trim(),
      is_builtin: false,
      buttons: customButtons.map((b) => ({ ...b })),
    };

    const updated = saveUserToolbarVariant(toSave);
    setVariants(updated);
    setSelectedVariantId(cleanId);
    setIsSaveModalOpen(false);
    setNewVariantId('');
    setNewVariantName('');
    setNewVariantDesc('');
    setVariantToast(t(`Saved variant '${cleanId}'.`, `변형 '${cleanId}'을 저장했습니다.`));
    setTimeout(() => setVariantToast(null), 3000);
  };

  const handleDeleteVariant = (id: string) => {
    if (isReadOnly) return;
    if (window.confirm(t(`Delete variant '${id}'?`, `변형 '${id}'을 삭제하시겠습니까?`))) {
      const updated = deleteUserToolbarVariant(id);
      setVariants(updated);
      if (selectedVariantId === id) setSelectedVariantId('');
    }
  };

  // Cell range selection state
  const [selectedRange, setSelectedRange] = useState<CellRange | null>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const dragAnchorRef = useRef<{ row: number; col: number } | null>(null);

  // Mouse up listener on window
  useEffect(() => {
    const handleMouseUp = () => {
      setIsMouseDown(false);
    };
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Separate buttons into Standard vs Custom
  const standardButtons = buttons.filter(
    (b) => b.is_standard !== false || b.function.startsWith('&')
  );
  const customButtons = buttons.filter(
    (b) => b.is_standard === false && !b.function.startsWith('&')
  );

  const displayedButtons = activeTab === 'standard' ? standardButtons : customButtons;

  const filteredButtons = displayedButtons.filter(
    (b) =>
      b.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.function.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.quickinfo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Column definitions for Toolbar table (Columns A..G, Type column deleted per RFQ v1.05)
  // 0: DISPLAY (visible)
  // 1: ICON
  // 2: FUNCTION
  // 3: BUTTON TEXT
  // 4: QUICKINFO
  // 5: SEPARATOR (separator_before)
  // 6: DISABLED
  const COL_COUNT = 7;

  const getToolbarCellValue = (rowIdx: number, colIdx: number): string => {
    const btn = filteredButtons[rowIdx];
    if (!btn) return '';
    switch (colIdx) {
      case 0: return btn.visible !== false ? 'X' : '';
      case 1: return btn.icon || '';
      case 2: return btn.function || '';
      case 3: return btn.text || '';
      case 4: return btn.quickinfo || '';
      case 5: return btn.separator_before ? 'X' : '';
      case 6: return btn.disabled ? 'X' : '';
      default: return '';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      const activeEl = document.activeElement;
      if (
        activeEl instanceof HTMLInputElement &&
        activeEl.selectionStart !== null &&
        activeEl.selectionEnd !== null &&
        activeEl.selectionStart !== activeEl.selectionEnd
      ) {
        return;
      }
      if (selectedRange) {
        e.preventDefault();
        const tsv = extractCellRangeTsv(selectedRange, getToolbarCellValue);
        if (tsv) {
          copyTsvToClipboard(tsv);
        }
      }
    }
  };

  // Handle cell selection
  const handleCellMouseDown = (rowIdx: number, colIdx: number) => {
    setIsMouseDown(true);
    dragAnchorRef.current = { row: rowIdx, col: colIdx };
    setSelectedRange({
      startRow: rowIdx,
      startCol: colIdx,
      endRow: rowIdx,
      endCol: colIdx,
    });
  };

  const handleCellMouseEnter = (rowIdx: number, colIdx: number) => {
    if (!isMouseDown || !dragAnchorRef.current) return;
    setSelectedRange({
      startRow: dragAnchorRef.current.row,
      startCol: dragAnchorRef.current.col,
      endRow: rowIdx,
      endCol: colIdx,
    });
  };

  // Direct paste into selected cells and expand rows if needed
  const handleTablePaste = (e: React.ClipboardEvent) => {
    if (isReadOnly) return;
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    const matrix = parseSpreadsheetText(text);
    if (matrix.length === 0) return;

    e.preventDefault();

    const startR = selectedRange
      ? Math.min(selectedRange.startRow, selectedRange.endRow)
      : 0;
    const startC = selectedRange
      ? Math.min(selectedRange.startCol, selectedRange.endCol)
      : (matrix[0].length === 1 ? 3 : 0); // If 1 col, default to button text if not selected

    const pastedRowCount = matrix.length;
    const pastedColCount = Math.max(...matrix.map((r) => r.length));

    // Clone buttons
    const updated = [...buttons];

    // Find indices of currently displayed buttons in the master buttons list
    const displayedMasterIndices: number[] = displayedButtons.map((db) =>
      updated.findIndex((b) => b.id === db.id)
    );

    const neededTotal = startR + pastedRowCount;
    const currentDisplayedCount = displayedButtons.length;

    // If more rows needed and we are in Custom tab, automatically add rows!
    if (neededTotal > currentDisplayedCount) {
      const rowsToAdd = neededTotal - currentDisplayedCount;
      for (let i = 0; i < rowsToAdd; i++) {
        const nextIdx = customButtons.length + i + 1;
        const newBtn: AlvToolbarButton = {
          id: `btn-custom-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 4)}`,
          function: `FC0${nextIdx}`,
          text: `Custom Button ${nextIdx}`,
          quickinfo: `Custom Button ${nextIdx}`,
          icon: 'ICON_EXECUTE',
          disabled: false,
          visible: true,
          is_standard: false,
          separator_before: false,
        };
        updated.push(newBtn);
        displayedMasterIndices.push(updated.length - 1);
      }
    }

    // Apply values
    matrix.forEach((rowVals, rOffset) => {
      const targetRowIdx = startR + rOffset;
      const masterIdx = displayedMasterIndices[targetRowIdx];
      if (masterIdx === undefined || !updated[masterIdx]) return;

      const targetBtn = { ...updated[masterIdx] };

      rowVals.forEach((val, cOffset) => {
        const targetColIdx = startC + cOffset;
        const trimmed = val.trim();

        switch (targetColIdx) {
          case 0: // DISPLAY
            targetBtn.visible = isTruthy(trimmed, true);
            break;
          case 1: // ICON
            if (trimmed) targetBtn.icon = trimmed;
            break;
          case 2: // FUNCTION
            if (trimmed) targetBtn.function = trimmed.toUpperCase();
            break;
          case 3: // BUTTON TEXT
            targetBtn.text = trimmed;
            break;
          case 4: // QUICKINFO
            targetBtn.quickinfo = trimmed;
            break;
          case 5: // SEPARATOR
            targetBtn.separator_before = isTruthy(trimmed, false);
            break;
          case 6: // DISABLED
            targetBtn.disabled = isTruthy(trimmed, false);
            break;
        }
      });

      updated[masterIdx] = targetBtn;
    });

    onChange(updated);

    // Expand selection to encompass pasted area
    setSelectedRange({
      startRow: startR,
      startCol: startC,
      endRow: startR + pastedRowCount - 1,
      endCol: Math.min(startC + pastedColCount - 1, COL_COUNT - 1),
    });
  };

  // Keyboard navigation
  const handleCellKeyDown = (e: React.KeyboardEvent, rowIndex: number, colKey: string) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextInput = document.querySelector(`[data-tcell="${rowIndex + 1}-${colKey}"]`) as HTMLElement;
      if (nextInput) nextInput.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevInput = document.querySelector(`[data-tcell="${rowIndex - 1}-${colKey}"]`) as HTMLElement;
      if (prevInput) prevInput.focus();
    }
  };

  // Copy table to Excel
  const handleCopyTable = async () => {
    const tsv = exportToolbarButtonsToTsv(displayedButtons);
    await copyTsvToClipboard(tsv);
  };

  // Add custom button
  const handleAddButton = () => {
    if (isReadOnly) return;
    const nextIdx = customButtons.length + 1;
    const newBtn: AlvToolbarButton = {
      id: `btn-custom-${Date.now()}`,
      function: `FC0${nextIdx}`,
      text: `Custom Button ${nextIdx}`,
      quickinfo: `Execute custom function ${nextIdx}`,
      icon: 'ICON_EXECUTE',
      disabled: false,
      visible: true,
      is_standard: false,
      separator_before: false,
    };
    onChange([...buttons, newBtn]);
    setActiveTab('custom');
  };

  // Reset to default 16 standard buttons
  const handleResetDefaults = () => {
    if (isReadOnly) return;
    if (
      window.confirm(
        t(
          'Reset standard toolbar to SAP standard 16 buttons (&EXPORT follows &PRINT)?',
          '표준 툴바를 SAP 표준 16개 버튼(&PRINT 다음에 &EXPORT 배치)으로 초기화하시겠습니까?'
        )
      )
    ) {
      onChange([...DEFAULT_ALV_TOOLBAR_BUTTONS, ...customButtons]);
    }
  };

  // Move custom buttons up/down
  const handleMoveCustom = (customIndex: number, direction: 'up' | 'down') => {
    if (isReadOnly) return;
    const targetIdx = direction === 'up' ? customIndex - 1 : customIndex + 1;
    if (targetIdx < 0 || targetIdx >= customButtons.length) return;

    const reorderedCustom = [...customButtons];
    const temp = reorderedCustom[customIndex];
    reorderedCustom[customIndex] = reorderedCustom[targetIdx];
    reorderedCustom[targetIdx] = temp;

    // Combine standard and reordered custom
    onChange([...standardButtons, ...reorderedCustom]);
  };

  // Delete custom button
  const handleDeleteCustom = (id: string) => {
    if (isReadOnly) return;
    onChange(buttons.filter((b) => b.id !== id));
  };

  // Update button field
  const handleUpdate = (id: string, patch: Partial<AlvToolbarButton>) => {
    if (isReadOnly) return;
    onChange(buttons.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="space-y-3 font-sans focus:outline-none"
    >
      {/* Top Header (Matched to Layout tab) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Configure the Toolbar
          </h3>
          <p className="text-xs text-slate-500">
            {t(
              'Configure standard ALV grid toolbar visibility and define custom application buttons, function codes, icons, and variants.',
              '표준 ALV 그리드 툴바 표시 여부를 설정하고 사용자 정의 버튼, 펑션 코드, 아이콘 및 변형(Variant)을 구성합니다.'
            )}
          </p>
        </div>
      </div>

      {/* Tab Switcher: Standard vs Custom */}
      <div className="flex items-center justify-between gap-3 flex-wrap border-b border-slate-200 pb-2">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setActiveTab('standard');
              setSelectedRange(null);
            }}
            className={`px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'standard'
                ? 'bg-white text-blue-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>{t(`Standard (${standardButtons.length})`, `표준 (${standardButtons.length})`)}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('custom');
              setSelectedRange(null);
            }}
            className={`px-3.5 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
              activeTab === 'custom'
                ? 'bg-white text-emerald-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>{t(`Custom (${customButtons.length})`, `사용자 정의 (${customButtons.length})`)}</span>
          </button>
        </div>

        {/* Right side controls per active tab: Simple Icon buttons with Tooltips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {activeTab === 'custom' && (
            <button
              type="button"
              disabled={isReadOnly}
              onClick={handleAddButton}
              title={t('Add Custom Button', '사용자 정의 버튼 추가')}
              aria-label={t('Add Custom Button', '사용자 정의 버튼 추가')}
              className="p-1.5 text-white bg-blue-700 hover:bg-blue-800 rounded transition-colors flex items-center justify-center shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}

          {activeTab === 'standard' && (
            <button
              type="button"
              disabled={isReadOnly}
              onClick={handleResetDefaults}
              title={t('Restore Standard Toolbar (16 Buttons)', '표준 툴바 복원 (16개 버튼)')}
              aria-label={t('Restore Standard Toolbar', '표준 툴바 복원')}
              className="p-1.5 text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors flex items-center justify-center cursor-pointer shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4 text-slate-500" />
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyTable}
            disabled={displayedButtons.length === 0}
            className="p-1.5 text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors flex items-center justify-center shadow-2xs cursor-pointer disabled:opacity-40"
            title={t('Copy Table to Excel', '엑셀용 테이블 복사')}
            aria-label={t('Copy Table to Excel', '엑셀용 테이블 복사')}
          >
            <Copy className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Variant Toast Notification */}
      {variantToast && (
        <div className="flex items-center gap-2 p-2 bg-emerald-100 border border-emerald-300 text-emerald-900 rounded-lg text-xs font-semibold animate-in fade-in slide-in-from-top-1">
          <Bookmark className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{variantToast}</span>
        </div>
      )}

      {/* Custom Toolbar Variant Control Bar (Applied to Custom tab only per RFQ v1.16) */}
      {activeTab === 'custom' && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50/80 p-2.5 rounded-lg border border-emerald-300 shadow-2xs flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-950">
              <Bookmark className="w-4 h-4 text-emerald-600" />
              <span>{t('Custom Variant:', '사용자 변형(Variant):')}</span>
            </div>

            <div className="w-56 sm:w-64">
              <InspectableSelect
                isReadOnly={isReadOnly}
                value={selectedVariantId}
                onChange={(e) => handleSelectVariant(e.target.value)}
                aria-label={t('Custom Toolbar Variant', '사용자 툴바 변형')}
                className="w-full text-xs font-medium bg-white border border-emerald-300 rounded px-2.5 py-1 text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500 shadow-2xs cursor-pointer"
              >
                <option value="" disabled>{t('-- Select Variant --', '-- 변형 선택 --')}</option>
                {variants.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id} {v.name ? `— ${v.name}` : ''} {v.is_builtin ? t('(Standard)', '(기본)') : t('(Custom)', '(사용자)')}
                  </option>
                ))}
              </InspectableSelect>
            </div>

            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => !isReadOnly && setIsSaveModalOpen(true)}
              title={t('Save current custom toolbar buttons as a new variant', '현재 사용자 정의 버튼 구성을 새 변형으로 저장')}
              aria-label={t('Save Variant', '변형 저장')}
              className="px-2.5 py-1 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded transition-colors shadow-2xs flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{t('Save Variant', '변형 저장')}</span>
            </button>

            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => !isReadOnly && setIsManageModalOpen(true)}
              title={t('Manage saved variants', '저장된 변형 관리')}
              aria-label={t('Manage Variants', '변형 관리')}
              className="px-2 py-1 text-xs font-medium bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded transition-colors shadow-2xs flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Settings className="w-3.5 h-3.5 text-emerald-700" />
              <span>{t('Manage', '관리')}</span>
            </button>
          </div>

          <div className="text-[11px] text-emerald-800 font-medium">
            {t(
              'Apply a preset custom toolbar set or save the current buttons as a new variant.',
              '저장된 사용자 정의 툴바 프리셋을 불러오거나 현재 구성을 새 변형으로 저장하세요.'
            )}
          </div>
        </div>
      )}

      {/* Action / Search Bar & Info */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-50 p-2 rounded-lg border border-slate-200">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('Search button text / code...', '버튼 텍스트 / 코드 검색...')}
            className="text-xs pl-8 pr-2.5 py-1.5 bg-white border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 w-52 shadow-2xs"
          />
        </div>

        <div className="text-xs text-slate-600">
          {activeTab === 'standard' ? (
            <span className="text-slate-500">
              {t(
                'SAP Standard sequence fixed (&EXPORT placed right after &PRINT). Order editing disabled.',
                'SAP 표준 순서가 고정되어 있습니다 (&PRINT 다음에 &EXPORT 위치). 순서 편집은 불가합니다.'
              )}
            </span>
          ) : (
            <span className="text-slate-500">
              {lang === 'ko' ? (
                <>
                  셀을 클릭 및 드래그하여 선택하세요. <strong>Ctrl+C</strong> 복사 및 <strong>Ctrl+V</strong> 붙여넣기를 지원합니다.
                </>
              ) : (
                <>
                  Click &amp; drag to select cells. <strong>Ctrl+C</strong> copy and <strong>Ctrl+V</strong> paste supported.
                </>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Buttons Table in Google Sheets Style */}
      <div
        onPaste={handleTablePaste}
        className="border border-slate-300 rounded-lg overflow-x-auto bg-white shadow-xs focus:outline-none select-none"
      >
        <table className="w-full text-xs text-left border-collapse font-sans">
          <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 font-semibold text-[11px] select-none">
            <tr>
              {/* Row index corner cell (Table headers kept strictly English per RFQ v1.29) */}
              <th className="py-2 px-1 text-center w-8 bg-slate-200 border-r border-slate-300 text-slate-500 font-mono text-[10px]" title={t('Spreadsheet Row Number', '스프레드시트 행 번호')}>
                fx
              </th>
              <th className="py-1 px-1 text-center w-14 border-r border-slate-200">
                <div className="text-[9px] text-slate-400 font-mono">A</div>
                <div>DISPLAY</div>
              </th>
              <th className="py-1 px-1 text-center w-12 border-r border-slate-200">
                <div className="text-[9px] text-slate-400 font-mono">B</div>
                <div>ICON</div>
              </th>
              <th className="py-1 px-2 w-28 border-r border-slate-200 font-mono">
                <div className="text-[9px] text-slate-400 font-mono">C</div>
                <div>FUNCTION</div>
              </th>
              <th className="py-1 px-2 min-w-36 border-r border-slate-200">
                <div className="text-[9px] text-slate-400 font-mono">D</div>
                <div>BUTTON TEXT</div>
              </th>
              <th className="py-1 px-2 min-w-48 border-r border-slate-200">
                <div className="text-[9px] text-slate-400 font-mono">E</div>
                <div>QUICKINFO</div>
              </th>
              <th className="py-1 px-1 text-center w-16 border-r border-slate-200">
                <div className="text-[9px] text-slate-400 font-mono">F</div>
                <div>SEPARATOR</div>
              </th>
              <th className="py-1 px-1 text-center w-16 border-r border-slate-200">
                <div className="text-[9px] text-slate-400 font-mono">G</div>
                <div>DISABLED</div>
              </th>
              {activeTab === 'custom' && (
                <th className="py-1 px-2 text-center w-24">
                  <div className="text-[9px] text-slate-400 font-mono">ACTIONS</div>
                  <div>ORDER / DEL</div>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
            {filteredButtons.length === 0 ? (
              <tr>
                <td colSpan={activeTab === 'custom' ? 9 : 8} className="py-10 text-center text-slate-400 font-sans">
                  <div className="flex flex-col items-center justify-center gap-1.5">
                    <p className="font-medium">
                      {activeTab === 'standard'
                        ? t('No standard toolbar buttons found.', '표준 툴바 버튼이 없습니다.')
                        : t('No custom toolbar buttons created yet.', '생성된 사용자 정의 버튼이 없습니다.')}
                    </p>
                    <p className="text-xs text-slate-400">
                      {activeTab === 'custom'
                        ? t(
                            'Click "+ Add Custom Button" or paste multi-line rows with Ctrl+V.',
                            '상단의 추가(+) 버튼을 클릭하거나 Ctrl+V로 여러 행을 붙여넣으세요.'
                          )
                        : t(
                            'Click "Restore Standard Toolbar" to restore standard buttons.',
                            '표준 툴바 복원 버튼을 클릭해 표준 버튼을 복원하세요.'
                          )}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredButtons.map((btn, idx) => {
                const isSelectedRow =
                  selectedRange &&
                  idx >= Math.min(selectedRange.startRow, selectedRange.endRow) &&
                  idx <= Math.max(selectedRange.startRow, selectedRange.endRow);

                return (
                  <tr
                    key={btn.id}
                    className={`transition-colors ${
                      !btn.visible ? 'opacity-40 bg-slate-50/60' : 'hover:bg-blue-50/20'
                    }`}
                  >
                    {/* Google Sheets Row Index (1, 2, 3...) */}
                    <td
                      onClick={() => {
                        setSelectedRange({
                          startRow: idx,
                          startCol: 0,
                          endRow: idx,
                          endCol: COL_COUNT - 1,
                        });
                      }}
                      className={`py-1 px-1 text-center font-mono font-bold text-[10px] border-r border-slate-300 select-none cursor-pointer ${
                        isSelectedRow ? 'bg-blue-200 text-blue-900' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {idx + 1}
                    </td>

                    {/* Col A: Visible Checkbox */}
                    <td
                      onMouseDown={() => handleCellMouseDown(idx, 0)}
                      onMouseEnter={() => handleCellMouseEnter(idx, 0)}
                      className={`p-0 border-r border-slate-200 text-center ${
                        isCellInRange(selectedRange, idx, 0)
                          ? 'bg-blue-100 ring-1 ring-blue-500'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-center h-8">
                        <input
                          type="checkbox"
                          disabled={isReadOnly}
                          checked={btn.visible !== false}
                          onChange={(e) => handleUpdate(btn.id, { visible: e.target.checked })}
                          title={btn.visible !== false ? 'Visible on toolbar' : 'Hidden on toolbar'}
                          className="w-4 h-4 accent-blue-600 rounded cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>
                    </td>

                    {/* Col B: Icon Preview */}
                    <td
                      onMouseDown={() => handleCellMouseDown(idx, 1)}
                      onMouseEnter={() => handleCellMouseEnter(idx, 1)}
                      className={`p-0 border-r border-slate-200 text-center ${
                        isCellInRange(selectedRange, idx, 1)
                          ? 'bg-blue-100 ring-1 ring-blue-500'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-center h-8">
                        <div
                          className="w-6 h-6 mx-auto rounded flex items-center justify-center border border-[#c0a662] shadow-2xs"
                          style={{
                            background: btn.disabled
                              ? '#ede4cc'
                              : 'linear-gradient(to bottom, #fffdf2 0%, #fae6a6 50%, #f4d983 100%)',
                          }}
                          title={`Icon: ${btn.icon}`}
                        >
                          <SapToolbarIcon func={btn.function} iconName={btn.icon} />
                        </div>
                      </div>
                    </td>

                    {/* Col C: Function code */}
                    <td
                      onMouseDown={() => handleCellMouseDown(idx, 2)}
                      onMouseEnter={() => handleCellMouseEnter(idx, 2)}
                      className={`p-0 border-r border-slate-200 font-bold ${
                        isCellInRange(selectedRange, idx, 2)
                          ? 'bg-blue-100 ring-1 ring-blue-500'
                          : ''
                      }`}
                    >
                      <input
                        type="text"
                        value={btn.function}
                        readOnly={activeTab === 'standard' || isReadOnly}
                        data-tcell={`${idx}-function`}
                        onFocus={() => {
                          if (!selectedRange) {
                            setSelectedRange({ startRow: idx, startCol: 2, endRow: idx, endCol: 2 });
                          }
                        }}
                        onKeyDown={(e) => handleCellKeyDown(e, idx, 'function')}
                        onChange={(e) => handleUpdate(btn.id, { function: e.target.value })}
                        onBlur={(e) =>
                          handleUpdate(btn.id, { function: e.target.value.trim().toUpperCase() })
                        }
                        className="w-full h-8 px-2 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 uppercase font-mono font-bold text-slate-800 read-only:text-slate-600"
                      />
                    </td>

                    {/* Col D: Button Text */}
                    <td
                      onMouseDown={() => handleCellMouseDown(idx, 3)}
                      onMouseEnter={() => handleCellMouseEnter(idx, 3)}
                      className={`p-0 border-r border-slate-200 font-sans ${
                        isCellInRange(selectedRange, idx, 3)
                          ? 'bg-blue-100 ring-1 ring-blue-500'
                          : ''
                      }`}
                    >
                      <input
                        type="text"
                        value={btn.text}
                        readOnly={isReadOnly}
                        data-tcell={`${idx}-text`}
                        onFocus={() => {
                          if (!selectedRange) {
                            setSelectedRange({ startRow: idx, startCol: 3, endRow: idx, endCol: 3 });
                          }
                        }}
                        onKeyDown={(e) => handleCellKeyDown(e, idx, 'text')}
                        onChange={(e) => handleUpdate(btn.id, { text: e.target.value })}
                        className="w-full h-8 px-2 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 font-medium text-slate-800"
                      />
                    </td>

                    {/* Col E: Quickinfo */}
                    <td
                      onMouseDown={() => handleCellMouseDown(idx, 4)}
                      onMouseEnter={() => handleCellMouseEnter(idx, 4)}
                      className={`p-0 border-r border-slate-200 font-sans ${
                        isCellInRange(selectedRange, idx, 4)
                          ? 'bg-blue-100 ring-1 ring-blue-500'
                          : ''
                      }`}
                    >
                      <input
                        type="text"
                        value={btn.quickinfo}
                        readOnly={isReadOnly}
                        data-tcell={`${idx}-quickinfo`}
                        onFocus={() => {
                          if (!selectedRange) {
                            setSelectedRange({ startRow: idx, startCol: 4, endRow: idx, endCol: 4 });
                          }
                        }}
                        onKeyDown={(e) => handleCellKeyDown(e, idx, 'quickinfo')}
                        onChange={(e) => handleUpdate(btn.id, { quickinfo: e.target.value })}
                        className="w-full h-8 px-2 bg-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-700"
                      />
                    </td>

                    {/* Col F: Separator before */}
                    <td
                      onMouseDown={() => handleCellMouseDown(idx, 5)}
                      onMouseEnter={() => handleCellMouseEnter(idx, 5)}
                      className={`p-0 border-r border-slate-200 text-center ${
                        isCellInRange(selectedRange, idx, 5)
                          ? 'bg-blue-100 ring-1 ring-blue-500'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-center h-8">
                        <input
                          type="checkbox"
                          disabled={isReadOnly}
                          checked={!!btn.separator_before}
                          onChange={(e) =>
                            handleUpdate(btn.id, { separator_before: e.target.checked })
                          }
                          title="Insert separator line (|) before button"
                          className="w-4 h-4 accent-slate-600 rounded cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>
                    </td>

                    {/* Col G: Disabled */}
                    <td
                      onMouseDown={() => handleCellMouseDown(idx, 6)}
                      onMouseEnter={() => handleCellMouseEnter(idx, 6)}
                      className={`p-0 border-r border-slate-200 text-center ${
                        isCellInRange(selectedRange, idx, 6)
                          ? 'bg-blue-100 ring-1 ring-blue-500'
                          : ''
                      }`}
                    >
                      <div className="flex items-center justify-center h-8">
                        <input
                          type="checkbox"
                          disabled={isReadOnly}
                          checked={btn.disabled}
                          onChange={(e) => handleUpdate(btn.id, { disabled: e.target.checked })}
                          title="Disable button"
                          className="w-4 h-4 accent-red-600 rounded cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>
                    </td>

                    {/* Col H: Actions (Custom tab only) */}
                    {activeTab === 'custom' && (
                      <td className="py-1 px-1 text-center">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleMoveCustom(idx, 'up')}
                            disabled={isReadOnly || idx === 0}
                            title={t('Move up', '위로 이동')}
                            aria-label={t('Move up', '위로 이동')}
                            className="p-1 text-slate-400 hover:text-blue-700 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveCustom(idx, 'down')}
                            disabled={isReadOnly || idx === customButtons.length - 1}
                            title={t('Move down', '아래로 이동')}
                            aria-label={t('Move down', '아래로 이동')}
                            className="p-1 text-slate-400 hover:text-blue-700 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => handleDeleteCustom(btn.id)}
                            title={t('Delete button', '버튼 삭제')}
                            aria-label={t('Delete button', '버튼 삭제')}
                            className="p-1 text-slate-400 hover:text-red-600 cursor-pointer transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Guide footer */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-xs flex items-center justify-between flex-wrap gap-2">
        <div>
          {lang === 'ko' ? (
            <>
              <strong>스프레드시트 팁:</strong> 셀을 클릭하거나 드래그해 선택하고 <strong>Ctrl+V</strong>로 바로 붙여넣으세요. 붙여넣은 행 수가 많으면 사용자 정의 버튼 행이 자동 추가됩니다.
            </>
          ) : (
            <>
              <strong>Spreadsheet Tips:</strong> Click on any cell or drag across cells to select. Paste (<strong>Ctrl+V</strong>) directly to update. If pasted data contains more lines, new custom lines are automatically created.
            </>
          )}
        </div>
        <span className="font-mono text-[11px] text-slate-700 font-semibold bg-white px-2 py-0.5 rounded border border-slate-200">
          {t(
            `Showing ${displayedButtons.length} / Total ${buttons.length} Buttons`,
            `표시 ${displayedButtons.length} / 전체 ${buttons.length}개 버튼`
          )}
        </span>
      </div>

      {/* 1. Save Variant Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md p-5 animate-in zoom-in-95 font-sans">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {t('Save Custom Toolbar Variant', '사용자 툴바 변형 저장')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                aria-label={t('Close', '닫기')}
                title={t('Close', '닫기')}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveVariant} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {t('Variant ID', '변형 ID')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newVariantId}
                  onChange={(e) => setNewVariantId(e.target.value.toUpperCase())}
                  placeholder={t('e.g., /SD_DISPATCH, ZVAR_SALES_01', '예: /SD_DISPATCH, ZVAR_SALES_01')}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-mono font-bold uppercase focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {t("Recommended: Uppercase letters, numbers, '/' or '_'", "권장: 영문 대문자, 숫자, '/' 또는 '_'")}
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  {t('Variant Name', '변형 이름')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newVariantName}
                  onChange={(e) => setNewVariantName(e.target.value)}
                  placeholder={t('e.g., Sales Dispatch & Billing Actions', '예: 출하 및 청구 처리 툴바')}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">{t('Description', '설명')}</label>
                <textarea
                  rows={2}
                  value={newVariantDesc}
                  onChange={(e) => setNewVariantDesc(e.target.value)}
                  placeholder={t('Describe the business purpose and actions in this toolbar set', '이 툴바 세트의 업무 용도와 포함된 기능을 입력하세요')}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 text-emerald-900 text-xs">
                {lang === 'ko' ? (
                  <>
                    <strong className="font-bold">{customButtons.length}</strong>개의 사용자 정의 버튼이 이 변형 ID로 저장됩니다.
                  </>
                ) : (
                  <>
                    <strong className="font-bold">{customButtons.length}</strong> custom button(s) will be saved under this variant ID.
                  </>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsSaveModalOpen(false)}
                  className="px-3.5 py-1.5 border border-slate-300 rounded text-slate-700 hover:bg-slate-100 font-medium cursor-pointer"
                >
                  {t('Cancel', '취소')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold transition-colors shadow-xs cursor-pointer"
                >
                  {t('Save', '저장')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Manage Variants Modal */}
      {isManageModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-2xl p-5 animate-in zoom-in-95 font-sans flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {t('Manage Custom Toolbar Variants', '사용자 툴바 변형 관리')}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {t('View, load, or delete saved toolbar variants', '저장된 툴바 변형을 조회, 적용 또는 삭제합니다')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManageModalOpen(false)}
                aria-label={t('Close', '닫기')}
                title={t('Close', '닫기')}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3 font-mono">{t('VARIANT ID', '변형 ID')}</th>
                    <th className="py-2 px-3 min-w-44">{t('NAME', '이름')}</th>
                    <th className="py-2 px-2 text-center w-20">{t('TYPE', '구분')}</th>
                    <th className="py-2 px-2 text-center w-16">{t('BUTTONS', '버튼 수')}</th>
                    <th className="py-2 px-3 text-center w-28">{t('ACTIONS', '작업')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {variants.map((v) => {
                    const isSelected = selectedVariantId === v.id;
                    return (
                      <tr
                        key={v.id}
                        className={`transition-colors ${
                          isSelected ? 'bg-emerald-50/70 ring-1 ring-inset ring-emerald-500 font-semibold' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2 px-3 font-mono font-bold text-emerald-950">{v.id}</td>
                        <td className="py-2 px-3">
                          <div className="font-semibold text-slate-800">{v.name}</div>
                          {v.description && <div className="text-[11px] text-slate-500 truncate">{v.description}</div>}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {v.is_builtin ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 text-slate-700 font-bold border border-slate-200">
                              {t('Standard', '기본')}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-bold border border-emerald-300">
                              {t('Custom', '사용자')}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center font-mono font-bold text-slate-700">
                          {v.buttons.length}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                handleSelectVariant(v.id);
                                setIsManageModalOpen(false);
                              }}
                              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer transition-colors"
                            >
                              {t('Load', '적용')}
                            </button>
                            {!v.is_builtin && (
                              <button
                                type="button"
                                onClick={() => handleDeleteVariant(v.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                title={t('Delete Variant', '변형 삭제')}
                                aria-label={t('Delete Variant', '변형 삭제')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 mt-3 text-xs">
              <span className="text-slate-500">
                {t(`Total ${variants.length} Custom Toolbar Variant(s)`, `총 ${variants.length}개의 사용자 툴바 변형`)}
              </span>
              <button
                type="button"
                onClick={() => setIsManageModalOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded font-bold cursor-pointer"
              >
                {t('Close', '닫기')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
