import React, { useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  Edit3,
  Eye,
  FileCode2,
  Info,
  Lock,
  RefreshCw,
  RotateCcw,
  Terminal,
} from 'lucide-react';
import { AbapSyntaxMode, ProgramSourceCodeTabs, ProgramSpec } from '../types/sap';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  assembleUnifiedAbapProgram,
  extractPfStatusFunctionsTable,
  extractTextSymbolsTable,
  generateAllIncludes,
  generateC01Include,
  generateF01Include,
  generateModInclude,
  generateProgramInclude,
  generateS01Include,
  generateTopInclude,
  mergeUserLogicRegions,
} from '../utils/abapCodeEngine';
import { getProjectAbapStandards, isCommonProtectedSample } from '../utils/projectStorage';
import { downloadFile } from '../utils/specExport';
import { HighlightedAbapLine } from './AbapSyntaxHighlighter';

interface AbapCodeGeneratorProps {
  spec: ProgramSpec;
  onUpdateSpec?: (updated: ProgramSpec) => void;
}

type CodeViewTab = 'full' | 'program' | 'top' | 's01' | 'c01' | 'mod' | 'f01' | 'symbols';
type EditableIncludeTab = 'program' | 'top' | 's01' | 'c01' | 'mod' | 'f01';

const VIEW_TABS: { id: CodeViewTab; label: string; labelKo: string; desc: string; descKo: string }[] = [
  { id: 'full', label: 'Full Program', labelKo: '전체 프로그램', desc: 'Combined ABAP program source (read-only)', descKo: '통합 ABAP 프로그램 소스 (읽기 전용)' },
  { id: 'program', label: 'Program', labelKo: 'Program', desc: 'Main report source (REPORT <prog>)', descKo: '메인 리포트 소스 (REPORT <prog>)' },
  { id: 'top', label: 'TOP', labelKo: 'TOP', desc: 'Global variables & type declarations (INCLUDE <prog>TOP)', descKo: '전역 변수 및 타입 선언 (INCLUDE <prog>TOP)' },
  { id: 's01', label: 'S01', labelKo: 'S01', desc: 'Selection screen definition (INCLUDE <prog>S01)', descKo: '선택 화면 정의 (INCLUDE <prog>S01)' },
  { id: 'c01', label: 'C01', labelKo: 'C01', desc: 'Local classes & event handlers (INCLUDE <prog>C01)', descKo: '로컬 클래스 및 이벤트 핸들러 (INCLUDE <prog>C01)' },
  { id: 'mod', label: 'MOD', labelKo: 'MOD', desc: 'PBO / PAI screen modules (INCLUDE <prog>MOD)', descKo: 'PBO / PAI 화면 모듈 (INCLUDE <prog>MOD)' },
  { id: 'f01', label: 'F01', labelKo: 'F01', desc: 'Subroutines, AUTHORITY-CHECK, F4 & FORM logic (INCLUDE <prog>F01)', descKo: '서브루틴, AUTHORITY-CHECK, F4 및 FORM 로직 (INCLUDE <prog>F01)' },
  { id: 'symbols', label: 'Text Symbols · PF-STATUS', labelKo: 'Text Symbols · PF-STATUS', desc: 'SE38 Text Elements & SE41 PF-STATUS reference', descKo: 'SE38 텍스트 요소 및 SE41 PF-STATUS 참조' },
];

const EDITABLE_TABS: EditableIncludeTab[] = ['program', 'top', 's01', 'c01', 'mod', 'f01'];

function isEditableIncludeTab(tab: CodeViewTab): tab is EditableIncludeTab {
  return (EDITABLE_TABS as string[]).includes(tab);
}

