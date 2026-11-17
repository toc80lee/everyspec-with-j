import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FileText,
  Database,
  Sliders,
  Layout,
  CheckCircle,
  CheckCircle2,
  AlertTriangle,
  Info,
  Plus,
  Trash2,
  Table,
  Sparkles,
  Check,
  Download,
  Upload,
  Layers,
  Printer,
  Search,
  ListOrdered,
  FileDown,
  FolderOpen,
  Wand2,
  GitPullRequestCreate,
  Undo2,
  Redo2,
  FileSpreadsheet,
  FileType2,
  Copy,
  Lock,
  FolderKanban,
  Code2,
  MessageSquareText,
  ExternalLink,
  ChevronDown,
  MoreHorizontal,
  ShieldCheck,
  MessageSquare,
  Users,
  X,
} from 'lucide-react';
import { PdfExportModal } from './PdfExportModal';
import { SpecManagerModal } from './SpecManagerModal';
import { AiSpecCopilotModal } from './AiSpecCopilotModal';
import { AiReverseExtractModal } from './AiReverseExtractModal';
import { CopySpecModal } from './CopySpecModal';
import { SpecLifecycleBar } from './SpecLifecycleBar';
import { SpecSnapshotDiffModal } from './SpecSnapshotDiffModal';
import { SpecGovernancePanel } from './SpecGovernancePanel';
import { SpecReviewCommentsPanel } from './SpecReviewCommentsPanel';
import { LegacyAbapImportModal } from './LegacyAbapImportModal';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useConfirmDialog } from '../contexts/ConfirmDialogContext';
import { backfillMockRowsForFields } from '../utils/aiLogicGenerator';
import { exportSpecificationDocx, exportSpecificationXlsx } from '../utils/officeExport';
import {
  COMMON_PROJECT_CODE,
  TEMP_PROJECT_CODE,
  getAccessibleProjectsForUser,
  getProjectAbapStandards,
  isReadOnlyCommonSpec,
} from '../utils/projectStorage';
import {
  ProgramSpec,
  SapModule,
  SapProject,
  TestCase,
  AlvToolbarButton,
  AlvLayout,
  AlvField,
  SelectionParameter,
  SelectionKind,
  SapDataType,
  SpecPresenceEntry,
} from '../types/sap';
import { FieldCatalogEditor } from './FieldCatalogEditor';
import { AlvSortEditor } from './AlvSortEditor';
import { AlvLayoutSpreadsheet } from './AlvLayoutSpreadsheet';
import { SelectionScreenEditor } from './SelectionScreenEditor';
import { ToolbarEditor } from './ToolbarEditor';
import { DataFlowEditor } from './DataFlowEditor';
import { MarkdownFieldEditor } from './MarkdownFieldEditor';
import { SapSearchHelpModal } from './SapSearchHelpModal';
import { DEFAULT_ALV_TOOLBAR_BUTTONS } from '../data/defaultToolbarButtons';
import { SAMPLE_SPECS } from '../data/sampleSpecs';
import { downloadExcelTemplate, parseUploadedExcelOrCsv } from '../utils/excelTemplateHelper';
import {
  analyzeS4HanaCompatibility,
  validateFullProgramSpec,
  validateProjectNamingStandards,
  validateSapTCode,
} from '../utils/sapValidation';
import { getReviewCommentsForSpec } from '../utils/reviewCommentStorage';
import {
  CurrentUser,
  DEFAULT_OPERATOR_USER,
  USERS_UPDATED_EVENT,
  getRegisteredUsers,
  isLegacyRemovedUserName,
} from '../utils/authStorage';
import { InspectableSelect } from './InspectableSelect';

interface SpecEditorProps {
  spec: ProgramSpec;
  onChange: (updated: ProgramSpec) => void;
  onTriggerPrint?: () => void;
  onOpenTemplates?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onOpenMeetingMinute?: (minuteId: string) => void;
  onCommentsChanged?: () => void;
  onNotify?: (message: string) => void;
  remoteProjects?: SapProject[];
  activeCollaborators?: SpecPresenceEntry[];
}

