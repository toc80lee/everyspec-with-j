import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Download,
  FileCode,
  FileSpreadsheet,
  FolderKanban,
  Info,
  Lock,
  MessageSquare,
  Mic,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Star,
  Trash2,
} from 'lucide-react';
import {
  ProgramSpec,
  ProjectMeetingMinute,
  SapModule,
  SapProject,
  SpecLifecycleStatus,
} from '../types/sap';
import { CurrentUser } from '../utils/authStorage';
import {
  COMMON_PROJECT_CODE,
  TEMP_PROJECT_CODE,
  isCommonProtectedSample,
  isSpecVisibleInProject,
} from '../utils/projectStorage';
import { SavedProgramSpecItem, deleteSpecFromStorage } from '../utils/specStorage';
import {
  exportBatchSpecsDocuments,
  exportProjectWricefIndexXlsx,
} from '../utils/officeExport';

const SAP_MODULES: { code: SapModule; label: string }[] = [
  { code: 'SD', label: 'Sales & Dist.' },
  { code: 'MM', label: 'Materials Mgmt' },
  { code: 'FI', label: 'Financial Acctg' },
  { code: 'CO', label: 'Controlling' },
  { code: 'PP', label: 'Production' },
  { code: 'HR', label: 'Human Capital' },
  { code: 'QM', label: 'Quality Mgmt' },
  { code: 'PM', label: 'Plant Maint.' },
  { code: 'BC', label: 'Basis & System' },
  { code: 'CM', label: 'Cross-Module' },
];

