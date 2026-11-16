import React, { useState, useRef, useEffect } from 'react';
import {
  Layers,
  FileCode,
  FileText,
  SplitSquareVertical,
  Printer,
  Palette,
  PanelTop,
  PanelLeft,
  PanelBottom,
  PanelRight,
  Keyboard,
  Star,
  LogIn,
  LogOut,
  Save,
  ShieldCheck,
  Plus,
} from 'lucide-react';
import { ProgramSpec, UserProjectRole } from '../types/sap';
import {
  CurrentUser,
  USERS_UPDATED_EVENT,
  getRegisteredUsers,
  isDefaultOperatorUser,
} from '../utils/authStorage';
import { SapGuiTheme, SAP_GUI_THEMES } from '../data/sapGuiThemes';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { COMMON_PROJECT_CODE } from '../utils/projectStorage';

export type MainWorkspaceMode =
  | 'overview'
  | 'program_list'
  | 'meeting_minutes'
  | 'meeting_wizard'
  | 'project_settings'
  | 'shortcuts'
  | 'split'
  | 'mockup_only'
  | 'editor_only'
  | 'abap_code'
  | 'document';
export type DualSplitLayout = 'top-bottom' | 'left-right' | 'bottom-top' | 'right-left';

interface TopNavProps {
  currentMode: MainWorkspaceMode;
  onSelectMode: (mode: MainWorkspaceMode) => void;
  currentSpec: ProgramSpec;
  onSelectTemplate: (spec: ProgramSpec) => void;
  onNewSpec: () => void;
  onTriggerPrint?: () => void;
  onOpenTemplates?: () => void;
  onExportPdf?: () => void;
  onGenerateMockData?: () => void;
  currentTheme?: SapGuiTheme;
  onSelectTheme?: (theme: SapGuiTheme) => void;
  splitLayout?: DualSplitLayout;
  onCycleSplitLayout?: () => void;
  onOpenShortcuts?: () => void;
  onOpenProjectManager?: () => void;
  onUserChanged?: (user: CurrentUser) => void;
  selectedProjectCode?: string;
  isCurrentSpecFavorite?: boolean;
  onToggleCurrentSpecFavorite?: () => void;
  onOpenCommandPalette?: () => void;
  lastSavedAt?: string | null;
  hasUnsavedChanges?: boolean;
  onQuickSnapshotSave?: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentMode,
  onSelectMode,
  currentSpec,
  onSelectTemplate,
  onNewSpec,
  onTriggerPrint,
  onOpenTemplates,
  onExportPdf,
  onGenerateMockData,
  currentTheme = 'blue_crystal',
  onSelectTheme,
  splitLayout = 'left-right',
  onCycleSplitLayout,
  onOpenShortcuts,
  onOpenProjectManager,
  onUserChanged,
  selectedProjectCode,
  isCurrentSpecFavorite = false,
  onToggleCurrentSpecFavorite,
  onOpenCommandPalette,
  lastSavedAt,
  hasUnsavedChanges = false,
  onQuickSnapshotSave,
}) => {
  const {
    activeUser,
    isFirebaseAuthenticated,
    projectRole,
    setProjectRole,
    switchPresetUser,
    loginWithGoogle,
    logoutGoogle,
    authError,
  } = useAuth();
  const { lang, setLang, t } = useLanguage();
  const isOverviewOrList =
    currentMode === 'overview' ||
    currentMode === 'program_list' ||
    currentMode === 'meeting_minutes' ||
    currentMode === 'meeting_wizard' ||
    currentMode === 'project_settings' ||
    currentMode === 'shortcuts';
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [registeredUsers, setRegisteredUsers] = useState<CurrentUser[]>(() => getRegisteredUsers());
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const themeMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncUsers = () => setRegisteredUsers(getRegisteredUsers());
    window.addEventListener(USERS_UPDATED_EVENT, syncUsers);
    return () => window.removeEventListener(USERS_UPDATED_EVENT, syncUsers);
  }, []);

  useEffect(() => {
    if (isUserMenuOpen) {
      setRegisteredUsers(getRegisteredUsers());
    }
  }, [isUserMenuOpen]);

  useEffect(() => {
    if (!isUserMenuOpen && !isThemeMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsUserMenuOpen(false);
        setIsThemeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isUserMenuOpen, isThemeMenuOpen]);

  const modeBreadcrumbLabel: Record<MainWorkspaceMode, string> = {
    overview: t('Project Dashboard', '프로젝트 대시보드'),
    program_list: t('Programs', '프로그램 목록'),
    meeting_minutes: t('Meeting Minutes', '프로젝트 회의록'),
    meeting_wizard: t('AI Spec Wizard', 'AI 사양서 생성'),
    project_settings: t('Project Settings', '프로젝트 설정'),
    shortcuts: t('Keyboard Shortcuts', '단축키 안내'),
    split: t('Split Workspace', '분할 작업실'),
    mockup_only: t('GUI Simulator', 'GUI 시뮬레이터'),
    editor_only: t('Spec Editor', '사양서 편집기'),
    abap_code: t('ABAP Code', 'ABAP 코드'),
    document: t('Print View', '인쇄 미리보기'),
  };

  const renderTopTooltip = (label: string, shortcut?: string, alignRight = false) => (
    <span
      role="tooltip"
      className={`pointer-events-none absolute top-full mt-2 z-50 px-2.5 py-1.5 rounded-md bg-slate-800 border border-slate-700 text-white text-xs font-medium whitespace-nowrap shadow-xl opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150 flex items-center gap-2 ${
        alignRight ? 'right-0' : 'left-1/2 -translate-x-1/2'
      }`}
    >
      <span>{label}</span>
      {shortcut && (
        <kbd className="font-mono text-[10px] text-slate-300 bg-slate-900/90 px-1.5 py-0.5 rounded border border-slate-700">
          {shortcut}
        </kbd>
      )}
    </span>
  );

  const splitLayoutLabel =
    splitLayout === 'top-bottom'
      ? t('Layout: Top / Bottom', '배치: 상하 분할')
      : splitLayout === 'left-right'
      ? t('Layout: Left / Right', '배치: 좌우 분할')
      : splitLayout === 'bottom-top'
      ? t('Layout: Bottom / Top', '배치: 하상 분할')
      : t('Layout: Right / Left', '배치: 우좌 분할');

  return (
    <header className="no-print h-12 flex items-center justify-between gap-6 px-5 bg-slate-900 border-b border-slate-800 text-white shrink-0">
      {/* Zone 1: Contextual Breadcrumb */}
      <div className="flex items-center gap-2.5 min-w-0">
        {isOverviewOrList ? (
          <div className="flex items-center gap-2 text-xs min-w-0">
            <span className="font-mono font-semibold text-blue-300 whitespace-nowrap shrink-0">
              {selectedProjectCode || COMMON_PROJECT_CODE}
            </span>
            <span className="text-slate-600 shrink-0" aria-hidden="true">/</span>
            <h1 className="font-semibold text-slate-100 truncate">
              {modeBreadcrumbLabel[currentMode]}
            </h1>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs min-w-0">
            <span className="font-mono font-semibold text-blue-300 whitespace-nowrap shrink-0">
              {currentSpec.project_code || selectedProjectCode || 'TEMP'}
            </span>
            <span className="text-slate-600 shrink-0" aria-hidden="true">/</span>
            <span className="font-mono font-bold text-white whitespace-nowrap shrink-0">
              {currentSpec.program_id}
            </span>
            {currentSpec.title && (
              <>
                <span className="hidden md:inline text-slate-600 shrink-0" aria-hidden="true">·</span>
                <span className="hidden md:inline text-slate-400 truncate max-w-[260px]">
                  {currentSpec.title}
                </span>
              </>
            )}
            {onToggleCurrentSpecFavorite && (
              <button
                type="button"
                onClick={onToggleCurrentSpecFavorite}
                aria-label={
                  isCurrentSpecFavorite
                    ? t('Remove favorite', '즐겨찾기 해제')
                    : t('Add favorite', '즐겨찾기 추가')
                }
                className="group relative p-1.5 rounded-md hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <Star
                  className={`w-3.5 h-3.5 ${
                    isCurrentSpecFavorite
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-slate-500 hover:text-amber-300'
                  }`}
                />
                {renderTopTooltip(
                  isCurrentSpecFavorite
                    ? t('Remove favorite', '즐겨찾기 해제')
                    : t('Add favorite', '즐겨찾기 추가')
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Zone 2: Icon-Only Spec Workspace Perspective Switcher (Only visible inside a Spec) */}
      {!isOverviewOrList && (
        <nav
          aria-label={t('Spec Workspace Views', '작업실 화면 전환')}
          className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/70 shrink-0"
        >
          <button
            type="button"
            onClick={() => onSelectMode('split')}
            className={`group relative w-8 h-7 rounded-md transition-colors flex items-center justify-center cursor-pointer shrink-0 ${
              currentMode === 'split'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
            aria-label={t('Split View', '분할 보기')}
          >
            <SplitSquareVertical className="w-4 h-4" />
            {renderTopTooltip(t('Split View', '분할 보기'), 'Alt+1')}
          </button>

          {currentMode === 'split' && onCycleSplitLayout && (
            <button
              type="button"
              onClick={onCycleSplitLayout}
              className="group relative w-8 h-7 text-cyan-300 hover:text-white hover:bg-slate-700/60 rounded-md transition-colors flex items-center justify-center cursor-pointer shrink-0"
              aria-label={splitLayoutLabel}
            >
              {splitLayout === 'top-bottom' ? (
                <PanelTop className="w-4 h-4" />
              ) : splitLayout === 'left-right' ? (
                <PanelLeft className="w-4 h-4" />
              ) : splitLayout === 'bottom-top' ? (
                <PanelBottom className="w-4 h-4" />
              ) : (
                <PanelRight className="w-4 h-4" />
              )}
              {renderTopTooltip(splitLayoutLabel, 'Alt+L')}
            </button>
          )}

          <button
            type="button"
            onClick={() => onSelectMode('mockup_only')}
            className={`group relative w-8 h-7 rounded-md transition-colors flex items-center justify-center cursor-pointer shrink-0 ${
              currentMode === 'mockup_only'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
            aria-label={t('GUI Simulator', 'GUI 시뮬레이터')}
          >
            <Layers className="w-4 h-4" />
            {renderTopTooltip(t('GUI Simulator', 'GUI 시뮬레이터'), 'Alt+2')}
          </button>

          <button
            type="button"
            onClick={() => onSelectMode('editor_only')}
            className={`group relative w-8 h-7 rounded-md transition-colors flex items-center justify-center cursor-pointer shrink-0 ${
              currentMode === 'editor_only'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
            aria-label={t('Spec Editor', '사양서 편집기')}
          >
            <FileText className="w-4 h-4" />
            {renderTopTooltip(t('Spec Editor', '사양서 편집기'), 'Alt+3')}
          </button>

          <button
            type="button"
            onClick={() => onSelectMode('abap_code')}
            className={`group relative w-8 h-7 rounded-md transition-colors flex items-center justify-center cursor-pointer shrink-0 ${
              currentMode === 'abap_code'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
            aria-label={t('ABAP Code', 'ABAP 코드')}
          >
            <FileCode className="w-4 h-4" />
            {renderTopTooltip(t('ABAP Code', 'ABAP 코드'), 'Alt+4')}
          </button>

          <button
            type="button"
            onClick={() => onSelectMode('document')}
            className={`group relative w-8 h-7 rounded-md transition-colors flex items-center justify-center cursor-pointer shrink-0 ${
              currentMode === 'document'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
            }`}
            aria-label={t('Print View', '인쇄 미리보기')}
          >
            <Printer className="w-4 h-4" />
            {renderTopTooltip(t('Print View', '인쇄 미리보기'), 'Alt+5')}
          </button>
        </nav>
      )}

      {/* Zone 3: Language Switcher + Icon-Only Actions & Account */}
      <div className="flex items-center gap-2 shrink-0">
        {!isOverviewOrList && onQuickSnapshotSave && (
          <button
            type="button"
            onClick={onQuickSnapshotSave}
            aria-label={
              hasUnsavedChanges
                ? t('Save Snapshot (Unsaved changes)', '스냅샷 저장 (미저장 변경사항)')
                : t('Save Snapshot', '스냅샷 저장')
            }
            className={`group relative w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
              hasUnsavedChanges
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Save className="w-4 h-4" />
            {renderTopTooltip(
              hasUnsavedChanges
                ? t('Save Snapshot*', '스냅샷 저장*')
                : lastSavedAt
                ? t(`Save Snapshot (${lastSavedAt})`, `스냅샷 저장 (${lastSavedAt})`)
                : t('Save Snapshot', '스냅샷 저장'),
              'Ctrl+S',
              true
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onNewSpec}
          aria-label={t('New Spec', '새 사양서')}
          className="group relative w-8 h-8 text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors shrink-0 flex items-center justify-center cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {renderTopTooltip(t('New Spec', '새 사양서'), undefined, true)}
        </button>

        {/* Quick Language Option (EN / 한국어) */}
        <div
          role="group"
          aria-label={t('Language Selection', '언어 선택')}
          className="group relative flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 shrink-0"
        >
          <button
            type="button"
            onClick={() => setLang('en')}
            aria-pressed={lang === 'en'}
            className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
              lang === 'en'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang('ko')}
            aria-pressed={lang === 'ko'}
            className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
              lang === 'ko'
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            한국어
          </button>
          {renderTopTooltip(t('Language (English / 한국어)', '언어 설정 (English / 한국어)'), undefined, true)}
        </div>

        {/* User Profile, Theme & Role Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            aria-label={t(`Account & Settings (${activeUser.name})`, `계정 및 설정 (${activeUser.name})`)}
            className="group relative w-8 h-8 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <div className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px]">
              {activeUser.name.charAt(0)}
            </div>
            {!isUserMenuOpen &&
              renderTopTooltip(`${activeUser.name} · ${projectRole}`, undefined, true)}
          </button>

          {isUserMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 p-2.5 z-50 text-slate-800 space-y-2.5">
              {/* Language Setting inside Account & Settings */}
              <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg p-2">
                <span className="text-[11px] font-bold text-slate-700">
                  {t('Language', '언어 설정')}
                </span>
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md p-0.5">
                  <button
                    type="button"
                    onClick={() => setLang('en')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                      lang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => setLang('ko')}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                      lang === 'ko' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    한국어
                  </button>
                </div>
              </div>

              {/* Google Cloud Auth Section */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                  <span className="flex items-center gap-1">
                    <ShieldCheck className={`w-3.5 h-3.5 ${isFirebaseAuthenticated ? 'text-emerald-600' : 'text-slate-400'}`} />
                    {t('Cloud Sync', '클라우드 동기화')}
                  </span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isFirebaseAuthenticated ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    {isFirebaseAuthenticated ? t('SYNC ON', '동기화 중') : t('LOCAL', '로컬')}
                  </span>
                </div>
                {isFirebaseAuthenticated ? (
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate text-slate-600 font-mono">{activeUser.email || activeUser.name}</span>
                    <button
                      type="button"
                      onClick={() => logoutGoogle()}
                      className="flex items-center gap-1 px-2 py-1 rounded bg-white hover:bg-rose-50 text-rose-700 border border-slate-200 font-semibold shrink-0 cursor-pointer"
                    >
                      <LogOut className="w-3 h-3" />
                      {t('Sign Out', '로그아웃')}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => loginWithGoogle()}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    {t('Sign in with Google', 'Google 로그인')}
                  </button>
                )}
                {authError && (
                  <div className="text-[10px] text-rose-600">{authError}</div>
                )}
              </div>

              {/* Project RBAC Role Selector */}
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase px-1 mb-1">
                  {t('Project Role (Approval)', '프로젝트 역할 (승인 권한)')}
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {(['PM', 'FUNC', 'ABAP', 'QA', 'ADMIN'] as UserProjectRole[]).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setProjectRole(role)}
                      className={`py-1 rounded text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                        projectRole === role
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              {/* SAP GUI Theme & Shortcuts */}
              {(onSelectTheme || onOpenShortcuts) && (
                <div className="border-t border-slate-100 pt-2 space-y-1.5">
                  {onSelectTheme && (
                    <div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase px-1 mb-1 flex items-center gap-1">
                        <Palette className="w-3 h-3" />
                        <span>{t('SAP GUI Theme', 'SAP GUI 테마')}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {(['quartz', 'belize', 'blue_crystal'] as SapGuiTheme[]).map((themeKey) => {
                          const info = SAP_GUI_THEMES[themeKey];
                          const active = currentTheme === themeKey;
                          return (
                            <button
                              key={themeKey}
                              type="button"
                              onClick={() => onSelectTheme(themeKey)}
                              className={`px-2 py-1 rounded text-[10px] font-semibold border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                                active
                                  ? 'bg-blue-50 text-blue-900 border-blue-300'
                                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                              title={`${info.name} (${info.releaseBadge})`}
                            >
                              <span
                                className="w-2.5 h-2.5 rounded-xs border border-slate-300 shrink-0"
                                style={{ backgroundColor: info.colors.header }}
                              />
                              <span className="truncate">{info.name.split(' ')[0]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {onOpenShortcuts && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onOpenShortcuts();
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-xs text-slate-700 hover:bg-slate-100 flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5 font-semibold">
                        <Keyboard className="w-3.5 h-3.5 text-slate-500" />
                        {t('Keyboard Shortcuts', '단축키 안내')}
                      </span>
                      <kbd className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        ?
                      </kbd>
                    </button>
                  )}
                </div>
              )}

              {/* Registered Users Switcher */}
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase px-1 py-1 border-t border-slate-100">
                  {t('Switch User Profile', '사용자 프로필 전환')}
                </div>
                <div className="space-y-0.5 max-h-56 overflow-y-auto">
                  {registeredUsers.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        switchPresetUser(u);
                        setIsUserMenuOpen(false);
                        onUserChanged?.(u);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                        activeUser.name === u.name
                          ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200'
                          : 'hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-xs flex items-center gap-1.5">
                          <span className="truncate">{u.name}</span>
                          {isDefaultOperatorUser(u) && (
                            <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-slate-900 text-white shrink-0">
                              {t('Default', '기본 관리자')}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">{u.email || u.role}</div>
                      </div>
                      {activeUser.name === u.name && (
                        <span className="text-blue-600 font-bold text-xs shrink-0">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
