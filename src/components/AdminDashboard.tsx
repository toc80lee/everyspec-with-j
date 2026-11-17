import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clock,
  FolderKanban,
  Mail,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { PageHeader } from './PageHeader';
import { SapProject, UserProfileRecord, UserProjectRole } from '../types/sap';
import {
  isBootstrappedAdminEmail,
  subscribeAllUsersForAdmin,
  updateUserAccountRole,
  updateUserApprovalStatus,
  updateUserProjectRole,
} from '../services/userManagementService';
import {
  PROJECT_ASSIGNABLE_ROLES,
  getProjectRoleLabel,
  getProjectRoleOption,
  normalizeProjectRole,
} from '../utils/projectRoles';
import { useAuth } from '../contexts/AuthContext';
import { useConfirmDialog } from '../contexts/ConfirmDialogContext';
import { useLanguage } from '../contexts/LanguageContext';

interface AdminDashboardProps {
  projects: SapProject[];
  onClose: () => void;
  onProjectsOrMembersUpdated: () => void;
  onNotify?: (message: string) => void;
}

type AdminTab = 'pending' | 'approved' | 'rejected';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  projects,
  onClose,
  onNotify,
}) => {
  const { isAdmin, userProfile: currentAdminProfile } = useAuth();
  const { confirmAction, confirmDelete } = useConfirmDialog();
  const { lang, t } = useLanguage();
  const [allUsers, setAllUsers] = useState<UserProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AdminTab>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedRoleByUid, setSelectedRoleByUid] = useState<Record<string, UserProjectRole>>({});

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    const unsub = subscribeAllUsersForAdmin(
      (users) => {
        setAllUsers(users);
        setLoading(false);
        setLoadError(null);
      },
      (err: any) => {
        setLoadError(err?.message || 'Failed to subscribe to user directory.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [isAdmin]);

  const assignableProjects = useMemo(
    () => projects.filter((p) => p.visibility === 'project' && !p.is_system),
    [projects]
  );

  const pendingUsers = useMemo(
    () => allUsers.filter((u) => u.status === 'pending'),
    [allUsers]
  );
  const approvedUsers = useMemo(
    () => allUsers.filter((u) => u.status === 'approved'),
    [allUsers]
  );
  const rejectedUsers = useMemo(
    () => allUsers.filter((u) => u.status === 'rejected'),
    [allUsers]
  );

  useEffect(() => {
    if (!loading && activeTab === 'pending' && pendingUsers.length === 0 && approvedUsers.length > 0) {
      setActiveTab('approved');
    }
  }, [loading]);

  const displayedUsers = useMemo(() => {
    const base =
      activeTab === 'pending'
        ? pendingUsers
        : activeTab === 'approved'
        ? approvedUsers
        : rejectedUsers;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.uid.toLowerCase().includes(q)
    );
  }, [activeTab, pendingUsers, approvedUsers, rejectedUsers, searchQuery]);

  if (!isAdmin) {
    return null;
  }

  const getPendingOrTargetRole = (user: UserProfileRecord): UserProjectRole => {
    const chosen = selectedRoleByUid[user.uid];
    if (chosen && chosen !== 'ADMIN') return chosen;
    const normalized = normalizeProjectRole(user.projectRole, 'FUNC');
    return normalized === 'ADMIN' ? 'FUNC' : normalized;
  };

  const handleStatusChange = async (
    user: UserProfileRecord,
    nextStatus: 'approved' | 'rejected',
    assignedRole?: UserProjectRole
  ) => {
    if (isBootstrappedAdminEmail(user.email) && nextStatus === 'rejected') {
      onNotify?.(t('System owner account cannot be rejected.', '시스템 기본 관리자 계정은 거절할 수 없습니다.'));
      return;
    }
    setBusyUid(user.uid);
    try {
      const effectiveRole = nextStatus === 'approved' ? assignedRole || getPendingOrTargetRole(user) : undefined;
      await updateUserApprovalStatus(user.uid, nextStatus, effectiveRole);
      onNotify?.(
        nextStatus === 'approved'
          ? t(
              `Approved '${user.displayName}' as ${getProjectRoleLabel(effectiveRole, 'en', 'short')}.`,
              `'${user.displayName}'님의 가입을 '${getProjectRoleLabel(effectiveRole, 'ko', 'short')}' 역할로 승인했습니다.`
            )
          : t(`Rejected user '${user.displayName}'.`, `'${user.displayName}'님의 접근을 거절했습니다.`)
      );
    } finally {
      setBusyUid(null);
    }
  };

  const handleDefaultProjectRoleChange = async (
    user: UserProfileRecord,
    nextRole: UserProjectRole
  ) => {
    if (user.role === 'admin' || nextRole === 'ADMIN') return;
    setBusyUid(user.uid);
    try {
      await updateUserProjectRole(user.uid, nextRole);
      onNotify?.(
        t(
          `Updated '${user.displayName}' default role to ${getProjectRoleLabel(nextRole, 'en', 'short')}.`,
          `'${user.displayName}'님의 기본 프로젝트 역할을 '${getProjectRoleLabel(nextRole, 'ko', 'short')}'(으)로 변경했습니다.`
        )
      );
    } finally {
      setBusyUid(null);
    }
  };

  const handleAccountRoleToggle = async (user: UserProfileRecord) => {
    const isSelf = currentAdminProfile?.uid === user.uid;
    const isProtectedAdmin = isBootstrappedAdminEmail(user.email);
    const nextRole = user.role === 'admin' ? 'user' : 'admin';
    if ((isSelf || isProtectedAdmin) && nextRole === 'user') {
      onNotify?.(
        t(
          'Your own admin account or bootstrapped owner accounts cannot be demoted.',
          '본인 계정 또는 시스템 기본 관리자 계정은 일반 사용자로 강등할 수 없습니다.'
        )
      );
      return;
    }

    const confirmed = await confirmAction({
      title: nextRole === 'admin' ? t('Promote to Admin', '관리자 승격') : t('Demote to User', '일반 사용자 전환'),
      message:
        nextRole === 'admin'
          ? t(
              `Grant platform Admin privileges to '${user.displayName}'?`,
              `'${user.displayName}'님에게 플랫폼 관리자(ADMIN) 권한을 부여하시겠습니까?`
            )
          : t(
              `Revoke platform Admin privileges from '${user.displayName}'?`,
              `'${user.displayName}'님의 관리자(ADMIN) 권한을 해제하시겠습니까?`
            ),
      targetName: `${user.displayName} (${user.email || user.uid})`,
      confirmLabel: nextRole === 'admin' ? t('Promote', '승격') : t('Demote', '전환'),
      tone: 'primary',
    });
    if (!confirmed) return;

    setBusyUid(user.uid);
    try {
      await updateUserAccountRole(user.uid, nextRole, user.email);
      onNotify?.(
        nextRole === 'admin'
          ? t(`Promoted '${user.displayName}' to Admin.`, `'${user.displayName}'님을 관리자로 승격했습니다.`)
          : t(`Demoted '${user.displayName}' to regular user.`, `'${user.displayName}'님을 일반 사용자로 전환했습니다.`)
      );
    } finally {
      setBusyUid(null);
    }
  };

  const handleRevokeApprovedUser = async (user: UserProfileRecord) => {
    const isSelf = currentAdminProfile?.uid === user.uid;
    const isProtectedAdmin = isBootstrappedAdminEmail(user.email);
    if (isSelf || isProtectedAdmin) {
      onNotify?.(
        t(
          'Your own account or bootstrapped owner accounts cannot be revoked.',
          '본인 계정 또는 시스템 기본 관리자 계정의 접근은 회수할 수 없습니다.'
        )
      );
      return;
    }

    const confirmed = await confirmDelete({
      title: t('Revoke Workspace Access', '작업실 접근 권한 회수'),
      message: t(
        `Revoke approved workspace access for '${user.displayName}'?`,
        `'${user.displayName}'님의 작업실 접근 권한을 회수(차단)하시겠습니까?`
      ),
      targetName: `${user.displayName} (${user.email || user.uid})`,
      description: t(
        'The user will immediately lose access to AI APIs and Firestore project data until re-approved.',
        '재승인 전까지 AI API 및 프로젝트 데이터 접근이 즉시 차단됩니다.'
      ),
      confirmLabel: t('Revoke Access', '권한 회수'),
    });
    if (!confirmed) return;

    await handleStatusChange(user, 'rejected');
  };

  const formatTimestamp = (iso?: string) => {
    if (!iso) return '-';
    return iso.replace('T', ' ').slice(0, 16);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      <PageHeader
        icon={ShieldCheck}
        eyebrow={t('Administration · Security & Access Control (/admin)', '관리자 전용 · 인증 및 권한 관리 (/admin)')}
        title={t('User Management', '사용자 관리')}
        subtitle={t(
          'Review pending Google sign-up applicants, approve workspace access, and assign project-level permissions.',
          'Google 로그인으로 가입 신청한 사용자를 승인/거절하고, 승인된 사용자에게 프로젝트별 접근 권한을 할당합니다.'
        )}
        actions={
          <div className="group relative inline-flex shrink-0">
            <button
              type="button"
              onClick={onClose}
              aria-label={t('Back', '뒤로가기')}
              className="w-9 h-9 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute top-full right-0 mt-2 z-50 px-2.5 py-1 rounded-md bg-slate-800 border border-slate-700 text-white text-xs font-medium whitespace-nowrap shadow-xl opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150"
            >
              {t('Back', '뒤로가기')}
            </span>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-5 space-y-5">
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <button
              type="button"
              onClick={() => setActiveTab('pending')}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                activeTab === 'pending'
                  ? 'bg-amber-50/80 border-amber-300 shadow-2xs'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-amber-800">
                <span>{t('Pending', '대기')}</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1.5">
                {pendingUsers.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {t('Awaiting admin decision', '승인 검토 필요')}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('approved')}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                activeTab === 'approved'
                  ? 'bg-emerald-50/80 border-emerald-300 shadow-2xs'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
                <span>{t('Approved', '완료')}</span>
                <UserCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1.5">
                {approvedUsers.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {t('Eligible for project assignment', '프로젝트 할당 가능')}
              </div>
            </button>

            <div className="p-4 rounded-xl border bg-white border-slate-200">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-800">
                <span>{t('Team Projects', '할당 가능 프로젝트')}</span>
                <FolderKanban className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1.5">
                {assignableProjects.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {t('Isolated project workspaces', '개별 격리 프로젝트')}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('rejected')}
              className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                activeTab === 'rejected'
                  ? 'bg-rose-50/80 border-rose-300 shadow-2xs'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold text-rose-800">
                <span>{t('Rejected', '거절')}</span>
                <UserX className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1.5">
                {rejectedUsers.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {t('Workspace access blocked', '접근 차단 계정')}
              </div>
            </button>
          </div>

          {loadError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{loadError}</span>
            </div>
          )}

          {/* Filter & Tab Toolbar */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('pending')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'pending'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>{t('Pending', '대기')}</span>
                  <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-900">
                    {pendingUsers.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('approved')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'approved'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t('Approved', '완료')}</span>
                  <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900">
                    {approvedUsers.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('rejected')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'rejected'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserX className="w-3.5 h-3.5 text-rose-600" />
                  <span>{t('Rejected', '거절')}</span>
                  <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-700">
                    {rejectedUsers.length}
                  </span>
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('Search name or email...', '이름 또는 이메일 검색...')}
                  className="h-8 w-full pl-8 pr-3 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center text-xs text-slate-500">
                {t('Loading Firestore user directory...', '사용자 디렉토리를 불러오는 중...')}
              </div>
            ) : displayedUsers.length === 0 ? (
              <div className="p-10 text-center space-y-1.5">
                <div className="text-xs font-semibold text-slate-700">
                  {activeTab === 'pending'
                    ? t('No pending sign-up requests.', '현재 승인 대기 중인 가입 신청이 없습니다.')
                    : activeTab === 'approved'
                    ? t('No matching approved users.', '조건에 맞는 승인 사용자가 없습니다.')
                    : t('No rejected users.', '거절/차단된 사용자가 없습니다.')}
                </div>
                <p className="text-[11px] text-slate-500">
                  {activeTab === 'pending' &&
                    t(
                      'When new users sign in with Google for the first time, they will appear here automatically.',
                      '신규 사용자가 Google 로그인을 완료하면 자동으로 이 대기열에 표시됩니다.'
                    )}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {displayedUsers.map((u) => {
                  const isBusy = busyUid === u.uid;
                  const isProtectedAdmin = isBootstrappedAdminEmail(u.email);
                  const isSelf = currentAdminProfile?.uid === u.uid;

                  return (
                    <div
                      key={u.uid}
                      className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                    >
                      {/* User Identity Block */}
                      <div className="flex items-start gap-3 min-w-0">
                        {u.photoURL ? (
                          <img
                            src={u.photoURL}
                            alt={u.displayName}
                            className="w-10 h-10 rounded-full object-cover border border-slate-200 shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-slate-900 text-white font-bold flex items-center justify-center text-xs shrink-0">
                            {u.displayName.charAt(0)}
                          </div>
                        )}

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900 truncate">
                              {u.displayName}
                            </span>
                            <span
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                u.role === 'admin'
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {u.role.toUpperCase()}
                            </span>
                            {u.role !== 'admin' && (
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                                  getProjectRoleOption(normalizeProjectRole(u.projectRole, 'FUNC')).badgeClass
                                }`}
                              >
                                {getProjectRoleLabel(u.projectRole, lang, 'short')}
                              </span>
                            )}
                            {isProtectedAdmin && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                                {t('Site Owner', '사이트 운영자')}
                              </span>
                            )}
                            {isSelf && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {t('You', '현재 계정')}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
                            <span className="flex items-center gap-1 font-mono">
                              <Mail className="w-3 h-3 text-slate-400" />
                              {u.email || t('Email private', '이메일 비공개')}
                            </span>
                            <span className="font-mono text-slate-400">
                              {t('Applied:', '가입일:')} {formatTimestamp(u.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions & Project Assignment */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
                        {activeTab === 'pending' && (
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              disabled={isBusy}
                              value={getPendingOrTargetRole(u)}
                              onChange={(e) =>
                                setSelectedRoleByUid((prev) => ({
                                  ...prev,
                                  [u.uid]: e.target.value as UserProjectRole,
                                }))
                              }
                              aria-label={t('Select role on approval', '승인 시 역할 선택')}
                              className="h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none cursor-pointer"
                            >
                              {PROJECT_ASSIGNABLE_ROLES.map((r) => (
                                <option key={r.code} value={r.code}>
                                  {lang === 'ko' ? r.labelKo : r.labelEn}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleStatusChange(u, 'approved', getPendingOrTargetRole(u))}
                              className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{t('Approve', '승인')}</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy || isProtectedAdmin}
                              onClick={() => void handleStatusChange(u, 'rejected')}
                              className="h-8 px-3 bg-white hover:bg-rose-50 disabled:opacity-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>{t('Reject', '거절')}</span>
                            </button>
                          </div>
                        )}

                        {activeTab === 'approved' && (
                          <div className="flex flex-col items-start lg:items-end gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[11px] font-semibold text-slate-500 mr-1">
                                {t('Projects:', '할당 프로젝트:')}
                              </span>
                              {(() => {
                                const assignedList =
                                  u.role === 'admin'
                                    ? assignableProjects
                                    : assignableProjects.filter((proj) =>
                                        u.assignedProjects.includes(proj.code)
                                      );
                                if (assignedList.length === 0) {
                                  return (
                                    <span className="text-[11px] text-slate-400">
                                      {t('None', '할당 없음')}
                                    </span>
                                  );
                                }
                                return assignedList.map((proj) => (
                                  <span
                                    key={`${u.uid}-${proj.code}`}
                                    title={`${proj.code} — ${proj.name}`}
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-md border text-[11px] font-mono font-semibold ${
                                      u.role === 'admin'
                                        ? 'bg-slate-100 border-slate-200 text-slate-700'
                                        : 'bg-blue-50 border-blue-200 text-blue-900'
                                    }`}
                                  >
                                    {proj.code}
                                  </span>
                                ));
                              })()}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {u.role !== 'admin' && (
                                <select
                                  disabled={isBusy}
                                  value={normalizeProjectRole(u.projectRole, 'FUNC') === 'ADMIN' ? 'FUNC' : normalizeProjectRole(u.projectRole, 'FUNC')}
                                  onChange={(e) =>
                                    void handleDefaultProjectRoleChange(
                                      u,
                                      e.target.value as UserProjectRole
                                    )
                                  }
                                  aria-label={t('Default project role', '기본 프로젝트 역할')}
                                  className="h-7 px-2 bg-white border border-slate-300 rounded-md text-[11px] font-semibold text-slate-800 focus:border-blue-500 focus:outline-none cursor-pointer disabled:opacity-50"
                                >
                                  {PROJECT_ASSIGNABLE_ROLES.map((r) => (
                                    <option key={r.code} value={r.code}>
                                      {lang === 'ko' ? r.labelKo : r.labelEn}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <button
                                type="button"
                                disabled={isBusy || ((isSelf || isProtectedAdmin) && u.role === 'admin')}
                                onClick={() => void handleAccountRoleToggle(u)}
                                className="h-7 px-2.5 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 border border-slate-300 rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
                              >
                                {u.role === 'admin'
                                  ? t('Demote to User', '일반 사용자 전환')
                                  : t('Make Admin', '관리자 승격')}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy || isSelf || isProtectedAdmin}
                                onClick={() => void handleRevokeApprovedUser(u)}
                                className="h-7 px-2.5 bg-white hover:bg-rose-50 disabled:opacity-40 disabled:cursor-not-allowed text-rose-700 border border-rose-200 rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
                              >
                                {t('Revoke Access', '권한 회수')}
                              </button>
                            </div>
                          </div>
                        )}

                        {activeTab === 'rejected' && (
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              disabled={isBusy}
                              value={getPendingOrTargetRole(u)}
                              onChange={(e) =>
                                setSelectedRoleByUid((prev) => ({
                                  ...prev,
                                  [u.uid]: e.target.value as UserProjectRole,
                                }))
                              }
                              aria-label={t('Select role on re-approval', '재승인 시 역할 선택')}
                              className="h-8 px-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:border-blue-500 focus:outline-none cursor-pointer"
                            >
                              {PROJECT_ASSIGNABLE_ROLES.map((r) => (
                                <option key={r.code} value={r.code}>
                                  {lang === 'ko' ? r.labelKo : r.labelEn}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => void handleStatusChange(u, 'approved', getPendingOrTargetRole(u))}
                              className="h-8 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{t('Re-approve', '재승인')}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
