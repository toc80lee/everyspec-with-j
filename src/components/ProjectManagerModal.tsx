import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  FolderKanban,
  Plus,
  Save,
  Trash2,
  Lock,
  UserPlus,
  Users,
  Check,
  AlertCircle,
  Code2,
  Mail,
} from 'lucide-react';
import { AbapSyntaxMode, ProjectAbapStandards, SapModule, SapProject } from '../types/sap';
import {
  COMMON_PROJECT_CODE,
  TEMP_PROJECT_CODE,
  enforceProjectMembers,
  getProjects,
  isValidFourCharProjectCode,
  saveProject,
  deleteProject,
} from '../utils/projectStorage';
import { reassignSpecsProjectToTemp } from '../utils/specStorage';
import {
  CurrentUser,
  DEFAULT_OPERATOR_USER,
  USERS_UPDATED_EVENT,
  ensureRegisteredUser,
  getRegisteredUsers,
  isDefaultOperatorUser,
  pruneUnassignedRegisteredUsers,
} from '../utils/authStorage';
import { syncProjectToFirestore } from '../services/firestoreSync';
import { useLanguage } from '../contexts/LanguageContext';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectsChanged: (selectedCode?: string) => void;
  initialProjectCode?: string;
}

const MODULE_OPTIONS: { code: SapModule; labelEn: string; labelKo: string }[] = [
  { code: 'SD', labelEn: 'Sales & Dist.', labelKo: '영업·출하' },
  { code: 'MM', labelEn: 'Materials Mgmt', labelKo: '구매·자재' },
  { code: 'FI', labelEn: 'Financial Acctg', labelKo: '재무회계' },
  { code: 'CO', labelEn: 'Controlling', labelKo: '관리회계' },
  { code: 'PP', labelEn: 'Production', labelKo: '생산관리' },
  { code: 'HR', labelEn: 'Human Capital', labelKo: '인사관리' },
  { code: 'QM', labelEn: 'Quality Mgmt', labelKo: '품질관리' },
  { code: 'PM', labelEn: 'Plant Maint.', labelKo: '설비보전' },
  { code: 'BC', labelEn: 'Basis & System', labelKo: 'Basis·시스템' },
  { code: 'CM', labelEn: 'Cross-Module', labelKo: '공통 영역' },
];
const ALL_MODULES: SapModule[] = MODULE_OPTIONS.map((m) => m.code);