export const AbapCodeGenerator: React.FC<AbapCodeGeneratorProps> = ({ spec, onUpdateSpec }) => {
  const { projectRole } = useAuth();
  const { t, lang } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<CodeViewTab>('full');
  const [editorMode, setEditorMode] = useState<'view' | 'edit'>('view');
  const [actionToast, setActionToast] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightOverlayRef = useRef<HTMLDivElement>(null);

  const isProtectedCommon = isCommonProtectedSample(spec);
  const isApprovedLocked =
    spec.status === 'approved' && projectRole !== 'PM' && projectRole !== 'ADMIN';
  const isReadOnly = !onUpdateSpec || isProtectedCommon || isApprovedLocked;

  const readOnlyReason = isProtectedCommon
    ? t('COMM standard samples are read-only. Copy to a project to edit.', 'COMM 표준 샘플은 읽기 전용입니다. 프로젝트로 복사 후 수정하세요.')
    : isApprovedLocked
    ? t('Only PM/ADMIN can edit source code for Approved specs.', '승인됨(Approved) 상태는 PM/ADMIN만 소스를 수정할 수 있습니다.')
    : !onUpdateSpec
    ? t('Currently in view-only mode.', '현재 보기 전용 모드입니다.')
    : '';

  const projectStandards = useMemo(
    () => getProjectAbapStandards(spec.project_code),
    [spec.project_code]
  );

  const [localSyntaxMode, setLocalSyntaxMode] = useState<AbapSyntaxMode>(
    spec.abap_syntax_mode || projectStandards.default_syntax_mode || 'modern_740'
  );

  const effectiveSyntaxMode: AbapSyntaxMode = spec.abap_syntax_mode || localSyntaxMode;

  const engineOptions = useMemo(
    () => ({
      syntaxMode: effectiveSyntaxMode,
      standards: projectStandards,
    }),
    [effectiveSyntaxMode, projectStandards]
  );

  const includes = useMemo(() => generateAllIncludes(spec, engineOptions), [spec, engineOptions]);

  const fullCode = useMemo(
    () => assembleUnifiedAbapProgram(spec, engineOptions),
    [spec, engineOptions]
  );

  const currentIncludeCodes: ProgramSourceCodeTabs = useMemo(
    () => ({
      program: spec.source_code?.program !== undefined ? spec.source_code.program : includes.program,
      top: spec.source_code?.top !== undefined ? spec.source_code.top : includes.top,
      s01: spec.source_code?.s01 !== undefined ? spec.source_code.s01 : includes.s01,
      c01: spec.source_code?.c01 !== undefined ? spec.source_code.c01 : includes.c01,
      mod: spec.source_code?.mod !== undefined ? spec.source_code.mod : includes.mod,
      f01: spec.source_code?.f01 !== undefined ? spec.source_code.f01 : includes.f01,
    }),
    [spec.source_code, includes]
  );

  const textSymbols = useMemo(() => extractTextSymbolsTable(spec), [spec]);
  const pfFunctions = useMemo(() => extractPfStatusFunctionsTable(spec), [spec]);

  const displayedCode = useMemo(() => {
    if (viewMode === 'full' || viewMode === 'symbols') return fullCode;
    return currentIncludeCodes[viewMode] || '';
  }, [viewMode, fullCode, currentIncludeCodes]);

  const lines = useMemo(() => displayedCode.split('\n'), [displayedCode]);
  const lineNumbers = useMemo(
    () => Array.from({ length: Math.max(lines.length, 1) }, (_, i) => i + 1),
    [lines.length]
  );

  const customEditCount = useMemo(() => {
    if (!spec.source_code) return 0;
    return EDITABLE_TABS.filter((k) => Boolean(spec.source_code?.[k]?.trim())).length;
  }, [spec.source_code]);

  const showToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 2800);
  };

  const handleSyntaxModeChange = (mode: AbapSyntaxMode) => {
    setLocalSyntaxMode(mode);
    if (!isReadOnly && onUpdateSpec) {
      onUpdateSpec({
        ...spec,
        abap_syntax_mode: mode,
      });
    }
    showToast(
      mode === 'modern_740'
        ? t('ABAP 7.40+ syntax applied', 'ABAP 7.40+ 문법 적용됨')
        : t('Classic ABAP syntax applied', 'Classic ABAP 문법 적용됨')
    );
  };

  const handleSelectTab = (tabId: CodeViewTab) => {
    setViewMode(tabId);
    if (!isEditableIncludeTab(tabId) && editorMode === 'edit') {
      setEditorMode('view');
    }
  };

  const handleEnterEditMode = () => {
    if (isReadOnly) return;
    if (!isEditableIncludeTab(viewMode)) {
      setViewMode('program');
    }
    setEditorMode('edit');
  };

  const handleCodeChange = (newCode: string) => {
    if (isReadOnly || !onUpdateSpec || !isEditableIncludeTab(viewMode)) return;
    const updatedSourceTabs: ProgramSourceCodeTabs = {
      ...currentIncludeCodes,
      [viewMode]: newCode,
    };
    onUpdateSpec({
      ...spec,
      source_code: updatedSourceTabs,
    });
  };

  const handleSyncActiveTab = () => {
    if (isReadOnly || !onUpdateSpec || !isEditableIncludeTab(viewMode)) return;
    let rawDefault = '';
    if (viewMode === 'program') rawDefault = generateProgramInclude(spec, engineOptions);
    else if (viewMode === 'top') rawDefault = generateTopInclude(spec, engineOptions);
    else if (viewMode === 's01') rawDefault = generateS01Include(spec);
    else if (viewMode === 'c01') rawDefault = generateC01Include(spec, engineOptions);
    else if (viewMode === 'mod') rawDefault = generateModInclude(spec);
    else rawDefault = generateF01Include(spec, engineOptions);

    const merged = mergeUserLogicRegions(rawDefault, currentIncludeCodes[viewMode]);
    handleCodeChange(merged);
    showToast(
      t(
        `${viewMode.toUpperCase()} synced (USER LOGIC preserved)`,
        `${viewMode.toUpperCase()} 동기화 완료 (USER LOGIC 보존)`
      )
    );
  };

  const handleSyncAllTabs = () => {
    if (isReadOnly || !onUpdateSpec) return;
    const nextTabs = generateAllIncludes({ ...spec, source_code: currentIncludeCodes }, engineOptions);
    onUpdateSpec({
      ...spec,
      source_code: nextTabs,
    });
    showToast(t('All 6 Includes synced (USER LOGIC preserved)', '6개 Include 전체 동기화 완료 (USER LOGIC 보존)'));
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (highlightOverlayRef.current) {
      highlightOverlayRef.current.scrollTop = e.currentTarget.scrollTop;
      highlightOverlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownloadAbap = () => {
    const suffix = viewMode === 'full' || viewMode === 'program' || viewMode === 'symbols' ? '' : viewMode;
    downloadFile(
      `${(spec.program_id || 'ZRALV0010').toLowerCase()}${suffix}.abap`,
      displayedCode,
      'text/plain;charset=utf-8;'
    );
  };

  const isEditingCanvas = !isReadOnly && editorMode === 'edit' && isEditableIncludeTab(viewMode);
  const metaTooltip = [
    `${t('Sample Type', '샘플 유형')} ${spec.sample_type || '01'}`,
    `MSG: ${spec.message_class || projectStandards.message_class}`,
    `Package: ${projectStandards.dev_package || '$TMP'}`,
    `Include: ${projectStandards.common_top_include} / ${projectStandards.common_form_include}`,
    customEditCount > 0 ? t(`${customEditCount} custom Include edits merged`, `사용자 편집 Include ${customEditCount}개 병합됨`) : null,
    t('Auto-syncs LVC_T_SORT, AUTHORITY-CHECK, F4 & SY-BATCH', 'LVC_T_SORT, AUTHORITY-CHECK, F4, SY-BATCH 자동 반영'),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-xl font-sans">
      {/* Compact Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex-wrap gap-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-blue-500/10 border border-blue-500/20 rounded-md text-blue-400 shrink-0">
            <Terminal className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-white tracking-wide font-mono truncate">
            {t('ABAP Source Code', 'ABAP 소스 코드')} · {spec.program_id}
          </span>
          <span
            className="text-slate-400 hover:text-slate-200 cursor-help inline-flex items-center shrink-0"
            title={metaTooltip}
          >
            <Info className="w-3.5 h-3.5" />
          </span>
          {customEditCount > 0 && (
            <span
              className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
              title={t(`${customEditCount} custom Include edits saved`, `사용자 편집 Include ${customEditCount}개 저장됨`)}
            />
          )}
          {isReadOnly && (
            <span
              className="text-[11px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium inline-flex items-center gap-1 shrink-0 whitespace-nowrap"
              title={readOnlyReason}
            >
              <Lock className="w-3 h-3" />
              <span>{t('Read-Only', '읽기 전용')}</span>
            </span>
          )}
          {actionToast && (
            <span className="text-[11px] text-emerald-400 font-medium inline-flex items-center gap-1 ml-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{actionToast}</span>
            </span>
          )}
        </div>

        {/* Syntax Mode, Edit/Sync & Export Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
            <button
              type="button"
              onClick={() => handleSyntaxModeChange('classic')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                effectiveSyntaxMode === 'classic'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Classic
            </button>
            <button
              type="button"
              onClick={() => handleSyntaxModeChange('modern_740')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                effectiveSyntaxMode === 'modern_740'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Cpu className="w-3 h-3" />
              <span>7.40+</span>
            </button>
          </div>

          {!isReadOnly && (
            <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
              <button
                type="button"
                onClick={() => setEditorMode('view')}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  editorMode === 'view' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title={t('View syntax-highlighted source', '구문 강조 소스 보기')}
              >
                <Eye className="w-3 h-3" />
                <span>{t('View', '보기')}</span>
              </button>
              <button
                type="button"
                onClick={handleEnterEditMode}
                className={`px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  editorMode === 'edit' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title={t('Edit individual Include source directly (preserves USER LOGIC)', '개별 Include 소스 직접 편집 (USER LOGIC 보존)')}
              >
                <Edit3 className="w-3 h-3" />
                <span>{t('Edit', '편집')}</span>
              </button>
            </div>
          )}

          {!isReadOnly && (isEditingCanvas || isEditableIncludeTab(viewMode)) && (
            <>
              <button
                type="button"
                onClick={handleSyncActiveTab}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-semibold border border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                title={t('Re-sync current Include from spec (preserves *&--- BEGIN USER LOGIC)', '현재 Include 사양 재동기화 (*&--- BEGIN USER LOGIC 보존)')}
              >
                <RotateCcw className="w-3 h-3 text-amber-400" />
                <span>{t('Sync', '동기화')}</span>
              </button>
              <button
                type="button"
                onClick={handleSyncAllTabs}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-semibold border border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                title={t('Sync all 6 Includes (Program–F01) from spec (preserves *&--- BEGIN USER LOGIC)', '6개 Include 전체 재동기화 (*&--- BEGIN USER LOGIC 보존)')}
              >
                <RefreshCw className="w-3 h-3 text-blue-400" />
                <span>{t('Sync All', '전체 동기화')}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded text-xs font-semibold border border-slate-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">{t('Copied', '복사됨')}</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>{t('Copy', '복사')}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadAbap}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>.abap</span>
          </button>
        </div>
      </div>

      {/* Include Filter Sub-bar */}
      <div className="px-4 py-1.5 bg-slate-900/70 border-b border-slate-800 flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-1">
          {VIEW_TABS.map((tab) => {
            const active = viewMode === tab.id;
            const hasOverride =
              isEditableIncludeTab(tab.id) && Boolean(spec.source_code?.[tab.id]?.trim());
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectTab(tab.id)}
                title={lang === 'ko' ? tab.descKo : tab.desc}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                }`}
              >
                <FileCode2 className="w-3 h-3" />
                <span>{lang === 'ko' ? tab.labelKo : tab.label}</span>
                {hasOverride && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      active ? 'bg-white' : 'bg-emerald-400'
                    }`}
                    title={t('Custom edits saved', '사용자 편집본 저장됨')}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="text-[11px] font-mono text-slate-400 whitespace-nowrap tabular-nums">
          {projectStandards.dev_package || '$TMP'} · {lines.length} {t('lines', '줄')}
        </div>
      </div>

      {/* Main Content */}
      {viewMode === 'symbols' ? (
        <div className="flex-1 overflow-auto p-5 bg-slate-50 text-slate-900 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-bold text-slate-900">
                  {t('ABAP Text Elements (TEXT-001~)', 'ABAP 텍스트 요소 (TEXT-001~)')}
                </h4>
                <span
                  className="text-slate-400 hover:text-slate-700 cursor-help inline-flex"
                  title={t('Text Symbols registered in SE38 → Goto → Text Elements', 'SE38 → Goto → Text Elements에 등록할 텍스트 심볼')}
                >
                  <Info className="w-3.5 h-3.5" />
                </span>
              </div>
              <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums">
                {textSymbols.length} {t('items', '개')}
              </span>
            </div>
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                <tr>
                  <th className="px-4 py-2.5">{t('Symbol', '심볼')}</th>
                  <th className="px-4 py-2.5">{t('Usage', '용도')}</th>
                  <th className="px-4 py-2.5">{t('Text', '텍스트')}</th>
                  <th className="px-4 py-2.5 text-right">{t('Max Len', '최대 길이')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {textSymbols.map((sym) => (
                  <tr key={sym.symbol}>
                    <td className="px-4 py-2 font-mono font-bold text-blue-700">{sym.symbol}</td>
                    <td className="px-4 py-2 font-mono text-slate-600">{sym.usage}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{sym.text}</td>
                    <td className="px-4 py-2 font-mono tabular-nums text-right text-slate-600">
                      {sym.maxLen}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs font-bold text-slate-900">
                  {t('GUI Status (PF-STATUS 0100) & ALV Function Codes', 'GUI Status (PF-STATUS 0100) 및 ALV 기능 코드')}
                </h4>
                <span
                  className="text-slate-400 hover:text-slate-700 cursor-help inline-flex"
                  title={t('Function codes handled in SE41 GUI Status and handle_user_command', 'SE41 GUI Status 및 handle_user_command에서 처리되는 기능 코드')}
                >
                  <Info className="w-3.5 h-3.5" />
                </span>
              </div>
              <span className="font-mono text-xs font-semibold text-slate-600 tabular-nums">
                {pfFunctions.length} {t('items', '개')}
              </span>
            </div>
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                <tr>
                  <th className="px-4 py-2.5">{t('Function Code', '기능 코드')}</th>
                  <th className="px-4 py-2.5">{t('Category', '구분')}</th>
                  <th className="px-4 py-2.5">{t('Button Label', '버튼명')}</th>
                  <th className="px-4 py-2.5">{t('Shortcut', '단축키')}</th>
                  <th className="px-4 py-2.5">{t('Action', '동작 설명')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pfFunctions.map((fn, i) => (
                  <tr key={`${fn.fcode}-${i}`}>
                    <td className="px-4 py-2 font-mono font-bold text-indigo-700">{fn.fcode}</td>
                    <td className="px-4 py-2 text-slate-600">{fn.source}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{fn.text}</td>
                    <td className="px-4 py-2 font-mono text-slate-600">{fn.shortcut}</td>
                    <td className="px-4 py-2 text-slate-600">{fn.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : isEditingCanvas ? (
        <div className="flex-1 flex overflow-hidden bg-white text-slate-900 font-mono text-xs">
          <div className="w-12 py-3 bg-[#f8fafc] border-r border-slate-200 text-right pr-3 select-none text-slate-400 text-[11px] font-mono shrink-0 overflow-hidden tabular-nums">
            {lineNumbers.map((num) => (
              <div key={num} className="leading-5 h-5">
                {num}
              </div>
            ))}
          </div>

          <div className="flex-1 relative overflow-auto bg-white">
            <div className="relative w-full h-full min-h-[520px]">
              <div
                ref={highlightOverlayRef}
                aria-hidden="true"
                className="absolute inset-0 p-3 pointer-events-none whitespace-pre font-mono text-xs leading-5 overflow-hidden select-none"
                style={{
                  fontFamily: "'JetBrains Mono', 'Consolas', 'Courier New', monospace",
                  tabSize: 2,
                }}
              >
                {lines.map((line, idx) => (
                  <div key={idx} className="h-5 leading-5">
                    <HighlightedAbapLine line={line} />
                  </div>
                ))}
              </div>

              <textarea
                ref={textareaRef}
                value={displayedCode}
                onChange={(e) => handleCodeChange(e.target.value)}
                onScroll={handleScroll}
                placeholder={t(
                  `Enter INCLUDE ${(spec.program_id || 'ZRALV0010').toLowerCase()}${viewMode === 'program' ? '' : viewMode} source code...`,
                  `INCLUDE ${(spec.program_id || 'ZRALV0010').toLowerCase()}${viewMode === 'program' ? '' : viewMode} 소스를 입력하세요...`
                )}
                spellCheck={false}
                className="absolute inset-0 w-full h-full p-3 bg-transparent text-transparent caret-slate-900 font-mono text-xs leading-5 resize-none focus:outline-none border-none selection:bg-blue-200/80 selection:text-blue-900 whitespace-pre overflow-auto"
                style={{
                  fontFamily: "'JetBrains Mono', 'Consolas', 'Courier New', monospace",
                  tabSize: 2,
                  WebkitTextFillColor: 'transparent',
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4 bg-white text-slate-900 font-mono text-xs">
          {lines.map((line, idx) => (
            <div key={idx} className="flex hover:bg-blue-50/60 leading-5 font-mono text-xs">
              <span className="w-12 text-right pr-4 text-slate-400 select-none text-[11px] tabular-nums shrink-0">
                {idx + 1}
              </span>
              <span className="flex-1 whitespace-pre">
                <HighlightedAbapLine line={line} />
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Slim Footer */}
      <div className="px-4 py-1.5 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-mono truncate">
          <span>
            {viewMode === 'full'
              ? t('Full Program (Program + TOP + S01 + C01 + MOD + F01)', '전체 프로그램 (Program + TOP + S01 + C01 + MOD + F01)')
              : viewMode === 'program'
              ? `REPORT ${(spec.program_id || 'ZRALV0010').toLowerCase()}`
              : viewMode === 'symbols'
              ? t('Text Elements · PF-STATUS Reference', '텍스트 요소 · PF-STATUS 참조')
              : `INCLUDE ${(spec.program_id || 'ZRALV0010').toLowerCase()}${viewMode}`}
          </span>
          <span className="text-slate-600">|</span>
          <span>{effectiveSyntaxMode === 'modern_740' ? 'ABAP 7.40+' : 'ECC Classic'}</span>
        </div>
        <div className="text-slate-500 text-[10px] shrink-0">
          {isEditingCanvas
            ? t('*&--- BEGIN USER LOGIC blocks are preserved on re-sync', '*&--- BEGIN USER LOGIC 구간은 재동기화 시 보존됩니다')
            : `${t('Target', '대상')}: ${spec.target_sap_release || 'SAP S/4HANA & ECC 6.0'}`}
        </div>
      </div>
    </div>
  );
};
