import React, { Suspense, lazy, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ProgramSpec, ProjectMeetingMinute, SapProject, SpecPresenceEntry } from './types/sap';
import { SAMPLE_SPECS } from './data/sampleSpecs';
import { TopNav, MainWorkspaceMode } from './components/TopNav';
import { SideNav } from './components/SideNav';
import { ProjectOverviewDashboard } from './components/ProjectOverviewDashboard';
import {
  PendingNavigationDialog,
  SyncConflictDialog,
  SyncConflictState,
} from './components/WorkspaceDialogs';
import { GuideActionId } from './data/userGuideData';
import {
  SapGuiTheme,
  SAP_GUI_THEMES,
  SAP_THEME_STORAGE_KEY,
  isValidSapGuiTheme,
  loadSavedSapTheme,
  saveSapTheme,
} from './data/sapGuiThemes';
import { CurrentUser, getCurrentUser } from './utils/authStorage';
import { useAuth } from './contexts/AuthContext';
import { useLanguage } from './contexts/LanguageContext';
import { useSplitWorkspace } from './hooks/useSplitWorkspace';
import { useUserPreferencesSync } from './hooks/useUserPreferencesSync';
import {
  SpecSyncConflictError,
  clearSpecPresence,
  subscribeAccessibleProjects,
  subscribeCustomDdicTables,
  subscribeProjectMeetings,
  subscribeProjectSpecs,
  subscribeSpecPresence,
  syncProjectToFirestore,
  syncSpecPresence,
  syncSpecToFirestore,
} from './services/firestoreSync';
import {
  FIRESTORE_CONSOLE_UPGRADE_URL,
  FIRESTORE_PRICING_URL,
  isFirestoreQuotaExceeded,
  subscribeFirestoreQuotaState,
} from './lib/firebase';
import {
  COMMON_PROJECT_CODE,
  TEMP_PROJECT_CODE,
  getAccessibleProjectsForUser,
  getProjectAbapStandards,
  getProjects,
  isCommonProtectedSample,
  isReadOnlyCommonSpec,
  isSpecVisibleInProject,
  normalizeLegacyProjectCode,
} from './utils/projectStorage';
import {
  SavedProgramSpecItem,
  getSavedSpecList,
  markSpecPendingWrite,
  reconcileProjectSpecsFromRemote,
  upsertWorkingSpecQuietly,
} from './utils/specStorage';
import {
  deleteMeetingMinute,
  getVisibleMinutesForProject,
  reconcileProjectMeetingsFromRemote,
} from './utils/meetingStorage';
import { reconcileCustomDdicFromRemote } from './utils/sapDdicStorage';
import { getUnresolvedCommentCountsMap } from './utils/reviewCommentStorage';
import { createBlankProgramSpec } from './utils/blankSpecFactory';
import { createRevisionSnapshot } from './utils/specSnapshotStorage';
import {
  FAVORITE_STORAGE_KEY,
  getFavoriteProgramIds,
  migrateFavoriteUserKey,
  removeFavoriteProgram,
  toggleFavoriteProgram,
} from './utils/favoriteStorage';
import { AlertTriangle, CheckCircle2, Loader2, Undo2, X } from 'lucide-react';

function lazyNamed<T extends React.ComponentType<any>>(
  loader: () => Promise<Record<string, unknown>>,
  exportName: string
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    const mod = await loader();
    return { default: mod[exportName] as T };
  });
}

const SpecEditor = lazyNamed<typeof import('./components/SpecEditor').SpecEditor>(
  () => import('./components/SpecEditor'),
  'SpecEditor'
);
const SapGuiMockup = lazyNamed<typeof import('./components/SapGuiMockup').SapGuiMockup>(
  () => import('./components/SapGuiMockup'),
  'SapGuiMockup'
);
const AbapCodeGenerator = lazyNamed<typeof import('./components/AbapCodeGenerator').AbapCodeGenerator>(
  () => import('./components/AbapCodeGenerator'),
  'AbapCodeGenerator'
);
const SpecDocumentView = lazyNamed<typeof import('./components/SpecDocumentView').SpecDocumentView>(
  () => import('./components/SpecDocumentView'),
  'SpecDocumentView'
);
const ProgramTemplateModal = lazyNamed<typeof import('./components/ProgramTemplateModal').ProgramTemplateModal>(
  () => import('./components/ProgramTemplateModal'),
  'ProgramTemplateModal'
);
const PdfExportModal = lazyNamed<typeof import('./components/PdfExportModal').PdfExportModal>(
  () => import('./components/PdfExportModal'),
  'PdfExportModal'
);
const KeyboardShortcutsModal = lazyNamed<typeof import('./components/KeyboardShortcutsModal').KeyboardShortcutsModal>(
  () => import('./components/KeyboardShortcutsModal'),
  'KeyboardShortcutsModal'
);
const ProjectManagerModal = lazyNamed<typeof import('./components/ProjectManagerModal').ProjectManagerModal>(
  () => import('./components/ProjectManagerModal'),
  'ProjectManagerModal'
);
const AdminDashboard = lazyNamed<typeof import('./components/AdminDashboard').AdminDashboard>(
  () => import('./components/AdminDashboard'),
  'AdminDashboard'
);
const CopySpecModal = lazyNamed<typeof import('./components/CopySpecModal').CopySpecModal>(
  () => import('./components/CopySpecModal'),
  'CopySpecModal'
);
const MeetingSpecWizardModal = lazyNamed<typeof import('./components/MeetingSpecWizardModal').MeetingSpecWizardModal>(
  () => import('./components/MeetingSpecWizardModal'),
  'MeetingSpecWizardModal'
);
const MeetingMinutesPage = lazyNamed<typeof import('./components/MeetingMinutesPage').MeetingMinutesPage>(
  () => import('./components/MeetingMinutesPage'),
  'MeetingMinutesPage'
);
const GlobalCommandPalette = lazyNamed<typeof import('./components/GlobalCommandPalette').GlobalCommandPalette>(
  () => import('./components/GlobalCommandPalette'),
  'GlobalCommandPalette'
);
const SapDdicManagerModal = lazyNamed<typeof import('./components/SapDdicManagerModal').SapDdicManagerModal>(
  () => import('./components/SapDdicManagerModal'),
  'SapDdicManagerModal'
);
const UserGuidePage = lazyNamed<typeof import('./components/UserGuidePage').UserGuidePage>(
  () => import('./components/UserGuidePage'),
  'UserGuidePage'
);