const LIFECYCLE_META: {
  status: SpecLifecycleStatus;
  label: string;
  barColor: string;
  dotColor: string;
  badgeClass: string;
}[] = [
  {
    status: 'draft',
    label: 'Draft',
    barColor: 'bg-slate-400',
    dotColor: 'bg-slate-400',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  {
    status: 'in_review',
    label: 'In Review',
    barColor: 'bg-amber-500',
    dotColor: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  {
    status: 'approved',
    label: 'Approved',
    barColor: 'bg-blue-600',
    dotColor: 'bg-blue-600',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  {
    status: 'developed',
    label: 'Developed',
    barColor: 'bg-indigo-600',
    dotColor: 'bg-indigo-600',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  },
  {
    status: 'qa_passed',
    label: 'QA Passed',
    barColor: 'bg-emerald-600',
    dotColor: 'bg-emerald-600',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
];

const LIFECYCLE_META_MAP: Record<SpecLifecycleStatus, (typeof LIFECYCLE_META)[number]> = {
  draft: LIFECYCLE_META[0],
  in_review: LIFECYCLE_META[1],
  approved: LIFECYCLE_META[2],
  developed: LIFECYCLE_META[3],
  qa_passed: LIFECYCLE_META[4],
};

type ProgramSortCol = 'program_id' | 'module_tcode' | 'title' | 'status' | 'owner_updated';

const SORTABLE_COLUMNS: { key: ProgramSortCol; label: string }[] = [
  { key: 'program_id', label: 'Program ID' },
  { key: 'module_tcode', label: 'Module · T-Code' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'owner_updated', label: 'Owner · Updated' },
];

const STATUS_RANK: Record<SpecLifecycleStatus, number> = {
  draft: 0,
  in_review: 1,
  approved: 2,
  developed: 3,
  qa_passed: 4,
};

interface ProjectOverviewDashboardProps {
  viewMode: 'overview' | 'program_list';
  currentUser: CurrentUser;
  accessibleProjects: SapProject[];
  selectedProjectCode: string;
  onSelectProject: (code: string) => void;
  allSpecs: SavedProgramSpecItem[];
  favoriteProgramIds: string[];
  onToggleFavorite: (programId: string) => void;
  onSpecsChanged: (deletedProgramId?: string) => void;
  onChangeViewMode: (mode: 'overview' | 'program_list') => void;
  onOpenProgram: (spec: ProgramSpec) => void;
  onCreateNewProgram: (projectCode: string) => void;
  onOpenProjectManager: () => void;
  onRequestCopySpec: (spec: ProgramSpec) => void;
  onOpenMeetingWizard: (minute?: ProjectMeetingMinute) => void;
  unresolvedCommentCounts?: Record<string, number>;
  onOpenMeetingMinute?: (minuteId: string) => void;
  onNotify?: (message: string) => void;
}

export const ProjectOverviewDashboard: React.FC<ProjectOverviewDashboardProps> = ({
  viewMode,
  currentUser,
  accessibleProjects,
  selectedProjectCode,
  onSelectProject,
  allSpecs,
  favoriteProgramIds,
  onToggleFavorite,
  onSpecsChanged,
  onChangeViewMode,
  onOpenProgram,
  onCreateNewProgram,
  onOpenProjectManager,
  onRequestCopySpec,
  onOpenMeetingWizard,
  unresolvedCommentCounts = {},
  onOpenMeetingMinute,
  onNotify,
}) => {
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<'ALL' | SapModule>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sampleTypeFilter, setSampleTypeFilter] = useState<string>('ALL');
  const [lifecycleFilter, setLifecycleFilter] = useState<'ALL' | SpecLifecycleStatus>('ALL');
  const [favoritesOnlyFilter, setFavoritesOnlyFilter] = useState(false);
  const [favoriteOverviewScope, setFavoriteOverviewScope] = useState<'ALL' | 'PROJECT'>('ALL');
  const [selectedProgramIds, setSelectedProgramIds] = useState<Set<string>>(new Set());
  const [selectedSortCols, setSelectedSortCols] = useState<ProgramSortCol[]>([]);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const isHeaderDraggingRef = useRef(false);
  const dragStartColRef = useRef<ProgramSortCol | null>(null);
  const dragMovedRef = useRef(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    const handleWindowMouseUp = () => {
      isHeaderDraggingRef.current = false;
      dragStartColRef.current = null;
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, []);

  const activeProject = useMemo(
    () =>
      accessibleProjects.find((p) => p.code === selectedProjectCode) ||
      accessibleProjects[0],
    [accessibleProjects, selectedProjectCode]
  );

  const projectSpecs = useMemo(() => {
    if (!activeProject) return [];
    return allSpecs.filter((item) =>
      isSpecVisibleInProject(item, activeProject.code, currentUser.name)
    );
  }, [allSpecs, activeProject, currentUser.name]);

  const projectStatsMap = useMemo(() => {
    const map: Record<
      string,
      { count: number; latestUpdated: string | null; myCount: number }
    > = {};
    accessibleProjects.forEach((p) => {
      const visible = allSpecs.filter((item) =>
        isSpecVisibleInProject(item, p.code, currentUser.name)
      );
      let latestUpdated: string | null = null;
      let myCount = 0;
      visible.forEach((item) => {
        if ((item.author || '').trim() === currentUser.name.trim()) {
          myCount += 1;
        }
        const dateStr = (item.updated_at || item.spec.created_date || '').slice(0, 10);
        if (dateStr && (!latestUpdated || dateStr > latestUpdated)) {
          latestUpdated = dateStr;
        }
      });
      map[p.code] = { count: visible.length, latestUpdated, myCount };
    });
    return map;
  }, [accessibleProjects, allSpecs, currentUser.name]);

  const lifecycleCounts = useMemo(() => {
    const counts: Record<SpecLifecycleStatus, number> = {
      draft: 0,
      in_review: 0,
      approved: 0,
      developed: 0,
      qa_passed: 0,
    };
    projectSpecs.forEach((item) => {
      const st: SpecLifecycleStatus = item.spec.status || 'draft';
      counts[st] = (counts[st] || 0) + 1;
    });
    return counts;
  }, [projectSpecs]);

  const totalUnresolvedReviews = useMemo(() => {
    return projectSpecs.reduce(
      (sum, item) => sum + (unresolvedCommentCounts[item.spec.id] || 0),
      0
    );
  }, [projectSpecs, unresolvedCommentCounts]);

  const moduleCounts = useMemo(() => {
    const counts: Record<SapModule, number> = {
      SD: 0,
      MM: 0,
      FI: 0,
      CO: 0,
      PP: 0,
      HR: 0,
      QM: 0,
      PM: 0,
      BC: 0,
      CM: 0,
    };
    projectSpecs.forEach((item) => {
      if (counts[item.module] !== undefined) {
        counts[item.module] += 1;
      }
    });
    return counts;
  }, [projectSpecs]);

  const modulesWithSpecs = useMemo(() => {
    return SAP_MODULES.filter((mod) => (moduleCounts[mod.code] || 0) > 0);
  }, [moduleCounts]);

  const favoriteIdSet = useMemo(
    () => new Set(favoriteProgramIds.map((id) => id.toUpperCase())),
    [favoriteProgramIds]
  );

  const accessibleFavoriteSpecs = useMemo(() => {
    const byId = new Map<string, SavedProgramSpecItem>();
    allSpecs.forEach((item) => {
      const upperId = item.program_id.toUpperCase();
      if (!favoriteIdSet.has(upperId)) return;
      const isVisible = accessibleProjects.some((p) =>
        isSpecVisibleInProject(item, p.code, currentUser.name)
      );
      if (isVisible) {
        byId.set(upperId, item);
      }
    });
    return favoriteProgramIds
      .map((id) => byId.get(id.toUpperCase()))
      .filter((item): item is SavedProgramSpecItem => Boolean(item));
  }, [allSpecs, favoriteProgramIds, favoriteIdSet, accessibleProjects, currentUser.name]);

  const displayedFavoriteSpecs = useMemo(() => {
    if (favoriteOverviewScope === 'PROJECT' && activeProject) {
      return accessibleFavoriteSpecs.filter((item) =>
        isSpecVisibleInProject(item, activeProject.code, currentUser.name)
      );
    }
    return accessibleFavoriteSpecs;
  }, [accessibleFavoriteSpecs, favoriteOverviewScope, activeProject, currentUser.name]);

  const filteredListSpecs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projectSpecs.filter((item) => {
      if (favoritesOnlyFilter && !favoriteIdSet.has(item.program_id.toUpperCase())) {
        return false;
      }
      if (selectedModuleFilter !== 'ALL' && item.module !== selectedModuleFilter) {
        return false;
      }
      if (sampleTypeFilter !== 'ALL' && (item.sample_type || '01') !== sampleTypeFilter) {
        return false;
      }
      if (lifecycleFilter !== 'ALL' && (item.spec.status || 'draft') !== lifecycleFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.program_id.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.tcode.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q) ||
        item.module.toLowerCase().includes(q)
      );
    });
  }, [
    projectSpecs,
    favoritesOnlyFilter,
    favoriteIdSet,
    selectedModuleFilter,
    sampleTypeFilter,
    lifecycleFilter,
    searchQuery,
  ]);

  const sortedListSpecs = useMemo(() => {
    if (selectedSortCols.length === 0 || !sortDirection) {
      return filteredListSpecs;
    }
    const dir = sortDirection === 'asc' ? 1 : -1;
    const getSortVal = (item: SavedProgramSpecItem, col: ProgramSortCol): string | number => {
      switch (col) {
        case 'program_id':
          return (item.program_id || '').toUpperCase();
        case 'module_tcode':
          return `${item.module || ''} ${item.tcode || ''}`.toUpperCase();
        case 'title':
          return (item.title || '').toLowerCase();
        case 'status': {
          const st: SpecLifecycleStatus = item.spec.status || 'draft';
          return STATUS_RANK[st] ?? 0;
        }
        case 'owner_updated':
          return `${item.updated_at || ''} ${item.author || ''}`.toLowerCase();
      }
    };

    return [...filteredListSpecs].sort((a, b) => {
      for (const col of selectedSortCols) {
        const va = getSortVal(a, col);
        const vb = getSortVal(b, col);
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
      }
      return 0;
    });
  }, [filteredListSpecs, selectedSortCols, sortDirection]);

  const handleHeaderMouseDown = (col: ProgramSortCol, e: React.MouseEvent) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
    isHeaderDraggingRef.current = true;
    dragStartColRef.current = col;
    dragMovedRef.current = false;
  };

  const handleHeaderMouseEnter = (col: ProgramSortCol) => {
    if (!isHeaderDraggingRef.current || !dragStartColRef.current) return;
    const startCol = dragStartColRef.current;
    if (col !== startCol) {
      dragMovedRef.current = true;
    }
    const order = SORTABLE_COLUMNS.map((c) => c.key);
    const startIdx = order.indexOf(startCol);
    const endIdx = order.indexOf(col);
    if (startIdx < 0 || endIdx < 0) return;
    const slice: ProgramSortCol[] = [];
    if (startIdx <= endIdx) {
      for (let i = startIdx; i <= endIdx; i++) slice.push(order[i]);
    } else {
      for (let i = startIdx; i >= endIdx; i--) slice.push(order[i]);
    }
    setSelectedSortCols(slice);
  };

  const handleHeaderClick = (col: ProgramSortCol, e: React.MouseEvent) => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedSortCols((prev) =>
        prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
      );
      return;
    }
    setSelectedSortCols((prev) => (prev.length === 1 && prev[0] === col ? [] : [col]));
  };

  const handleApplySortDirection = (dir: 'asc' | 'desc') => {
    if (selectedSortCols.length === 0) {
      setSelectedSortCols(['program_id']);
    }
    setSortDirection(dir);
  };

  const handleClearSort = () => {
    setSelectedSortCols([]);
    setSortDirection(null);
  };

  const handleOpenModuleList = (mod: 'ALL' | SapModule) => {
    setSelectedModuleFilter(mod);
    onChangeViewMode('program_list');
  };

  const handleToggleSelectAllVisible = () => {
    const visibleIds = sortedListSpecs.map((item) => item.program_id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedProgramIds.has(id));
    setSelectedProgramIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleToggleRowSelection = (programId: string) => {
    setSelectedProgramIds((prev) => {
      const next = new Set(prev);
      if (next.has(programId)) {
        next.delete(programId);
      } else {
        next.add(programId);
      }
      return next;
    });
  };

  const handleExportWricefIndex = () => {
    setIsExportMenuOpen(false);
    if (!activeProject || projectSpecs.length === 0) {
      onNotify?.('No project specs available to export.');
      return;
    }
    const filename = exportProjectWricefIndexXlsx(
      activeProject,
      projectSpecs.map((item) => item.spec),
      unresolvedCommentCounts
    );
    onNotify?.(`Downloaded WRICEF Master List (${filename}).`);
  };

  const handleBatchExportSelected = async (format: 'xlsx' | 'docx') => {
    setIsExportMenuOpen(false);
    const targetSpecs = projectSpecs
      .filter((item) => selectedProgramIds.has(item.program_id))
      .map((item) => item.spec);
    if (targetSpecs.length === 0 || isBatchExporting) return;

    setIsBatchExporting(true);
    try {
      const files = await exportBatchSpecsDocuments(targetSpecs, format);
      onNotify?.(`Downloaded ${files.length} .${format} spec file(s).`);
    } finally {
      setIsBatchExporting(false);
    }
  };

  const handleDeleteItem = (item: SavedProgramSpecItem) => {
    if (isCommonProtectedSample(item.spec)) {
      onNotify?.('Protected COMM sample originals cannot be deleted.');
      return;
    }
    const res = deleteSpecFromStorage(item.program_id, currentUser.name);
    if (!res.success) {
      onNotify?.(res.message || 'Failed to delete spec.');
      return;
    }
    onSpecsChanged(item.program_id);
    onNotify?.(`Deleted spec '${item.program_id}'.`);
  };

  if (!activeProject) return null;

  const isTempProject = activeProject.code === TEMP_PROJECT_CODE;
  const isCommonProject = activeProject.code === COMMON_PROJECT_CODE;

  const visibilitySummary = isCommonProject
    ? 'Company-Wide Common · Readable by all users (Originals protected)'
    : isTempProject
    ? `Personal Workspace · Shows specs created by '${currentUser.name}' only`
    : `Shared Project · ${activeProject.members.length} Members (${activeProject.members.join(' · ')})`;

  const newTargetProject = isCommonProject ? TEMP_PROJECT_CODE : activeProject.code;
  const completedPct =
    projectSpecs.length > 0
      ? Math.round(((lifecycleCounts.developed + lifecycleCounts.qa_passed) / projectSpecs.length) * 100)
      : 0;

  return (
    <div className="h-full overflow-y-auto bg-slate-50 text-slate-900">
      <div className="max-w-7xl mx-auto px-6 py-5 space-y-5">
        {/* Compact Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              {viewMode === 'program_list' && (
                <>
                  <button
                    type="button"
                    onClick={() => onChangeViewMode('overview')}
                    className="text-blue-600 hover:underline font-medium cursor-pointer"
                  >
                    Overview
                  </button>
                  <span aria-hidden="true">/</span>
                </>
              )}
              <span>{currentUser.name}</span>
              <span aria-hidden="true">·</span>
              <span>{currentUser.department}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {viewMode === 'overview'
                  ? 'Project Spec Overview'
                  : activeProject.name}
              </h1>
              {viewMode === 'program_list' && isCommonProject && (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-800 text-[11px] font-semibold"
                  title="COMM sample originals (ZRALV0010–ZRALV0040) are protected. Use Copy on each row to clone into your project or TEMP."
                >
                  <Lock className="w-3 h-3" />
                  <span>Protected</span>
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onOpenMeetingWizard()}
              className="w-9 h-9 bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-2xs flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              title="AI Spec from Meeting"
              aria-label="AI Spec from Meeting"
            >
              <Mic className="w-4 h-4 text-blue-300" />
            </button>
          </div>
        </div>

        {/* Compact 1-Line Project Selector Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {accessibleProjects.map((proj) => {
            const isSelected = proj.code === activeProject.code;
            const stats = projectStatsMap[proj.code] || {
              count: 0,
              latestUpdated: null,
              myCount: 0,
            };
            return (
              <button
                key={proj.code}
                type="button"
                onClick={() => {
                  onSelectProject(proj.code);
                  setSelectedModuleFilter('ALL');
                  setLifecycleFilter('ALL');
                  setSelectedProgramIds(new Set());
                }}
                title={`${proj.name} · Updated ${stats.latestUpdated || '-'} · Mine ${stats.myCount}`}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  isSelected
                    ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <FolderKanban
                  className={`w-3.5 h-3.5 ${isSelected ? 'text-blue-300' : 'text-blue-600'}`}
                />
                <span className="font-mono">{proj.code}</span>
                <span
                  className={`font-mono tabular-nums text-[11px] px-1.5 py-0.2 rounded ${
                    isSelected ? 'bg-slate-800 text-blue-300' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {stats.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ========================================================================= */}
        {/* VIEW 1: PROJECT OVERVIEW DASHBOARD                                        */}
        {/* ========================================================================= */}
        {viewMode === 'overview' && (
          <div className="space-y-5">
            {/* Unified Active Project Summary & Inline Lifecycle Progress */}
            <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="text-xs font-mono font-semibold text-blue-700 flex items-center gap-2">
                    <span>
                      {activeProject.code} · {activeProject.target_sap_release}
                    </span>
                    <span
                      className="text-slate-400 hover:text-slate-700 cursor-help inline-flex"
                      title={`${activeProject.description || 'SAP ABAP Specification Management'}\n${visibilitySummary}`}
                    >
                      <Info className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900 truncate">
                    {activeProject.name}
                  </h2>
                </div>

                <div className="flex items-center gap-5 shrink-0">
                  <div className="text-right text-xs text-slate-600 font-mono tabular-nums space-y-0.5">
                    <div>
                      Dev & QA <strong className="text-slate-900">{completedPct}%</strong>
                    </div>
                    <div>
                      Open Reviews{' '}
                      <strong
                        className={
                          totalUnresolvedReviews > 0 ? 'text-amber-700' : 'text-slate-900'
                        }
                      >
                        {totalUnresolvedReviews}
                      </strong>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenModuleList('ALL')}
                    title="Click to view program list"
                    aria-label={`View ${activeProject.name} program list (${projectSpecs.length} specs)`}
                    className="group flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg hover:bg-blue-50/80 border border-slate-200 hover:border-blue-300 transition-colors cursor-pointer"
                  >
                    <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 group-hover:text-blue-700">
                      {projectSpecs.length}
                    </span>
                    <span className="text-xs font-medium text-slate-500 group-hover:text-blue-700">
                      Specs
                    </span>
                  </button>
                </div>
              </div>

              {/* Slim Segmented Progress Bar */}
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden flex">
                {projectSpecs.length > 0 &&
                  LIFECYCLE_META.map((meta) => {
                    const cnt = lifecycleCounts[meta.status] || 0;
                    if (cnt === 0) return null;
                    const pct = (cnt / projectSpecs.length) * 100;
                    return (
                      <div
                        key={`bar-${meta.status}`}
                        style={{ width: `${pct}%` }}
                        className={`${meta.barColor} h-full transition-all`}
                        title={`${meta.label}: ${cnt} (${Math.round(pct)}%)`}
                      />
                    );
                  })}
              </div>

              {/* Compact Clickable Status Legend Chips */}
              <div className="flex flex-wrap items-center gap-2">
                {LIFECYCLE_META.map((meta) => {
                  const cnt = lifecycleCounts[meta.status] || 0;
                  return (
                    <button
                      key={`stat-${meta.status}`}
                      type="button"
                      onClick={() => {
                        setLifecycleFilter(meta.status);
                        setSelectedModuleFilter('ALL');
                        onChangeViewMode('program_list');
                      }}
                      title={`View ${meta.label} specs in list`}
                      className="px-2.5 py-1 bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 rounded-md text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <span className={`w-2 h-2 rounded-full ${meta.dotColor}`} />
                      <span className="font-medium text-slate-700">{meta.label}</span>
                      <span className="font-mono tabular-nums font-bold text-slate-900">
                        {cnt}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Starred / Favorite Specifications Quick Access */}
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-500" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Starred Specs
                  </h3>
                  <span className="font-mono text-xs font-semibold text-amber-700">
                    ({displayedFavoriteSpecs.length})
                  </span>
                  <span
                    className="text-slate-400 hover:text-slate-700 cursor-help inline-flex"
                    title="Star frequently used specs (★) to access them quickly from any project."
                  >
                    <Info className="w-3.5 h-3.5" />
                  </span>
                </div>

                {accessibleFavoriteSpecs.length > 0 && (
                  <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs shrink-0">
                    <button
                      type="button"
                      onClick={() => setFavoriteOverviewScope('ALL')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                        favoriteOverviewScope === 'ALL'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      All ({accessibleFavoriteSpecs.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFavoriteOverviewScope('PROJECT')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                        favoriteOverviewScope === 'PROJECT'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {activeProject.code}
                    </button>
                  </div>
                )}
              </div>

              {displayedFavoriteSpecs.length === 0 ? (
                <div className="px-5 py-5 text-center text-xs text-slate-500">
                  {accessibleFavoriteSpecs.length === 0
                    ? 'No starred specs yet. Click ★ in the list or editor header to pin here.'
                    : `No starred specs in '${activeProject.code}'.`}
                </div>
              ) : (
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  {displayedFavoriteSpecs.map((item) => {
                    const isProtected = isCommonProtectedSample(item.spec);
                    return (
                      <div
                        key={`fav-${item.program_id}`}
                        className="p-3 bg-slate-50/70 hover:bg-blue-50/40 border border-slate-200 hover:border-blue-300 rounded-lg transition-all flex items-start justify-between gap-2"
                      >
                        <button
                          type="button"
                          onClick={() => onOpenProgram(item.spec)}
                          className="text-left min-w-0 flex-1 group cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <FileCode className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span className="font-mono text-xs font-bold text-blue-700 group-hover:underline">
                              {item.program_id}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">
                              {item.project_code} · {item.module}
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-slate-900 mt-1 line-clamp-1">
                            {item.title}
                          </div>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          {isProtected && (
                            <button
                              type="button"
                              onClick={() => onRequestCopySpec(item.spec)}
                              className="p-1 text-blue-600 hover:bg-blue-100/70 rounded cursor-pointer"
                              title="Copy to project"
                              aria-label={`Copy ${item.program_id} to project`}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onToggleFavorite(item.program_id)}
                            title="Remove from favorites"
                            aria-label={`Unstar ${item.program_id}`}
                            className="p-1 rounded hover:bg-amber-50 transition-colors cursor-pointer"
                          >
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Module Breakdown Section */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Specs by Module
                  </h3>
                  {modulesWithSpecs.length > 0 && (
                    <span className="font-mono text-xs font-semibold text-blue-700">
                      ({modulesWithSpecs.length})
                    </span>
                  )}
                  <span
                    className="text-slate-400 hover:text-slate-700 cursor-help inline-flex"
                    title="Only modules with registered specs are shown. Click a card to view its programs."
                  >
                    <Info className="w-3.5 h-3.5" />
                  </span>
                </div>
                {!isCommonProject && !isTempProject && (
                  <button
                    type="button"
                    onClick={onOpenProjectManager}
                    className="text-xs font-semibold text-slate-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Module Settings</span>
                  </button>
                )}
              </div>

              {modulesWithSpecs.length === 0 ? (
                <div className="p-6 bg-white border border-slate-200 rounded-xl text-center space-y-2.5">
                  <p className="text-xs text-slate-500">
                    No specs registered in this project yet.
                  </p>
                  {!isCommonProject && (
                    <button
                      type="button"
                      onClick={() => onCreateNewProgram(newTargetProject)}
                      title="New Program"
                      aria-label="New Program"
                      className="w-9 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg cursor-pointer inline-flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {modulesWithSpecs.map((mod) => {
                    const count = moduleCounts[mod.code] || 0;
                    return (
                      <button
                        key={mod.code}
                        type="button"
                        onClick={() => handleOpenModuleList(mod.code)}
                        className="p-3.5 bg-white border border-slate-200 hover:border-blue-400 rounded-xl text-left transition-all cursor-pointer group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-bold text-slate-900 group-hover:text-blue-700">
                            {mod.code}
                          </span>
                          <span className="font-mono tabular-nums text-lg font-bold text-blue-600">
                            {count}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{mod.label}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: PROJECT PROGRAM LIST                                              */}
        {/* ========================================================================= */}
        {viewMode === 'program_list' && (
          <div className="space-y-3.5">
            {/* Single-Row Unified Filter & Export Toolbar */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Program ID, Title, T-Code, Author..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white focus:border-blue-500"
                  />
                </div>

                <select
                  value={selectedModuleFilter}
                  onChange={(e) => setSelectedModuleFilter(e.target.value as 'ALL' | SapModule)}
                  aria-label="Module Filter"
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 cursor-pointer"
                >
                  <option value="ALL">All Modules ({projectSpecs.length})</option>
                  {modulesWithSpecs.map((mod) => (
                    <option key={mod.code} value={mod.code}>
                      {mod.code} ({moduleCounts[mod.code] || 0})
                    </option>
                  ))}
                </select>

                <select
                  value={lifecycleFilter}
                  onChange={(e) =>
                    setLifecycleFilter(e.target.value as 'ALL' | SpecLifecycleStatus)
                  }
                  aria-label="Status Filter"
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 cursor-pointer"
                >
                  <option value="ALL">All Statuses</option>
                  {LIFECYCLE_META.map((m) => (
                    <option key={m.status} value={m.status}>
                      {m.label} ({lifecycleCounts[m.status] || 0})
                    </option>
                  ))}
                </select>

                <select
                  value={sampleTypeFilter}
                  onChange={(e) => setSampleTypeFilter(e.target.value)}
                  aria-label="Sample Type Filter"
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 cursor-pointer"
                >
                  <option value="ALL">All Types</option>
                  <option value="01">01 Single ALV</option>
                  <option value="02">02 Master-Detail</option>
                  <option value="03">03 Tree ALV</option>
                  <option value="04">04 Pivot</option>
                </select>

                <button
                  type="button"
                  onClick={() => setFavoritesOnlyFilter((prev) => !prev)}
                  title="Show starred specs only"
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    favoritesOnlyFilter
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Star
                    className={`w-3.5 h-3.5 ${
                      favoritesOnlyFilter
                        ? 'fill-amber-400 text-amber-500'
                        : 'text-slate-400'
                    }`}
                  />
                  <span>Starred</span>
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-mono tabular-nums text-slate-500 mr-1">
                  {selectedProgramIds.size > 0
                    ? `${selectedProgramIds.size} selected`
                    : `${sortedListSpecs.length}/${projectSpecs.length} items`}
                </span>

                {/* Multi-column Header Sort Controls */}
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => handleApplySortDirection('asc')}
                    title="Sort ascending by selected headers"
                    aria-label="Sort ascending"
                    className={`w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
                      sortDirection === 'asc'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplySortDirection('desc')}
                    title="Sort descending by selected headers"
                    aria-label="Sort descending"
                    className={`w-7 h-7 rounded flex items-center justify-center transition-colors cursor-pointer ${
                      sortDirection === 'desc'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSort}
                    disabled={selectedSortCols.length === 0 && !sortDirection}
                    title="Clear sort selection"
                    aria-label="Clear sort"
                    className="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-900 disabled:opacity-35 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="relative" ref={exportMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsExportMenuOpen((prev) => !prev)}
                    title="Export"
                    aria-label="Export"
                    className="w-8 h-8 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  >
                    <Download className="w-4 h-4 text-blue-600" />
                  </button>

                  {isExportMenuOpen && (
                    <div className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-40 text-xs">
                      <button
                        type="button"
                        onClick={handleExportWricefIndex}
                        disabled={projectSpecs.length === 0}
                        className="w-full px-3 py-2 text-left text-slate-700 hover:bg-emerald-50 hover:text-emerald-800 disabled:opacity-40 flex items-center gap-2 cursor-pointer"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>WRICEF Master List (.xlsx)</span>
                      </button>
                      <div className="border-t border-slate-100 my-1" />
                      <button
                        type="button"
                        onClick={() => void handleBatchExportSelected('xlsx')}
                        disabled={selectedProgramIds.size === 0 || isBatchExporting}
                        className="w-full px-3 py-2 text-left text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>Batch Export .xlsx ({selectedProgramIds.size})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleBatchExportSelected('docx')}
                        disabled={selectedProgramIds.size === 0 || isBatchExporting}
                        className="w-full px-3 py-2 text-left text-slate-700 hover:bg-blue-50 hover:text-blue-800 disabled:opacity-40 flex items-center gap-2 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>Batch Export .docx ({selectedProgramIds.size})</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Streamlined 7-Column Program Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse min-w-[820px]">
                  <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold select-none">
                    <tr>
                      <th className="px-3 py-2.5 w-9 text-center">
                        <input
                          type="checkbox"
                          aria-label="Select all visible programs"
                          checked={
                            sortedListSpecs.length > 0 &&
                            sortedListSpecs.every((item) =>
                              selectedProgramIds.has(item.program_id)
                            )
                          }
                          onChange={handleToggleSelectAllVisible}
                          className="rounded border-slate-300 cursor-pointer"
                        />
                      </th>
                      {SORTABLE_COLUMNS.map((col) => {
                        const priorityIdx = selectedSortCols.indexOf(col.key);
                        const isSelectedCol = priorityIdx >= 0;
                        return (
                          <th
                            key={col.key}
                            onMouseDown={(e) => handleHeaderMouseDown(col.key, e)}
                            onMouseEnter={() => handleHeaderMouseEnter(col.key)}
                            onClick={(e) => handleHeaderClick(col.key, e)}
                            title="Click to select, Ctrl/Cmd+click or drag across headers for multi-column sort"
                            className={`px-3 py-2.5 cursor-pointer transition-colors whitespace-nowrap ${
                              isSelectedCol
                                ? 'bg-blue-50 text-blue-900 ring-1 ring-inset ring-blue-300'
                                : 'hover:bg-slate-200/60'
                            }`}
                          >
                            <div className="inline-flex items-center gap-1.5">
                              <span>{col.label}</span>
                              {isSelectedCol && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-mono tabular-nums font-bold text-blue-700">
                                  <span>{priorityIdx + 1}</span>
                                  {sortDirection === 'asc' && <ArrowUp className="w-3 h-3" />}
                                  {sortDirection === 'desc' && <ArrowDown className="w-3 h-3" />}
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedListSpecs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                          No program specs match the selected filters.
                        </td>
                      </tr>
                    ) : (
                      sortedListSpecs.map((item) => {
                        const isProtected = isCommonProtectedSample(item.spec);
                        const isFav = favoriteIdSet.has(item.program_id.toUpperCase());
                        const isSelectedRow = selectedProgramIds.has(item.program_id);
                        const canDelete =
                          !isProtected && !item.is_system && item.author === currentUser.name;
                        const latestVer =
                          item.change_history && item.change_history.length > 0
                            ? item.change_history[item.change_history.length - 1].version
                            : 'v1.0';
                        const statusKey: SpecLifecycleStatus = item.spec.status || 'draft';
                        const statusMeta = LIFECYCLE_META_MAP[statusKey];
                        const unresolvedCount = unresolvedCommentCounts[item.spec.id] || 0;

                        return (
                          <tr
                            key={item.program_id}
                            className={`hover:bg-blue-50/50 transition-colors ${
                              isSelectedRow ? 'bg-blue-50/30' : ''
                            }`}
                          >
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                aria-label={`Select ${item.program_id}`}
                                checked={isSelectedRow}
                                onChange={() => handleToggleRowSelection(item.program_id)}
                                className="rounded border-slate-300 cursor-pointer"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => onToggleFavorite(item.program_id)}
                                  title={isFav ? 'Unstar' : 'Star'}
                                  aria-label={`${isFav ? 'Unstar' : 'Star'} ${item.program_id}`}
                                  className="p-0.5 rounded hover:bg-amber-50 transition-colors cursor-pointer shrink-0"
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      isFav
                                        ? 'fill-amber-400 text-amber-500'
                                        : 'text-slate-300 hover:text-amber-400'
                                    }`}
                                  />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onOpenProgram(item.spec)}
                                  title={`ALV Type ${item.sample_type || '01'} · ${latestVer}`}
                                  className="font-mono font-bold text-blue-700 hover:text-blue-900 underline decoration-blue-300 hover:decoration-blue-700 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                >
                                  <FileCode className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                  <span>{item.program_id}</span>
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="font-bold text-slate-800">{item.module}</span>
                                <span className="text-slate-300">·</span>
                                <span className="text-slate-700">{item.tcode}</span>
                              </div>
                              <div className="text-[10px] font-mono text-slate-400">
                                Type {item.sample_type || '01'} · {latestVer}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 max-w-sm">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-medium text-slate-900 truncate">
                                  {item.title}
                                </span>
                                {item.spec.source_meeting_id && onOpenMeetingMinute && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onOpenMeetingMinute(item.spec.source_meeting_id!)
                                    }
                                    title={`Open source meeting: ${item.spec.source_meeting_title || item.spec.source_meeting_id}`}
                                    aria-label={`Open source meeting: ${item.spec.source_meeting_title || item.spec.source_meeting_id}`}
                                    className="p-0.5 text-blue-600 hover:bg-blue-50 rounded shrink-0 cursor-pointer"
                                  >
                                    <Mic className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold ${statusMeta.badgeClass}`}
                                >
                                  {statusKey === 'qa_passed' && (
                                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                                  )}
                                  <span>{statusMeta.label}</span>
                                </span>
                                {unresolvedCount > 0 && (
                                  <span
                                    className="inline-flex items-center gap-0.5 text-[11px] font-mono font-bold text-amber-700"
                                    title={`${unresolvedCount} open review comment(s)`}
                                  >
                                    <MessageSquare className="w-3 h-3 shrink-0" />
                                    <span>{unresolvedCount}</span>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <div className="text-slate-700 font-medium">{item.author}</div>
                              <div className="text-[11px] font-mono tabular-nums text-slate-400">
                                {item.updated_at}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => onRequestCopySpec(item.spec)}
                                  className="p-1.5 text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded cursor-pointer"
                                  title="Copy to another project"
                                  aria-label={`Copy ${item.program_id} to another project`}
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                {canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(item)}
                                    className="p-1.5 text-rose-600 hover:bg-rose-50 border border-slate-200 rounded cursor-pointer"
                                    title="Delete spec"
                                    aria-label={`Delete ${item.program_id}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
