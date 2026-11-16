import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ProgramSpec, ProjectMeetingMinute } from './types/sap';
import { SAMPLE_SPECS } from './data/sampleSpecs';
import { TopNav, MainWorkspaceMode, DualSplitLayout } from './components/TopNav';
import { SideNav } from './components/SideNav';
import { SpecEditor } from './components/SpecEditor';
import { SapGuiMockup } from './components/SapGuiMockup';
import { AbapCodeGenerator } from './components/AbapCodeGenerator';
import { SpecDocumentView } from './components/SpecDocumentView';
import { ProgramTemplateModal } from './components/ProgramTemplateModal';
import { PdfExportModal } from './components/PdfExportModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { ProjectOverviewDashboard } from './components/ProjectOverviewDashboard';
import { ProjectManagerModal } from './components/ProjectManagerModal';
import { CopySpecModal } from './components/CopySpecModal';
import { MeetingSpecWizardModal } from './components/MeetingSpecWizardModal';
import { MeetingMinutesPage } from './components/MeetingMinutesPage';
import { GlobalCommandPalette } from './components/GlobalCommandPalette';
import { SapDdicManagerModal } from './components/SapDdicManagerModal';
import { UserGuidePage } from './components/UserGuidePage';
import { GuideActionId } from './data/userGuideData';
import {
  SapGuiTheme,
  SAP_GUI_THEMES,
  SAP_THEME_STORAGE_KEY,
  isValidSapGuiTheme,
  loadSavedSapTheme,
  saveSapTheme,
} from './data/sapGuiThemes';
import {
  CurrentUser,
  DEFAULT_OPERATOR_USER,
  getCurrentUser,
  getRegisteredUsers,
  isDefaultOperatorUser,
} from './utils/authStorage';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import { syncSpecToFirestore, subscribeProjectSpecs } from './services/firestoreSync';
import {
  COMMON_PROJECT_CODE,
  TEMP_PROJECT_CODE,
  getAccessibleProjectsForUser,
  getProjectAbapStandards,
  isCommonProtectedSample,
  isReadOnlyCommonSpec,
  isSpecVisibleInProject,
  normalizeLegacyProjectCode,
} from './utils/projectStorage';
import {
  SavedProgramSpecItem,
  getSavedSpecList,
  upsertWorkingSpecQuietly,
} from './utils/specStorage';
import {
  deleteMeetingMinute,
  getVisibleMinutesForProject,
} from './utils/meetingStorage';
import { getUnresolvedCommentCountsMap } from './utils/reviewCommentStorage';
import { suggestCompliantIdsForProject } from './utils/sapValidation';
import { createRevisionSnapshot } from './utils/specSnapshotStorage';
import {
  FAVORITE_STORAGE_KEY,
  getFavoriteProgramIds,
  removeFavoriteProgram,
  toggleFavoriteProgram,
} from './utils/favoriteStorage';
import { AlertTriangle, CheckCircle2, Save, Undo2, X } from 'lucide-react';

const DUAL_SPLIT_CYCLE: DualSplitLayout[] = [
  'top-bottom',
  'left-right',
  'bottom-top',
  'right-left',
];