const WorkspacePaneFallback: React.FC = () => (
  <div className="h-full w-full flex items-center justify-center bg-slate-900/20 text-slate-400 text-xs gap-2">
    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
    <span>Loading workspace module...</span>
  </div>
);

export default function App() {
  const {
    activeUser: authActiveUser,
    isFirebaseAuthenticated,
    resolveEffectiveProjectRole,
    userProfile,
    isAdmin,
  } = useAuth();
  const { t } = useLanguage();
  const [currentUser, setCurrentUserState] = useState<CurrentUser>(() => authActiveUser || getCurrentUser());
  const currentUserNameRef = useRef(currentUser.name);
  currentUserNameRef.current = currentUser.name;
  const [firestoreQuotaExceeded, setFirestoreQuotaExceeded] = useState<boolean>(() => isFirestoreQuotaExceeded());
  const [dismissedQuotaBanner, setDismissedQuotaBanner] = useState(false);

  useEffect(() => {
    return subscribeFirestoreQuotaState((exceeded) => {
      setFirestoreQuotaExceeded(exceeded);
    });
  }, []);

  const isAdminOperator = isAdmin;
  const [projectRefreshKey, setProjectRefreshKey] = useState(0);
  const [remoteProjects, setRemoteProjects] = useState<SapProject[]>([]);
  const [remoteProjectsLoaded, setRemoteProjectsLoaded] = useState(false);
  const seededProjectsRef = useRef(false);
  const [allSavedSpecs, setAllSavedSpecs] = useState<SavedProgramSpecItem[]>(() => getSavedSpecList());
  const favoriteUserKey =
    isFirebaseAuthenticated && userProfile?.uid ? userProfile.uid : currentUser.name;
  const [favoriteProgramIds, setFavoriteProgramIdsState] = useState<string[]>(() =>
    getFavoriteProgramIds(getCurrentUser().name)
  );

  useEffect(() => {
    setCurrentUserState(authActiveUser);
    if (isFirebaseAuthenticated && userProfile?.uid) {
      setFavoriteProgramIdsState(migrateFavoriteUserKey(authActiveUser.name, userProfile.uid));
    } else {
      setFavoriteProgramIdsState(getFavoriteProgramIds(authActiveUser.name));
    }
    setProjectRefreshKey((k) => k + 1);
    setAllSavedSpecs(getSavedSpecList());
  }, [authActiveUser, isFirebaseAuthenticated, userProfile?.uid]);

  const assignedProjectsKey = JSON.stringify(userProfile?.assignedProjects || []);

  // Subscribe to Firestore projects accessible to current user (Admin = all, User = COMM + assigned)
  useEffect(() => {
    if (!isFirebaseAuthenticated || !userProfile?.uid || firestoreQuotaExceeded) {
      if (!isFirebaseAuthenticated || !userProfile?.uid) {
        setRemoteProjects([]);
        setRemoteProjectsLoaded(false);
      }
      return;
    }
    const assignedCodes = userProfile.assignedProjects || [];
    const unsub = subscribeAccessibleProjects(
      userProfile.uid,
      isAdmin,
      (projs) => {
        setRemoteProjects(projs);
        setRemoteProjectsLoaded(true);
      },
      assignedCodes
    );
    return () => unsub();
  }, [isFirebaseAuthenticated, userProfile?.uid, isAdmin, assignedProjectsKey, firestoreQuotaExceeded]);

  // Seed missing local system/team projects once when Admin connects so non-admin users can read COMM & assigned projects
  useEffect(() => {
    if (
      !isAdmin ||
      !isFirebaseAuthenticated ||
      !userProfile?.uid ||
      !remoteProjectsLoaded ||
      seededProjectsRef.current
    ) {
      return;
    }
    seededProjectsRef.current = true;
    const remoteCodeSet = new Set(remoteProjects.map((p) => p.code.toUpperCase()));
    const localList = getProjects();
    localList.forEach((proj) => {
      if (!remoteCodeSet.has(proj.code.toUpperCase())) {
        syncProjectToFirestore({
          ...proj,
          ownerId: proj.ownerId || userProfile.uid,
          memberUids: Array.from(new Set([...(proj.memberUids || []), userProfile.uid])),
        }).catch((err) => console.warn(`Seed sync notice for ${proj.code}:`, err));
      }
    });
  }, [isAdmin, isFirebaseAuthenticated, userProfile?.uid, remoteProjectsLoaded, remoteProjects]);

  const accessibleProjects = useMemo(
    () =>
      getAccessibleProjectsForUser(currentUser.name, {
        uid: userProfile?.uid,
        isAdmin,
        assignedProjects: userProfile?.assignedProjects || [],
        remoteProjects,
      }),
    [
      currentUser.name,
      userProfile?.uid,
      isAdmin,
      userProfile?.assignedProjects,
      remoteProjects,
      projectRefreshKey,
    ]
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

  const refreshAllSpecs = useCallback(() => {
    setAllSavedSpecs(getSavedSpecList());
  }, []);

  // Default entry screen is Project Overview Dashboard (or /admin for admins)
  const [workspaceMode, setWorkspaceMode] = useState<MainWorkspaceMode>(() => {
    if (typeof window !== 'undefined' && window.location.pathname === '/admin') {
      return 'admin_dashboard';
    }
    return 'overview';
  });
  const returnFromPageModeRef = useRef<MainWorkspaceMode>('overview');

  const [currentSpec, setCurrentSpec] = useState<ProgramSpec>(SAMPLE_SPECS[0]);
  const activeWorkspaceProject = useMemo(() => {
    const specProjCode = normalizeLegacyProjectCode(currentSpec.project_code || '') || selectedProjectCode;
    const isSpecViewport =
      workspaceMode === 'split' ||
      workspaceMode === 'mockup_only' ||
      workspaceMode === 'editor_only' ||
      workspaceMode === 'abap_code' ||
      workspaceMode === 'document';
    const targetCode = isSpecViewport ? specProjCode : selectedProjectCode;
    return accessibleProjects.find((p) => p.code === targetCode) || null;
  }, [accessibleProjects, currentSpec.project_code, selectedProjectCode, workspaceMode]);
  const currentSpecProject = useMemo(
    () =>
      accessibleProjects.find(
        (p) => p.code === normalizeLegacyProjectCode(currentSpec.project_code || TEMP_PROJECT_CODE)
      ) || null,
    [accessibleProjects, currentSpec.project_code]
  );
  const effectiveSpecRole = resolveEffectiveProjectRole(currentSpecProject);
  const isCurrentSpecReadOnly =
    isReadOnlyCommonSpec(currentSpec) ||
    ((currentSpec.status === 'approved' || currentSpec.status === 'qa_passed') &&
      effectiveSpecRole !== 'PM' &&
      effectiveSpecRole !== 'ADMIN');
  const [historyPast, setHistoryPast] = useState<ProgramSpec[]>([]);
  const [historyFuture, setHistoryFuture] = useState<ProgramSpec[]>([]);
  const lastEditTimestampRef = useRef<number>(0);
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
  const [activeCollaborators, setActiveCollaborators] = useState<SpecPresenceEntry[]>([]);
  const [syncConflict, setSyncConflict] = useState<SyncConflictState | null>(null);
  const syncConflictRef = useRef<SyncConflictState | null>(null);
  syncConflictRef.current = syncConflict;
  const loadedRevisionRef = useRef<Record<string, number>>({});
  const specSyncTimerRef = useRef<number | null>(null);
  const pendingSpecSyncRef = useRef<{ spec: ProgramSpec; expectedRevision?: number } | null>(null);
  const accessibleProjectsRef = useRef<SapProject[]>(accessibleProjects);
  accessibleProjectsRef.current = accessibleProjects;

  const unresolvedCommentCounts = useMemo(
    () => getUnresolvedCommentCountsMap(),
    [commentRefreshKey, allSavedSpecs]
  );

  const accessibleCommandSpecs = useMemo(
    () =>
      allSavedSpecs.filter((item) =>
        accessibleProjects.some((p) =>
          isSpecVisibleInProject(item, p.code, currentUser.name, currentUser.id)
        )
      ),
    [allSavedSpecs, accessibleProjects, currentUser.name, currentUser.id]
  );

  const accessibleCommandMinutes = useMemo(() => {
    const byId = new Map<string, ProjectMeetingMinute>();
    accessibleProjects.forEach((p) => {
      getVisibleMinutesForProject(p.code, currentUser.name, currentUser.id).forEach((m) => {
        if (!byId.has(m.id)) {
          byId.set(m.id, m);
        }
      });
    });
    return Array.from(byId.values()).sort((a, b) =>
      String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
    );
  }, [accessibleProjects, currentUser.name, currentUser.id, meetingRefreshKey]);

  const syncBrowserPathForMode = (mode: MainWorkspaceMode) => {
    if (typeof window === 'undefined') return;
    if (mode === 'admin_dashboard' && window.location.pathname !== '/admin') {
      window.history.pushState(null, '', '/admin');
    } else if (mode !== 'admin_dashboard' && window.location.pathname === '/admin') {
      window.history.pushState(null, '', '/');
    }
  };

  const openFullPageMode = (
    target: 'meeting_wizard' | 'project_settings' | 'admin_dashboard' | 'shortcuts'
  ) => {
    if ((target === 'project_settings' || target === 'admin_dashboard') && !isAdminOperator) {
      showWorkspaceToast(
        t(
          'This section is restricted to system administrators.',
          '이 메뉴는 시스템 관리자만 접근할 수 있습니다.'
        )
      );
      return;
    }
    if (
      workspaceMode !== 'meeting_wizard' &&
      workspaceMode !== 'project_settings' &&
      workspaceMode !== 'admin_dashboard' &&
      workspaceMode !== 'shortcuts'
    ) {
      returnFromPageModeRef.current = workspaceMode;
    }
    syncBrowserPathForMode(target);
    setWorkspaceMode(target);
  };

  useEffect(() => {
    if ((workspaceMode === 'project_settings' || workspaceMode === 'admin_dashboard') && !isAdminOperator) {
      setWorkspaceMode('overview');
      if (typeof window !== 'undefined' && window.location.pathname === '/admin') {
        window.history.replaceState(null, '', '/');
      }
    }
  }, [workspaceMode, isAdminOperator]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      if (window.location.pathname === '/admin' && isAdminOperator) {
        setWorkspaceMode('admin_dashboard');
      } else if (workspaceMode === 'admin_dashboard') {
        setWorkspaceMode('overview');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAdminOperator, workspaceMode]);

  const closeFullPageMode = () => {
    const back =
      returnFromPageModeRef.current && returnFromPageModeRef.current !== 'admin_dashboard'
        ? returnFromPageModeRef.current
        : 'overview';
    syncBrowserPathForMode(back);
    setWorkspaceMode(back);
  };
  const [workspaceToast, setWorkspaceToast] = useState<{
    message: string;
    actionLabel?: string;
    onAction?: () => void;
  } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showWorkspaceToast = useCallback(
    (message: string, actionLabel?: string, onAction?: () => void) => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      setWorkspaceToast({ message, actionLabel, onAction });
      toastTimerRef.current = window.setTimeout(() => {
        setWorkspaceToast(null);
      }, 3600);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const accessibleProjectCodesKey = useMemo(
    () =>
      accessibleProjects
        .map((p) => p.code)
        .filter(Boolean)
        .sort()
        .join(','),
    [accessibleProjects]
  );

  // Multi-project real-time subscriptions for specs & meetings (propagates remote deletes & updates across all accessible projects)
  useEffect(() => {
    if (!isFirebaseAuthenticated || !accessibleProjectCodesKey || firestoreQuotaExceeded) return;

    const projectCodes = accessibleProjectCodesKey.split(',').filter(Boolean);
    const unsubs: (() => void)[] = [];

    projectCodes.forEach((projCode) => {
      if (projCode !== COMMON_PROJECT_CODE) {
        unsubs.push(
          subscribeProjectSpecs(projCode, (remoteSpecs) => {
            reconcileProjectSpecsFromRemote(
              projCode,
              remoteSpecs,
              currentUserNameRef.current,
              userProfile?.uid
            );
            setAllSavedSpecs(getSavedSpecList());

            setCurrentSpec((prev) => {
              if (isCommonProtectedSample(prev)) return prev;
              const specKey = prev.id || prev.program_id;
              const matched = remoteSpecs.find(
                (r) => r.id === prev.id || r.program_id === prev.program_id
              );
              if (!matched) return prev;
              if (syncConflictRef.current?.specId === specKey) return prev;
              if (pendingSpecSyncRef.current?.spec.id === prev.id) return prev;
              if (Date.now() - lastEditTimestampRef.current < 2500) return prev;

              const remoteRev = matched.revision ?? 0;
              const prevRev = prev.revision ?? 0;
              const editedByOther =
                Boolean(matched.last_edited_by_uid) &&
                matched.last_edited_by_uid !== userProfile?.uid;

              if (
                !editedByOther &&
                remoteRev <= prevRev &&
                matched.last_edited_by_uid === prev.last_edited_by_uid &&
                matched.status === prev.status &&
                matched.title === prev.title &&
                (matched.change_history?.length ?? 0) === (prev.change_history?.length ?? 0)
              ) {
                return prev;
              }
              loadedRevisionRef.current[specKey] = remoteRev;
              return matched;
            });
          })
        );
      }

      if (projCode !== COMMON_PROJECT_CODE) {
        unsubs.push(
          subscribeProjectMeetings(projCode, (remoteMinutes) => {
            reconcileProjectMeetingsFromRemote(
              projCode,
              remoteMinutes,
              currentUserNameRef.current,
              userProfile?.uid
            );
            setMeetingRefreshKey((k) => k + 1);
          })
        );
      }
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [isFirebaseAuthenticated, accessibleProjectCodesKey, userProfile?.uid, firestoreQuotaExceeded]);

  // Shared custom DDIC subscription (DD02L / DD03L live sync across teammates)
  useEffect(() => {
    if (!isFirebaseAuthenticated || firestoreQuotaExceeded) return;
    const unsub = subscribeCustomDdicTables((entries) => {
      reconcileCustomDdicFromRemote(entries);
    });
    return () => unsub();
  }, [isFirebaseAuthenticated, firestoreQuotaExceeded]);

  const formatNowHms = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  };

  const executeFirestoreSpecSync = useCallback(
    async (
      targetSpec: ProgramSpec,
      expectedRevision?: number,
      forceOverwrite = false
    ): Promise<number | undefined> => {
      if (!isFirebaseAuthenticated || isCommonProtectedSample(targetSpec)) return undefined;
      const specKey = targetSpec.id || targetSpec.program_id;
      const projObj = accessibleProjectsRef.current.find(
        (p) => p.code === (targetSpec.project_code || TEMP_PROJECT_CODE)
      );
      try {
        const res = await syncSpecToFirestore(targetSpec, projObj, {
          expectedRevision,
          forceOverwrite,
        });
        if (res && typeof res.revision === 'number') {
          loadedRevisionRef.current[specKey] = res.revision;
          setCurrentSpec((prev) => {
            if ((prev.id || prev.program_id) !== specKey) return prev;
            if ((prev.revision ?? 0) >= res.revision) return prev;
            const stamped: ProgramSpec = {
              ...prev,
              revision: res.revision,
              last_edited_by: currentUser.name,
              last_edited_by_uid: userProfile?.uid,
            };
            upsertWorkingSpecQuietly(stamped);
            return stamped;
          });
          return res.revision;
        }
      } catch (err) {
        if (err instanceof SpecSyncConflictError) {
          setSyncConflict({
            specId: err.specId,
            programId: err.programId,
            localSpec: targetSpec,
            remoteSpec: err.remoteSpec,
            remoteEditor: err.remoteEditor,
            expectedRevision: err.expectedRevision,
            remoteRevision: err.remoteRevision,
          });
        } else {
          console.warn('Firestore spec sync skipped:', err);
        }
      }
      return undefined;
    },
    [isFirebaseAuthenticated, currentUser.name, userProfile?.uid]
  );

  const scheduleSpecCloudSync = useCallback(
    (stampedSpec: ProgramSpec, immediate = false) => {
      if (!isFirebaseAuthenticated || isCommonProtectedSample(stampedSpec)) return;
      const specKey = stampedSpec.id || stampedSpec.program_id;
      const expectedRev = loadedRevisionRef.current[specKey] ?? stampedSpec.revision;

      if (specSyncTimerRef.current) {
        window.clearTimeout(specSyncTimerRef.current);
        specSyncTimerRef.current = null;
      }

      if (immediate) {
        pendingSpecSyncRef.current = null;
        void executeFirestoreSpecSync(stampedSpec, expectedRev, false);
        return;
      }

      pendingSpecSyncRef.current = { spec: stampedSpec, expectedRevision: expectedRev };
      specSyncTimerRef.current = window.setTimeout(() => {
        specSyncTimerRef.current = null;
        const pending = pendingSpecSyncRef.current;
        pendingSpecSyncRef.current = null;
        if (pending) {
          void executeFirestoreSpecSync(pending.spec, pending.expectedRevision, false);
        }
      }, 600);
    },
    [isFirebaseAuthenticated, executeFirestoreSpecSync]
  );

  const flushPendingSpecSync = useCallback(async () => {
    if (specSyncTimerRef.current) {
      window.clearTimeout(specSyncTimerRef.current);
      specSyncTimerRef.current = null;
    }
    const pending = pendingSpecSyncRef.current;
    pendingSpecSyncRef.current = null;
    if (pending) {
      await executeFirestoreSpecSync(pending.spec, pending.expectedRevision, false);
    }
  }, [executeFirestoreSpecSync]);

  useEffect(() => {
    return () => {
      if (specSyncTimerRef.current) {
        window.clearTimeout(specSyncTimerRef.current);
      }
    };
  }, []);

  const applySpecChange = (updated: ProgramSpec, forceNewHistoryStep = false) => {
    const stampedSpec: ProgramSpec =
      !isCommonProtectedSample(updated) && !updated.author_id && currentUser.id
        ? { ...updated, author_id: currentUser.id }
        : updated;

    const now = Date.now();
    const isRapidContinuousEdit =
      !forceNewHistoryStep &&
      now - lastEditTimestampRef.current < 700 &&
      stampedSpec.id === currentSpec.id &&
      stampedSpec.selection_params.length === currentSpec.selection_params.length &&
      stampedSpec.field_catalog.length === currentSpec.field_catalog.length &&
      stampedSpec.sample_type === currentSpec.sample_type;

    lastEditTimestampRef.current = now;

    if (!isRapidContinuousEdit) {
      setHistoryPast((prev) => [...prev.slice(-29), currentSpec]);
    }
    setHistoryFuture([]);
    setCurrentSpec(stampedSpec);

    if (!isCommonProtectedSample(stampedSpec)) {
      markSpecPendingWrite(stampedSpec.program_id);
      if (stampedSpec.id) markSpecPendingWrite(stampedSpec.id);
      upsertWorkingSpecQuietly(stampedSpec);
      refreshAllSpecs();
      setLastSavedAt(formatNowHms());
      setHasUnsavedChanges(!forceNewHistoryStep);
      if (isFirebaseAuthenticated) {
        scheduleSpecCloudSync(stampedSpec, forceNewHistoryStep);
      }
    }
  };

  const isInSpecEditingMode =
    workspaceMode === 'split' ||
    workspaceMode === 'mockup_only' ||
    workspaceMode === 'editor_only' ||
    workspaceMode === 'abap_code';

  // Real-time collaborator presence heartbeat & listener while viewing/editing a shared spec
  const isViewingOrEditingSpec = isInSpecEditingMode || workspaceMode === 'document';
  useEffect(() => {
    const specId = currentSpec.id || currentSpec.program_id;
    const projCode = normalizeLegacyProjectCode(currentSpec.project_code || TEMP_PROJECT_CODE);
    if (
      !isFirebaseAuthenticated ||
      firestoreQuotaExceeded ||
      !userProfile?.uid ||
      !isViewingOrEditingSpec ||
      !specId ||
      projCode === COMMON_PROJECT_CODE ||
      projCode === TEMP_PROJECT_CODE ||
      isCommonProtectedSample(currentSpec)
    ) {
      setActiveCollaborators([]);
      return;
    }

    const mode: 'viewing' | 'editing' = isCurrentSpecReadOnly ? 'viewing' : 'editing';
    const sendHeartbeat = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (isFirestoreQuotaExceeded()) return;
      const projObj = accessibleProjectsRef.current.find((p) => p.code === projCode);
      void syncSpecPresence({
        projectCode: projCode,
        specId,
        displayName: currentUserNameRef.current,
        projectRole: resolveEffectiveProjectRole(projObj),
        mode,
        project: projObj,
      });
    };

    const unsubscribe = subscribeSpecPresence(projCode, specId, (collaborators) => {
      setActiveCollaborators(collaborators);
    });

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, 60_000);

    return () => {
      window.clearInterval(intervalId);
      unsubscribe();
      void clearSpecPresence(projCode, specId);
    };
  }, [
    isFirebaseAuthenticated,
    firestoreQuotaExceeded,
    userProfile?.uid,
    isViewingOrEditingSpec,
    currentSpec.id,
    currentSpec.program_id,
    currentSpec.project_code,
    isCurrentSpecReadOnly,
    effectiveSpecRole,
    resolveEffectiveProjectRole,
  ]);

  const executePendingNavigation = (
    nav:
      | { type: 'mode'; mode: MainWorkspaceMode }
      | { type: 'spec'; spec: ProgramSpec }
      | { type: 'minute'; minuteId: string }
  ) => {
    void flushPendingSpecSync();
    if (nav.type === 'mode') {
      if (nav.mode === 'overview' || nav.mode === 'program_list') {
        refreshAllSpecs();
      }
      setHasUnsavedChanges(false);
      syncBrowserPathForMode(nav.mode);
      setWorkspaceMode(nav.mode);
    } else if (nav.type === 'spec') {
      const specKey = nav.spec.id || nav.spec.program_id;
      loadedRevisionRef.current[specKey] = nav.spec.revision ?? 0;
      setHistoryPast([]);
      setHistoryFuture([]);
      setCurrentSpec(nav.spec);
      setHasUnsavedChanges(false);
      setLastSavedAt(null);
      if (nav.spec.project_code) {
        handleSelectProject(nav.spec.project_code);
      }
      syncBrowserPathForMode('split');
      setWorkspaceMode('split');
    } else if (nav.type === 'minute') {
      setHasUnsavedChanges(false);
      setSelectedMinuteDetailId(nav.minuteId);
      syncBrowserPathForMode('meeting_minutes');
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
    if (specSyncTimerRef.current) {
      window.clearTimeout(specSyncTimerRef.current);
      specSyncTimerRef.current = null;
    }
    pendingSpecSyncRef.current = null;

    const { historyItem } = await createRevisionSnapshot(
      currentSpec,
      t('Quick workspace snapshot (Ctrl+S)', '작업실 빠른 스냅샷 (Ctrl+S)'),
      currentUser.name
    );
    const updatedSpec: ProgramSpec = {
      ...currentSpec,
      change_history: [...(currentSpec.change_history || []), historyItem],
    };
    const specKey = updatedSpec.id || updatedSpec.program_id;
    const expectedRevision = loadedRevisionRef.current[specKey] ?? updatedSpec.revision;

    setCurrentSpec(updatedSpec);
    markSpecPendingWrite(updatedSpec.program_id);
    if (updatedSpec.id) markSpecPendingWrite(updatedSpec.id);
    upsertWorkingSpecQuietly(updatedSpec);
    refreshAllSpecs();
    setLastSavedAt(formatNowHms());
    setHasUnsavedChanges(false);
    if (isFirebaseAuthenticated) {
      await executeFirestoreSpecSync(updatedSpec, expectedRevision, false);
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
        mode === 'user_guide' ||
        mode === 'admin_dashboard');
    if (isLeavingEditor && hasUnsavedChanges && !isCommonProtectedSample(currentSpec)) {
      setPendingNavigation({ type: 'mode', mode });
      return;
    }
    if (mode === 'overview' || mode === 'program_list') {
      refreshAllSpecs();
    }
    syncBrowserPathForMode(mode);
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
    if (!isCommonProtectedSample(previous)) {
      markSpecPendingWrite(previous.program_id);
      if (previous.id) markSpecPendingWrite(previous.id);
      upsertWorkingSpecQuietly(previous);
      refreshAllSpecs();
      scheduleSpecCloudSync(previous, false);
    }
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
    if (!isCommonProtectedSample(next)) {
      markSpecPendingWrite(next.program_id);
      if (next.id) markSpecPendingWrite(next.id);
      upsertWorkingSpecQuietly(next);
      refreshAllSpecs();
      scheduleSpecCloudSync(next, false);
    }
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
        setFavoriteProgramIdsState(getFavoriteProgramIds(favoriteUserKey));
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [favoriteUserKey]);

  const handleToggleFavorite = (programId: string) => {
    const cleanId = (programId || '').trim().toUpperCase();
    if (!cleanId) return;
    const res = toggleFavoriteProgram(favoriteUserKey, cleanId);
    setFavoriteProgramIdsState(res.ids);
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

  const {
    splitLayout,
    setSplitLayout,
    splitRatio,
    setSplitRatio,
    splitRatioRef,
    isResizingSplit,
    setIsResizingSplit,
    splitContainerRef,
    isVerticalSplit,
    isReversedSplit,
    cycleSplitLayout: handleCycleSplitLayout,
    resetSplitRatio,
  } = useSplitWorkspace(showWorkspaceToast);

  useUserPreferencesSync({
    isFirebaseAuthenticated,
    uid: userProfile?.uid,
    favoriteProgramIds,
    setFavoriteProgramIdsState,
    currentTheme,
    setCurrentTheme,
    splitLayout,
    setSplitLayout,
    splitRatio,
    setSplitRatio,
    splitRatioRef,
    isResizingSplit,
  });

  // Global keyboard shortcuts with ref-backed handler so listener binds once
  const globalKeyDownRef = useRef<(e: KeyboardEvent) => void>(() => {});
  globalKeyDownRef.current = (e: KeyboardEvent) => {
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

  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => globalKeyDownRef.current(e);
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  // Create new blank specification (assigned to current non-COMMON project or TEMP)
  const handleNewSpec = (explicitProjectCode?: string) => {
    const targetProject =
      explicitProjectCode && explicitProjectCode !== COMMON_PROJECT_CODE
        ? explicitProjectCode
        : selectedProjectCode && selectedProjectCode !== COMMON_PROJECT_CODE
        ? selectedProjectCode
        : TEMP_PROJECT_CODE;

    const projectStandards = getProjectAbapStandards(targetProject);
    const blankSpec = createBlankProgramSpec({
      targetProject,
      author: currentUser.name,
      authorId: currentUser.id,
      existingProgramIds: allSavedSpecs.map((s) => s.program_id),
      projectStandards,
    });
    const nextProgramId = blankSpec.program_id;

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
        isAdmin={isAdminOperator}
        onOpenAdmin={() => openFullPageMode('admin_dashboard')}
        accessibleProjects={accessibleProjects}
        selectedProjectCode={selectedProjectCode}
        onSelectProjectScope={(code) => {
          handleSelectProject(code);
          handleNavigateModeSafely('program_list');
        }}
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
          onOpenAdmin={() => {
            if (workspaceMode === 'admin_dashboard') {
              closeFullPageMode();
            } else {
              openFullPageMode('admin_dashboard');
            }
          }}
          selectedProjectCode={selectedProjectCode}
          activeProject={activeWorkspaceProject}
          isCurrentSpecFavorite={favoriteProgramIds.includes((currentSpec.program_id || '').toUpperCase())}
          onToggleCurrentSpecFavorite={() => handleToggleFavorite(currentSpec.program_id)}
          onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
          lastSavedAt={lastSavedAt}
          hasUnsavedChanges={hasUnsavedChanges}
          onQuickSnapshotSave={() => void handleQuickSnapshotSave()}
        />

        {firestoreQuotaExceeded && !dismissedQuotaBanner && (
          <div className="bg-amber-950/90 border-b border-amber-700/80 px-4 py-2 text-xs text-amber-100 flex items-center justify-between gap-3 print:hidden">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="truncate sm:whitespace-normal leading-snug">
                {t(
                  'Firestore daily free-tier quota exceeded. Background cloud sync is paused (local workspace edits are preserved) until quota resets tomorrow.',
                  'Firestore 일일 무료 할당량이 초과되어 클라우드 실시간 동기화가 일시 중단되었습니다(로컬 작업은 계속 유지되며 할당량은 다음 날 초기화됩니다).'
                )}{' '}
                <a
                  href={FIRESTORE_CONSOLE_UPGRADE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-semibold text-amber-300 hover:text-white"
                >
                  {t('Upgrade in Firebase Console', 'Firebase Console에서 업그레이드')}
                </a>
                {' · '}
                <a
                  href={FIRESTORE_PRICING_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-amber-200 hover:text-white"
                >
                  {t('Spark Quota Info', 'Spark 플랜 할당량 안내')}
                </a>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDismissedQuotaBanner(true)}
              className="p-1 text-amber-300 hover:text-white rounded cursor-pointer shrink-0"
              aria-label="Close quota notice"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Workspace Viewport */}
        <main
          className={`flex-1 overflow-hidden ${
            workspaceMode === 'overview' ||
            workspaceMode === 'program_list' ||
            workspaceMode === 'meeting_minutes' ||
            workspaceMode === 'meeting_wizard' ||
            workspaceMode === 'user_guide' ||
            workspaceMode === 'project_settings' ||
            workspaceMode === 'admin_dashboard' ||
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
                setFavoriteProgramIdsState(
                  removeFavoriteProgram(favoriteUserKey, deletedProgramId)
                );
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

        <Suspense fallback={<WorkspacePaneFallback />}>
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
            remoteProjects={remoteProjects}
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

        {workspaceMode === 'admin_dashboard' && isAdminOperator && (
          <AdminDashboard
            projects={accessibleProjects}
            onClose={closeFullPageMode}
            onProjectsOrMembersUpdated={() => {
              setProjectRefreshKey((k) => k + 1);
              refreshAllSpecs();
            }}
            onNotify={(msg) => showWorkspaceToast(msg)}
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
                remoteProjects={remoteProjects}
                activeCollaborators={activeCollaborators}
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
              onDoubleClick={resetSplitRatio}
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
              remoteProjects={remoteProjects}
              activeCollaborators={activeCollaborators}
            />
          </div>
        )}

        {workspaceMode === 'abap_code' && (
          <div className="h-full max-w-7xl mx-auto overflow-hidden">
            <AbapCodeGenerator
              spec={currentSpec}
              sapGuiTheme={currentTheme}
              onUpdateSpec={(updated) => applySpecChange(updated)}
              remoteProjects={remoteProjects}
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
        </Suspense>
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

      <Suspense fallback={null}>
        {isTemplateModalOpen && (
          <ProgramTemplateModal
            isOpen={true}
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
        )}

        {copyingSpec !== null && (
          <CopySpecModal
            isOpen={true}
            sourceSpec={copyingSpec}
            defaultTargetProject={selectedProjectCode !== COMMON_PROJECT_CODE ? selectedProjectCode : TEMP_PROJECT_CODE}
            remoteProjects={remoteProjects}
            onClose={() => setCopyingSpec(null)}
            onCopied={(newSpec) => {
              markSpecPendingWrite(newSpec.program_id);
              if (newSpec.id) markSpecPendingWrite(newSpec.id);
              if (isFirebaseAuthenticated) {
                const projObj = accessibleProjects.find(
                  (p) => p.code === (newSpec.project_code || TEMP_PROJECT_CODE)
                );
                syncSpecToFirestore(newSpec, projObj)
                  .then((res) => {
                    if (res && typeof res.revision === 'number') {
                      loadedRevisionRef.current[newSpec.id || newSpec.program_id] = res.revision;
                    }
                  })
                  .catch((err) => {
                    console.warn('Firestore copied spec sync skipped:', err);
                  });
              }
              refreshAllSpecs();
              handleOpenProgramFromProject(newSpec);
              showWorkspaceToast(`Copied '${newSpec.program_id}' to [${newSpec.project_code}].`);
            }}
          />
        )}

        {isPdfExportModalOpen && (
          <PdfExportModal
            isOpen={true}
            onClose={() => setIsPdfExportModalOpen(false)}
            spec={currentSpec}
          />
        )}

        {isCommandPaletteOpen && (
          <GlobalCommandPalette
            isOpen={true}
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
        )}

        {ddicInspectTabname !== null && (
          <SapDdicManagerModal
            key={ddicInspectTabname || 'ddic'}
            isOpen={true}
            initialTabname={ddicInspectTabname || undefined}
            onClose={() => setDdicInspectTabname(null)}
          />
        )}
      </Suspense>

      {pendingNavigation && (
        <PendingNavigationDialog
          programId={currentSpec.program_id}
          onKeepEditing={() => setPendingNavigation(null)}
          onLeaveWithoutSnapshot={() => {
            const target = pendingNavigation;
            setPendingNavigation(null);
            executePendingNavigation(target);
          }}
          onSaveSnapshotAndLeave={async () => {
            const target = pendingNavigation;
            await handleQuickSnapshotSave();
            setPendingNavigation(null);
            executePendingNavigation(target);
          }}
        />
      )}

      {syncConflict && (
        <SyncConflictDialog
          conflict={syncConflict}
          onLoadRemote={() => {
            const conflict = syncConflict;
            setSyncConflict(null);
            const specKey = conflict.remoteSpec.id || conflict.remoteSpec.program_id;
            loadedRevisionRef.current[specKey] = conflict.remoteRevision;
            markSpecPendingWrite(conflict.remoteSpec.program_id);
            if (conflict.remoteSpec.id) markSpecPendingWrite(conflict.remoteSpec.id);
            upsertWorkingSpecQuietly(conflict.remoteSpec);
            refreshAllSpecs();
            setCurrentSpec(conflict.remoteSpec);
            setHasUnsavedChanges(false);
            showWorkspaceToast(
              t(
                `Loaded latest remote version (rev ${conflict.remoteRevision}).`,
                `서버 최신 버전(rev ${conflict.remoteRevision})을 불러왔습니다.`
              )
            );
          }}
          onBackupToTempAndLoadRemote={() => {
            const conflict = syncConflict;
            const cleanPid = `${conflict.localSpec.program_id}_CONFLICT`;
            const backupSpec: ProgramSpec = {
              ...JSON.parse(JSON.stringify(conflict.localSpec)),
              id: `spec-conflict-${Date.now()}`,
              project_code: TEMP_PROJECT_CODE,
              program_id: cleanPid,
              title: `${conflict.localSpec.title} (Conflict Backup)`,
              author: currentUser.name,
              author_id: currentUser.id,
              revision: 1,
              is_system: false,
            };
            markSpecPendingWrite(backupSpec.program_id);
            markSpecPendingWrite(backupSpec.id);
            upsertWorkingSpecQuietly(backupSpec);
            if (isFirebaseAuthenticated) {
              const tempProj = accessibleProjects.find((p) => p.code === TEMP_PROJECT_CODE);
              syncSpecToFirestore(backupSpec, tempProj, { forceOverwrite: true }).catch(() => {});
            }

            setSyncConflict(null);
            const specKey = conflict.remoteSpec.id || conflict.remoteSpec.program_id;
            loadedRevisionRef.current[specKey] = conflict.remoteRevision;
            upsertWorkingSpecQuietly(conflict.remoteSpec);
            refreshAllSpecs();
            setCurrentSpec(conflict.remoteSpec);
            setHasUnsavedChanges(false);
            showWorkspaceToast(
              t(
                `Backed up local edits to TEMP (${cleanPid}) & loaded remote version.`,
                `내 편집본을 TEMP(${cleanPid})에 백업하고 서버 최신 버전을 불러왔습니다.`
              )
            );
          }}
          onOverwriteRemote={async () => {
            const conflict = syncConflict;
            setSyncConflict(null);
            await executeFirestoreSpecSync(conflict.localSpec, undefined, true);
            showWorkspaceToast(
              t(
                `Overwrote remote spec '${conflict.programId}' with your changes.`,
                `'${conflict.programId}' 사양서를 내 변경사항으로 덮어썼습니다.`
              )
            );
          }}
        />
      )}
    </div>
  );
}