export const SpecEditor: React.FC<SpecEditorProps> = ({
  spec,
  onChange,
  onTriggerPrint,
  onOpenTemplates,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onOpenMeetingMinute,
  onCommentsChanged,
  onNotify,
  remoteProjects = [],
  activeCollaborators = [],
}) => {
  const { lang, t } = useLanguage();
  // Main Tabs: 1. Program Spec -> 2. Selection Screen -> 3. Main Screen
  const [mainTab, setMainTab] = useState<'info' | 'selection' | 'alv'>('info');

  // Subtabs for Program Spec
  const [specSubTab, setSpecSubTab] = useState<'basic' | 'flow' | 'governance' | 'review'>('basic');
  const [isSpecManagerOpen, setIsSpecManagerOpen] = useState(false);
  const [openToolbarMenu, setOpenToolbarMenu] = useState<'ai' | 'export' | 'more' | null>(null);
  const toolbarMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openToolbarMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (toolbarMenuRef.current && !toolbarMenuRef.current.contains(e.target as Node)) {
        setOpenToolbarMenu(null);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenToolbarMenu(null);
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [openToolbarMenu]);

  // Master-Detail ALV Sub-Grid Selector: Header ALV Grid vs Item ALV Grid
  const [activeGridTab, setActiveGridTab] = useState<'header' | 'item'>('header');

  const [alvSubTab, setAlvSubTab] = useState<'layout' | 'fields' | 'sort' | 'toolbar' | 'tests'>('layout');

  // RFQ v1.18: In Sample Type 03, Tree tab hides Sort sub-tab
  const isTreeTab = spec.sample_type === '03' && activeGridTab === 'header';

  useEffect(() => {
    if (isTreeTab && alvSubTab === 'sort') {
      setAlvSubTab('fields');
    }
  }, [isTreeTab, alvSubTab]);

  // SAP T-Code Naming Standard Validation (Customer Namespace: Z... or Y...)
  const tcodeValidation = useMemo(() => validateSapTCode(spec.tcode), [spec.tcode]);
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  const [isAiCopilotOpen, setIsAiCopilotOpen] = useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [isLegacyImportOpen, setIsLegacyImportOpen] = useState(false);
  const [aiReverseExtractFocus, setAiReverseExtractFocus] = useState<'all' | 'selection' | 'fields' | null>(null);
  const [localCommentTick, setLocalCommentTick] = useState(0);
  const [registeredUsers, setRegisteredUsers] = useState<CurrentUser[]>(() => getRegisteredUsers());

  useEffect(() => {
    const syncUsers = () => setRegisteredUsers(getRegisteredUsers());
    window.addEventListener(USERS_UPDATED_EVENT, syncUsers);
    return () => window.removeEventListener(USERS_UPDATED_EVENT, syncUsers);
  }, []);

  const { activeUser, userProfile, isAdmin, resolveEffectiveProjectRole } = useAuth();
  const { confirmDelete } = useConfirmDialog();
  const accessibleProjects = useMemo(
    () =>
      getAccessibleProjectsForUser(activeUser.name, {
        uid: userProfile?.uid,
        isAdmin,
        assignedProjects: userProfile?.assignedProjects || [],
        remoteProjects,
      }),
    [
      activeUser.name,
      userProfile?.uid,
      isAdmin,
      userProfile?.assignedProjects,
      remoteProjects,
      isSpecManagerOpen,
      isCopyModalOpen,
      spec.project_code,
    ]
  );
  const currentSpecProject = useMemo(
    () =>
      accessibleProjects.find(
        (p) => p.code === (spec.project_code || TEMP_PROJECT_CODE).toUpperCase()
      ) || null,
    [accessibleProjects, spec.project_code]
  );
  const effectiveProjectRole = resolveEffectiveProjectRole(currentSpecProject);
  const isReadOnlyCommon = isReadOnlyCommonSpec(spec);
  const isLockedApproved =
    (spec.status === 'approved' || spec.status === 'qa_passed') &&
    effectiveProjectRole !== 'PM' &&
    effectiveProjectRole !== 'ADMIN';
  const isEffectiveReadOnly = isReadOnlyCommon || isLockedApproved;

  const governanceIssueCount = useMemo(() => {
    const standards = getProjectAbapStandards(spec.project_code);
    const base = validateFullProgramSpec(spec);
    const naming =
      spec.project_code && spec.project_code !== COMMON_PROJECT_CODE
        ? validateProjectNamingStandards(spec, standards)
        : [];
    const s4 = analyzeS4HanaCompatibility(spec);
    return base.issues.length + naming.length + s4.length;
  }, [spec]);

  const unresolvedReviewCount = useMemo(() => {
    const projectCode = (spec.project_code || TEMP_PROJECT_CODE).toUpperCase();
    return getReviewCommentsForSpec(projectCode, spec.id).filter((c) => !c.resolved).length;
  }, [spec.project_code, spec.id, localCommentTick]);

  const safeOnChange = (updated: ProgramSpec) => {
    if (isReadOnlyCommon) {
      onNotify?.(t('COMM standard samples are read-only. Copy to a project to edit.', 'COMM 표준 샘플은 읽기 전용입니다. 프로젝트로 복사 후 편집하세요.'));
      return;
    }
    if (isLockedApproved) {
      onNotify?.(
        t(
          `Locked by ${spec.status === 'qa_passed' ? 'QA Passed' : 'Approved'} status. Only PM or ADMIN can edit or unlock (${effectiveProjectRole}).`,
          `${spec.status === 'qa_passed' ? 'QA 통과(QA Passed)' : '승인(Approved)'} 상태로 잠겨 있습니다. PM 또는 ADMIN 권한만 수정/잠금 해제가 가능합니다 (${effectiveProjectRole}).`
        )
      );
      return;
    }
    onChange(updated);
  };

  // Dynamic Selection Param Addition State & Function
  const [showAddParamModal, setShowAddParamModal] = useState(false);
  const [showParamSearchHelp, setShowParamSearchHelp] = useState(false);
  const [newParamForm, setNewParamForm] = useState<{
    kind: SelectionKind;
    name: string;
    datatype: SapDataType;
    length: number;
    text: string;
    ref_table: string;
    ref_field: string;
    obligatory: boolean;
    default_val: string;
  }>({
    kind: 'PARAMETER',
    name: 'P_BUKRS',
    datatype: 'CHAR',
    length: 4,
    text: 'Company Code',
    ref_table: 'T001',
    ref_field: 'BUKRS',
    obligatory: true,
    default_val: '1000',
  });

  /**
   * Dynamically adds a new input field (Parameters or Select-Options) to the selection_params array,
   * including inputs for field name, data type, and length.
   */
  const handleAddSelectionParam = (paramData?: {
    kind?: SelectionKind;
    name?: string;
    datatype?: SapDataType;
    length?: number;
    text?: string;
    ref_table?: string;
    ref_field?: string;
    obligatory?: boolean;
    default_val?: string;
    block_title?: string;
    block_id?: string;
    radio_group?: string;
  }): SelectionParameter => {
    const kind: SelectionKind = paramData?.kind || 'PARAMETER';
    const isSelectOpt = kind === 'SELECT_OPTION';
    const isRadioOrChk = kind === 'RADIOBUTTON' || kind === 'CHECKBOX';
    const nextIdx = spec.selection_params.length + 1;

    // Field Name: e.g. P_BUKRS, S_VBELN
    const defaultName = isSelectOpt ? `S_FLD${nextIdx}` : `P_FLD${nextIdx}`;
    const name = (paramData?.name || defaultName).trim().toUpperCase();

    // Data Type: e.g. CHAR, DATS, CURR, etc.
    const datatype: SapDataType = isRadioOrChk ? 'CHAR' : paramData?.datatype || 'CHAR';

    // Length: e.g. 10, 4, 18, 8
    const length = isRadioOrChk
      ? 1
      : Number(paramData?.length) > 0
      ? Number(paramData?.length)
      : datatype === 'DATS'
      ? 8
      : datatype === 'TIMS'
      ? 6
      : 10;

    const cleanBlockTitle = paramData?.block_title?.trim() || undefined;
    const cleanBlockId = paramData?.block_id?.trim() || undefined;
    const cleanRadioGroup =
      kind === 'RADIOBUTTON'
        ? (paramData?.radio_group?.trim().toUpperCase().slice(0, 4) || 'R1')
        : undefined;

    const newParam: SelectionParameter = {
      id: `param-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      kind,
      name,
      datatype,
      length,
      text:
        paramData?.text?.trim() ||
        (isSelectOpt
          ? `Selection Range ${nextIdx}`
          : kind === 'RADIOBUTTON'
          ? `Radio Option ${nextIdx}`
          : kind === 'CHECKBOX'
          ? `Checkbox Item ${nextIdx}`
          : `Parameter Item ${nextIdx}`),
      ref_table: paramData?.ref_table?.trim().toUpperCase() || '',
      ref_field: paramData?.ref_field?.trim().toUpperCase() || '',
      obligatory: isRadioOrChk ? false : !!paramData?.obligatory,
      default_val: paramData?.default_val?.trim() || '',
      block_title: cleanBlockTitle,
      block_id: cleanBlockId,
      radio_group: cleanRadioGroup,
      low: '',
      high: '',
      sign: 'I',
      option: 'EQ',
    };

    const updated = [...spec.selection_params, newParam];
    safeOnChange({ ...spec, selection_params: updated });
    return newParam;
  };

  // Switch or configure sample type (01: Single ALV, 02: Master-Detail, 03: Tree ALV, 04: Pivot Browser)
  const handleSampleTypeChange = (newType: string) => {
    if (isEffectiveReadOnly) return;
    const foundSample = SAMPLE_SPECS.find((s) => s.sample_type === newType);
    if (foundSample) {
      safeOnChange({
        ...foundSample,
        id: spec.id,
        project_code: spec.project_code || TEMP_PROJECT_CODE,
        program_id: spec.program_id,
        tcode: spec.tcode,
        title: spec.title,
        author: spec.author,
        is_system: false,
        sample_type: newType,
      });
    } else {
      safeOnChange({
        ...spec,
        sample_type: newType,
      });
    }
  };

  // Master-Detail / Dual ALV resolution (Sample Type 02 & Sample Type 03)
  const isMasterDetail = spec.sample_type === '02' || spec.sample_type === '03';
  const activeIsItem = isMasterDetail && activeGridTab === 'item';

  const defaultItemLayout: AlvLayout = {
    zebra: true,
    grid_title: spec.sample_type === '03' ? 'Flight Schedule ALV Grid' : 'Sales Order Item ALV Grid (VBAP)',
    sel_mode: 'A',
    cwidth_opt: true,
    totals_only: false,
    excp_fname: 'ZICON',
    excp_led: true,
    show_row_numbers: true,
  };

  const activeLayout = activeIsItem
    ? (spec.item_grid?.layout || defaultItemLayout)
    : spec.layout;

  const activeFieldCatalog = activeIsItem
    ? (spec.item_grid?.field_catalog || [])
    : spec.field_catalog;

  const activeToolbarButtons = activeIsItem
    ? (spec.item_grid?.toolbar_buttons || DEFAULT_ALV_TOOLBAR_BUTTONS)
    : (spec.toolbar_buttons || DEFAULT_ALV_TOOLBAR_BUTTONS);

  const activeTestCases = activeIsItem
    ? (spec.item_grid?.test_cases || [])
    : spec.test_cases;

  const activeMockRows = activeIsItem
    ? (spec.item_grid?.mock_rows || [])
    : (spec.mock_rows || []);

  const updateActiveLayout = (newLayout: AlvLayout) => {
    if (activeIsItem) {
      safeOnChange({
        ...spec,
        item_grid: {
          ...(spec.item_grid || {
            grid_name: 'Item ALV Grid',
            layout: newLayout,
            field_catalog: [],
            mock_rows: [],
            foreign_key: 'VBELN',
          }),
          layout: newLayout,
        },
      });
    } else {
      safeOnChange({ ...spec, layout: newLayout });
    }
  };

  const updateActiveFieldCatalog = (newCatalog: AlvField[], newMockRows?: Record<string, any>[]) => {
    if (activeIsItem) {
      safeOnChange({
        ...spec,
        item_grid: {
          ...(spec.item_grid || {
            grid_name: spec.sample_type === '03' ? 'Flight Schedule Grid' : 'Item ALV Grid',
            layout: defaultItemLayout,
            field_catalog: [],
            mock_rows: [],
            foreign_key: spec.sample_type === '03' ? 'CARRID' : 'VBELN',
          }),
          field_catalog: newCatalog,
          ...(newMockRows ? { mock_rows: newMockRows } : {}),
        },
      });
    } else {
      safeOnChange({
        ...spec,
        field_catalog: newCatalog,
        ...(newMockRows ? { mock_rows: newMockRows } : {}),
      });
    }
  };

  const handleReorderFieldCatalog = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= activeFieldCatalog.length) return;
    const list = [...activeFieldCatalog];
    const [movedItem] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, movedItem);

    // Automatically update col_pos for each field accordingly (1-indexed sequential: 1, 2, 3...)
    const renumbered = list.map((field, idx) => ({
      ...field,
      col_pos: idx + 1,
    }));

    updateActiveFieldCatalog(renumbered);
  };

  const updateActiveToolbarButtons = (newButtons: AlvToolbarButton[]) => {
    if (activeIsItem) {
      safeOnChange({
        ...spec,
        item_grid: {
          ...(spec.item_grid || {
            grid_name: 'Item ALV Grid',
            layout: defaultItemLayout,
            field_catalog: [],
            mock_rows: [],
            foreign_key: 'VBELN',
          }),
          toolbar_buttons: newButtons,
        },
      });
    } else {
      safeOnChange({ ...spec, toolbar_buttons: newButtons });
    }
  };

  const updateActiveTestCases = (newTestCases: TestCase[]) => {
    if (activeIsItem) {
      safeOnChange({
        ...spec,
        item_grid: {
          ...(spec.item_grid || {
            grid_name: 'Item ALV Grid',
            layout: defaultItemLayout,
            field_catalog: [],
            mock_rows: [],
            foreign_key: 'VBELN',
          }),
          test_cases: newTestCases,
        },
      });
    } else {
      safeOnChange({ ...spec, test_cases: newTestCases });
    }
  };

  const updateActiveMockRows = (newRows: Record<string, any>[]) => {
    if (activeIsItem) {
      safeOnChange({
        ...spec,
        item_grid: {
          ...(spec.item_grid || {
            grid_name: 'Item ALV Grid',
            layout: defaultItemLayout,
            field_catalog: [],
            mock_rows: [],
            foreign_key: 'VBELN',
          }),
          mock_rows: newRows,
        },
      });
    } else {
      safeOnChange({ ...spec, mock_rows: newRows });
    }
  };

  // Add test case for active grid
  const handleAddTestCase = () => {
    const nextIdx = activeTestCases.length + 1;
    const newTc: TestCase = {
      id: `tc-${Date.now()}`,
      scenario: t(`Scenario ${nextIdx}: Standard Data Check`, `시나리오 ${nextIdx}: 기본 데이터 조회 검증`),
      condition: t('Set input conditions', '조회 조건 입력'),
      expected: t('Verify expected output', '기대 출력 결과 확인'),
    };
    updateActiveTestCases([...activeTestCases, newTc]);
  };

  // Excel / CSV File Upload Handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const parsed = parseUploadedExcelOrCsv(text, activeFieldCatalog);
      if (parsed.errors && parsed.errors.length > 0) {
        onNotify?.(t(`CSV upload error: ${parsed.errors.join(', ')}`, `CSV 업로드 오류: ${parsed.errors.join(', ')}`));
        return;
      }

      if (parsed.rows.length === 0) {
        onNotify?.(t('No valid data rows found in uploaded file.', '업로드된 파일에 유효한 데이터 행이 없습니다.'));
        return;
      }

      updateActiveMockRows(parsed.rows);
      onNotify?.(
        t(
          `${parsed.rows.length} test data rows loaded into ALV Grid.`,
          `${parsed.rows.length}건의 테스트 데이터가 ALV 그리드에 반영되었습니다.`
        )
      );
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const toolbarButtonsCount = activeToolbarButtons.filter(b => b.visible !== false).length;

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden font-sans">
      {/* 1. Main Tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 px-3.5 bg-slate-50">
        <div className="flex items-center gap-1 py-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setMainTab('info')}
            title={t('Program Spec', '프로그램 사양')}
            aria-label={t('Program Spec', '프로그램 사양')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 relative cursor-pointer whitespace-nowrap shrink-0 ${
              mainTab === 'info'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5 shrink-0" />
            <span>{t('Program Spec', '프로그램 사양')}</span>
            {!tcodeValidation.isValid && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                title={tcodeValidation.message}
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMainTab('selection')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 relative cursor-pointer whitespace-nowrap shrink-0 ${
              mainTab === 'selection'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 shrink-0" />
            <span>{t('Selection Screen', '조회 조건 화면')}</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab('alv')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 relative cursor-pointer whitespace-nowrap shrink-0 ${
              mainTab === 'alv'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Table className="w-3.5 h-3.5 shrink-0" />
            <span>{t('Main Screen', '메인 화면 (ALV)')}</span>
          </button>
        </div>

        {/* Consolidated Action Toolbar: Collaborators + Undo/Redo + AI ▾ + Export ▾ + More ⋯ */}
        <div ref={toolbarMenuRef} className="flex items-center gap-1.5 py-1.5 shrink-0">
          {activeCollaborators.length > 0 && (
            <div
              className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold shrink-0"
              title={activeCollaborators
                .map(
                  (c) =>
                    `${c.displayName} (${c.projectRole}) · ${
                      c.mode === 'editing' ? t('Editing', '편집 중') : t('Viewing', '조회 중')
                    }`
                )
                .join('\n')}
            >
              <Users className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="truncate max-w-[145px]">
                {activeCollaborators.length === 1
                  ? `${activeCollaborators[0].displayName} (${activeCollaborators[0].projectRole})`
                  : t(
                      `${activeCollaborators[0].displayName} +${activeCollaborators.length - 1}`,
                      `${activeCollaborators[0].displayName} 외 ${activeCollaborators.length - 1}명`
                    )}
              </span>
            </div>
          )}
          {onUndo && (
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1.5 text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
              title={t('Undo (Ctrl+Z)', '실행 취소 (Ctrl+Z)')}
              aria-label={t('Undo', '실행 취소')}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onRedo && (
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1.5 text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed"
              title={t('Redo (Ctrl+Y)', '다시 실행 (Ctrl+Y)')}
              aria-label={t('Redo', '다시 실행')}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* AI Assistant Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenToolbarMenu((m) => (m === 'ai' ? null : 'ai'))}
              className={`px-2.5 py-1.5 rounded-md border text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                openToolbarMenu === 'ai'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
              }`}
              title={t('AI Spec & Reverse Engineering Tools', 'AI 사양 작성 및 역공학 도구')}
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {openToolbarMenu === 'ai' && (
              <div className="absolute right-0 top-full mt-1.5 w-60 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-40 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setOpenToolbarMenu(null);
                    setIsAiCopilotOpen(true);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-indigo-50 text-slate-800 flex items-center gap-2 cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>{t('AI Spec Copilot (Draft)', 'AI 사양 코파일럿 (초안)')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenToolbarMenu(null);
                    setIsLegacyImportOpen(true);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-emerald-50 text-slate-800 flex items-center gap-2 cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{t('Legacy ABAP / SE11 Reverse', '레거시 ABAP / SE11 역공학')}</span>
                </button>
                {!isEffectiveReadOnly && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenToolbarMenu(null);
                      setAiReverseExtractFocus('all');
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-blue-50 text-slate-800 flex items-center gap-2 cursor-pointer"
                  >
                    <GitPullRequestCreate className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>{t('Extract Fields from Logic', '로직에서 필드 자동 추출')}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenToolbarMenu((m) => (m === 'export' ? null : 'export'))}
              className={`p-1.5 rounded-md border text-xs font-semibold flex items-center justify-center cursor-pointer transition-colors shrink-0 ${
                openToolbarMenu === 'export'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
              title={t('Export Specification', '사양서 내보내기')}
              aria-label={t('Export Specification', '사양서 내보내기')}
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
            </button>
            {openToolbarMenu === 'export' && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-40 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setOpenToolbarMenu(null);
                    setIsPdfModalOpen(true);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-blue-50 text-slate-800 flex items-center gap-2 cursor-pointer"
                >
                  <FileDown className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>{t('Export PDF', 'PDF 내보내기')}</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setOpenToolbarMenu(null);
                    try {
                      const filename = await exportSpecificationDocx(spec);
                      onNotify?.(t(`Downloaded Word (.docx) spec: ${filename}`, `Word (.docx) 사양서 다운로드 완료: ${filename}`));
                    } catch (err) {
                      console.error('DOCX export error:', err);
                      onNotify?.(t('Failed to generate Word (.docx) document.', 'Word (.docx) 문서 생성에 실패했습니다.'));
                    }
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-sky-50 text-slate-800 flex items-center gap-2 cursor-pointer"
                >
                  <FileType2 className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span>{t('Word Document (.docx)', 'Word 문서 (.docx)')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenToolbarMenu(null);
                    try {
                      const filename = exportSpecificationXlsx(spec);
                      onNotify?.(t(`Downloaded Excel (.xlsx) spec: ${filename}`, `Excel (.xlsx) 사양서 다운로드 완료: ${filename}`));
                    } catch (err) {
                      console.error('XLSX export error:', err);
                      onNotify?.(t('Failed to generate Excel (.xlsx) workbook.', 'Excel (.xlsx) 통합 문서 생성에 실패했습니다.'));
                    }
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-teal-50 text-slate-800 flex items-center gap-2 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span>{t('Excel Workbook (.xlsx)', 'Excel 통합 문서 (.xlsx)')}</span>
                </button>
                {onTriggerPrint && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenToolbarMenu(null);
                      onTriggerPrint();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-800 flex items-center gap-2 cursor-pointer border-t border-slate-100 mt-1 pt-2"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span>{t('Print Preview', '인쇄 미리보기')}</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* More Actions Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenToolbarMenu((m) => (m === 'more' ? null : 'more'))}
              className={`p-1.5 rounded-md border text-xs flex items-center justify-center cursor-pointer transition-colors ${
                openToolbarMenu === 'more'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
              title={t('Copy, Templates & Switch Spec', '복사, 템플릿 및 사양 전환')}
              aria-label={t('More Actions', '더 보기')}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {openToolbarMenu === 'more' && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-slate-200 p-1.5 z-40 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setOpenToolbarMenu(null);
                    setIsCopyModalOpen(true);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-blue-50 text-slate-800 flex items-center gap-2 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span>{t('Copy to Project', '프로젝트로 복사')}</span>
                </button>
                {onOpenTemplates && (
                  <button
                    type="button"
                    onClick={() => {
                      setOpenToolbarMenu(null);
                      onOpenTemplates();
                    }}
                    className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-800 flex items-center gap-2 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span>{t('Manage Templates', '템플릿 관리')}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setOpenToolbarMenu(null);
                    setIsSpecManagerOpen(true);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-slate-100 text-slate-800 flex items-center gap-2 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span>{t('Switch Saved Spec', '저장된 사양 전환')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Slim 1-Line Protection Strip (when read-only) */}
      {isReadOnlyCommon && (
        <div
          title={t('Standard samples in COMM are read-only to protect templates. Copy to a project to edit.', 'COMM 표준 샘플은 원본 보호를 위해 읽기 전용입니다. 프로젝트로 복사 후 편집하세요.')}
          className="px-4 py-1.5 bg-blue-50 border-b border-blue-200 text-[11px] text-blue-900 flex items-center justify-between gap-2 shrink-0"
        >
          <span className="flex items-center gap-1.5 font-medium truncate">
            <Lock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>{t('COMM Standard Sample (Read-Only)', 'COMM 표준 샘플 (읽기 전용)')}</span>
          </span>
          <button
            type="button"
            onClick={() => setIsCopyModalOpen(true)}
            title={t('Copy to Project', '프로젝트로 복사')}
            aria-label={t('Copy to Project', '프로젝트로 복사')}
            className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded flex items-center justify-center shrink-0 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {isLockedApproved && !isReadOnlyCommon && (
        <div
          title={t('Specification is approved/QA-passed and locked. Only PM or ADMIN roles can unlock to edit.', '승인(Approved)/QA 통과로 잠긴 사양서입니다. PM 또는 ADMIN 권한만 수정/잠금 해제할 수 있습니다.')}
          className="px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-900 flex items-center gap-1.5 font-medium shrink-0"
        >
          <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span>{t(`Approved Lock — Read-Only (${effectiveProjectRole})`, `승인 잠금 — 읽기 전용 (${effectiveProjectRole})`)}</span>
        </div>
      )}

      {/* Editor Content Area */}
      <div className="flex-1 p-4 overflow-y-auto">
        {/* ========================================================================= */}
        {/* MAIN TAB 1: Program Info & Logic                                          */}
        {/* ========================================================================= */}
        {mainTab === 'info' && (
          <div className="space-y-4 max-w-4xl">
            {/* Program Spec Sub-Tab Navigation */}
            <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
              <button
                type="button"
                onClick={() => setSpecSubTab('basic')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                  specSubTab === 'basic'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{t('Info & Logic', '기본 정보 · 로직')}</span>
              </button>
              <button
                type="button"
                onClick={() => setSpecSubTab('flow')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                  specSubTab === 'flow'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{t('Flowchart', '흐름도')}</span>
              </button>
              <button
                type="button"
                onClick={() => setSpecSubTab('governance')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                  specSubTab === 'governance'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{t('Quality & Security', '품질 · 보안')}</span>
                {governanceIssueCount > 0 && (
                  <span
                    className={`text-[10px] px-1.5 rounded-full font-mono ${
                      specSubTab === 'governance'
                        ? 'bg-blue-700 text-white'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {governanceIssueCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSpecSubTab('review')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                  specSubTab === 'review'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{t('Review', '리뷰')}</span>
                {unresolvedReviewCount > 0 && (
                  <span
                    className={`text-[10px] px-1.5 rounded-full font-mono ${
                      specSubTab === 'review'
                        ? 'bg-blue-700 text-white'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {unresolvedReviewCount}
                  </span>
                )}
              </button>
            </div>

            {specSubTab === 'basic' && (
              <div className="space-y-4">
                {/* Workflow Lifecycle & Revision Snapshots */}
                <SpecLifecycleBar
                  spec={spec}
                  currentUserName={activeUser.name}
                  projectRole={effectiveProjectRole}
                  isReadOnlyCommon={isReadOnlyCommon}
                  onChange={(updated) => {
                    if (isReadOnlyCommon) return;
                    onChange(updated);
                  }}
                  onOpenDiffModal={() => setIsDiffModalOpen(true)}
                />

                {/* Origin Meeting Traceability Link (if derived from meeting) */}
                {spec.source_meeting_id && (
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => onOpenMeetingMinute?.(spec.source_meeting_id!)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                      title={t('Open Source Meeting Minutes', '원본 회의록 열기')}
                    >
                      <MessageSquareText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>
                        {t('Source Meeting:', '원본 회의록:')} {spec.source_meeting_title || spec.source_meeting_id}
                      </span>
                      <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                    </button>
                  </div>
                )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Required Project Assignment Field */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    {t('Project', '프로젝트')} <span className="text-red-500 font-bold">*</span>
                  </label>
                  {isReadOnlyCommon ? (
                    <span className="text-[10px] font-medium text-blue-700">
                      {t('COMM Read-Only', 'COMM 읽기 전용')}
                    </span>
                  ) : !spec.project_code ? (
                    <span className="text-[10px] font-semibold text-rose-600">
                      {t('Required', '필수')}
                    </span>
                  ) : null}
                </div>
                <div className="relative">
                  <FolderKanban className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2 pointer-events-none z-10" />
                  <InspectableSelect
                    isReadOnly={isEffectiveReadOnly}
                    required
                    value={spec.project_code || ''}
                    onChange={(e) => {
                      if (!isEffectiveReadOnly) {
                        safeOnChange({ ...spec, project_code: e.target.value });
                      }
                    }}
                    aria-label={t('Project', '프로젝트')}
                    className={`w-full pl-8 pr-3 py-1.5 rounded text-xs font-semibold transition-colors cursor-pointer ${
                      isEffectiveReadOnly ? 'bg-slate-100 text-slate-600' : ''
                    } ${
                      !spec.project_code
                        ? 'bg-rose-50 border-2 border-rose-400 text-rose-900'
                        : 'bg-slate-50 border border-slate-300 text-slate-900 focus:bg-white focus:border-blue-500'
                    }`}
                  >
                    <option value="" disabled>
                      {t('Select Project (Required)...', '프로젝트 선택 (필수)...')}
                    </option>
                    {accessibleProjects.map((p) => {
                      if (!isReadOnlyCommon && p.code === COMMON_PROJECT_CODE && spec.project_code !== COMMON_PROJECT_CODE) {
                        return null;
                      }
                      return (
                        <option key={p.code} value={p.code}>
                          [{p.code}] {p.name}
                          {p.code === TEMP_PROJECT_CODE ? t(' (Private)', ' (개인)') : ''}
                        </option>
                      );
                    })}
                  </InspectableSelect>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Program ID <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  type="text"
                  required
                  readOnly={isEffectiveReadOnly}
                  value={spec.program_id}
                  onChange={(e) => {
                    if (!isEffectiveReadOnly) safeOnChange({ ...spec, program_id: e.target.value });
                  }}
                  onBlur={(e) => {
                    if (!isEffectiveReadOnly) {
                      safeOnChange({ ...spec, program_id: e.target.value.trim().toUpperCase() });
                    }
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs font-mono font-bold text-blue-900 uppercase focus:bg-white focus:border-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('Sample Type', '샘플 유형')}
                </label>
                <InspectableSelect
                  isReadOnly={isEffectiveReadOnly}
                  aria-label={t('Sample Type', '샘플 유형')}
                  value={spec.sample_type || '01'}
                  onChange={(e) => handleSampleTypeChange(e.target.value)}
                  className={`w-full border rounded px-2.5 py-1.5 text-xs font-semibold shadow-xs cursor-pointer ${
                    isEffectiveReadOnly
                      ? 'bg-slate-100 border-slate-300 text-slate-600'
                      : 'bg-blue-50/70 border-blue-300 text-blue-950 focus:bg-white focus:border-blue-500'
                  }`}
                >
                  <option value="01">{t('01 (Single ALV Grid)', '01 (단일 ALV 그리드)')}</option>
                  <option value="02">{t('02 (Master-Detail ALV)', '02 (마스터-디테일 ALV)')}</option>
                  <option value="03">{t('03 (Tree ALV Grid)', '03 (트리 ALV 그리드)')}</option>
                  <option value="04">{t('04 (Pivot Browser)', '04 (피벗 브라우저)')}</option>
                </InspectableSelect>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('Module', '모듈')}
                </label>
                <InspectableSelect
                  isReadOnly={isEffectiveReadOnly}
                  aria-label={t('Module', '모듈')}
                  value={spec.module}
                  onChange={(e) => {
                    if (!isEffectiveReadOnly) safeOnChange({ ...spec, module: e.target.value as SapModule });
                  }}
                  className={`w-full border border-slate-300 rounded px-3 py-1.5 text-xs font-semibold focus:bg-white focus:border-blue-500 ${
                    isEffectiveReadOnly ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-800'
                  }`}
                >
                  <option value="SD">{t('SD (Sales & Distribution)', 'SD (영업·출하)')}</option>
                  <option value="MM">{t('MM (Materials Management)', 'MM (구매·자재)')}</option>
                  <option value="FI">{t('FI (Financial Accounting)', 'FI (재무회계)')}</option>
                  <option value="CO">{t('CO (Controlling)', 'CO (관리회계)')}</option>
                  <option value="PP">{t('PP (Production Planning)', 'PP (생산관리)')}</option>
                  <option value="HR">{t('HR (Human Resources)', 'HR (인사관리)')}</option>
                  <option value="QM">{t('QM (Quality Management)', 'QM (품질관리)')}</option>
                  <option value="PM">{t('PM (Plant Maintenance)', 'PM (설비보전)')}</option>
                  <option value="BC">{t('BC (Basis & System)', 'BC (Basis·시스템)')}</option>
                  <option value="CM">{t('CM (Common)', 'CM (공통 영역)')}</option>
                </InspectableSelect>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('Target SAP Release', '대상 SAP 릴리즈')}
                </label>
                <input
                  type="text"
                  readOnly={isEffectiveReadOnly}
                  value={spec.target_sap_release}
                  onChange={(e) => {
                    if (!isEffectiveReadOnly) safeOnChange({ ...spec, target_sap_release: e.target.value });
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs font-medium text-slate-800 focus:bg-white focus:border-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
                />
              </div>

              {/* Transaction Code Field with Single Inline Indicator + Tooltip */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1 gap-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    {t('Transaction Code (T-Code)', '트랜잭션 코드 (T-Code)')} <span className="text-red-500 font-bold">*</span>
                  </label>
                  {tcodeValidation.isValid ? (
                    <span
                      title={t('Follows SAP customer namespace rules (Z/Y).', 'SAP 고객 네임스페이스 규칙(Z/Y)을 준수합니다.')}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 cursor-help"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{t('Standard', '표준 준수')}</span>
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span
                        title={`${tcodeValidation.message} (${tcodeValidation.details})`}
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold cursor-help ${
                          tcodeValidation.severity === 'error' ? 'text-rose-700' : 'text-amber-700'
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>{t('Check Z/Y Rule', 'Z/Y 규칙 확인')}</span>
                      </span>
                      {!isEffectiveReadOnly && tcodeValidation.suggestedTCode && (
                        <button
                          type="button"
                          onClick={() => {
                            const fixed = tcodeValidation.suggestedTCode!;
                            safeOnChange({ ...spec, tcode: fixed });
                            onNotify?.(t(`T-Code updated to standard '${fixed}'.`, `T-Code가 표준 '${fixed}'(으)로 변경되었습니다.`));
                          }}
                          title={t(`Apply customer namespace '${tcodeValidation.suggestedTCode}'`, `고객 네임스페이스 '${tcodeValidation.suggestedTCode}' 적용`)}
                          className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-0.5 cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>{t(`Auto-Fix (${tcodeValidation.suggestedTCode})`, `자동 보정 (${tcodeValidation.suggestedTCode})`)}</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    required
                    readOnly={isEffectiveReadOnly}
                    value={spec.tcode}
                    onChange={(e) => {
                      if (!isEffectiveReadOnly) safeOnChange({ ...spec, tcode: e.target.value });
                    }}
                    onBlur={(e) => {
                      if (isEffectiveReadOnly) return;
                      const formatted = e.target.value.trim().toUpperCase();
                      safeOnChange({ ...spec, tcode: formatted });
                    }}
                    className={`w-full rounded px-3 py-1.5 text-xs font-mono font-bold uppercase transition-colors pr-8 read-only:bg-slate-100 read-only:text-slate-600 ${
                      !tcodeValidation.isValid
                        ? tcodeValidation.severity === 'error'
                          ? 'bg-rose-50/70 border-2 border-rose-400 text-rose-950 focus:bg-white focus:border-rose-600'
                          : 'bg-amber-50/70 border-2 border-amber-400 text-amber-950 focus:bg-white focus:border-amber-600'
                        : 'bg-slate-50 border border-slate-300 text-blue-900 focus:bg-white focus:border-blue-500'
                    }`}
                    placeholder={t('e.g., ZSD01, YMM01', '예: ZSD01, YMM01')}
                  />
                  <div
                    className="absolute right-2.5 top-2 pointer-events-none"
                    title={tcodeValidation.isValid ? t('SAP Standard Compliant', 'SAP 표준 준수') : tcodeValidation.message}
                  >
                    {tcodeValidation.isValid ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle
                        className={`w-3.5 h-3.5 ${
                          tcodeValidation.severity === 'error' ? 'text-rose-600' : 'text-amber-600'
                        }`}
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('Program Title', '프로그램 제목')} <span className="text-red-500 font-bold">*</span>
                </label>
                <input
                  type="text"
                  required
                  readOnly={isEffectiveReadOnly}
                  value={spec.title}
                  onChange={(e) => {
                    if (!isEffectiveReadOnly) safeOnChange({ ...spec, title: e.target.value });
                  }}
                  className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs font-medium text-slate-800 focus:bg-white focus:border-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
                />
              </div>

              <div className={spec.sample_type === '04' ? 'md:col-span-2' : 'md:col-span-2'}>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('Author', '작성자')} <span className="text-red-500 font-bold">*</span>
                </label>
                {(() => {
                  const cleanAuthor =
                    spec.author && !isLegacyRemovedUserName(spec.author)
                      ? spec.author
                      : DEFAULT_OPERATOR_USER.name;
                  const authorInList = registeredUsers.some((u) => u.name === cleanAuthor);
                  return (
                    <InspectableSelect
                      isReadOnly={isEffectiveReadOnly}
                      required
                      value={authorInList ? cleanAuthor : DEFAULT_OPERATOR_USER.name}
                      onChange={(e) => {
                        if (!isEffectiveReadOnly) safeOnChange({ ...spec, author: e.target.value });
                      }}
                      aria-label={t('Author', '작성자')}
                      className={`w-full border border-slate-300 rounded px-3 py-1.5 text-xs font-medium focus:bg-white focus:border-blue-500 cursor-pointer ${
                        isEffectiveReadOnly ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-800'
                      }`}
                    >
                      {registeredUsers.map((u) => (
                        <option key={u.id} value={u.name}>
                          {u.name}
                        </option>
                      ))}
                    </InspectableSelect>
                  );
                })()}
              </div>

              {/* Sample Type 04 only: CDS View/Table required field (RFQ v1.20 Page 3 & v1.21) */}
              {spec.sample_type === '04' && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {t('CDS View/Table', 'CDS View / 테이블')} <span className="text-red-500 font-bold">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    readOnly={isEffectiveReadOnly}
                    value={spec.cds_view_table || ''}
                    onChange={(e) => {
                      if (!isEffectiveReadOnly) safeOnChange({ ...spec, cds_view_table: e.target.value.toUpperCase() });
                    }}
                    placeholder={t('e.g., ACDOCA, BSEG, I_JournalEntryItem', '예: ACDOCA, BSEG, I_JournalEntryItem')}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-3 py-1.5 text-xs font-mono font-bold uppercase text-blue-900 focus:bg-white focus:border-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
                  />
                </div>
              )}
            </div>

            {/* Business Purpose */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {t('Business Purpose', '업무 목적 (Business Purpose)')}
              </label>

              <MarkdownFieldEditor
                isReadOnly={isEffectiveReadOnly}
                value={spec.business_purpose}
                onChange={(val) => safeOnChange({ ...spec, business_purpose: val })}
                rows={4}
                minHeight="120px"
                placeholder={t(
                  'Document business context, purpose, target users, and expected impact in Markdown (# Heading, - List, **Bold**, `Code`).',
                  '업무 배경, 목적, 주요 사용자 및 기대 효과를 마크다운(# 제목, - 목록, **굵게**, `코드`)으로 작성하세요.'
                )}
                aiContext={{
                  section: 'business_purpose',
                  sectionTitle: t('Business Purpose', '업무 목적'),
                  spec,
                }}
              />
            </div>

            {/* Data Extraction & Logic */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  {t('Data Extraction & Logic', '데이터 추출 및 가공 로직')}
                </label>
                {!isEffectiveReadOnly && (
                  <button
                    type="button"
                    onClick={() => setAiReverseExtractFocus('all')}
                    className="p-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition-colors shadow-2xs cursor-pointer flex items-center justify-center"
                    title={t('AI Extract Selection & Fields from Logic', '로직에서 조회 조건 및 필드 AI 자동 추출')}
                    aria-label={t('AI Extract Selection & Fields from Logic', '로직에서 조회 조건 및 필드 AI 자동 추출')}
                  >
                    <GitPullRequestCreate className="w-3.5 h-3.5 text-indigo-600" />
                  </button>
                )}
              </div>

              <MarkdownFieldEditor
                isReadOnly={isEffectiveReadOnly}
                value={spec.data_extraction_logic}
                onChange={(val) => safeOnChange({ ...spec, data_extraction_logic: val })}
                rows={7}
                minHeight="180px"
                placeholder={t(
                  'Document source DB tables, JOIN/WHERE criteria, traffic-light status logic (LIGHTS=1/2/3), and aggregation rules in Markdown (# Heading, - List, `Table/Field`).',
                  '원천 DB 테이블, JOIN/WHERE 조건, 신호등 상태 로직(LIGHTS=1/2/3), 집계 규칙을 마크다운(# 제목, - 목록, `테이블/필드`)으로 기술하세요.'
                )}
                aiContext={{
                  section: 'data_extraction_logic',
                  sectionTitle: t('Data Extraction & Logic', '데이터 추출 및 가공 로직'),
                  spec,
                }}
              />
            </div>

              </div>
            )}

            {/* Sub-Tab 2: Data Flow Diagram */}
            {specSubTab === 'flow' && (
              <div className="space-y-4">
                <DataFlowEditor
                  isReadOnly={isEffectiveReadOnly}
                  spec={spec}
                  onChange={(updatedFlow) => safeOnChange({ ...spec, data_flow: updatedFlow })}
                />
              </div>
            )}

            {/* Sub-Tab 3: SAP Governance, S/4HANA, Authority & SE91 */}
            {specSubTab === 'governance' && (
              <SpecGovernancePanel
                spec={spec}
                isReadOnly={isEffectiveReadOnly}
                onChange={safeOnChange}
              />
            )}

            {/* Sub-Tab 4: Section-Based Review Comments */}
            {specSubTab === 'review' && (
              <SpecReviewCommentsPanel
                spec={spec}
                currentUserName={activeUser.name}
                currentUserId={activeUser.id}
                projectRole={effectiveProjectRole}
                isReadOnly={isReadOnlyCommon}
                onCommentsUpdated={() => {
                  setLocalCommentTick((t) => t + 1);
                  onCommentsChanged?.();
                }}
                onNotify={onNotify}
              />
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* MAIN TAB 2: Selection Screen                                              */}
        {/* ========================================================================= */}
        {mainTab === 'selection' && (
          <div>
            <SelectionScreenEditor
              isReadOnly={isEffectiveReadOnly}
              spec={spec}
              onChange={(updatedParams) => {
                safeOnChange({ ...spec, selection_params: updatedParams });
              }}
              onAddParam={handleAddSelectionParam}
              onOpenAiExtract={() => {
                if (!isEffectiveReadOnly) setAiReverseExtractFocus('selection');
              }}
            />
          </div>
        )}

        {/* Modal for Dynamically Adding Selection Parameter with Field Name, Data Type, and Length */}
        {showAddParamModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-400" />
                  <h4 className="text-sm font-bold">
                    {newParamForm.kind === 'PARAMETER'
                      ? t('Add Parameters (Single Value) Field', 'Parameters (단일 값) 필드 추가')
                      : t('Add Select-options (Range) Field', 'Select-options (범위) 필드 추가')}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddParamModal(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick SAP Field Presets */}
              <div className="px-5 pt-3 pb-1 bg-slate-50 border-b border-slate-200 text-xs">
                <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                  {t('Quick Preset Application:', '빠른 프리셋 적용:')}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: t('P_BUKRS (Company Code)', 'P_BUKRS (회사코드)'), kind: 'PARAMETER' as SelectionKind, name: 'P_BUKRS', datatype: 'CHAR' as SapDataType, length: 4, text: t('Company Code', '회사코드'), ref_table: 'T001', ref_field: 'BUKRS', obligatory: true, default_val: '1000' },
                    { label: t('S_ERDAT (Doc Date)', 'S_ERDAT (전기일)'), kind: 'SELECT_OPTION' as SelectionKind, name: 'S_ERDAT', datatype: 'DATS' as SapDataType, length: 8, text: t('Document Date', '전기일자'), ref_table: 'VBAK', ref_field: 'ERDAT', obligatory: false, default_val: '' },
                    { label: t('S_VBELN (Sales Order)', 'S_VBELN (판매오더)'), kind: 'SELECT_OPTION' as SelectionKind, name: 'S_VBELN', datatype: 'CHAR' as SapDataType, length: 10, text: t('Sales Order Number', '판매오더 번호'), ref_table: 'VBAK', ref_field: 'VBELN', obligatory: false, default_val: '' },
                    { label: t('P_WERKS (Plant)', 'P_WERKS (플랜트)'), kind: 'PARAMETER' as SelectionKind, name: 'P_WERKS', datatype: 'CHAR' as SapDataType, length: 4, text: t('Plant', '플랜트'), ref_table: 'T001W', ref_field: 'WERKS', obligatory: true, default_val: '1000' },
                    { label: t('S_MATNR (Material)', 'S_MATNR (자재번호)'), kind: 'SELECT_OPTION' as SelectionKind, name: 'S_MATNR', datatype: 'CHAR' as SapDataType, length: 18, text: t('Material Number', '자재 번호'), ref_table: 'MARA', ref_field: 'MATNR', obligatory: false, default_val: '' },
                    { label: t('P_VKORG (Sales Org)', 'P_VKORG (영업조직)'), kind: 'PARAMETER' as SelectionKind, name: 'P_VKORG', datatype: 'CHAR' as SapDataType, length: 4, text: t('Sales Organization', '영업조직'), ref_table: 'VBAK', ref_field: 'VKORG', obligatory: true, default_val: '1000' },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() => setNewParamForm({ ...preset })}
                      className="px-2 py-0.5 bg-white hover:bg-blue-50 hover:border-blue-300 border border-slate-200 rounded text-[11px] font-mono text-slate-700 transition-colors cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddSelectionParam(newParamForm);
                  setShowAddParamModal(false);
                }}
                className="p-5 space-y-4 text-xs"
              >
                {/* Kind Toggle */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{t('Kind', '유형')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewParamForm((f) => ({
                          ...f,
                          kind: 'PARAMETER',
                          name: f.name.startsWith('S_') ? f.name.replace(/^S_/, 'P_') : f.name,
                        }));
                      }}
                      className={`py-1.5 px-3 rounded border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                        newParamForm.kind === 'PARAMETER'
                          ? 'bg-amber-100 border-amber-400 text-amber-900 ring-1 ring-amber-400'
                          : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span>{t('PARAMETERS (Single Input)', 'PARAMETERS (단일 입력)')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewParamForm((f) => ({
                          ...f,
                          kind: 'SELECT_OPTION',
                          name: f.name.startsWith('P_') ? f.name.replace(/^P_/, 'S_') : f.name,
                        }));
                      }}
                      className={`py-1.5 px-3 rounded border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                        newParamForm.kind === 'SELECT_OPTION'
                          ? 'bg-blue-100 border-blue-400 text-blue-900 ring-1 ring-blue-400'
                          : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span>{t('SELECT-OPTIONS (Range Input)', 'SELECT-OPTIONS (범위 입력)')}</span>
                    </button>
                  </div>
                </div>

                {/* Field Name & Data Type & Length */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('Field Name', '필드명')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newParamForm.name}
                      onChange={(e) =>
                        setNewParamForm({ ...newParamForm, name: e.target.value.toUpperCase() })
                      }
                      placeholder={newParamForm.kind === 'PARAMETER' ? 'P_BUKRS' : 'S_VBELN'}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono font-bold text-blue-950 uppercase focus:bg-white focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('Data Type', '데이터 타입')} <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={newParamForm.datatype}
                      onChange={(e) => {
                        const dt = e.target.value as SapDataType;
                        const defaultLen = dt === 'DATS' ? 8 : dt === 'TIMS' ? 6 : dt === 'UNIT' ? 3 : dt === 'CURR' ? 15 : dt === 'STRING' ? 255 : 10;
                        setNewParamForm({
                          ...newParamForm,
                          datatype: dt,
                          length: defaultLen,
                        });
                      }}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono text-slate-800 focus:bg-white focus:border-blue-500"
                    >
                      <option value="CHAR">CHAR ({t('Character String', '문자열')})</option>
                      <option value="NUMC">NUMC ({t('Numeric Text', '숫자 텍스트')})</option>
                      <option value="DATS">DATS ({t('Date YYYYMMDD', '일자 YYYYMMDD')})</option>
                      <option value="TIMS">TIMS ({t('Time HHMMSS', '시간 HHMMSS')})</option>
                      <option value="CURR">CURR ({t('Currency Amount', '통화 금액')})</option>
                      <option value="DEC">DEC ({t('Decimal Number', '소수점 숫자')})</option>
                      <option value="INT4">INT4 ({t('4-byte Integer', '4바이트 정수')})</option>
                      <option value="UNIT">UNIT ({t('Unit of Measure', '단위')})</option>
                      <option value="STRING">STRING ({t('Variable Length', '가변 길이')})</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('Length', '길이')} <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={255}
                      required
                      value={newParamForm.length}
                      onChange={(e) =>
                        setNewParamForm({
                          ...newParamForm,
                          length: Math.max(1, parseInt(e.target.value) || 1),
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono text-center text-slate-800 focus:bg-white focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Screen Text */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {t('Screen Text (Label)', '화면 라벨 (Screen Text)')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newParamForm.text}
                    onChange={(e) => setNewParamForm({ ...newParamForm, text: e.target.value })}
                    placeholder={t('e.g., Company Code, Document Date, Sales Order', '예: 회사코드, 전기일자, 판매오더')}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-800 focus:bg-white focus:border-blue-500"
                  />
                </div>

                {/* Reference Table & Field with Search Help (F4) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-700">{t('Reference Table & Field', '참조 테이블 및 필드')}</span>
                    <button
                      type="button"
                      onClick={() => setShowParamSearchHelp(true)}
                      className="text-[11px] font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Search className="w-3 h-3 text-blue-600" />
                      <span>{t('Search Help (F4)', '검색 도움말 (F4)')}</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <input
                        type="text"
                        value={newParamForm.ref_table}
                        onChange={(e) =>
                          setNewParamForm({ ...newParamForm, ref_table: e.target.value.toUpperCase() })
                        }
                        placeholder={t('Ref Table (e.g., VBAK)', '참조 테이블 (예: VBAK)')}
                        className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono uppercase text-slate-800 focus:bg-white focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        value={newParamForm.ref_field}
                        onChange={(e) =>
                          setNewParamForm({ ...newParamForm, ref_field: e.target.value.toUpperCase() })
                        }
                        placeholder={t('Ref Field (e.g., VBELN)', '참조 필드 (예: VBELN)')}
                        className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono uppercase text-slate-800 focus:bg-white focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Obligatory & Default Value */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {t('Default Value', '기본값')}
                    </label>
                    <input
                      type="text"
                      value={newParamForm.default_val}
                      onChange={(e) =>
                        setNewParamForm({ ...newParamForm, default_val: e.target.value })
                      }
                      placeholder={t('e.g., 1000, 2026.01.01', '예: 1000, 2026.01.01')}
                      className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-slate-800 focus:bg-white focus:border-blue-500"
                    />
                  </div>
                  <div className="flex items-center pt-6">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-800 font-semibold select-none">
                      <input
                        type="checkbox"
                        checked={newParamForm.obligatory}
                        onChange={(e) =>
                          setNewParamForm({ ...newParamForm, obligatory: e.target.checked })
                        }
                        className="w-4 h-4 accent-red-600 rounded"
                      />
                      <span>{t('OBLIGATORY (Required)', 'OBLIGATORY (필수 입력)')}</span>
                    </label>
                  </div>
                </div>

                {/* Modal Buttons */}
                <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddParamModal(false)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold cursor-pointer"
                  >
                    {t('Cancel', '취소')}
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{t('Add Field', '필드 추가')}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Search Help (F4) Modal for Selection Parameters */}
        <SapSearchHelpModal
          isOpen={showParamSearchHelp}
          onClose={() => setShowParamSearchHelp(false)}
          onSelect={(selected) => {
            setNewParamForm((prev) => ({
              ...prev,
              ref_table: selected.table,
              ref_field: selected.field,
              datatype: selected.datatype,
              length: selected.length,
              text: selected.label,
              name: prev.kind === 'PARAMETER' ? `P_${selected.field}` : `S_${selected.field}`,
            }));
          }}
        />

        {/* ========================================================================= */}
        {/* MAIN TAB 3: ALV 그리드 (Layout -> Field Catalog -> Toolbar -> Test Case)  */}
        {/* ========================================================================= */}
        {mainTab === 'alv' && (
          <div className="space-y-5">
            {/* Master-Detail ALV Sub-Grid Selector (Sample Type 02) */}
            {isMasterDetail && (
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-gradient-to-r from-blue-50 to-indigo-50/60 border border-blue-200 rounded-lg shadow-2xs">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveGridTab('header')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeGridTab === 'header'
                        ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400/30'
                        : 'bg-white text-slate-700 hover:bg-blue-100/70 border border-slate-300'
                    }`}
                  >
                    <span>{spec.sample_type === '03' ? t('Tree', '트리') : t('Header', '헤더')}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        activeGridTab === 'header' ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {spec.field_catalog.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveGridTab('item')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                      activeGridTab === 'item'
                        ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-400/30'
                        : 'bg-white text-slate-700 hover:bg-blue-100/70 border border-slate-300'
                    }`}
                  >
                    <span>{spec.sample_type === '03' ? t('Grid', '그리드') : t('Item', '아이템')}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        activeGridTab === 'item' ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {spec.item_grid?.field_catalog?.length || 0}
                    </span>
                  </button>
                </div>

                <div className="text-[11px] text-blue-900 font-medium px-2">
                  {spec.sample_type === '03'
                    ? activeGridTab === 'header'
                      ? t('Editing [Tree] (Carrier Hierarchy)', '[트리] 편집 중 (항공사 계층 구조)')
                      : t('Editing [Grid] (Flight Schedule)', '[그리드] 편집 중 (항공편 일정)')
                    : activeGridTab === 'header'
                    ? t('Editing [Header]', '[헤더] 영역 편집 중')
                    : t(
                        `Editing [Item] (Header Key: ${spec.item_grid?.foreign_key || 'VBELN'})`,
                        `[아이템] 영역 편집 중 (연계 키: ${spec.item_grid?.foreign_key || 'VBELN'})`
                      )}
                </div>
              </div>
            )}

            {/* Sub-Tab Navigation Header */}
            <div className="flex items-center gap-1.5 border-b border-slate-200 pb-2.5 bg-slate-50 p-1.5 rounded-lg overflow-x-auto">
              {/* 1. Layout */}
              <button
                onClick={() => setAlvSubTab('layout')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  alvSubTab === 'layout'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Layout className="w-3.5 h-3.5" />
                <span>{t('Layout', '레이아웃')}</span>
              </button>

              {/* 2. Field Catalog */}
              <button
                onClick={() => setAlvSubTab('fields')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  alvSubTab === 'fields'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>{t('Field Catalog', '필드 카탈로그')}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    alvSubTab === 'fields' ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {activeFieldCatalog.length}
                </span>
              </button>

              {/* 3. Sort (Tree 설정에서는 삭제 per RFQ v1.18) */}
              {!isTreeTab && (
                <button
                  onClick={() => setAlvSubTab('sort')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                    alvSubTab === 'sort'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                  <span>{t('Sort', '정렬')}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      alvSubTab === 'sort' ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {activeFieldCatalog.length}
                  </span>
                </button>
              )}

              {/* 4. Toolbar */}
              <button
                onClick={() => setAlvSubTab('toolbar')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  alvSubTab === 'toolbar'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{t('Toolbar', '툴바')}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    alvSubTab === 'toolbar' ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {toolbarButtonsCount}
                </span>
              </button>

              {/* 4. Test Case */}
              <button
                onClick={() => setAlvSubTab('tests')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                  alvSubTab === 'tests'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>{t('Test Case', '테스트 케이스')}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    alvSubTab === 'tests' ? 'bg-blue-700 text-blue-100' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {activeTestCases.length}
                </span>
              </button>
            </div>

            {/* Sub-Tab 1: Layout (LVC_S_LAYO Full Configuration - Spreadsheet Format with Direct Excel Paste) */}
            {alvSubTab === 'layout' && (
              <div>
                <AlvLayoutSpreadsheet
                  isReadOnly={isEffectiveReadOnly}
                  layout={activeLayout}
                  onChange={(updatedLayout) => updateActiveLayout(updatedLayout)}
                />
              </div>
            )}

            {/* Sub-Tab 2: Field Catalog */}
            {alvSubTab === 'fields' && (
              <div>
                <FieldCatalogEditor
                  isReadOnly={isEffectiveReadOnly}
                  spec={{
                    ...spec,
                    field_catalog: activeFieldCatalog,
                    mock_rows: activeMockRows,
                  }}
                  onChange={(updatedCatalog, updatedMockRows) => {
                    updateActiveFieldCatalog(updatedCatalog, updatedMockRows);
                  }}
                  onReorder={handleReorderFieldCatalog}
                  onOpenAiExtract={() => {
                    if (!isEffectiveReadOnly) setAiReverseExtractFocus('fields');
                  }}
                />
              </div>
            )}

            {/* Sub-Tab 3: Sort */}
            {alvSubTab === 'sort' && !isTreeTab && (
              <div>
                <AlvSortEditor
                  isReadOnly={isEffectiveReadOnly}
                  spec={{
                    ...spec,
                    field_catalog: activeFieldCatalog,
                    mock_rows: activeMockRows,
                  }}
                  onChange={(updatedCatalog, updatedMockRows) => {
                    updateActiveFieldCatalog(updatedCatalog, updatedMockRows);
                  }}
                  onReorder={handleReorderFieldCatalog}
                />
              </div>
            )}

            {/* Sub-Tab 4: Toolbar */}
            {alvSubTab === 'toolbar' && (
              <div>
                <ToolbarEditor
                  isReadOnly={isEffectiveReadOnly}
                  spec={{
                    ...spec,
                    toolbar_buttons: activeToolbarButtons,
                  }}
                  onChange={(updatedButtons) => {
                    updateActiveToolbarButtons(updatedButtons);
                  }}
                />
              </div>
            )}

            {/* Sub-Tab 5: Test Case */}
            {alvSubTab === 'tests' && (
              <div className="space-y-4 max-w-5xl">
                {/* Compact Action Bar with Tooltip */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <span>{t('Test Scenarios & Mock Data', '테스트 시나리오 및 목업 데이터')}</span>
                    <span
                      title={t(
                        'Create validation scenarios or download/upload CSV templates from the current field catalog to preview in the simulator.',
                        '현재 필드 카탈로그 기반으로 검증 시나리오를 작성하거나 CSV 템플릿을 다운로드/업로드하여 시뮬레이터에서 바로 확인할 수 있습니다.'
                      )}
                      className="text-slate-400 hover:text-slate-600 cursor-help"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        downloadExcelTemplate(
                          activeFieldCatalog,
                          `${spec.program_id}_${activeIsItem ? 'ITEM' : 'HEADER'}`
                        );
                      }}
                      className="px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                      title={t('Download CSV template for current field catalog', '현재 필드 카탈로그 기준 CSV 템플릿 다운로드')}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{t('CSV Template', 'CSV 템플릿')}</span>
                    </button>

                    {!isEffectiveReadOnly && (
                      <>
                        <label
                          className="px-2.5 py-1.5 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded-md flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
                          title={t('Upload CSV file to populate simulator test data', '시뮬레이터 테스트 데이터용 CSV 파일 업로드')}
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>{t('Upload CSV', 'CSV 업로드')}</span>
                          <input
                            type="file"
                            accept=".csv,.txt"
                            className="hidden"
                            onChange={handleFileUpload}
                          />
                        </label>

                        <button
                          type="button"
                          onClick={handleAddTestCase}
                          className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t('Add Scenario', '시나리오 추가')}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* 1. Test Scenarios Table */}
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
                  <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 font-bold text-xs text-slate-800 flex items-center justify-between">
                    <span>{t('Test Scenario List', '테스트 시나리오 목록')}</span>
                    <span className="text-[11px] font-normal text-slate-500">
                      {t(`Total ${activeTestCases.length} items`, `총 ${activeTestCases.length}건`)}
                    </span>
                  </div>
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-700 font-semibold text-[11px] border-b border-slate-200">
                      <tr>
                        <th className="p-2.5 w-12 text-center">No</th>
                        <th className="p-2.5 w-48">{t('Scenario (Description)', '시나리오 (설명)')}</th>
                        <th className="p-2.5">{t('Input Condition', '입력 조건')}</th>
                        <th className="p-2.5">{t('Expected Result', '기대 결과')}</th>
                        <th className="p-2.5 w-16 text-center">{t('Delete', '삭제')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-[11px]">
                      {activeTestCases.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-slate-400">
                            {t("No test scenarios registered. Click 'Add Scenario' above to add one.", "등록된 테스트 시나리오가 없습니다. 상단의 '시나리오 추가' 버튼을 눌러 추가하세요.")}
                          </td>
                        </tr>
                      ) : (
                        activeTestCases.map((tc, idx) => (
                          <tr key={tc.id}>
                            <td className="p-2 text-center text-slate-500 font-mono font-bold">
                              {idx + 1}
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                readOnly={isEffectiveReadOnly}
                                value={tc.scenario}
                                onChange={(e) => {
                                  if (isEffectiveReadOnly) return;
                                  const next = [...activeTestCases];
                                  next[idx] = { ...next[idx], scenario: e.target.value };
                                  updateActiveTestCases(next);
                                }}
                                className="w-full bg-slate-50 border border-slate-200 px-2 py-1 rounded focus:bg-white focus:border-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                readOnly={isEffectiveReadOnly}
                                value={tc.condition}
                                onChange={(e) => {
                                  if (isEffectiveReadOnly) return;
                                  const next = [...activeTestCases];
                                  next[idx] = { ...next[idx], condition: e.target.value };
                                  updateActiveTestCases(next);
                                }}
                                className="w-full bg-slate-50 border border-slate-200 px-2 py-1 rounded focus:bg-white focus:border-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
                              />
                            </td>
                            <td className="p-1.5">
                              <input
                                type="text"
                                readOnly={isEffectiveReadOnly}
                                value={tc.expected}
                                onChange={(e) => {
                                  if (isEffectiveReadOnly) return;
                                  const next = [...activeTestCases];
                                  next[idx] = { ...next[idx], expected: e.target.value };
                                  updateActiveTestCases(next);
                                }}
                                className="w-full bg-slate-50 border border-slate-200 px-2 py-1 rounded font-medium text-emerald-900 focus:bg-white focus:border-blue-500 read-only:bg-slate-100 read-only:text-slate-600"
                              />
                            </td>
                            <td className="p-1.5 text-center">
                              <button
                                type="button"
                                disabled={isEffectiveReadOnly}
                                onClick={async () => {
                                  const confirmed = await confirmDelete({
                                    title: t('Delete Test Case', '테스트 케이스 삭제'),
                                    message: t('Are you sure you want to delete this test case?', '삭제하시겠습니까?'),
                                    targetName: tc.scenario ? `#${idx + 1} · ${tc.scenario}` : tc.condition,
                                  });
                                  if (!confirmed) return;
                                  updateActiveTestCases(activeTestCases.filter((_, i) => i !== idx));
                                }}
                                className="p-1 text-slate-400 hover:text-red-600 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                title={t('Delete test case', '테스트 케이스 삭제')}
                                aria-label={t('Delete test case', '테스트 케이스 삭제')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 2. Uploaded Mock Data Preview for ALV Grid */}
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
                  <div className="px-3 py-2 bg-blue-50 border-b border-blue-200 font-bold text-xs text-blue-950 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Table className="w-3.5 h-3.5 text-blue-700" />
                      <span>
                        {t(
                          `ALV Grid Test Data (${activeIsItem ? 'Item Grid' : 'Header Grid'}: ${activeMockRows.length} rows)`,
                          `ALV 그리드 테스트 데이터 (${activeIsItem ? '아이템 그리드' : '헤더 그리드'}: ${activeMockRows.length}건)`
                        )}
                      </span>
                    </div>
                    <span className="text-[11px] text-blue-700 font-normal">
                      {t('Rendered in real-time in the Simulate screen on the right', '우측 시뮬레이션 화면에 실시간 반영됩니다')}
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-60">
                    <table className="w-full text-xs text-left border-collapse whitespace-nowrap">
                      <thead className="bg-slate-100 text-slate-700 font-semibold text-[11px] sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="p-2 w-10 text-center">#</th>
                          {activeFieldCatalog.map((f) => (
                            <th key={f.fieldname} className="p-2 border-r border-slate-200">
                              {f.coltext} <span className="font-mono text-[10px] text-slate-500">[{f.fieldname}]</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px]">
                        {activeMockRows.length === 0 ? (
                          <tr>
                            <td colSpan={activeFieldCatalog.length + 1} className="p-6 text-center text-slate-400">
                              {t(
                                'No test data available. Download the template above and upload CSV, or generate mock data.',
                                '테스트 데이터가 없습니다. 상단 템플릿을 다운로드해 CSV를 업로드하거나 목업 데이터를 생성하세요.'
                              )}
                            </td>
                          </tr>
                        ) : (
                          activeMockRows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-blue-50/40">
                              <td className="p-2 text-center text-slate-400 font-mono font-semibold">
                                {rIdx + 1}
                              </td>
                              {activeFieldCatalog.map((f) => {
                                const val = row[f.fieldname];
                                const isStatusField =
                                  f.fieldname === 'ZICON' ||
                                  f.fieldname === 'STATUS' ||
                                  f.fieldname === 'LIGHTS';

                                return (
                                  <td key={f.fieldname} className="p-2 border-r border-slate-100 font-mono">
                                    {isStatusField ? (
                                      <div className="flex items-center gap-1.5">
                                        {val === '1' || val === 1 ? (
                                          <span className="w-3 h-3 rounded-full bg-emerald-500 border border-emerald-700 inline-block" />
                                        ) : val === '2' || val === 2 ? (
                                          <span className="w-3 h-3 rounded-full bg-amber-400 border border-amber-600 inline-block" />
                                        ) : (
                                          <span className="w-3 h-3 rounded-full bg-rose-500 border border-rose-700 inline-block" />
                                        )}
                                        <span className="text-[10px] text-slate-600 font-bold">
                                          {val === '1'
                                            ? t('Normal(1)', '정상(1)')
                                            : val === '2'
                                            ? t('Warning(2)', '주의(2)')
                                            : t('Error(3)', '오류(3)')}
                                        </span>
                                      </div>
                                    ) : (
                                      <span>{val !== undefined && val !== null ? String(val) : ''}</span>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* jsPDF Specification Export Modal */}
      <PdfExportModal
        isOpen={isPdfModalOpen}
        onClose={() => setIsPdfModalOpen(false)}
        spec={spec}
      />

      {/* Program Spec Manager Modal */}
      <SpecManagerModal
        currentSpec={spec}
        isOpen={isSpecManagerOpen}
        remoteProjects={remoteProjects}
        onClose={() => setIsSpecManagerOpen(false)}
        onSelectSpec={(newSpec) => onChange(newSpec)}
      />

      {/* AI Spec Copilot Modal (Natural Language -> Full Spec Draft / Patch) */}
      <AiSpecCopilotModal
        isOpen={isAiCopilotOpen}
        onClose={() => setIsAiCopilotOpen(false)}
        currentSpec={spec}
        onApplySpec={(generatedSpec) => {
          const targetProj = isReadOnlyCommon
            ? TEMP_PROJECT_CODE
            : spec.project_code || TEMP_PROJECT_CODE;
          onChange({
            ...generatedSpec,
            project_code: targetProj,
            is_system: false,
          });
          onNotify?.(
            t(
              `AI Spec Copilot (${generatedSpec.program_id} / ${generatedSpec.tcode}) applied to project '${targetProj}'.`,
              `AI 사양 코파일럿 (${generatedSpec.program_id} / ${generatedSpec.tcode})이 프로젝트 '${targetProj}'에 적용되었습니다.`
            )
          );
        }}
      />

      {/* Snapshot Diff & Restore Modal */}
      <SpecSnapshotDiffModal
        isOpen={isDiffModalOpen}
        onClose={() => setIsDiffModalOpen(false)}
        currentSpec={spec}
        isReadOnly={isEffectiveReadOnly}
        onRestoreSnapshot={(restored) => {
          safeOnChange(restored);
          onNotify?.(t('Snapshot version restored.', '스냅샷 버전이 복원되었습니다.'));
        }}
      />

      {/* Legacy ABAP / SE11 Reverse Import Modal */}
      <LegacyAbapImportModal
        isOpen={isLegacyImportOpen}
        onClose={() => setIsLegacyImportOpen(false)}
        targetRelease={spec.target_sap_release || 'SAP S/4HANA 2023'}
        currentProjectCode={spec.project_code || TEMP_PROJECT_CODE}
        currentUserName={activeUser.name}
        onImportSpec={(importedSpec) => {
          onChange(importedSpec);
          onNotify?.(
            t(
              `Imported spec '${importedSpec.program_id}' created in project '${importedSpec.project_code}'.`,
              `역공학된 사양 '${importedSpec.program_id}'이(가) 프로젝트 '${importedSpec.project_code}'에 생성되었습니다.`
            )
          );
        }}
      />

      {/* Copy Spec to Target Project Modal */}
      <CopySpecModal
        isOpen={isCopyModalOpen}
        sourceSpec={spec}
        defaultTargetProject={isReadOnlyCommon ? TEMP_PROJECT_CODE : spec.project_code}
        remoteProjects={remoteProjects}
        onClose={() => setIsCopyModalOpen(false)}
        onCopied={(newSpec) => {
          onChange(newSpec);
          onNotify?.(
            t(
              `Spec '${newSpec.program_id}' copied to project '${newSpec.project_code}'.`,
              `사양 '${newSpec.program_id}'이(가) 프로젝트 '${newSpec.project_code}'(으)로 복사되었습니다.`
            )
          );
        }}
      />

      {/* AI Reverse Extract Modal (Logic / Purpose -> Selection Screen & Field Catalog) */}
      <AiReverseExtractModal
        isOpen={aiReverseExtractFocus !== null}
        onClose={() => setAiReverseExtractFocus(null)}
        spec={spec}
        activeFieldCatalog={activeFieldCatalog}
        initialFocus={aiReverseExtractFocus || 'all'}
        onApply={(addedParams, addedFields) => {
          if (isEffectiveReadOnly) {
            onNotify?.(t('Spec is read-only or locked by approval.', '읽기 전용이거나 승인으로 잠긴 사양서입니다.'));
            return;
          }
          const existingParamNames = new Set(spec.selection_params.map((p) => p.name.toUpperCase()));
          const uniqueParams = addedParams.filter((p) => !existingParamNames.has(p.name.toUpperCase()));
          const nextSelectionParams = [...spec.selection_params, ...uniqueParams];

          const existingFieldNames = new Set(activeFieldCatalog.map((f) => f.fieldname.toUpperCase()));
          const uniqueFields = addedFields.filter((f) => !existingFieldNames.has(f.fieldname.toUpperCase()));
          const mergedCatalog = [...activeFieldCatalog, ...uniqueFields].map((f, idx) => ({
            ...f,
            col_pos: idx + 1,
          }));
          const updatedMockRows = backfillMockRowsForFields(
            activeMockRows,
            uniqueFields,
            mergedCatalog
          );

          if (activeIsItem && spec.item_grid) {
            safeOnChange({
              ...spec,
              selection_params: nextSelectionParams,
              item_grid: {
                ...spec.item_grid,
                field_catalog: mergedCatalog,
                mock_rows: updatedMockRows,
              },
            });
          } else {
            safeOnChange({
              ...spec,
              selection_params: nextSelectionParams,
              field_catalog: mergedCatalog,
              mock_rows: updatedMockRows,
            });
          }

          onNotify?.(
            t(
              `AI extraction applied: ${uniqueParams.length} selection params, ${uniqueFields.length} fields added.`,
              `AI 추출 적용 완료: 조회 조건 ${uniqueParams.length}건, 필드 ${uniqueFields.length}건 추가됨.`
            )
          );
        }}
      />
    </div>
  );
};
