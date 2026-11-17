import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Cpu,
  Download,
  Edit3,
  Eye,
  FileCode,
  FileCode2,
  Info,
  Lock,
  Palette,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { AbapSyntaxMode, ProgramSourceCodeTabs, ProgramSpec, SapProject } from '../types/sap';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import {
  SAP_GUI_THEMES,
  SAP_THEME_STORAGE_KEY,
  SapGuiTheme,
  isValidSapGuiTheme,
  loadSavedSapTheme,
} from '../data/sapGuiThemes';
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
import {
  getAccessibleProjectsForUser,
  getProjectAbapStandards,
  isCommonProtectedSample,
  TEMP_PROJECT_CODE,
} from '../utils/projectStorage';
import { downloadFile } from '../utils/specExport';
import {
  ABAP_SYNTAX_THEMES,
  ABAP_SYNTAX_THEME_LIST,
  AbapSyntaxThemeId,
  HighlightedAbapLine,
  normalizeAbapSyntaxTheme,
  resolveAbapThemeForSapGui,
} from './AbapSyntaxHighlighter';

const ABAP_THEME_STORAGE_KEY = 'everyspec_abap_theme_v1';
type AbapThemePreference = 'auto' | AbapSyntaxThemeId;

function loadSavedAbapThemePreference(): AbapThemePreference {
  try {
    const saved = localStorage.getItem(ABAP_THEME_STORAGE_KEY);
    if (!saved || saved === 'auto') return 'auto';
    if (
      saved === 'light' ||
      saved === 'dark' ||
      saved in ABAP_SYNTAX_THEMES
    ) {
      return normalizeAbapSyntaxTheme(saved);
    }
  } catch {
    // ignore storage access issues
  }
  return 'auto';
}

interface AbapCodeGeneratorProps {
  spec: ProgramSpec;
  sapGuiTheme?: SapGuiTheme;
  onUpdateSpec?: (updated: ProgramSpec) => void;
  remoteProjects?: SapProject[];
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

export const AbapCodeGenerator: React.FC<AbapCodeGeneratorProps> = ({
  spec,
  sapGuiTheme,
  onUpdateSpec,
  remoteProjects = [],
}) => {
  const { activeUser, userProfile, isAdmin, resolveEffectiveProjectRole } = useAuth();
  const { t, lang } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<CodeViewTab>('full');
  const [editorMode, setEditorMode] = useState<'view' | 'edit'>('view');
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [themePreference, setThemePreference] = useState<AbapThemePreference>(
    loadSavedAbapThemePreference
  );
  const [fallbackSapTheme, setFallbackSapTheme] = useState<SapGuiTheme>(() => loadSavedSapTheme());
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [codeSearchQuery, setCodeSearchQuery] = useState('');
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);
  const [selectedLineNum, setSelectedLineNum] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightOverlayRef = useRef<HTMLDivElement>(null);
  const editGutterRef = useRef<HTMLDivElement>(null);
  const viewContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const effectiveProjectRole = useMemo(() => {
    const projCode = (spec.project_code || TEMP_PROJECT_CODE).toUpperCase();
    const projects = getAccessibleProjectsForUser(activeUser.name, {
      uid: userProfile?.uid,
      isAdmin,
      assignedProjects: userProfile?.assignedProjects || [],
      remoteProjects,
    });
    const activeProj = projects.find((p) => p.code === projCode) || null;
    return resolveEffectiveProjectRole(activeProj);
  }, [
    spec.project_code,
    activeUser.name,
    userProfile?.uid,
    userProfile?.assignedProjects,
    isAdmin,
    remoteProjects,
    resolveEffectiveProjectRole,
  ]);

  const isProtectedCommon = isCommonProtectedSample(spec);
  const isApprovedLocked =
    (spec.status === 'approved' || spec.status === 'qa_passed') &&
    effectiveProjectRole !== 'PM' &&
    effectiveProjectRole !== 'ADMIN';
  const isReadOnly = !onUpdateSpec || isProtectedCommon || isApprovedLocked;

  const readOnlyReason = isProtectedCommon
    ? t('COMM standard samples are read-only. Copy to a project to edit.', 'COMM 표준 샘플은 읽기 전용입니다. 프로젝트로 복사 후 수정하세요.')
    : isApprovedLocked
    ? t('Only PM/ADMIN can edit source code for Approved or QA Passed specs.', '승인됨(Approved)/QA 통과 상태는 PM/ADMIN만 소스를 수정할 수 있습니다.')
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

