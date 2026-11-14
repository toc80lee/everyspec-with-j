import React, { useState, useEffect } from 'react';
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
  removeMemberFromAllProjects,
} from '../utils/projectStorage';
import { reassignSpecsProjectToTemp } from '../utils/specStorage';
import {
  CurrentUser,
  DEFAULT_OPERATOR_USER,
  USERS_UPDATED_EVENT,
  addRegisteredUser,
  getRegisteredUsers,
  isDefaultOperatorUser,
  removeRegisteredUser,
} from '../utils/authStorage';
import { syncProjectToFirestore } from '../services/firestoreSync';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectsChanged: (selectedCode?: string) => void;
  initialProjectCode?: string;
}

const MODULE_OPTIONS: { code: SapModule; label: string }[] = [
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
const ALL_MODULES: SapModule[] = MODULE_OPTIONS.map((m) => m.code);

const ROLE_OPTIONS = [
  'SAP Functional Consultant',
  'SAP ABAP Developer',
  'Project Manager',
  'QA / Release Engineer',
];

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  onClose,
  onProjectsChanged,
  initialProjectCode,
}) => {
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

  // New registered user inputs
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState(ROLE_OPTIONS[0]);

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
    setFormMembers(enforceProjectMembers(proj.members || [], safeOwner));
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

  if (!isOpen) return null;

  const isSystemProject =
    !isCreatingNew && (editingCode === COMMON_PROJECT_CODE || editingCode === TEMP_PROJECT_CODE);

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

  const toggleMember = (name: string) => {
    if (isSystemProject || isDefaultOperatorUser(name)) return;
    setFormMembers((prev) =>
      enforceProjectMembers(
        prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name],
        formOwner
      )
    );
  };

  const handleAddUser = () => {
    const res = addRegisteredUser({
      name: newUserName,
      email: newUserEmail,
      role: newUserRole,
    });
    if (!res.success || !res.user) {
      setNotice({ type: 'error', text: res.message || 'Failed to add user.' });
      return;
    }

    setRegisteredUsers(res.users);
    setNewUserName('');
    setNewUserEmail('');

    if (!isSystemProject) {
      setFormMembers((prev) => enforceProjectMembers([...prev, res.user!.name], formOwner));
    }

    const refreshedProjects = getProjects();
    setProjects(refreshedProjects);
    onProjectsChanged(editingCode || undefined);
    setNotice({
      type: 'success',
      text: `Added user '${res.user.name}' to workspace members.`,
    });
  };

  const handleRemoveUser = (user: CurrentUser) => {
    if (isDefaultOperatorUser(user)) return;
    const res = removeRegisteredUser(user.id);
    if (!res.success) {
      setNotice({ type: 'error', text: res.message || 'Failed to remove user.' });
      return;
    }

    const updatedProjects = removeMemberFromAllProjects(user.name);
    setRegisteredUsers(res.users);
    setProjects(updatedProjects);
    if (formOwner.toLowerCase() === user.name.toLowerCase()) {
      setFormOwner(DEFAULT_OPERATOR_USER.name);
    }
    setFormMembers((prev) =>
      enforceProjectMembers(
        prev.filter((m) => m.toLowerCase() !== user.name.toLowerCase()),
        DEFAULT_OPERATOR_USER.name
      )
    );
    onProjectsChanged(editingCode || undefined);
    setNotice({
      type: 'success',
      text: `Removed '${user.name}' from registered members.`,
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
        text: 'Project code must be exactly 4 characters (A-Z, 0-9, _).',
      });
      return;
    }
    if (cleanCode === COMMON_PROJECT_CODE || cleanCode === TEMP_PROJECT_CODE) {
      setNotice({ type: 'error', text: 'COMM and TEMP are reserved system project codes.' });
      return;
    }
    if (formStartDate && formEndDate && formEndDate < formStartDate) {
      setNotice({ type: 'error', text: 'End date must be on or after start date.' });
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
      setNotice({ type: 'error', text: res.message || 'Failed to save project.' });
      return;
    }

    syncProjectToFirestore(res.savedProject).catch((err) =>
      console.warn('Firestore project sync notice:', err)
    );
    setProjects(res.list);
    loadIntoForm(res.savedProject);
    setNotice({
      type: 'success',
      text: `Saved settings for project [${res.savedProject.code}].`,
    });
    onProjectsChanged(res.savedProject.code);
  };

  const handleDelete = () => {
    if (!editingCode || isSystemProject) return;
    const res = deleteProject(editingCode);
    if (!res.success) {
      setNotice({ type: 'error', text: res.message || 'Failed to delete project.' });
      return;
    }
    reassignSpecsProjectToTemp(editingCode);
    setProjects(res.list);
    const fallback = res.list.find((p) => !p.is_system) || res.list[0];
    if (fallback) loadIntoForm(fallback);
    setNotice({
      type: 'success',
      text: `Deleted project [${editingCode}]. Linked programs moved to TEMP.`,
    });
    onProjectsChanged(fallback?.code);
  };

  const registeredNamesLower = new Set(registeredUsers.map((u) => u.name.toLowerCase()));
  const extraProjectMembers = !isSystemProject
    ? formMembers.filter((m) => !registeredNamesLower.has(m.toLowerCase()))
    : [];

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
                Project Settings & Members
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure projects, manage registered members, and assign active SAP modules.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Back"
            aria-label="Back"
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
              <span className="text-xs font-bold text-slate-700">Projects</span>
              <button
                type="button"
                onClick={startNewProject}
                title="New Project"
                aria-label="New Project"
                className="w-8 h-8 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-2xs flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              {projects.map((p) => {
                const selected = !isCreatingNew && editingCode === p.code;
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
                          <span>System</span>
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-slate-800 truncate mt-0.5">{p.name}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {p.visibility === 'common'
                        ? `Company-Wide Common · ${p.members.length} Members`
                        : p.visibility === 'temp'
                        ? `Personal Space · ${p.members.length} Member`
                        : `${p.members.length} ${p.members.length === 1 ? 'Member' : 'Members'}`}
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
                  <strong>{editingCode}</strong> is a system default project and cannot be renamed, modified, or deleted.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Project Code <span className="text-rose-500">*</span>{' '}
                  <span className="text-[10px] font-normal text-slate-500">(4 chars: A-Z, 0-9, _)</span>
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
                  placeholder="e.g. 2603 (4 chars)"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold uppercase text-blue-900 disabled:bg-slate-100 disabled:text-slate-500 focus:bg-white focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target SAP Release
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
                  Start Date
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
                  End Date
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
                  Project Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isSystemProject}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Next-Gen SAP S/4HANA Rollout"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-medium text-slate-900 disabled:bg-slate-100 focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  disabled={isSystemProject}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Enter project scope and key objectives."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 disabled:bg-slate-100 focus:bg-white focus:border-blue-500"
                />
              </div>
            </div>

            {/* Active Modules */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Active SAP Modules
              </label>
              <div className="flex flex-wrap gap-1.5">
                {MODULE_OPTIONS.map((mod) => {
                  const active = formModules.includes(mod.code);
                  return (
                    <button
                      key={mod.code}
                      type="button"
                      disabled={isSystemProject}
                      onClick={() => toggleModule(mod.code)}
                      title={`${mod.code} — ${mod.label}`}
                      aria-label={`${mod.code} — ${mod.label}`}
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

            {/* Members & User Directory Management */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  <span>
                    {isSystemProject
                      ? 'Registered Users & Default Project Membership'
                      : 'Project Members & Registered Users'}
                  </span>
                </label>
                <span className="text-[11px] text-slate-500">
                  Josh Lee (toc80.lee@gmail.com) is always included in every project.
                </span>
              </div>

              {/* Add User to Registered Members Directory */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="text-[11px] font-semibold text-slate-600">
                  Add User to Workspace Directory
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddUser();
                      }
                    }}
                    placeholder="Full name *"
                    aria-label="New user name"
                    className="sm:col-span-4 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                  />
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
                    placeholder="Email (optional)"
                    aria-label="New user email"
                    className="sm:col-span-4 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                  />
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    aria-label="New user role"
                    className="sm:col-span-3 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-blue-500"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddUser}
                    title="Add User"
                    aria-label="Add User"
                    className="sm:col-span-1 h-8 bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Member Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {registeredUsers.map((user) => {
                  const isDefaultOp = isDefaultOperatorUser(user);
                  const checked = isSystemProject
                    ? editingCode === COMMON_PROJECT_CODE || isDefaultOp
                    : isDefaultOp || formMembers.includes(user.name);
                  const canToggle = !isSystemProject && !isDefaultOp;

                  return (
                    <div
                      key={user.id}
                      className={`px-3 py-2.5 rounded-lg border text-xs flex items-center justify-between gap-2 transition-colors ${
                        checked
                          ? 'bg-blue-50/70 border-blue-300 text-blue-950'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={!canToggle}
                        onClick={() => toggleMember(user.name)}
                        className={`flex-1 min-w-0 text-left flex items-start gap-2.5 ${
                          canToggle ? 'cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        <div
                          className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            checked
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'bg-white border-slate-300 text-transparent'
                          }`}
                        >
                          {isDefaultOp ? <Lock className="w-2.5 h-2.5" /> : <Check className="w-3 h-3" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-900 truncate">{user.name}</span>
                            {isDefaultOp && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-900 text-white whitespace-nowrap">
                                Default · Always Included
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 truncate mt-0.5">
                            {user.email ? (
                              <>
                                <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{user.email}</span>
                              </>
                            ) : (
                              <span className="truncate">{user.role}</span>
                            )}
                          </div>
                        </div>
                      </button>

                      {!isDefaultOp && (
                        <button
                          type="button"
                          onClick={() => handleRemoveUser(user)}
                          title={`Remove ${user.name}`}
                          aria-label={`Remove ${user.name}`}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}

                {extraProjectMembers.map((memberName) => (
                  <button
                    key={memberName}
                    type="button"
                    onClick={() => toggleMember(memberName)}
                    className="px-3 py-2.5 rounded-lg border bg-blue-50/70 border-blue-300 text-blue-950 text-xs flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="font-semibold truncate">{memberName}</span>
                    <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* Project ABAP Development Standards */}
            {!isSystemProject && (
              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Project ABAP Standards (Include · Wrapper Class · SE91 · Syntax)</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                      Common TOP Include
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
                      Common FORM Include
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
                      ALV Grid Wrapper Class
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
                      Message Class (SE91)
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
                      Default ABAP Syntax
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
                      <option value="classic">Classic ABAP (ECC 6.0 / NetWeaver 7.0x)</option>
                      <option value="modern_740">Modern ABAP 7.40+ (S/4HANA Inline / VALUE #)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                      Program ID Prefix
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
                      placeholder="e.g. ZR_, ZSD_"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                      T-Code Naming Pattern
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
                      placeholder="e.g. Z*, ZSD*"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-600 mb-1">
                      Dev Package (SE80)
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
                      placeholder="e.g. $TMP, ZDEV"
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
                    title="Delete Project"
                    aria-label="Delete Project"
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
                  title="Back"
                  aria-label="Back"
                  className="w-9 h-9 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                {!isSystemProject && (
                  <button
                    type="submit"
                    title={isCreatingNew ? 'Create Project' : 'Save Changes'}
                    aria-label={isCreatingNew ? 'Create Project' : 'Save Changes'}
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