export default function App() {
  const { activeUser: authActiveUser, isFirebaseAuthenticated, projectRole } = useAuth();
  const { t } = useLanguage();
  const [currentUser, setCurrentUserState] = useState<CurrentUser>(() => authActiveUser || getCurrentUser());
  const isAdminOperator = isDefaultOperatorUser(currentUser);
  const [projectRefreshKey, setProjectRefreshKey] = useState(0);
  const [allSavedSpecs, setAllSavedSpecs] = useState<SavedProgramSpecItem[]>(() => getSavedSpecList());
  const [favoriteProgramIds, setFavoriteProgramIds] = useState<string[]>(() =>
    getFavoriteProgramIds(getCurrentUser().name)
  );

  useEffect(() => {
    setCurrentUserState(authActiveUser);
    setFavoriteProgramIds(getFavoriteProgramIds(authActiveUser.name));
    setProjectRefreshKey((k) => k + 1);
    setAllSavedSpecs(getSavedSpecList());
  }, [authActiveUser]);

  const accessibleProjects = useMemo(
    () => getAccessibleProjectsForUser(currentUser.name),
    [currentUser.name, projectRefreshKey]
  );

  const [selectedProjectCode, setSelectedProjectCode] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('sap_spec_selected_project_v1');
      if (saved) return normalizeLegacyProjectCode(saved) || COMMON_PROJECT_CODE;
    } catch {
      // ignore
    }
    return COMMON_PROJECT_CODE;
  });

  useEffect(() => {
    if (
      accessibleProjects.length > 0 &&
      !accessibleProjects.some((p) => p.code === selectedProjectCode)
    ) {
      const fallback = accessibleProjects[0].code;
      setSelectedProjectCode(fallback);
    }
  }, [accessibleProjects, selectedProjectCode]);

  const handleSelectProject = (code: string) => {
    const normalizedCode = normalizeLegacyProjectCode(code) || COMMON_PROJECT_CODE;
    setSelectedProjectCode(normalizedCode);
    try {
      localStorage.setItem('sap_spec_selected_project_v1', normalizedCode);
    } catch {
      // ignore
    }
  };

  const refreshAllSpecs = () => {
    setAllSavedSpecs(getSavedSpecList());
  };

  const [currentSpec, setCurrentSpec] = useState<ProgramSpec>(SAMPLE_SPECS[0]);
  const isCurrentSpecReadOnly =
    isReadOnlyCommonSpec(currentSpec) ||
    (currentSpec.status === 'approved' && projectRole !== 'PM' && projectRole !== 'ADMIN');
  const [historyPast, setHistoryPast] = useState<ProgramSpec[]>([]);
  const [historyFuture, setHistoryFuture] = useState<ProgramSpec[]>([]);
  const lastEditTimestampRef = useRef<number>(0);

  // Default entry screen is now Project Overview Dashboard
  const [workspaceMode, setWorkspaceMode] = useState<MainWorkspaceMode>('overview');
  const returnFromPageModeRef = useRef<MainWorkspaceMode>('overview');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isPdfExportModalOpen, setIsPdfExportModalOpen] = useState(false);
  const [copyingSpec, setCopyingSpec] = useState<ProgramSpec | null>(null);
  const [editingMeetingMinute, setEditingMeetingMinute] = useState<ProjectMeetingMinute | null>(null);
  const [selectedMinuteDetailId, setSelectedMinuteDetailId] = useState<string | null>(null);
  const [wizardStartInSpecGen, setWizardStartInSpecGen] = useState<boolean>(false);
  const [meetingRefreshKey, setMeetingRefreshKey] = useState(0);
  const [commentRefreshKey, setCommentRefreshKey] = useState(0);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [ddicInspectTabname, setDdicInspectTabname] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<
    | { type: 'mode'; mode: MainWorkspaceMode }
    | { type: 'spec'; spec: ProgramSpec }
    | { type: 'minute'; minuteId: string }
    | null
  >(null);

  const unresolvedCommentCounts = useMemo(
    () => getUnresolvedCommentCountsMap(),
    [commentRefreshKey, allSavedSpecs]
  );

  const accessibleCommandSpecs = useMemo(
    () =>
      allSavedSpecs.filter((item) =>
        accessibleProjects.some((p) =>
          isSpecVisibleInProject(item, p.code, currentUser.name)
        )
      ),
    [allSavedSpecs, accessibleProjects, currentUser.name]
  );

  const accessibleCommandMinutes = useMemo(() => {
    const byId = new Map<string, ProjectMeetingMinute>();
    accessibleProjects.forEach((p) => {
      getVisibleMinutesForProject(p.code, currentUser.name).forEach((m) => {
        if (!byId.has(m.id)) {
          byId.set(m.id, m);
        }
      });
    });
    return Array.from(byId.values()).sort((a, b) =>
      String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
    );
  }, [accessibleProjects, currentUser.name, meetingRefreshKey]);

  const openFullPageMode = (target: 'meeting_wizard' | 'project_settings' | 'shortcuts') => {
    if (target === 'project_settings' && !isAdminOperator) {
      showWorkspaceToast(
        t(
          'Project Settings is restricted to administrator Josh Lee.',
          '프로젝트 설정은 관리자(Josh Lee)만 접근할 수 있습니다.'
        )
      );
      return;
    }
    if (
      workspaceMode !== 'meeting_wizard' &&
      workspaceMode !== 'project_settings' &&
      workspaceMode !== 'shortcuts'
    ) {
      returnFromPageModeRef.current = workspaceMode;
    }
    setWorkspaceMode(target);
  };

  useEffect(() => {
    if (workspaceMode === 'project_settings' && !isAdminOperator) {
      setWorkspaceMode('overview');
    }
  }, [workspaceMode, isAdminOperator]);

  const closeFullPageMode = () => {
    const back = returnFromPageModeRef.current || 'overview';
    setWorkspaceMode(back);
  };
  const [workspaceToast, setWorkspaceToast] = useState<{
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showWorkspaceToast = (
    message: string,
    actionLabel?: string,
    onAction?: () => void
  ) => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    setWorkspaceToast({ message, actionLabel, onAction });
    toastTimerRef.current = window.setTimeout(() => {
      setWorkspaceToast(null);
    }, 3600);
  };

  useEffect(() => {
    if (
      !isFirebaseAuthenticated ||
      !selectedProjectCode ||
      selectedProjectCode === COMMON_PROJECT_CODE
    ) {
      return;
    }

    const unsubscribe = subscribeProjectSpecs(selectedProjectCode, (remoteSpecs) => {
      if (!remoteSpecs || remoteSpecs.length === 0) return;
      remoteSpecs.forEach((remote) => {
        if (!isCommonProtectedSample(remote)) {
          upsertWorkingSpecQuietly(remote);
        }
      });
      setAllSavedSpecs(getSavedSpecList());
      setCurrentSpec((prev) => {
        if (isCommonProtectedSample(prev)) return prev;
        if (Date.now() - lastEditTimestampRef.current < 2500) return prev;
        const matched = remoteSpecs.find(
          (r) => r.id === prev.id || r.program_id === prev.program_id
        );
        if (!matched) return prev;
        return JSON.stringify(matched) === JSON.stringify(prev) ? prev : matched;
      });
    });

    return () => unsubscribe();
  }, [isFirebaseAuthenticated, selectedProjectCode]);

  const formatNowHms = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const applySpecChange = (updated: ProgramSpec, forceNewHistoryStep = false) => {
    const now = Date.now();
    const isRapidContinuousEdit =
      !forceNewHistoryStep &&
      now - lastEditTimestampRef.current < 700 &&
      updated.id === currentSpec.id &&
      updated.selection_params.length === currentSpec.selection_params.length &&
      updated.field_catalog.length === currentSpec.field_catalog.length &&
      updated.sample_type === currentSpec.sample_type;

    lastEditTimestampRef.current = now;

    if (!isRapidContinuousEdit) {
      setHistoryPast((prev) => [...prev.slice(-29), currentSpec]);
    }
    setHistoryFuture([]);
    setCurrentSpec(updated);

    if (!isCommonProtectedSample(updated)) {
      upsertWorkingSpecQuietly(updated);
      refreshAllSpecs();
      setLastSavedAt(formatNowHms());
      setHasUnsavedChanges(!forceNewHistoryStep);
      if (isFirebaseAuthenticated) {
        const projObj = accessibleProjects.find(
          (p) => p.code === (updated.project_code || TEMP_PROJECT_CODE)
        );
        syncSpecToFirestore(updated, projObj).catch((err) => {
          console.warn('Firestore spec sync skipped:', err);
        });
      }
    }
  };

  const isInSpecEditingMode =
    workspaceMode === 'split' ||
    workspaceMode === 'mockup_only' ||
    workspaceMode === 'editor_only' ||
    workspaceMode === 'abap_code';

  const executePendingNavigation = (
    nav:
      | { type: 'mode'; mode: MainWorkspaceMode }
      | { type: 'spec'; spec: ProgramSpec }
      | { type: 'minute'; minuteId: string }
  ) => {
    if (nav.type === 'mode') {
      if (nav.mode === 'overview' || nav.mode === 'program_list') {
        refreshAllSpecs();
      }
      setHasUnsavedChanges(false);
      setWorkspaceMode(nav.mode);
    } else if (nav.type === 'spec') {
      setHistoryPast([]);
      setHistoryFuture([]);
      setCurrentSpec(nav.spec);
      setHasUnsavedChanges(false);
      setLastSavedAt(null);
      if (nav.spec.project_code) {
        handleSelectProject(nav.spec.project_code);
      }
      setWorkspaceMode('split');
    } else if (nav.type === 'minute') {
      setHasUnsavedChanges(false);
      setSelectedMinuteDetailId(nav.minuteId);
      setWorkspaceMode('meeting_minutes');
    }
  };

  const handleQuickSnapshotSave = async (): Promise<boolean> => {
    if (isCommonProtectedSample(currentSpec)) {
      showWorkspaceToast(
        t(
          'COMM standard samples are read-only. Copy to a project before editing.',
          'COMM 표준 샘플은 읽기 전용입니다. 프로젝트로 복사한 뒤 편집하세요.'
        )
      );
      return false;
    }
    const { historyItem } = await createRevisionSnapshot(
      currentSpec,
      t('Quick workspace snapshot (Ctrl+S)', '작업실 빠른 스냅샷 (Ctrl+S)'),
      currentUser.name
    );
    const updatedSpec: ProgramSpec = {
      ...currentSpec,
      change_history: [...(currentSpec.change_history || []), historyItem],
    };
    setCurrentSpec(updatedSpec);
    upsertWorkingSpecQuietly(updatedSpec);
    refreshAllSpecs();
    setLastSavedAt(formatNowHms());
    setHasUnsavedChanges(false);
    if (isFirebaseAuthenticated) {
      const projObj = accessibleProjects.find(
        (p) => p.code === (updatedSpec.project_code || TEMP_PROJECT_CODE)
      );
      syncSpecToFirestore(updatedSpec, projObj).catch((err) => {
        console.warn('Firestore snapshot spec sync skipped:', err);
      });
    }
    showWorkspaceToast(
      t(
        `Snapshot ${historyItem.version} saved (${updatedSpec.program_id})`,
        `스냅샷 ${historyItem.version} 저장 완료 (${updatedSpec.program_id})`
      )
    );
    return true;
  };

  const handleNavigateModeSafely = (mode: MainWorkspaceMode) => {
    const isLeavingEditor =
      isInSpecEditingMode &&
      (mode === 'overview' ||
        mode === 'program_list' ||
        mode === 'meeting_minutes' ||
        mode === 'user_guide');
    if (isLeavingEditor && hasUnsavedChanges && !isCommonProtectedSample(currentSpec)) {
      setPendingNavigation({ type: 'mode', mode });
      return;
    }
    if (mode === 'overview' || mode === 'program_list') {
      refreshAllSpecs();
    }
    setWorkspaceMode(mode);
  };

  const handleOpenProgramFromProject = (spec: ProgramSpec) => {
    const isDifferentSpec =
      spec.id !== currentSpec.id || spec.program_id !== currentSpec.program_id;
    if (
      isInSpecEditingMode &&
      isDifferentSpec &&
      hasUnsavedChanges &&
      !isCommonProtectedSample(currentSpec)
    ) {
      setPendingNavigation({ type: 'spec', spec });
      return;
    }
    executePendingNavigation({ type: 'spec', spec });
  };

  const handleOpenMeetingMinuteFromSpec = (minuteId: string) => {
    if (isInSpecEditingMode && hasUnsavedChanges && !isCommonProtectedSample(currentSpec)) {
      setPendingNavigation({ type: 'minute', minuteId });
      return;
    }
    executePendingNavigation({ type: 'minute', minuteId });
  };

  const handleUndo = () => {
    if (historyPast.length === 0) return;
    const previous = historyPast[historyPast.length - 1];
    setHistoryPast((prev) => prev.slice(0, -1));
    setHistoryFuture((prev) => [currentSpec, ...prev.slice(0, 29)]);
    setCurrentSpec(previous);
    showWorkspaceToast(
      t(
        `Reverted to previous spec state (${previous.program_id})`,
        `이전 사양서 상태로 되돌렸습니다 (${previous.program_id})`
      )
    );
  };

  const handleRedo = () => {
    if (historyFuture.length === 0) return;
    const next = historyFuture[0];
    setHistoryFuture((prev) => prev.slice(1));
    setHistoryPast((prev) => [...prev.slice(-29), currentSpec]);
    setCurrentSpec(next);
    showWorkspaceToast(
      t(`Redid spec state (${next.program_id})`, `사양서 상태를 다시 실행했습니다 (${next.program_id})`)
    );
  };
  const [currentTheme, setCurrentTheme] = useState<SapGuiTheme>(() => loadSavedSapTheme());

  useEffect(() => {
    saveSapTheme(currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === SAP_THEME_STORAGE_KEY && isValidSapGuiTheme(e.newValue)) {
        setCurrentTheme(e.newValue);
      }
      if (e.key === FAVORITE_STORAGE_KEY) {
        setFavoriteProgramIds(getFavoriteProgramIds(currentUser.name));
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [currentUser.name]);

  const handleToggleFavorite = (programId: string) => {
    const cleanId = (programId || '').trim().toUpperCase();
    if (!cleanId) return;
    const res = toggleFavoriteProgram(currentUser.name, cleanId);
    setFavoriteProgramIds(res.ids);
    showWorkspaceToast(
      res.favorited
        ? t(`Added '${cleanId}' to favorites.`, `'${cleanId}'을(를) 즐겨찾기에 추가했습니다.`)
        : t(`Removed '${cleanId}' from favorites.`, `'${cleanId}'을(를) 즐겨찾기에서 해제했습니다.`)
    );
  };

  const handleSelectTheme = (nextTheme: SapGuiTheme) => {
    setCurrentTheme(nextTheme);
    saveSapTheme(nextTheme);
    const info = SAP_GUI_THEMES[nextTheme];
    showWorkspaceToast(
      t(
        `Simulator theme: SAP ${info.name} (${info.releaseBadge})`,
        `시뮬레이터 테마: SAP ${info.name} (${info.releaseBadge})`
      )
    );
  };
  const [mockDataTrigger, setMockDataTrigger] = useState<number>(0);

  // Dual Screen Split Layout (상하, 좌우, 하상, 우좌) & Resizable Divider Ratio
  const [splitLayout, setSplitLayout] = useState<DualSplitLayout>(() => {
    try {
      const saved = localStorage.getItem('sap_spec_dual_split_layout') as DualSplitLayout;
      if (DUAL_SPLIT_CYCLE.includes(saved)) return saved;
    } catch {
      // ignore
    }
    return 'left-right';
  });
  const isVerticalSplit = splitLayout === 'top-bottom' || splitLayout === 'bottom-top';
  const isReversedSplit = splitLayout === 'bottom-top' || splitLayout === 'right-left';

  const [splitRatio, setSplitRatio] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('sap_spec_dual_split_ratio'));
      if (!isNaN(saved) && saved >= 20 && saved <= 80) return saved;
    } catch {
      // ignore
    }
    return 50;
  });
  const [isResizingSplit, setIsResizingSplit] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const splitRatioRef = useRef<number>(splitRatio);
  splitRatioRef.current = splitRatio;

  useEffect(() => {
    if (!isResizingSplit) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      let nextRatio = 50;
      if (!isVerticalSplit) {
        if (rect.width <= 0) return;
        nextRatio = ((e.clientX - rect.left) / rect.width) * 100;
      } else {
        if (rect.height <= 0) return;
        nextRatio = ((e.clientY - rect.top) / rect.height) * 100;
      }
      const clamped = Math.min(80, Math.max(20, Math.round(nextRatio * 10) / 10));
      splitRatioRef.current = clamped;
      setSplitRatio(clamped);
    };

    const handleMouseUp = () => {
      setIsResizingSplit(false);
      document.body.style.cursor = '';
      try {
        localStorage.setItem('sap_spec_dual_split_ratio', String(splitRatioRef.current));
      } catch {
        // ignore
      }
    };

    document.body.style.cursor = !isVerticalSplit ? 'col-resize' : 'row-resize';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSplit, isVerticalSplit]);

  const handleCycleSplitLayout = () => {
    setSplitLayout((prev) => {
      const idx = DUAL_SPLIT_CYCLE.indexOf(prev);
      const next = DUAL_SPLIT_CYCLE[(idx + 1) % DUAL_SPLIT_CYCLE.length];
      try {
        localStorage.setItem('sap_spec_dual_split_layout', next);
      } catch {
        // ignore
      }
      const labels: Record<DualSplitLayout, string> = {
        'top-bottom': 'Top / Bottom',
        'left-right': 'Left / Right',
        'bottom-top': 'Bottom / Top',
        'right-left': 'Right / Left',
      };
      showWorkspaceToast(`Split layout: ${labels[next]}`);
      return next;
    });
  };

  // Global keyboard shortcuts (Ctrl+K search, Ctrl+S snapshot, Alt+1..5 views, Alt+L layout, Ctrl+Z/Y undo/redo, ? help)
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        Boolean(target?.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (isInSpecEditingMode) {
          e.preventDefault();
          void handleQuickSnapshotSave();
        }
        return;
      }

      // View mode switching: Alt + 1..5
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === '1') {
          e.preventDefault();
          setWorkspaceMode('split');
          return;
        }
        if (e.key === '2') {
          e.preventDefault();
          setWorkspaceMode('mockup_only');
          return;
        }
        if (e.key === '3') {
          e.preventDefault();
          setWorkspaceMode('editor_only');
          return;
        }
        if (e.key === '4') {
          e.preventDefault();
          setWorkspaceMode('abap_code');
          return;
        }
        if (e.key === '5') {
          e.preventDefault();
          setWorkspaceMode('document');
          return;
        }
        if (e.key.toLowerCase() === 'l' && workspaceMode === 'split') {
          e.preventDefault();
          handleCycleSplitLayout();
          return;
        }
      }

      if (isTextInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          if (historyFuture.length > 0) {
            e.preventDefault();
            handleRedo();
          }
        } else if (historyPast.length > 0) {
          e.preventDefault();
          handleUndo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        if (historyFuture.length > 0) {
          e.preventDefault();
          handleRedo();
        }
        return;
      }

      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        if (workspaceMode === 'shortcuts') {
          closeFullPageMode();
        } else {
          openFullPageMode('shortcuts');
        }
      }
    };

    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  });

  // Create new blank specification (assigned to current non-COMMON project or TEMP)
  const handleNewSpec = (explicitProjectCode?: string) => {
    const activeUser = getCurrentUser();
    const registeredUsers = getRegisteredUsers();
    const registeredAuthor = registeredUsers.some((u) => u.name === activeUser.name)
      ? activeUser.name
      : DEFAULT_OPERATOR_USER.name;

    const targetProject =
      explicitProjectCode && explicitProjectCode !== COMMON_PROJECT_CODE
        ? explicitProjectCode
        : selectedProjectCode && selectedProjectCode !== COMMON_PROJECT_CODE
        ? selectedProjectCode
        : TEMP_PROJECT_CODE;

    const projectStandards = getProjectAbapStandards(targetProject);
    const existingIds = new Set(allSavedSpecs.map((s) => s.program_id.toUpperCase()));
    let suffix = 1;
    let suggested = suggestCompliantIdsForProject(
      `ZR_CUSTOM_${String(suffix).padStart(3, '0')}`,
      `ZC${String(suffix).padStart(3, '0')}`,
      'SD',
      projectStandards
    );
    while (existingIds.has(suggested.program_id.toUpperCase())) {
      suffix += 1;
      suggested = suggestCompliantIdsForProject(
        `ZR_CUSTOM_${String(suffix).padStart(3, '0')}`,
        `ZC${String(suffix).padStart(3, '0')}`,
        'SD',
        projectStandards
      );
    }
    const nextProgramId = suggested.program_id;
    const nextTCode = suggested.tcode;

    const blankSpec: ProgramSpec = {
      id: `spec-custom-${Date.now()}`,
      project_code: targetProject,
      program_id: nextProgramId,
      tcode: nextTCode,
      title: 'New ALV Grid Report Program',
      module: 'SD',
      author: registeredAuthor,
      created_date: new Date().toISOString().split('T')[0],
      target_sap_release: 'SAP S/4HANA 2023',
      program_type: 'REPORT',
      abap_syntax_mode: projectStandards.default_syntax_mode,
      message_class: projectStandards.message_class,
      business_purpose: 'ALV report for querying business process data.',
      data_extraction_logic: '1. Define selection criteria and DB extraction logic.',
      selection_params: [
        {
          id: 'p_bukrs',
          kind: 'PARAMETER',
          name: 'P_BUKRS',
          text: 'Company Code',
          ref_table: 'T001',
          ref_field: 'BUKRS',
          datatype: 'CHAR',
          length: 4,
          obligatory: true,
          default_val: '1000',
          low: '1000',
        },
        {
          id: 's_date',
          kind: 'SELECT_OPTION',
          name: 'S_DATE',
          text: 'Posting Date',
          datatype: 'DATS',
          length: 10,
          obligatory: true,
          default_val: 'SY-DATUM',
          low: '2026.10.01',
          high: '2026.10.31',
          sign: 'I',
          option: 'BT',
        },
      ],
      field_catalog: [
        {
          id: 'custom-f1',
          col_pos: 1,
          fieldname: 'ZICON',
          coltext: 'Status',
          datatype: 'CHAR',
          outputlen: 5,
          just: 'C',
          key: true,
          hotspot: false,
          checkbox: false,
          edit: false,
          do_sum: false,
          emphasize: '',
        },
        {
          id: 'custom-f2',
          col_pos: 2,
          fieldname: 'DOC_NO',
          coltext: 'Document No.',
          datatype: 'CHAR',
          outputlen: 12,
          just: 'C',
          key: true,
          hotspot: true,
          checkbox: false,
          edit: false,
          do_sum: false,
          emphasize: '',
          drilldown_tcode: 'VA03',
        },
        {
          id: 'custom-f3',
          col_pos: 3,
          fieldname: 'DOC_DATE',
          coltext: 'Posting Date',
          datatype: 'DATS',
          outputlen: 10,
          just: 'C',
          key: false,
          hotspot: false,
          checkbox: false,
          edit: false,
          do_sum: false,
          emphasize: '',
        },
        {
          id: 'custom-f4',
          col_pos: 4,
          fieldname: 'PARTNER_NAME',
          coltext: 'Partner Name',
          datatype: 'CHAR',
          outputlen: 25,
          just: 'L',
          key: false,
          hotspot: false,
          checkbox: false,
          edit: false,
          do_sum: false,
          emphasize: '',
        },
        {
          id: 'custom-f5',
          col_pos: 5,
          fieldname: 'AMOUNT',
          coltext: 'Amount',
          datatype: 'CURR',
          outputlen: 15,
          just: 'R',
          key: false,
          hotspot: false,
          checkbox: false,
          edit: false,
          do_sum: true,
          emphasize: '',
        },
        {
          id: 'custom-f6',
          col_pos: 6,
          fieldname: 'CURRENCY',
          coltext: 'Currency',
          datatype: 'CHAR',
          outputlen: 5,
          just: 'C',
          key: false,
          hotspot: false,
          checkbox: false,
          edit: false,
          do_sum: false,
          emphasize: '',
        },
      ],
      layout: {
        zebra: true,
        grid_title: 'Custom ALV Report',
        sel_mode: 'A',
        cwidth_opt: true,
        totals_only: false,
        excp_fname: 'ZICON',
        excp_led: true,
        show_row_numbers: true,
      },
      custom_toolbar: [],
      test_cases: [
        {
          id: 'tc-new-1',
          scenario: 'Normal Data Query',
          condition: 'Company Code = 1000',
          expected: 'Grid renders rows correctly',
        },
      ],
      mock_rows: [
        {
          ZICON: '1',
          DOC_NO: 'DOC-2026-001',
          DOC_DATE: '2026.10.10',
          PARTNER_NAME: 'Samsung Electronics Suwon',
          AMOUNT: 45000000,
          CURRENCY: 'KRW',
        },
        {
          ZICON: '2',
          DOC_NO: 'DOC-2026-002',
          DOC_DATE: '2026.10.15',
          PARTNER_NAME: 'Hyundai Motor Namyang',
          AMOUNT: 38200000,
          CURRENCY: 'KRW',
        },
        {
          ZICON: '3',
          DOC_NO: 'DOC-2026-003',
          DOC_DATE: '2026.10.22',
          PARTNER_NAME: 'LG Energy Solution Ochang',
          AMOUNT: 19800000,
          CURRENCY: 'KRW',
        },
      ],
    };

    applySpecChange(blankSpec, true);
    handleSelectProject(targetProject);
    setWorkspaceMode('split');
    showWorkspaceToast(`Created spec '${nextProgramId}' in [${targetProject}].`, 'Undo', () => {
      setHistoryPast((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        setCurrentSpec(last);
        return prev.slice(0, -1);
      });
    });
  };

  // Trigger print-friendly view and PDF export
  const handleTriggerPrint = () => {
    setWorkspaceMode('document');
    setTimeout(() => {
      window.print();
    }, 280);
  };

  const handleGuideAction = (actionId: GuideActionId) => {
    if (actionId === 'open_meeting_wizard') {
      setEditingMeetingMinute(null);
      setWizardStartInSpecGen(false);
      openFullPageMode('meeting_wizard');
      return;
    }
    if (actionId === 'open_meetings') {
      setWorkspaceMode('meeting_minutes');
      return;
    }
    if (actionId === 'open_program_list') {
      refreshAllSpecs();
      setWorkspaceMode('program_list');
      return;
    }
    if (actionId === 'open_templates') {
      setIsTemplateModalOpen(true);
      return;
    }
    if (
      actionId === 'open_sample_01' ||
      actionId === 'open_sample_02' ||
      actionId === 'open_sample_03' ||
      actionId === 'open_sample_04'
    ) {
      const targetType = actionId.slice(-2);
      const found =
        SAMPLE_SPECS.find(
          (s) =>
            (s.project_code === COMMON_PROJECT_CODE || !s.project_code) &&
            s.sample_type === targetType
        ) || SAMPLE_SPECS[0];
      handleOpenProgramFromProject(found);
      showWorkspaceToast(
        t(
          `Opened standard sample ${found.program_id} (Type ${targetType})`,
          `표준 샘플 ${found.program_id} (유형 ${targetType})을 열었습니다`
        )
      );
      return;
    }
    if (actionId === 'open_editor') {
      setWorkspaceMode('editor_only');
      return;
    }
    if (actionId === 'open_split') {
      setWorkspaceMode('split');
      return;
    }
    if (actionId === 'open_mockup') {
      setWorkspaceMode('mockup_only');
      return;
    }
    if (actionId === 'open_abap_code') {
      setWorkspaceMode('abap_code');
      return;
    }
    if (actionId === 'open_document') {
      setWorkspaceMode('document');
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-900 print:h-auto print:min-h-screen print:overflow-visible print:bg-white">
      {/* 1. Unified Minimal Icon-Based Side Navigation Rail */}
      <SideNav
        currentMode={workspaceMode}
        onSelectMode={handleNavigateModeSafely}
        canAccessProjectSettings={isAdminOperator}
        onOpenProjectSettings={() => {
          if (workspaceMode !== 'project_settings') {
            openFullPageMode('project_settings');
          }
        }}
        onOpenShortcuts={() => {
          if (workspaceMode === 'shortcuts') {
            closeFullPageMode();
          } else {
            openFullPageMode('shortcuts');
          }
        }}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        currentSpec={currentSpec}
      />

      {/* 2. Primary Workspace Column (Header + Focused Content Area) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden print:overflow-visible print:h-auto">
        <TopNav
          currentMode={workspaceMode}
          onSelectMode={handleNavigateModeSafely}
          currentSpec={currentSpec}
          onSelectTemplate={(s) => applySpecChange(s, true)}
          onNewSpec={() => handleNewSpec()}
          onTriggerPrint={handleTriggerPrint}
          onOpenTemplates={() => setIsTemplateModalOpen(true)}
          onExportPdf={() => setIsPdfExportModalOpen(true)}
          currentTheme={currentTheme}
          onSelectTheme={handleSelectTheme}
          onGenerateMockData={() => {
            setMockDataTrigger((prev) => prev + 1);
            showWorkspaceToast(t('Generating fresh mock data...', '새 테스트 데이터를 생성하는 중...'));
          }}
          splitLayout={splitLayout}
          onCycleSplitLayout={handleCycleSplitLayout}
          onOpenShortcuts={() => {
            if (workspaceMode === 'shortcuts') {
              closeFullPageMode();
            } else {
              openFullPageMode('shortcuts');
            }
          }}
          onOpenProjectManager={() => {
            if (workspaceMode === 'project_settings') {
              closeFullPageMode();
            } else {
              openFullPageMode('project_settings');
            }
          }}
          selectedProjectCode={selectedProjectCode}
          isCurrentSpecFavorite={favoriteProgramIds.includes((currentSpec.program_id || '').toUpperCase())}
          onToggleCurrentSpecFavorite={() => handleToggleFavorite(currentSpec.program_id)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          lastSavedAt={lastSavedAt}
          hasUnsavedChanges={hasUnsavedChanges}
          onQuickSnapshotSave={() => void handleQuickSnapshotSave()}
          onUserChanged={(u) => {
            setCurrentUserState(u);
            setFavoriteProgramIds(getFavoriteProgramIds(u.name));
            setProjectRefreshKey((k) => k + 1);
            refreshAllSpecs();
            showWorkspaceToast(t(`Switched user: ${u.name}`, `사용자 전환: ${u.name}`));
          }}
        />

        {/* Main Workspace Viewport */}
        <main
          className={`flex-1 overflow-hidden ${
            workspaceMode === 'overview' ||
            workspaceMode === 'program_list' ||
            workspaceMode === 'meeting_minutes' ||
            workspaceMode === 'meeting_wizard' ||
            workspaceMode === 'user_guide' ||
            workspaceMode === 'project_settings' ||
            workspaceMode === 'shortcuts'
              ? 'p-0 bg-slate-50'
              : 'p-3 bg-slate-950'
          } print:p-0 print:bg-white print:overflow-visible print:h-auto`}
        >
        {(workspaceMode === 'overview' || workspaceMode === 'program_list') && (
          <ProjectOverviewDashboard
            viewMode={workspaceMode}
            currentUser={currentUser}
            accessibleProjects={accessibleProjects}
            selectedProjectCode={selectedProjectCode}
            onSelectProject={handleSelectProject}
            allSpecs={allSavedSpecs}
            favoriteProgramIds={favoriteProgramIds}
            onToggleFavorite={handleToggleFavorite}
            onSpecsChanged={(deletedProgramId) => {
              if (deletedProgramId) {
                setFavoriteProgramIds(removeFavoriteProgram(currentUser.name, deletedProgramId));
              }
              refreshAllSpecs();
            }}
            onChangeViewMode={(m) => {
              refreshAllSpecs();
              setWorkspaceMode(m);
            }}
            onOpenProgram={handleOpenProgramFromProject}
            onCreateNewProgram={(projCode) => handleNewSpec(projCode)}
            canManageProjects={isAdminOperator}
            onOpenProjectManager={() => openFullPageMode('project_settings')}
            onRequestCopySpec={(spec) => setCopyingSpec(spec)}
            onOpenMeetingWizard={(minute) => {
              setEditingMeetingMinute(minute || null);
              setWizardStartInSpecGen(false);
              openFullPageMode('meeting_wizard');
            }}
            unresolvedCommentCounts={unresolvedCommentCounts}
            onOpenMeetingMinute={(minuteId) => {
              setSelectedMinuteDetailId(minuteId);
              setWorkspaceMode('meeting_minutes');
            }}
            onNotify={(msg) => showWorkspaceToast(msg)}
          />
        )}

        {workspaceMode === 'meeting_minutes' && (
          <MeetingMinutesPage
            currentUser={currentUser}
            accessibleProjects={accessibleProjects}
            selectedProjectCode={selectedProjectCode}
            onSelectProject={handleSelectProject}
            allSpecs={allSavedSpecs}
            initialSelectedMinuteId={selectedMinuteDetailId}
            meetingRefreshKey={meetingRefreshKey}
            onMinutesChanged={() => setMeetingRefreshKey((k) => k + 1)}
            onBackToOverview={() => setWorkspaceMode('overview')}
            onStartNewMeeting={() => {
              setEditingMeetingMinute(null);
              setWizardStartInSpecGen(false);
              openFullPageMode('meeting_wizard');
            }}
            onResumeWizard={(minute) => {
              setEditingMeetingMinute(minute);
              setWizardStartInSpecGen(false);
              openFullPageMode('meeting_wizard');
            }}
            onEnterSpecGeneration={(minute) => {
              setEditingMeetingMinute(minute);
              setWizardStartInSpecGen(true);
              openFullPageMode('meeting_wizard');
            }}
            onDeleteMinute={(id) => {
              deleteMeetingMinute(id);
              setMeetingRefreshKey((k) => k + 1);
              showWorkspaceToast('Meeting minutes deleted.');
            }}
            onOpenProgram={handleOpenProgramFromProject}
            onNotify={(msg) => showWorkspaceToast(msg)}
          />
        )}

        {workspaceMode === 'meeting_wizard' && (
          <MeetingSpecWizardModal
            isOpen={true}
            startInSpecGen={wizardStartInSpecGen}
            onClose={() => {
              setEditingMeetingMinute(null);
              setWizardStartInSpecGen(false);
              closeFullPageMode();
            }}
            currentUser={currentUser}
            accessibleProjects={accessibleProjects}
            defaultProjectCode={selectedProjectCode}
            existingProgramIds={allSavedSpecs.map((s) => s.program_id)}
            initialMinute={editingMeetingMinute}
            onMinutesSaved={() => setMeetingRefreshKey((k) => k + 1)}
            onSpecFinalized={(generatedSpec) => {
              applySpecChange(generatedSpec, true);
              if (generatedSpec.project_code) {
                handleSelectProject(generatedSpec.project_code);
              }
              setMeetingRefreshKey((k) => k + 1);
              setEditingMeetingMinute(null);
              setWizardStartInSpecGen(false);
              setWorkspaceMode('split');
              showWorkspaceToast(
                `Created spec '${generatedSpec.program_id}' in [${generatedSpec.project_code}].`
              );
            }}
          />
        )}

        {workspaceMode === 'project_settings' && isAdminOperator && (
          <ProjectManagerModal
            isOpen={true}
            initialProjectCode={selectedProjectCode}
            onClose={closeFullPageMode}
            onProjectsChanged={(nextSelected) => {
              setProjectRefreshKey((k) => k + 1);
              refreshAllSpecs();
              if (nextSelected) {
                handleSelectProject(nextSelected);
              }
            }}
          />
        )}

        {workspaceMode === 'user_guide' && (
          <UserGuidePage
            currentProgramId={currentSpec.program_id}
            onExecuteAction={handleGuideAction}
          />
        )}

        {workspaceMode === 'shortcuts' && (
          <KeyboardShortcutsModal
            isOpen={true}
            onClose={closeFullPageMode}
          />
        )}

        {workspaceMode === 'split' && (
          <div
            ref={splitContainerRef}
            className={`flex h-full overflow-hidden ${
              isVerticalSplit ? 'flex-col' : 'flex-row'
            } ${isResizingSplit ? 'select-none' : ''}`}
          >
            {/* SpecEditor Pane */}
            <div
              style={
                !isReversedSplit
                  ? !isVerticalSplit
                    ? { width: `calc(${splitRatio}% - 6px)` }
                    : { height: `calc(${splitRatio}% - 6px)` }
                  : undefined
              }
              className={`${
                isReversedSplit ? 'order-3 flex-1' : 'order-1 shrink-0'
              } ${isVerticalSplit ? 'w-full' : 'h-full'} overflow-hidden min-w-0 min-h-0`}
            >
              <SpecEditor
                spec={currentSpec}
                onChange={(updated) => applySpecChange(updated)}
                onTriggerPrint={handleTriggerPrint}
                onOpenTemplates={() => setIsTemplateModalOpen(true)}
                canUndo={historyPast.length > 0}
                canRedo={historyFuture.length > 0}
                onUndo={handleUndo}
                onRedo={handleRedo}
                onOpenMeetingMinute={handleOpenMeetingMinuteFromSpec}
                onCommentsChanged={() => setCommentRefreshKey((k) => k + 1)}
                onNotify={(msg) => showWorkspaceToast(msg)}
              />
            </div>

            {/* Interactive Resizable Divider */}
            <div
              role="separator"
              aria-orientation={!isVerticalSplit ? 'vertical' : 'horizontal'}
              aria-label="Resize workspace panes"
              title="Drag to resize panes (Double-click: 50:50 reset)"
              onMouseDown={(e) => {
                e.preventDefault();
                setIsResizingSplit(true);
              }}
              onDoubleClick={() => {
                setSplitRatio(50);
                try {
                  localStorage.setItem('sap_spec_dual_split_ratio', '50');
                } catch {
                  // ignore
                }
                showWorkspaceToast('Split ratio reset to 50% : 50%.');
              }}
              className={`order-2 shrink-0 relative flex items-center justify-center group transition-colors ${
                !isVerticalSplit
                  ? 'w-3 h-full cursor-col-resize'
                  : 'h-3 w-full cursor-row-resize'
              }`}
            >
              <div
                className={`rounded-full transition-colors ${
                  isResizingSplit
                    ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]'
                    : 'bg-slate-700 group-hover:bg-blue-400'
                } ${
                  !isVerticalSplit
                    ? 'w-1 h-12 group-hover:h-20'
                    : 'h-1 w-12 group-hover:w-20'
                }`}
              />
              {isResizingSplit && (
                <div className="absolute z-40 px-2 py-0.5 rounded bg-slate-900/95 border border-blue-400 text-white font-mono text-[10px] font-bold whitespace-nowrap shadow-lg pointer-events-none">
                  {Math.round(splitRatio)}% : {Math.round(100 - splitRatio)}%
                </div>
              )}
            </div>

            {/* Real-time Interactive SAP GUI Mockup Pane */}
            <div
              style={
                isReversedSplit
                  ? !isVerticalSplit
                    ? { width: `calc(${splitRatio}% - 6px)` }
                    : { height: `calc(${splitRatio}% - 6px)` }
                  : undefined
              }
              className={`${
                isReversedSplit ? 'order-1 shrink-0' : 'order-3 flex-1'
              } ${isVerticalSplit ? 'w-full' : 'h-full'} overflow-hidden min-w-0 min-h-0`}
            >
              <SapGuiMockup
                spec={currentSpec}
                onUpdateSpec={(updated) => applySpecChange(updated)}
                isReadOnly={isCurrentSpecReadOnly}
                currentTheme={currentTheme}
                onSelectTheme={handleSelectTheme}
                mockDataTrigger={mockDataTrigger}
              />
            </div>
          </div>
        )}

        {workspaceMode === 'mockup_only' && (
          <div className="h-full max-w-7xl mx-auto overflow-hidden">
            <SapGuiMockup
              spec={currentSpec}
              onUpdateSpec={(updated) => applySpecChange(updated)}
              isReadOnly={isCurrentSpecReadOnly}
              currentTheme={currentTheme}
              onSelectTheme={handleSelectTheme}
              mockDataTrigger={mockDataTrigger}
            />
          </div>
        )}

        {workspaceMode === 'editor_only' && (
          <div className="h-full max-w-7xl mx-auto overflow-hidden">
            <SpecEditor
              spec={currentSpec}
              onChange={(updated) => applySpecChange(updated)}
              onTriggerPrint={handleTriggerPrint}
              onOpenTemplates={() => setIsTemplateModalOpen(true)}
              canUndo={historyPast.length > 0}
              canRedo={historyFuture.length > 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onOpenMeetingMinute={handleOpenMeetingMinuteFromSpec}
              onCommentsChanged={() => setCommentRefreshKey((k) => k + 1)}
              onNotify={(msg) => showWorkspaceToast(msg)}
            />
          </div>
        )}

        {workspaceMode === 'abap_code' && (
          <div className="h-full max-w-7xl mx-auto overflow-hidden">
            <AbapCodeGenerator
              spec={currentSpec}
              sapGuiTheme={currentTheme}
              onUpdateSpec={(updated) => applySpecChange(updated)}
            />
          </div>
        )}

        {workspaceMode === 'document' && (
          <div className="h-full w-full overflow-hidden print:overflow-visible print:h-auto">
            <SpecDocumentView
              spec={currentSpec}
              onImportSpec={(imported) => {
                applySpecChange(imported, true);
                showWorkspaceToast(`Imported spec (${imported.program_id}).`);
              }}
              onReturnToWorkspace={() => setWorkspaceMode('split')}
            />
          </div>
        )}
        </main>
      </div>

      {/* Non-intrusive Workspace Toast Notification */}
      {workspaceToast && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-4 right-4 z-50 bg-slate-900/95 text-white border border-slate-700 shadow-2xl rounded-lg px-3.5 py-2.5 text-xs flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{workspaceToast.message}</span>
          {workspaceToast.actionLabel && workspaceToast.onAction && (
            <button
              type="button"
              onClick={() => {
                workspaceToast.onAction?.();
                setWorkspaceToast(null);
              }}
              className="px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Undo2 className="w-3 h-3" />
              <span>{workspaceToast.actionLabel}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setWorkspaceToast(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Program Templates Management Modal */}
      <ProgramTemplateModal
        isOpen={isTemplateModalOpen}
        onClose={() => setIsTemplateModalOpen(false)}
        currentSpec={currentSpec}
        onSelectTemplate={(s) => {
          const targetProj =
            selectedProjectCode && selectedProjectCode !== COMMON_PROJECT_CODE
              ? selectedProjectCode
              : TEMP_PROJECT_CODE;
          applySpecChange(
            {
              ...s,
              project_code: targetProj,
              is_system: false,
            },
            true
          );
          setIsTemplateModalOpen(false);
          showWorkspaceToast(`Applied template '${s.title}' to [${targetProj}].`);
        }}
      />

      {/* Copy Spec to Target Project Modal (from Overview / List) */}
      <CopySpecModal
        isOpen={copyingSpec !== null}
        sourceSpec={copyingSpec}
        defaultTargetProject={selectedProjectCode !== COMMON_PROJECT_CODE ? selectedProjectCode : TEMP_PROJECT_CODE}
        onClose={() => setCopyingSpec(null)}
        onCopied={(newSpec) => {
          refreshAllSpecs();
          handleOpenProgramFromProject(newSpec);
          showWorkspaceToast(`Copied '${newSpec.program_id}' to [${newSpec.project_code}].`);
        }}
      />

      {/* jsPDF Specification Export Modal */}
      <PdfExportModal
        isOpen={isPdfExportModalOpen}
        onClose={() => setIsPdfExportModalOpen(false)}
        spec={currentSpec}
      />

      {/* Global Command Palette (Ctrl+K / Cmd+K) */}
      <GlobalCommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        specs={accessibleCommandSpecs}
        minutes={accessibleCommandMinutes}
        onSelectSpec={(spec) => handleOpenProgramFromProject(spec)}
        onSelectMinute={(minute) => {
          setSelectedMinuteDetailId(minute.id);
          if (minute.project_code) {
            handleSelectProject(minute.project_code);
          }
          setWorkspaceMode('meeting_minutes');
        }}
        onSelectDdicTable={(tabname) => setDdicInspectTabname(tabname)}
      />

      {/* DDIC Quick Inspector Modal triggered from Command Palette */}
      {ddicInspectTabname !== null && (
        <SapDdicManagerModal
          key={ddicInspectTabname || 'ddic'}
          isOpen={true}
          initialTabname={ddicInspectTabname || undefined}
          onClose={() => setDdicInspectTabname(null)}
        />
      )}

      {/* Non-blocking Leave Confirmation Dialog when unsaved snapshot edits exist */}
      {pendingNavigation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-confirm-title"
          className="no-print fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center p-4"
        >
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 text-slate-900">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 id="leave-confirm-title" className="text-sm font-bold text-slate-900">
                  {t('Leave without saving a revision snapshot?', '리비전 스냅샷을 저장하지 않고 이동하시겠습니까?')}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {t(
                    'Edits are auto-saved locally and to the cloud, but no version snapshot has been recorded yet for ',
                    '편집 내용은 로컬과 클라우드에 자동 저장되지만, 다음 프로그램의 버전 스냅샷이 아직 기록되지 않았습니다: '
                  )}
                  <span className="font-mono font-semibold">{currentSpec.program_id}</span>.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingNavigation(null)}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                {t('Keep Editing', '계속 편집')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = pendingNavigation;
                  setPendingNavigation(null);
                  executePendingNavigation(target);
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                {t('Leave Without Snapshot', '저장 없이 이동')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = pendingNavigation;
                  await handleQuickSnapshotSave();
                  setPendingNavigation(null);
                  executePendingNavigation(target);
                }}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{t('Save Snapshot & Leave', '스냅샷 저장 후 이동')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