  const matchedLineNumbers = useMemo(() => {
    const q = codeSearchQuery.trim().toLowerCase();
    if (!q || viewMode === 'symbols') return [];
    const matches: number[] = [];
    lines.forEach((ln, idx) => {
      if (ln.toLowerCase().includes(q)) {
        matches.push(idx + 1);
      }
    });
    return matches;
  }, [codeSearchQuery, lines, viewMode]);

  useEffect(() => {
    setActiveMatchIdx(0);
  }, [codeSearchQuery, viewMode]);

  useEffect(() => {
    if (!isSearchOpen || matchedLineNumbers.length === 0) return;
    const safeIdx = Math.min(activeMatchIdx, matchedLineNumbers.length - 1);
    const targetLine = matchedLineNumbers[safeIdx];
    const rowEl = lineRefs.current[targetLine];
    if (rowEl && typeof rowEl.scrollIntoView === 'function') {
      rowEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeMatchIdx, matchedLineNumbers, isSearchOpen]);

  useEffect(() => {
    if (sapGuiTheme) return;
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SAP_THEME_STORAGE_KEY && isValidSapGuiTheme(e.newValue)) {
        setFallbackSapTheme(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [sapGuiTheme]);

  useEffect(() => {
    if (!isThemeMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isThemeMenuOpen]);

  const effectiveSapGuiTheme: SapGuiTheme = sapGuiTheme ?? fallbackSapTheme;
  const matchedThemeForSapGui: AbapSyntaxThemeId = resolveAbapThemeForSapGui(effectiveSapGuiTheme);
  const resolvedThemeId: AbapSyntaxThemeId =
    themePreference === 'auto' ? matchedThemeForSapGui : themePreference;
  const activeThemeDef = ABAP_SYNTAX_THEMES[resolvedThemeId];
  const activeSapGuiInfo = SAP_GUI_THEMES[effectiveSapGuiTheme];

  const handleSelectThemePreference = (nextPref: AbapThemePreference) => {
    setThemePreference(nextPref);
    setIsThemeMenuOpen(false);
    try {
      localStorage.setItem(ABAP_THEME_STORAGE_KEY, nextPref);
    } catch {
      // ignore
    }
  };

  const handleOpenSearch = () => {
    setIsSearchOpen(true);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
  };

  const handleStepMatch = (delta: number) => {
    if (matchedLineNumbers.length === 0) return;
    setActiveMatchIdx((prev) => (prev + delta + matchedLineNumbers.length) % matchedLineNumbers.length);
  };

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
    if (editGutterRef.current) {
      editGutterRef.current.scrollTop = e.currentTarget.scrollTop;
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

  const activeMatchedLine =
    isSearchOpen && matchedLineNumbers.length > 0
      ? matchedLineNumbers[Math.min(activeMatchIdx, matchedLineNumbers.length - 1)]
      : null;

  return (
    <div
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f' && viewMode !== 'symbols') {
          e.preventDefault();
          handleOpenSearch();
        }
      }}
      className="flex flex-col h-full bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-xl font-sans"
    >
      {/* Compact Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex-wrap gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-lg bg-slate-800 text-blue-400 border border-slate-700/80 flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            <FileCode className="w-4 h-4" />
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

          {viewMode !== 'symbols' && (
            <>
              <button
                type="button"
                onClick={() => (isSearchOpen ? setIsSearchOpen(false) : handleOpenSearch())}
                className={`p-1.5 rounded border transition-colors cursor-pointer ${
                  isSearchOpen
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                }`}
                title={t('Find in ABAP Code (Ctrl+F)', 'ABAP 코드 내 찾기 (Ctrl+F)')}
                aria-label={t('Find in ABAP Code', 'ABAP 코드 내 찾기')}
              >
                <Search className="w-3.5 h-3.5" />
              </button>

              <div className="relative" ref={themeMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsThemeMenuOpen((prev) => !prev)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    isThemeMenuOpen
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border-slate-700'
                  }`}
                  title={t(
                    'Select ABAP syntax highlighting theme or match SAP GUI theme',
                    'ABAP 구문 강조 테마 선택 또는 SAP GUI 테마 연동'
                  )}
                  aria-haspopup="menu"
                  aria-expanded={isThemeMenuOpen}
                >
                  <Palette className="w-3.5 h-3.5 shrink-0" />
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-white/30 shrink-0"
                    style={{ backgroundColor: activeThemeDef.swatches[0] }}
                  />
                  <span className="hidden sm:inline">
                    {themePreference === 'auto'
                      ? `${t('Auto', '자동')} · ${lang === 'ko' ? activeThemeDef.nameKo : activeThemeDef.name}`
                      : lang === 'ko'
                      ? activeThemeDef.nameKo
                      : activeThemeDef.name}
                  </span>
                  <ChevronDown className="w-3 h-3 opacity-80" />
                </button>

                {isThemeMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-1.5 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1.5 z-40 text-left"
                  >
                    <div className="px-3 py-1.5 border-b border-slate-800 flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {t('Syntax Theme', '구문 강조 테마')}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        SAP {activeSapGuiInfo.name}
                      </span>
                    </div>

                    {/* Auto Match SAP GUI Option */}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleSelectThemePreference('auto')}
                      className={`w-full px-3 py-2 flex items-start gap-2.5 text-left transition-colors cursor-pointer ${
                        themePreference === 'auto'
                          ? 'bg-blue-600/20 text-white'
                          : 'text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-md bg-blue-500/20 border border-blue-400/30 flex items-center justify-center shrink-0 mt-0.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold truncate">
                            {t('Match SAP GUI Theme', 'SAP GUI 테마 자동 연동')}
                          </span>
                          {themePreference === 'auto' && (
                            <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                          {activeSapGuiInfo.name} →{' '}
                          {lang === 'ko'
                            ? ABAP_SYNTAX_THEMES[matchedThemeForSapGui].nameKo
                            : ABAP_SYNTAX_THEMES[matchedThemeForSapGui].name}
                        </p>
                      </div>
                    </button>

                    <div className="my-1 border-t border-slate-800" />

                    {/* Explicit Multi-Themes */}
                    <div className="max-h-72 overflow-y-auto">
                      {ABAP_SYNTAX_THEME_LIST.map((themeItem) => {
                        const isSelected = themePreference === themeItem.id;
                        const isSapMatched = matchedThemeForSapGui === themeItem.id;
                        return (
                          <button
                            key={themeItem.id}
                            type="button"
                            role="menuitem"
                            onClick={() => handleSelectThemePreference(themeItem.id)}
                            className={`w-full px-3 py-2 flex items-start gap-2.5 text-left transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-blue-600/20 text-white'
                                : 'text-slate-200 hover:bg-slate-800'
                            }`}
                          >
                            {/* 4-color mini swatch preview */}
                            <div
                              className="w-6 h-6 rounded-md border border-slate-600/70 grid grid-cols-2 grid-rows-2 overflow-hidden shrink-0 mt-0.5"
                              aria-hidden="true"
                            >
                              {themeItem.swatches.map((hex, i) => (
                                <span key={i} style={{ backgroundColor: hex }} />
                              ))}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1.5">
                                <span className="text-xs font-semibold truncate">
                                  {lang === 'ko' ? themeItem.nameKo : themeItem.name}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  {isSapMatched && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700 font-medium">
                                      SAP
                                    </span>
                                  )}
                                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
                                </div>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5 leading-snug truncate">
                                {lang === 'ko' ? themeItem.descriptionKo : themeItem.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
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

      {/* Inline Code Search Strip */}
      {isSearchOpen && viewMode !== 'symbols' && (
        <div className="px-4 py-1.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={codeSearchQuery}
              onChange={(e) => setCodeSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleStepMatch(e.shiftKey ? -1 : 1);
                } else if (e.key === 'Escape') {
                  setIsSearchOpen(false);
                  setCodeSearchQuery('');
                }
              }}
              placeholder={t(
                'Search keywords, fields, FORM, METHOD...',
                '키워드, 필드, FORM, METHOD 검색...'
              )}
              className="flex-1 bg-slate-800 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-100 placeholder-slate-400 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-[11px] font-mono text-slate-400 tabular-nums whitespace-nowrap min-w-14 text-right">
              {codeSearchQuery.trim()
                ? matchedLineNumbers.length > 0
                  ? `${Math.min(activeMatchIdx + 1, matchedLineNumbers.length)} / ${matchedLineNumbers.length}`
                  : t('0 matches', '0건')
                : ''}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={matchedLineNumbers.length === 0}
              onClick={() => handleStepMatch(-1)}
              className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-35 cursor-pointer"
              title={t('Previous match (Shift+Enter)', '이전 결과 (Shift+Enter)')}
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={matchedLineNumbers.length === 0}
              onClick={() => handleStepMatch(1)}
              className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-35 cursor-pointer"
              title={t('Next match (Enter)', '다음 결과 (Enter)')}
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false);
                setCodeSearchQuery('');
              }}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title={t('Close search (Esc)', '검색 닫기 (Esc)')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

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
        <div
          className={`flex-1 flex overflow-hidden font-mono text-xs ${activeThemeDef.surface.canvasClass}`}
        >
          <div
            ref={editGutterRef}
            className={`w-14 py-3 border-r text-right pr-3 select-none text-[11px] font-mono shrink-0 overflow-hidden tabular-nums ${activeThemeDef.surface.editGutterClass}`}
          >
            {lineNumbers.map((num) => (
              <div key={num} className="leading-5 h-5">
                {num}
              </div>
            ))}
          </div>

          <div className="flex-1 relative overflow-hidden">
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
                    <HighlightedAbapLine
                      line={line}
                      theme={resolvedThemeId}
                      searchQuery={isSearchOpen ? codeSearchQuery : undefined}
                    />
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
                className={`absolute inset-0 w-full h-full p-3 bg-transparent text-transparent font-mono text-xs leading-5 resize-none focus:outline-none border-none whitespace-pre overflow-auto ${activeThemeDef.surface.caretSelectionClass}`}
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
        <div
          ref={viewContainerRef}
          className={`flex-1 overflow-auto py-3 font-mono text-xs ${activeThemeDef.surface.canvasClass}`}
          style={{
            fontFamily: "'JetBrains Mono', 'Consolas', 'Courier New', monospace",
            tabSize: 2,
          }}
        >
          <div className="min-w-max">
            {lines.map((line, idx) => {
              const lineNum = idx + 1;
              const isUserLogicMarker = /^\*+[-=&*\s]*(BEGIN|END)\s+USER\s+LOGIC/i.test(line.trim());
              const isActiveMatch = activeMatchedLine === lineNum;
              const isSelected = selectedLineNum === lineNum;

              const rowBgClass = isActiveMatch
                ? activeThemeDef.surface.rowMatchClass
                : isUserLogicMarker
                ? activeThemeDef.surface.userLogicRowClass
                : isSelected
                ? activeThemeDef.surface.rowSelectedClass
                : activeThemeDef.surface.rowHoverClass;

              const gutterBgClass = isActiveMatch
                ? activeThemeDef.surface.gutterMatchClass
                : isSelected
                ? activeThemeDef.surface.gutterSelectedClass
                : activeThemeDef.surface.gutterClass;

              return (
                <div
                  key={idx}
                  ref={(el) => {
                    lineRefs.current[lineNum] = el;
                  }}
                  onClick={() => setSelectedLineNum(isSelected ? null : lineNum)}
                  className={`flex items-stretch leading-5 font-mono text-xs transition-colors cursor-text ${rowBgClass}`}
                >
                  <span
                    className={`sticky left-0 z-10 w-14 text-right pr-3 pl-2 border-r select-none text-[11px] tabular-nums shrink-0 ${gutterBgClass}`}
                  >
                    {lineNum}
                  </span>
                  <span className="flex-1 whitespace-pre px-4">
                    <HighlightedAbapLine
                      line={line}
                      theme={resolvedThemeId}
                      searchQuery={isSearchOpen ? codeSearchQuery : undefined}
                    />
                  </span>
                </div>
              );
            })}
          </div>
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
          {viewMode !== 'symbols' && (
            <>
              <span className="text-slate-600">|</span>
              <span className="text-slate-300">
                {lang === 'ko' ? activeThemeDef.nameKo : activeThemeDef.name}
                {themePreference === 'auto'
                  ? ` (${t('Matched', '연동')}: ${activeSapGuiInfo.name})`
                  : ''}
              </span>
            </>
          )}
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
