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
  Search,
  ShieldCheck,
} from 'lucide-react';
import {
  AbapSyntaxMode,
  ProjectAbapStandards,
  SapModule,
  SapProject,
  UserProfileRecord,
} from '../types/sap';
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
  DEFAULT_OPERATOR_USER,
  isDefaultOperatorUser,
} from '../utils/authStorage';
import { syncProjectToFirestore } from '../services/firestoreSync';
import {
  subscribeAllUsersForAdmin,
  syncProjectMembershipChange,
} from '../services/userManagementService';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { PageHeader } from './PageHeader';

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
  const { isAdmin, userProfile: currentAdminProfile } = useAuth();
  const [approvedUsers, setApprovedUsers] = useState<UserProfileRecord[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
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
  const [formMemberUids, setFormMemberUids] = useState<string[]>([]);
  const [prevMemberUids, setPrevMemberUids] = useState<string[]>([]);
  const [formModules, setFormModules] = useState<SapModule[]>(['SD', 'MM', 'FI', 'CO']);

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
    const isSys = proj.code === COMMON_PROJECT_CODE || proj.code === TEMP_PROJECT_CODE;
    const nextUids = Array.isArray(proj.memberUids) ? proj.memberUids.filter(Boolean) : [];
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
      isSys
        ? [DEFAULT_OPERATOR_USER.name]
        : enforceProjectMembers(proj.members || [], safeOwner)
    );
    setFormMemberUids(nextUids);
    setPrevMemberUids(nextUids);
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
    if (!isOpen || !isAdmin) return;
    const unsub = subscribeAllUsersForAdmin(
      (allUsers) => {
        setApprovedUsers(allUsers.filter((u) => u.status === 'approved'));
      },
      (err) => {
        console.warn('Approved user directory sync warning:', err);
      }
    );
    return () => unsub();
  }, [isOpen, isAdmin]);

  const isSystemProject =
    !isCreatingNew && (editingCode === COMMON_PROJECT_CODE || editingCode === TEMP_PROJECT_CODE);

  const memberCardEntries = useMemo(() => {
    const userByUid = new Map<string, UserProfileRecord>();
    const userByNameLower = new Map<string, UserProfileRecord>();
    approvedUsers.forEach((u) => {
      userByUid.set(u.uid, u);
      userByNameLower.set(u.displayName.trim().toLowerCase(), u);
    });

    const sourceNames = isSystemProject
      ? [DEFAULT_OPERATOR_USER.name]
      : enforceProjectMembers(formMembers, formOwner);

    const seenKeys = new Set<string>();
    const entries: {
      uid?: string;
      name: string;
      email: string;
      role: string;
      photoURL?: string;
      isDefaultOp: boolean;
    }[] = [];

    sourceNames.forEach((name) => {
      const matched = userByNameLower.get(name.trim().toLowerCase());
      const isDefaultOp = isDefaultOperatorUser(matched?.email || name);
      if (isDefaultOp) {
        const key = 'default-josh';
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          entries.push({
            uid: matched?.uid || (isDefaultOperatorUser(currentAdminProfile?.email) ? currentAdminProfile?.uid : undefined),
            name: DEFAULT_OPERATOR_USER.name,
            email: matched?.email || DEFAULT_OPERATOR_USER.email,
            role: DEFAULT_OPERATOR_USER.role,
            photoURL: matched?.photoURL,
            isDefaultOp: true,
          });
        }
        return;
      }
      const key = matched?.uid || name.trim().toLowerCase();
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        entries.push({
          uid: matched?.uid,
          name: matched?.displayName || name,
          email: matched?.email || '',
          role: matched?.projectRole || 'SAP Consultant / Developer',
          photoURL: matched?.photoURL,
          isDefaultOp: false,
        });
      }
    });

    formMemberUids.forEach((uid) => {
      const u = userByUid.get(uid);
      if (!u || seenKeys.has(u.uid)) return;
      if (isDefaultOperatorUser(u.email || u.displayName)) return;
      seenKeys.add(u.uid);
      entries.push({
        uid: u.uid,
        name: u.displayName,
        email: u.email,
        role: u.projectRole || 'SAP Consultant / Developer',
        photoURL: u.photoURL,
        isDefaultOp: false,
      });
    });

    return entries;
  }, [approvedUsers, formMembers, formMemberUids, formOwner, isSystemProject, currentAdminProfile]);

  const eligibleApprovedUsers = useMemo(() => {
    const memberUidSet = new Set(formMemberUids);
    const memberNameLower = new Set(formMembers.map((m) => m.trim().toLowerCase()));
    const q = memberSearchQuery.trim().toLowerCase();

    return approvedUsers.filter((u) => {
      if (isDefaultOperatorUser(u.email || u.displayName)) return false;
      if (memberUidSet.has(u.uid)) return false;
      if (memberNameLower.has(u.displayName.trim().toLowerCase())) return false;
      if (!q) return true;
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
      );
    });
  }, [approvedUsers, formMemberUids, formMembers, memberSearchQuery]);

  if (!isOpen) return null;

  const startNewProject = () => {
    const initialUids = currentAdminProfile?.uid ? [currentAdminProfile.uid] : [];
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
    setFormMemberUids(initialUids);
    setPrevMemberUids([]);
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

  const handleAddApprovedUser = async (user: UserProfileRecord) => {
    if (isSystemProject) return;
    if (user.status !== 'approved') {
      setNotice({
        type: 'error',
        text: t(
          'Only approved users can be assigned to a project.',
          '관리자 승인을 완료한(approved) 사용자만 프로젝트 멤버로 추가할 수 있습니다.'
        ),
      });
      return;
    }

    const nextMembers = enforceProjectMembers([...formMembers, user.displayName], formOwner);
    const nextMemberUids = Array.from(new Set([...formMemberUids, user.uid]));
    setFormMembers(nextMembers);
    setFormMemberUids(nextMemberUids);

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
          memberUids: nextMemberUids,
          modules: formModules,
          abap_standards: abapStandards,
        });
        if (saveRes.success && saveRes.savedProject) {
          try {
            await syncProjectToFirestore(saveRes.savedProject);
            await syncProjectMembershipChange(editingCode, nextMemberUids, prevMemberUids);
            setPrevMemberUids(nextMemberUids);
          } catch (err) {
            console.warn('Firestore project sync notice:', err);
          }
          setProjects(saveRes.list);
          onProjectsChanged(editingCode);
          setNotice({
            type: 'success',
            text: t(
              `Added '${user.displayName}' to project [${editingCode}] and synced access permissions.`,
              `'${user.displayName}'님을 프로젝트 [${editingCode}] 멤버로 추가하고 접근 권한을 동기화했습니다.`
            ),
          });
          return;
        }
      }
    }

    setNotice({
      type: 'success',
      text: t(
        `Added '${user.displayName}' to this project draft. Click Save to create the project.`,
        `'${user.displayName}'님을 새 프로젝트 멤버로 추가했습니다. 저장 시 반영됩니다.`
      ),
    });
  };

  const handleRemoveMember = async (memberName: string, memberUid?: string) => {
    if (isSystemProject || isDefaultOperatorUser(memberName)) return;

    const nextOwner =
      formOwner.trim().toLowerCase() === memberName.trim().toLowerCase()
        ? DEFAULT_OPERATOR_USER.name
        : formOwner;
    const nextMembers = enforceProjectMembers(
      formMembers.filter((m) => m.trim().toLowerCase() !== memberName.trim().toLowerCase()),
      nextOwner
    );
    const matchedUid =
      memberUid ||
      approvedUsers.find((u) => u.displayName.trim().toLowerCase() === memberName.trim().toLowerCase())?.uid;
    const nextMemberUids = matchedUid
      ? formMemberUids.filter((id) => id !== matchedUid)
      : formMemberUids;

    setFormOwner(nextOwner);
    setFormMembers(nextMembers);
    setFormMemberUids(nextMemberUids);

    if (!isCreatingNew && editingCode) {
      const targetProj = projects.find((p) => p.code === editingCode);
      if (targetProj) {
        const saveRes = saveProject({
          ...targetProj,
          owner: nextOwner,
          members: nextMembers,
          memberUids: nextMemberUids,
        });
        if (saveRes.success && saveRes.savedProject) {
          try {
            await syncProjectToFirestore(saveRes.savedProject);
            await syncProjectMembershipChange(editingCode, nextMemberUids, prevMemberUids);
            setPrevMemberUids(nextMemberUids);
          } catch (err) {
            console.warn('Firestore project sync notice:', err);
          }
          setProjects(saveRes.list);
          onProjectsChanged(editingCode);
          setNotice({
            type: 'success',
            text: t(
              `Removed '${memberName}' from project [${editingCode}] and revoked project access.`,
              `'${memberName}'님을 프로젝트 [${editingCode}]에서 제외하고 접근 권한을 회수했습니다.`
            ),
          });
          return;
        }
      }
    }

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

  const handleSave = async (e: React.FormEvent) => {
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
    const nextMemberUids = Array.from(
      new Set([
        ...formMemberUids,
        ...(currentAdminProfile?.uid ? [currentAdminProfile.uid] : []),
      ])
    );

    const res = saveProject({
      code: cleanCode,
      name: formName,
      description: formDesc,
      visibility: 'project',
      target_sap_release: formRelease,
      start_date: formStartDate || undefined,
      end_date: formEndDate || undefined,
      owner: formOwner || DEFAULT_OPERATOR_USER.name,
      ownerId: currentAdminProfile?.uid,
      members: enforcedMembers,
      memberUids: nextMemberUids,
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

    try {
      await syncProjectToFirestore(res.savedProject);
      await syncProjectMembershipChange(res.savedProject.code, nextMemberUids, prevMemberUids);
      setPrevMemberUids(nextMemberUids);
    } catch (err) {
      console.warn('Firestore project sync notice:', err);
    }

    setProjects(res.list);
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
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      <PageHeader
        icon={FolderKanban}
        eyebrow={t('Administration · Workspace Governance', '관리자 설정 · 프로젝트 거버넌스')}
        title={t('Project Settings & Members', '프로젝트 설정 및 멤버 관리')}
        subtitle={t(
          'Configure projects, manage project-specific members, and assign active SAP modules.',
          '프로젝트를 생성하고 프로젝트별 참여 멤버와 활성 SAP 모듈을 구성합니다.'
        )}
        actions={
          <button
            type="button"
            onClick={onClose}
            title={t('Back', '뒤로가기')}
            aria-label={t('Back', '뒤로가기')}
            className="h-9 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t('Back', '뒤로가기')}</span>
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-5">

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

              {/* Add Approved-Only Member Picker */}
              {!isSystemProject && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold text-slate-700 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>
                        {t(
                          `Assign Approved Users to ${editingCode || 'This Project'}`,
                          `${editingCode || '현재 프로젝트'}에 승인 완료 사용자 배정`
                        )}
                      </span>
                    </div>
                    <div className="relative sm:w-64">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={memberSearchQuery}
                        onChange={(e) => setMemberSearchQuery(e.target.value)}
                        placeholder={t(
                          'Search approved users by name or email...',
                          '이름 또는 이메일로 승인된 사용자 검색...'
                        )}
                        aria-label={t('Search approved users', '승인된 사용자 검색')}
                        className="w-full pl-8 pr-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  {eligibleApprovedUsers.length === 0 ? (
                    <div className="px-3 py-2.5 bg-white border border-dashed border-slate-200 rounded-lg text-[11px] text-slate-500">
                      {t(
                        'Only approved users can be added. Approve pending users in the Admin Dashboard (/admin) first.',
                        '승인 완료(approved) 상태인 사용자만 추가할 수 있습니다. Admin 대시보드(/admin)에서 먼저 승인을 완료하세요.'
                      )}
                    </div>
                  ) : (
                    <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {eligibleApprovedUsers.map((user) => (
                        <div
                          key={user.uid}
                          className="px-2.5 py-2 bg-white border border-slate-200 hover:border-blue-300 rounded-lg flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {user.photoURL ? (
                              <img
                                src={user.photoURL}
                                alt={user.displayName}
                                className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                                {user.displayName.charAt(0)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-900 truncate">
                                  {user.displayName}
                                </span>
                                <span className="text-[9px] font-mono font-bold px-1 py-0.2 rounded bg-emerald-100 text-emerald-800 uppercase shrink-0">
                                  {user.role}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500 truncate">
                                {user.email || user.uid}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleAddApprovedUser(user)}
                            className="px-2.5 py-1 bg-slate-900 hover:bg-blue-600 text-white rounded-md text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                          >
                            <UserPlus className="w-3 h-3" />
                            <span>{t('Add', '추가')}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Scoped Member Cards (Only members belonging to the selected project) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {memberCardEntries.map((member) => (
                  <div
                    key={member.uid || member.name}
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
                        onClick={() => void handleRemoveMember(member.name, member.uid)}
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
    </div>
  );
};