const ROLE_OPTIONS: { value: string; ko: string }[] = [
  { value: 'SAP Functional Consultant', ko: 'SAP 모듈 컨설턴트' },
  { value: 'SAP ABAP Developer', ko: 'SAP ABAP 개발자' },
  { value: 'Project Manager', ko: '프로젝트 관리자 (PM)' },
  { value: 'QA / Release Engineer', ko: 'QA / 배포 담당자' },
];

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  onClose,
  onProjectsChanged,
  initialProjectCode,
}) => {
  const { lang, t } = useLanguage();
  const [registeredUsers, setRegisteredUsers] = useState<CurrentUser[]>(() => getRegisteredUsers());
  const [projects, setProjects] = useState<SapProject[]>([]);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formRelease, setFormRelease] = useState('SAP S/4HANA 2023');
  const [formStartDate, setFormStartDate] = useState('2026-01-01');
  const [formEndDate, setFormEndDate] = useState('2026-12-31');
  const [formOwner, setFormOwner] = useState(DEFAULT_OPERATOR_USER.name);
  const [formMembers, setFormMembers] = useState<string[]>([DEFAULT_OPERATOR_USER.name]);
  const [formModules, setFormModules] = useState<SapModule[]>(['SD', 'MM', 'FI', 'CO']);

  // New project member inputs
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState(ROLE_OPTIONS[0].value);

  const [abapStandards, setAbapStandards] = useState<ProjectAbapStandards>({
    common_top_include: 'zcommtop',
    common_form_include: 'zcommf01',
    grid_class_name: 'cl_gui_alv_grid',
    message_class: 'Z01',
    default_syntax_mode: 'modern_740',
    program_prefix: 'ZR_',
    tcode_pattern: 'Z*',
    dev_package: '$TMP',
  });
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadIntoForm = (proj: SapProject) => {
    const safeOwner = !proj.owner || proj.owner === 'SYSTEM' ? DEFAULT_OPERATOR_USER.name : proj.owner;
    setIsCreatingNew(false);
    setEditingCode(proj.code);
    setFormCode(proj.code);
    setFormName(proj.name);
    setFormDesc(proj.description);
    setFormRelease(proj.target_sap_release);
    setFormStartDate(proj.start_date || '');
    setFormEndDate(proj.end_date || '');
    setFormOwner(safeOwner);
    setFormMembers(
      proj.code === COMMON_PROJECT_CODE || proj.code === TEMP_PROJECT_CODE
        ? [DEFAULT_OPERATOR_USER.name]
        : enforceProjectMembers(proj.members || [], safeOwner)
    );
    setFormModules(proj.modules || ALL_MODULES);
    setAbapStandards({
      common_top_include: proj.abap_standards?.common_top_include || 'zcommtop',
      common_form_include: proj.abap_standards?.common_form_include || 'zcommf01',
      grid_class_name: proj.abap_standards?.grid_class_name || 'cl_gui_alv_grid',
      message_class: proj.abap_standards?.message_class || 'Z01',
      default_syntax_mode: proj.abap_standards?.default_syntax_mode || 'modern_740',
      program_prefix: proj.abap_standards?.program_prefix ?? 'ZR_',
      tcode_pattern: proj.abap_standards?.tcode_pattern ?? 'Z*',
      dev_package: proj.abap_standards?.dev_package ?? '$TMP',
    });
    setNotice(null);
  };

  useEffect(() => {
    if (!isOpen) return;
    setRegisteredUsers(getRegisteredUsers());
    const list = getProjects();
    setProjects(list);
    const target =
      (initialProjectCode && list.find((p) => p.code === initialProjectCode)) ||
      list.find((p) => !p.is_system) ||
      list[0];
    if (target) {
      loadIntoForm(target);
    }
  }, [isOpen, initialProjectCode]);

  useEffect(() => {
    const handleUsersUpdated = () => {
      setRegisteredUsers(getRegisteredUsers());
    };
    window.addEventListener(USERS_UPDATED_EVENT, handleUsersUpdated);
    return () => window.removeEventListener(USERS_UPDATED_EVENT, handleUsersUpdated);
  }, []);

  const isSystemProject =
    !isCreatingNew && (editingCode === COMMON_PROJECT_CODE || editingCode === TEMP_PROJECT_CODE);

  const memberCardEntries = useMemo(() => {
    const userByNameLower = new Map<string, CurrentUser>();
    registeredUsers.forEach((u) => {
      userByNameLower.set(u.name.trim().toLowerCase(), u);
    });

    const sourceNames = isSystemProject
      ? [DEFAULT_OPERATOR_USER.name]
      : enforceProjectMembers(formMembers, formOwner);

    return sourceNames.map((name) => {
      const matched = userByNameLower.get(name.trim().toLowerCase());
      const isDefaultOp = isDefaultOperatorUser(matched || name);
      if (isDefaultOp) {
        return {
          name: DEFAULT_OPERATOR_USER.name,
          email: DEFAULT_OPERATOR_USER.email,
          role: DEFAULT_OPERATOR_USER.role,
          isDefaultOp: true,
        };
      }
      return {
        name: matched?.name || name,
        email: matched?.email || '',
        role: matched?.role || 'SAP Consultant / Developer',
        isDefaultOp: false,
      };
    });
  }, [registeredUsers, formMembers, formOwner, isSystemProject]);

  const suggestedExistingUsers = useMemo(() => {
    const currentLower = new Set(formMembers.map((m) => m.trim().toLowerCase()));
    return registeredUsers.filter(
      (u) => !isDefaultOperatorUser(u) && !currentLower.has(u.name.trim().toLowerCase())
    );
  }, [registeredUsers, formMembers]);

  if (!isOpen) return null;

  const startNewProject = () => {
    setIsCreatingNew(true);
    setEditingCode(null);
    setFormCode('');
    setFormName('');
    setFormDesc('');
    setFormRelease('SAP S/4HANA 2023');
    setFormStartDate('2026-01-01');
    setFormEndDate('2026-12-31');
    setFormOwner(DEFAULT_OPERATOR_USER.name);
    setFormMembers([DEFAULT_OPERATOR_USER.name]);
    setFormModules(['SD', 'MM', 'FI', 'CO']);
    setAbapStandards({
      common_top_include: 'zcommtop',
      common_form_include: 'zcommf01',
      grid_class_name: 'cl_gui_alv_grid',
      message_class: 'Z01',
      default_syntax_mode: 'modern_740',
      program_prefix: 'ZR_',
      tcode_pattern: 'Z*',
      dev_package: 'ZDEV',
    });
    setNotice(null);
  };

  const syncPrunedDirectory = (projectList: SapProject[], extraNames: string[] = []) => {
    const activeNames = new Set<string>(extraNames);
    projectList.forEach((proj) => {
      (proj.members || []).forEach((m) => activeNames.add(m));
      if (proj.owner) activeNames.add(proj.owner);
    });
    const nextUsers = pruneUnassignedRegisteredUsers(activeNames);
    setRegisteredUsers(nextUsers);
  };

  const handleAddUser = () => {
    if (isSystemProject) return;

    const trimmedName = newUserName.trim();
    if (!trimmedName) {
      setNotice({
        type: 'error',
        text: t('Please enter a user name.', '사용자 이름을 입력해 주세요.'),
      });
      return;
    }

    if (isDefaultOperatorUser(trimmedName)) {
      setNotice({
        type: 'error',
        text: t(
          'Josh Lee is already included in every project.',
          'Josh Lee는 모든 프로젝트에 기본으로 포함되어 있습니다.'
        ),
      });
      return;
    }

    if (formMembers.some((m) => m.trim().toLowerCase() === trimmedName.toLowerCase())) {
      setNotice({
        type: 'error',
        text: t(
          `'${trimmedName}' is already a member of this project.`,
          `'${trimmedName}'님은 이미 현재 프로젝트의 멤버입니다.`
        ),
      });
      return;
    }

    const res = ensureRegisteredUser({
      name: trimmedName,
      email: newUserEmail.trim(),
      role: newUserRole,
    });
    if (!res.success || !res.user) {
      setNotice({
        type: 'error',
        text: res.message || t('Failed to add member.', '멤버 추가에 실패했습니다.'),
      });
      return;
    }

    const nextMembers = enforceProjectMembers([...formMembers, res.user.name], formOwner);
    setRegisteredUsers(res.users);
    setFormMembers(nextMembers);
    setNewUserName('');
    setNewUserEmail('');

    if (!isCreatingNew && editingCode) {
      const targetProj = projects.find((p) => p.code === editingCode);
      if (targetProj) {
        const saveRes = saveProject({
          ...targetProj,
          name: formName.trim() || targetProj.name,
          description: formDesc.trim(),
          target_sap_release: formRelease.trim() || targetProj.target_sap_release,
          start_date: formStartDate || undefined,
          end_date: formEndDate || undefined,
          owner: formOwner || targetProj.owner || DEFAULT_OPERATOR_USER.name,
          members: nextMembers,
          modules: formModules,
          abap_standards: abapStandards,
        });
        if (saveRes.success && saveRes.savedProject) {
          syncProjectToFirestore(saveRes.savedProject).catch((err) =>
            console.warn('Firestore project sync notice:', err)
          );
          setProjects(saveRes.list);
          onProjectsChanged(editingCode);
          setNotice({
            type: 'success',
            text: t(
              `Added '${res.user.name}' to project [${editingCode}].`,
              `'${res.user.name}'님을 프로젝트 [${editingCode}] 멤버로 추가했습니다.`
            ),
          });
          return;
        }
      }
    }

    setNotice({
      type: 'success',
      text: t(
        `Added '${res.user.name}' to this project draft. Click Save to create the project.`,
        `'${res.user.name}'님을 새 프로젝트 멤버로 추가했습니다. 저장 시 반영됩니다.`
      ),
    });
  };

  const handleRemoveMember = (memberName: string) => {
    if (isSystemProject || isDefaultOperatorUser(memberName)) return;

    const nextOwner =
      formOwner.trim().toLowerCase() === memberName.trim().toLowerCase()
        ? DEFAULT_OPERATOR_USER.name
        : formOwner;
    const nextMembers = enforceProjectMembers(
      formMembers.filter((m) => m.trim().toLowerCase() !== memberName.trim().toLowerCase()),
      nextOwner
    );

    setFormOwner(nextOwner);
    setFormMembers(nextMembers);

    if (!isCreatingNew && editingCode) {
      const targetProj = projects.find((p) => p.code === editingCode);
      if (targetProj) {
        const saveRes = saveProject({
          ...targetProj,
          owner: nextOwner,
          members: nextMembers,
        });
        if (saveRes.success && saveRes.savedProject) {
          syncProjectToFirestore(saveRes.savedProject).catch((err) =>
            console.warn('Firestore project sync notice:', err)
          );
          setProjects(saveRes.list);
          syncPrunedDirectory(saveRes.list);
          onProjectsChanged(editingCode);
          setNotice({
            type: 'success',
            text: t(
              `Removed '${memberName}' from project [${editingCode}].`,
              `'${memberName}'님을 프로젝트 [${editingCode}]에서 제외했습니다.`
            ),
          });
          return;
        }
      }
    }

    syncPrunedDirectory(projects, nextMembers);
    setNotice({
      type: 'success',
      text: t(
        `Removed '${memberName}' from this project.`,
        `'${memberName}'님을 현재 프로젝트에서 제외했습니다.`
      ),
    });
  };

  const toggleModule = (mod: SapModule) => {
    if (isSystemProject) return;
    setFormModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSystemProject) return;

    const cleanCode = formCode.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!isValidFourCharProjectCode(cleanCode)) {
      setNotice({
        type: 'error',
        text: t(
          'Project code must be exactly 4 characters (A-Z, 0-9, _).',
          '프로젝트 코드는 정확히 4자리 영문/숫자/밑줄(A-Z, 0-9, _)이어야 합니다.'
        ),
      });
      return;
    }
    if (cleanCode === COMMON_PROJECT_CODE || cleanCode === TEMP_PROJECT_CODE) {
      setNotice({
        type: 'error',
        text: t(
          'COMM and TEMP are reserved system project codes.',
          'COMM과 TEMP는 시스템 기본 프로젝트 코드로 사용할 수 없습니다.'
        ),
      });
      return;
    }
    if (formStartDate && formEndDate && formEndDate < formStartDate) {
      setNotice({
        type: 'error',
        text: t(
          'End date must be on or after start date.',
          '종료일은 시작일 이후여야 합니다.'
        ),
      });
      return;
    }

    const enforcedMembers = enforceProjectMembers(formMembers, formOwner);
    const res = saveProject({
      code: cleanCode,
      name: formName,
      description: formDesc,
      visibility: 'project',
      target_sap_release: formRelease,
      start_date: formStartDate || undefined,
      end_date: formEndDate || undefined,
      owner: formOwner || DEFAULT_OPERATOR_USER.name,
      members: enforcedMembers,
      modules: formModules,
      abap_standards: abapStandards,
      is_system: false,
      created_date: new Date().toISOString().split('T')[0],
    });

    if (!res.success || !res.savedProject) {
      setNotice({
        type: 'error',
        text: res.message || t('Failed to save project.', '프로젝트 저장에 실패했습니다.'),
      });
      return;
    }

    syncProjectToFirestore(res.savedProject).catch((err) =>
      console.warn('Firestore project sync notice:', err)
    );
    setProjects(res.list);
    syncPrunedDirectory(res.list);
    loadIntoForm(res.savedProject);
    setNotice({
      type: 'success',
      text: t(
        `Saved settings for project [${res.savedProject.code}].`,
        `프로젝트 [${res.savedProject.code}] 설정이 저장되었습니다.`
      ),
    });
    onProjectsChanged(res.savedProject.code);
  };

  const handleDelete = () => {
    if (!editingCode || isSystemProject) return;
    const deletedCode = editingCode;
    const res = deleteProject(deletedCode);
    if (!res.success) {
      setNotice({
        type: 'error',
        text: res.message || t('Failed to delete project.', '프로젝트 삭제에 실패했습니다.'),
      });
      return;
    }
    reassignSpecsProjectToTemp(deletedCode);
    setProjects(res.list);
    syncPrunedDirectory(res.list);
    const fallback = res.list.find((p) => !p.is_system) || res.list[0];
    if (fallback) loadIntoForm(fallback);
    setNotice({
      type: 'success',
      text: t(
        `Deleted project [${deletedCode}]. Linked programs moved to TEMP.`,
        `프로젝트 [${deletedCode}]가 삭제되었습니다. 연결된 사양서는 TEMP로 이동했습니다.`
      ),
    });
    onProjectsChanged(fallback?.code);
  };

  const roleLabel = (roleValue: string) => {
    const found = ROLE_OPTIONS.find((r) => r.value === roleValue);
    return found ? (lang === 'ko' ? found.ko : found.value) : roleValue;
  };

  return (
    <div className="h-full overflow-y-auto bg-slate-50 text-slate-900">
      <div className="max-w-7xl mx-auto px-6 py-7 space-y-6">
        {/* Top Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-blue-400 flex items-center justify-center shrink-0">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {t('Project Settings & Members', '프로젝트 설정 및 멤버 관리')}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(
                  'Configure projects, manage project-specific members, and assign active SAP modules.',
                  '프로젝트를 생성하고 프로젝트별 참여 멤버와 활성 SAP 모듈을 구성합니다.'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title={t('Back', '뒤로가기')}
            aria-label={t('Back', '뒤로가기')}
            className="w-9 h-9 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg flex items-center justify-center transition-colors cursor-pointer self-start sm:self-auto shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Main Workspace Card */}
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col md:flex-row overflow-hidden min-h-[580px]">
          {/* Left Project List */}
          <div className="w-full md:w-72 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50 p-4 flex flex-col gap-3 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">
                {t('Projects', '프로젝트 목록')}
              </span>
              <button
                type="button"
                onClick={startNewProject}
                title={t('New Project', '새 프로젝트 추가')}
                aria-label={t('New Project', '새 프로젝트 추가')}
                className="w-8 h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-2xs flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              {projects.map((p) => {
                const selected = !isCreatingNew && editingCode === p.code;
                const memberCount = p.members.length;
                return (
                  <button
                    key={p.code}
                    type="button"
                    onClick={() => loadIntoForm(p)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                      selected
                        ? 'bg-white border-blue-500 shadow-2xs text-slate-900'
                        : 'bg-white/60 border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-blue-800">{p.code}</span>
                      {p.is_system && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                          <Lock className="w-3 h-3" />
                          <span>{t('System', '기본')}</span>
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-slate-800 truncate mt-0.5">{p.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {p.visibility === 'common'
                        ? t(
                            `Company-Wide Common · ${memberCount} Member${memberCount === 1 ? '' : 's'}`,
                            `전사 공통 영역 · ${memberCount}명`
                          )
                        : p.visibility === 'temp'
                        ? t(
                            `Personal Space · ${memberCount} Member${memberCount === 1 ? '' : 's'}`,
                            `개인 임시 영역 · ${memberCount}명`
                          )
                        : t(
                            `${memberCount} ${memberCount === 1 ? 'Member' : 'Members'}`,
                            `참여 인원 ${memberCount}명`
                          )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Form */}
          <form onSubmit={handleSave} className="flex-1 p-6 overflow-y-auto space-y-5">
            {notice && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                  notice.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{notice.text}</span>
              </div>
            )}

            {isSystemProject && (
              <div className="p-3 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-700 flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  {lang === 'ko' ? (
                    <>
                      <strong>{editingCode}</strong>는 시스템 기본 프로젝트이므로 코드, 멤버 및 설정을 변경하거나 삭제할 수 없습니다.
                    </>
                  ) : (
                    <>
                      <strong>{editingCode}</strong> is a system default project and cannot be renamed, modified, or deleted.
                    </>
                  )}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('Project Code', '프로젝트 코드')} <span className="text-rose-500">*</span>{' '}
                  <span className="text-[10px] font-normal text-slate-500">
                    {t('(4 chars: A-Z, 0-9, _)', '(영문/숫자/_ 4자리)')}
                  </span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  disabled={!isCreatingNew}
                  value={formCode}
                  onChange={(e) =>
                    setFormCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 4))
                  }
                  placeholder={t('e.g. 2603 (4 chars)', '예: 2603 (4자리)')}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold uppercase text-blue-900 disabled:bg-slate-100 disabled:text-slate-500 focus:bg-white focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('Target SAP Release', '대상 SAP 릴리스')}
                </label>
                <input
                  type="text"
                  disabled={isSystemProject}
                  value={formRelease}
                  onChange={(e) => setFormRelease(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 disabled:bg-slate-100 focus:bg-white focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('Start Date', '시작일')}
                </label>
                <input
                  type="date"
                  disabled={isSystemProject}
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono tabular-nums text-slate-800 disabled:bg-slate-100 focus:bg-white focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('End Date', '종료일')}
                </label>
                <input
                  type="date"
                  disabled={isSystemProject}
                  value={formEndDate}
                  onChange={(e) => setFormEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono tabular-nums text-slate-800 disabled:bg-slate-100 focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('Project Name', '프로젝트명')} <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSystemProject}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('e.g. Next-Gen SAP S/4HANA Rollout', '예: 차세대 SAP S/4HANA 구축')}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 disabled:bg-slate-100 focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {t('Description', '프로젝트 설명')}
                </label>
                <textarea
                  rows={2}
                  disabled={isSystemProject}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder={t('Enter project scope and key objectives.', '프로젝트 범위 및 주요 목표를 입력하세요.')}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 disabled:bg-slate-100 focus:bg-white focus:border-blue-500"
                />
              </div>
            </div>

            {/* Active Modules */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {t('Active SAP Modules', '프로젝트 활성 모듈')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {MODULE_OPTIONS.map((mod) => {
                  const active = formModules.includes(mod.code);
                  const modLabel = lang === 'ko' ? mod.labelKo : mod.labelEn;
                  return (
                    <button
                      key={mod.code}
                      type="button"
                      disabled={isSystemProject}
                      onClick={() => toggleModule(mod.code)}
                      title={`${mod.code} — ${modLabel}`}
                      aria-label={`${mod.code} — ${modLabel}`}
                      className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold border transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap shrink-0 ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {mod.code}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Project-Scoped Members Management */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  <span>
                    {isSystemProject
                      ? t('Default System Project Membership', '시스템 프로젝트 기본 멤버')
                      : t(
                          `Project Members (${editingCode || 'New Project'})`,
                          `프로젝트 참여 멤버 (${editingCode || '신규 프로젝트'})`
                        )}
                  </span>
                </label>
                <span className="text-[11px] text-slate-500">
                  {t(
                    'Josh Lee (toc80.lee@gmail.com) is always included in every project.',
                    'Josh Lee (toc80.lee@gmail.com)는 모든 프로젝트에 항상 포함됩니다.'
                  )}
                </span>
              </div>

              {/* Add Member directly to this project only */}
              {!isSystemProject && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-600">
                    {t(
                      `Add Member to ${editingCode || 'This Project'}`,
                      `${editingCode || '현재 프로젝트'}에 멤버 추가`
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <input
                      type="text"
                      list="project-member-suggestions"
                      value={newUserName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewUserName(val);
                        const matched = suggestedExistingUsers.find(
                          (u) => u.name.toLowerCase() === val.trim().toLowerCase()
                        );
                        if (matched) {
                          if (!newUserEmail && matched.email) setNewUserEmail(matched.email);
                          if (matched.role) setNewUserRole(matched.role);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddUser();
                        }
                      }}
                      placeholder={t('Full name *', '이름 *')}
                      aria-label={t('New member name', '새 멤버 이름')}
                      className="sm:col-span-4 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                    />
                    <datalist id="project-member-suggestions">
                      {suggestedExistingUsers.map((u) => (
                        <option key={u.id} value={u.name} />
                      ))}
                    </datalist>
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddUser();
                        }
                      }}
                      placeholder={t('Email (optional)', '이메일 (선택)')}
                      aria-label={t('New member email', '새 멤버 이메일')}
                      className="sm:col-span-4 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                    />
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value)}
                      aria-label={t('New member role', '새 멤버 역할')}
                      className="sm:col-span-3 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {lang === 'ko' ? r.ko : r.value}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddUser}
                      title={t('Add Member to Project', '프로젝트 멤버 추가')}
                      aria-label={t('Add Member to Project', '프로젝트 멤버 추가')}
                      className="sm:col-span-1 h-8 bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Scoped Member Cards (Only members belonging to the selected project) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {memberCardEntries.map((member) => (
                  <div
                    key={member.name}
                    className="px-3 py-2.5 rounded-lg border bg-blue-50/70 border-blue-300 text-blue-950 text-xs flex items-center justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0 flex items-start gap-2.5">
                      <div className="mt-0.5 w-4 h-4 rounded border bg-blue-600 border-blue-600 text-white flex items-center justify-center shrink-0">
                        {member.isDefaultOp ? (
                          <Lock className="w-2.5 h-2.5" />
                        ) : (
                          <Check className="w-3 h-3" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-slate-900 truncate">
                            {member.name}
                          </span>
                          {member.isDefaultOp && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-900 text-white whitespace-nowrap">
                              {t('Default · Always Included', '기본 관리자 · 항상 포함')}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 truncate mt-0.5">
                          {member.email ? (
                            <>
                              <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{member.email}</span>
                            </>
                          ) : (
                            <span className="truncate">{roleLabel(member.role)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {!isSystemProject && !member.isDefaultOp && (
                      <button
                        type="button"
                        onClick={() => handleRemoveMember(member.name)}
                        title={t(`Remove ${member.name} from project`, `${member.name} 멤버 제외`)}
                        aria-label={t(
                          `Remove ${member.name} from project`,
                          `${member.name} 멤버 제외`
                        )}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Project ABAP Development Standards */}
            {!isSystemProject && (
              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>
                    {t(
                      'Project ABAP Standards (Include · Wrapper Class · SE91 · Syntax)',
                      '프로젝트 ABAP 개발 표준 (Include · Wrapper Class · SE91 · 문법)'
                    )}
                  </span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                      {t('Common TOP Include', '공통 TOP Include')}
                    </label>
                    <input
                      type="text"
                      value={abapStandards.common_top_include || ''}
                      onChange={(e) =>
                        setAbapStandards({ ...abapStandards, common_top_include: e.target.value })
                      }
                      placeholder="zcommtop"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                      {t('Common FORM Include', '공통 FORM Include')}
                    </label>
                    <input
                      type="text"
                      value={abapStandards.common_form_include || ''}
                      onChange={(e) =>
                        setAbapStandards({ ...abapStandards, common_form_include: e.target.value })
                      }
                      placeholder="zcommf01"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                      {t('ALV Grid Wrapper Class', 'ALV Grid 래퍼 클래스')}
                    </label>
                    <input
                      type="text"
                      value={abapStandards.grid_class_name || ''}
                      onChange={(e) =>
                        setAbapStandards({ ...abapStandards, grid_class_name: e.target.value })
                      }
                      placeholder="cl_gui_alv_grid"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                      {t('Message Class (SE91)', '메시지 클래스 (SE91)')}
                    </label>
                    <input
                      type="text"
                      value={abapStandards.message_class || ''}
                      onChange={(e) =>
                        setAbapStandards({
                          ...abapStandards,
                          message_class: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder="Z01"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                      {t('Default ABAP Syntax', '기본 ABAP 문법')}
                    </label>
                    <select
                      value={abapStandards.default_syntax_mode || 'modern_740'}
                      onChange={(e) =>
                        setAbapStandards({
                          ...abapStandards,
                          default_syntax_mode: e.target.value as AbapSyntaxMode,
                        })
                      }
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
                    >
                      <option value="classic">
                        {t('Classic ABAP (ECC 6.0 / NetWeaver 7.0x)', 'Classic ABAP (ECC 6.0 호환)')}
                      </option>
                      <option value="modern_740">
                        {t(
                          'Modern ABAP 7.40+ (S/4HANA Inline / VALUE #)',
                          'Modern ABAP 7.40+ (S/4HANA 인라인 / VALUE #)'
                        )}
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                      {t('Program ID Prefix', '프로그램 ID 접두어')}
                    </label>
                    <input
                      type="text"
                      value={abapStandards.program_prefix || ''}
                      onChange={(e) =>
                        setAbapStandards({
                          ...abapStandards,
                          program_prefix: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder={t('e.g. ZR_, ZSD_', '예: ZR_, ZSD_')}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                      {t('T-Code Naming Pattern', 'T-Code 명명 규칙')}
                    </label>
                    <input
                      type="text"
                      value={abapStandards.tcode_pattern || ''}
                      onChange={(e) =>
                        setAbapStandards({
                          ...abapStandards,
                          tcode_pattern: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder={t('e.g. Z*, ZSD*', '예: Z*, ZSD*')}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                      {t('Dev Package (SE80)', '개발 패키지 (SE80)')}
                    </label>
                    <input
                      type="text"
                      value={abapStandards.dev_package || ''}
                      onChange={(e) =>
                        setAbapStandards({
                          ...abapStandards,
                          dev_package: e.target.value.toUpperCase(),
                        })
                      }
                      placeholder={t('e.g. $TMP, ZDEV', '예: $TMP, ZDEV')}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono uppercase"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Footer actions */}
            <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <div>
                {!isCreatingNew && !isSystemProject && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    title={t('Delete Project', '프로젝트 삭제')}
                    aria-label={t('Delete Project', '프로젝트 삭제')}
                    className="w-9 h-9 text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  title={t('Back', '뒤로가기')}
                  aria-label={t('Back', '뒤로가기')}
                  className="w-9 h-9 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                {!isSystemProject && (
                  <button
                    type="submit"
                    title={
                      isCreatingNew
                        ? t('Create Project', '프로젝트 생성')
                        : t('Save Changes', '변경사항 저장')
                    }
                    aria-label={
                      isCreatingNew
                        ? t('Create Project', '프로젝트 생성')
                        : t('Save Changes', '변경사항 저장')
                    }
                    className="w-9 h-9 text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
