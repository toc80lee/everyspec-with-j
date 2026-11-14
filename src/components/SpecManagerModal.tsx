import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Save,
  Copy,
  Trash2,
  X,
  Search,
  CheckCircle2,
  AlertCircle,
  FileCode,
  ArrowRight,
  Lock,
  User,
  History,
  Shield,
} from 'lucide-react';
import { ProgramSpec } from '../types/sap';
import {
  getSavedSpecList,
  saveSpecToStorage,
  copySpecInStorage,
  deleteSpecFromStorage,
  SavedProgramSpecItem,
} from '../utils/specStorage';
import {
  getCurrentUser,
  setCurrentUser,
  getRegisteredUsers,
  USERS_UPDATED_EVENT,
  CurrentUser,
} from '../utils/authStorage';
import {
  COMMON_PROJECT_CODE,
  TEMP_PROJECT_CODE,
  getAccessibleProjectsForUser,
  isReadOnlyCommonSpec,
  isSpecVisibleInProject,
} from '../utils/projectStorage';

interface SpecManagerModalProps {
  currentSpec: ProgramSpec;
  isOpen: boolean;
  onClose: () => void;
  onSelectSpec: (spec: ProgramSpec) => void;
}

export const SpecManagerModal: React.FC<SpecManagerModalProps> = ({
  currentSpec,
  isOpen,
  onClose,
  onSelectSpec,
}) => {
  const [specs, setSpecs] = useState<SavedProgramSpecItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // User Authentication State
  const [currentUser, setCurrentUserState] = useState<CurrentUser>(getCurrentUser());
  const [registeredUsers, setRegisteredUsers] = useState<CurrentUser[]>(() => getRegisteredUsers());
  const [isUserSwitcherOpen, setIsUserSwitcherOpen] = useState(false);

  // Save with Change History Modal State
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveChangeComment, setSaveChangeComment] = useState('');

  // Copy modal state
  const [copyingSource, setCopyingSource] = useState<SavedProgramSpecItem | null>(null);
  const [copyTargetProject, setCopyTargetProject] = useState<string>(TEMP_PROJECT_CODE);
  const [newProgramIdInput, setNewProgramIdInput] = useState('');
  const [copyError, setCopyError] = useState<string | null>(null);

  // History Detail Viewer Modal State
  const [historyViewingItem, setHistoryViewingItem] = useState<SavedProgramSpecItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const tableScrollRef = React.useRef<HTMLDivElement>(null);

  const scrollTable = (direction: 'left' | 'right') => {
    if (tableScrollRef.current) {
      tableScrollRef.current.scrollBy({
        left: direction === 'left' ? -300 : 300,
        behavior: 'smooth',
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshList();
      setCurrentUserState(getCurrentUser());
      setRegisteredUsers(getRegisteredUsers());
    }
  }, [isOpen]);

  useEffect(() => {
    const syncUsers = () => {
      setRegisteredUsers(getRegisteredUsers());
      setCurrentUserState(getCurrentUser());
    };
    window.addEventListener(USERS_UPDATED_EVENT, syncUsers);
    return () => window.removeEventListener(USERS_UPDATED_EVENT, syncUsers);
  }, []);

  const refreshList = () => {
    const list = getSavedSpecList();
    setSpecs(list);
  };

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleSwitchUser = (user: CurrentUser) => {
    setCurrentUser(user);
    setCurrentUserState(user);
    setIsUserSwitcherOpen(false);
    showToast('success', `Signed in as '${user.name}'.`);
  };

  if (!isOpen) return null;

  const accessibleProjects = getAccessibleProjectsForUser(currentUser.name);
  const accessibleCodes = new Set(accessibleProjects.map((p) => p.code));

  // Filtered spec list (enforces TEMP privacy & project membership visibility)
  const filteredSpecs = specs.filter((s) => {
    const projCode = s.project_code || TEMP_PROJECT_CODE;
    if (!accessibleCodes.has(projCode)) return false;
    if (!isSpecVisibleInProject(s, projCode, currentUser.name)) return false;

    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      s.program_id.toLowerCase().includes(query) ||
      s.title.toLowerCase().includes(query) ||
      s.tcode.toLowerCase().includes(query) ||
      s.module.toLowerCase().includes(query) ||
      s.author.toLowerCase().includes(query) ||
      projCode.toLowerCase().includes(query) ||
      (s.sample_type && s.sample_type.includes(query))
    );
  });

  // Handle Save Spec with change description
  const handleExecuteSave = () => {
    const res = saveSpecToStorage(currentSpec, saveChangeComment, currentUser.name);
    if (res.success && res.savedItem) {
      refreshList();
      setIsSaveModalOpen(false);
      setSaveChangeComment('');
      showToast(
        'success',
        `Saved '${currentSpec.program_id}' as version ${
          res.savedItem.change_history[res.savedItem.change_history.length - 1]?.version || 'v1.0'
        }.`
      );
    } else {
      showToast('error', res.message || 'Failed to save spec.');
    }
  };

  // Open copy dialog for an item
  const handleOpenCopyDialog = (item: SavedProgramSpecItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setCopyingSource(item);
    setCopyTargetProject(
      item.project_code === COMMON_PROJECT_CODE ? TEMP_PROJECT_CODE : item.project_code || TEMP_PROJECT_CODE
    );
    setNewProgramIdInput(`${item.program_id}_COPY`);
    setCopyError(null);
  };

  // Execute copy
  const handleExecuteCopy = () => {
    if (!copyingSource) return;
    const res = copySpecInStorage(
      copyingSource.program_id,
      newProgramIdInput,
      currentUser.name,
      copyTargetProject
    );
    if (res.success && res.newSpec) {
      refreshList();
      setCopyingSource(null);
      setCopyError(null);
      showToast('success', `Copied '${res.newSpec.program_id}' to project '${res.newSpec.project_code}'.`);
      onSelectSpec(res.newSpec);
      onClose();
    } else {
      setCopyError(res.message || 'Failed to copy spec.');
    }
  };

  // Delete item with strict authorization
  const handleDelete = (item: SavedProgramSpecItem, e: React.MouseEvent) => {
    e.stopPropagation();

    if (item.is_system) {
      showToast('error', 'Default sample specifications cannot be deleted.');
      return;
    }

    if (item.author !== currentUser.name) {
      showToast(
        'error',
        `Only the author (${item.author}) can delete this spec.`
      );
      return;
    }

    if (confirmDeleteId !== item.program_id) {
      setConfirmDeleteId(item.program_id);
      return;
    }

    const res = deleteSpecFromStorage(item.program_id, currentUser.name);
    setConfirmDeleteId(null);
    if (res.success) {
      setSpecs(res.list);
      showToast('success', `Deleted spec '${item.program_id}'.`);
    } else {
      showToast('error', res.message || 'Failed to delete spec.');
    }
  };

  // Select/Load spec
  const handleSelect = (item: SavedProgramSpecItem) => {
    onSelectSpec(item.spec);
    showToast('success', `Loaded spec '${item.program_id}'.`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-base font-bold text-white leading-tight flex items-center gap-2">
                <span>Program Spec Manager</span>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-900/80 text-blue-200 border border-blue-700 tabular-nums">
                  {specs.length} Specs
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Save, load, copy, and manage version history for program specifications.
              </p>
            </div>
          </div>

          {/* Current Logged-in User Profile & Switcher */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsUserSwitcherOpen(!isUserSwitcherOpen)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs flex items-center gap-2 transition-colors cursor-pointer"
                title="Switch user profile"
              >
                <div className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-[10px]">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="text-left">
                  <div className="font-bold text-white text-[11px] leading-none">
                    {currentUser.name}
                  </div>
                  <div className="text-[9px] text-blue-300 leading-none mt-0.5">
                    {currentUser.role}
                  </div>
                </div>
                <span className="text-[10px] text-slate-400">▼</span>
              </button>

              {/* User Switcher Dropdown */}
              {isUserSwitcherOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 p-2 z-50 text-slate-800 font-sans">
                  <div className="text-[11px] font-bold text-slate-500 px-2 py-1 border-b border-slate-100 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-blue-600" />
                    <span>Switch Registered User</span>
                  </div>
                  <div className="py-1 space-y-0.5 max-h-56 overflow-y-auto">
                    {registeredUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleSwitchUser(u)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          currentUser.name === u.name
                            ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200'
                            : 'hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold text-xs truncate">{u.name}</div>
                          <div className="text-[10px] text-slate-500 truncate">{u.email || u.role}</div>
                        </div>
                        {currentUser.name === u.name && (
                          <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="pt-2 border-t border-slate-100 px-2 text-[10px] text-slate-500">
                    Manage members in Project Settings & Members.
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              title="Close"
              aria-label="Close"
              className="text-slate-400 hover:text-white p-1 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action bar */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (isReadOnlyCommonSpec(currentSpec)) {
                  showToast('error', 'COMM samples are read-only. Copy to another project to save changes.');
                  return;
                }
                setIsSaveModalOpen(true);
              }}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Save current spec with version history"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Current Spec [{currentSpec.program_id}]</span>
            </button>

            <span className="text-xs text-slate-500 ml-2">
              Author: <strong className="text-slate-800">{currentUser.name}</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Horizontal Scroll Quick Buttons */}
            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-300 text-xs shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 mr-1">Scroll:</span>
              <button
                type="button"
                onClick={() => scrollTable('left')}
                className="px-2 py-0.5 bg-slate-100 hover:bg-blue-100 hover:text-blue-800 rounded text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                title="Scroll table left"
              >
                ◀ Left
              </button>
              <button
                type="button"
                onClick={() => scrollTable('right')}
                className="px-2 py-0.5 bg-slate-100 hover:bg-blue-100 hover:text-blue-800 rounded text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                title="Scroll table right"
              >
                Right ▶
              </button>
            </div>

            <div className="relative min-w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search ID, title, module, author..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
              />
            </div>
          </div>
        </div>

        {/* Toast / Alert notification */}
        {toastMessage && (
          <div
            className={`px-6 py-2 text-xs font-medium flex items-center gap-2 shrink-0 border-b ${
              toastMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        )}

        {/* Spec List Table with Horizontal Scroll (필드 정보 잘림 방지: min-w-[1100px] 및 가로 스크롤 제공) */}
        <div className="flex-1 overflow-auto p-6">
          <div
            ref={tableScrollRef}
            className="border border-slate-200 rounded-lg overflow-x-auto shadow-2xs bg-white"
            style={{ scrollbarWidth: 'thin' }}
          >
            <table className="w-full text-left text-xs border-collapse min-w-[1100px] whitespace-nowrap">
              <thead className="bg-[#e9f0f8] border-b border-slate-200 text-slate-700 font-bold uppercase text-[11px] sticky top-0 z-10">
                <tr>
                  <th className="px-3.5 py-2.5 w-40">Program ID</th>
                  <th className="px-3.5 py-2.5 w-28">Project</th>
                  <th className="px-3.5 py-2.5 w-28">Type</th>
                  <th className="px-3.5 py-2.5 w-20">Module</th>
                  <th className="px-3.5 py-2.5 w-28">T-Code</th>
                  <th className="px-3.5 py-2.5 min-w-56">Title</th>
                  <th className="px-3.5 py-2.5 w-28">Author</th>
                  <th className="px-3.5 py-2.5 w-48">History</th>
                  <th className="px-3.5 py-2.5 w-36">Updated</th>
                  <th className="px-3.5 py-2.5 w-48 text-center sticky right-0 bg-[#e9f0f8] shadow-xs">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-sans">
                {filteredSpecs.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      No matching program specs found.
                    </td>
                  </tr>
                ) : (
                  filteredSpecs.map((item) => {
                    const isCurrent = item.program_id === currentSpec.program_id;
                    const isMySpec = item.author === currentUser.name;
                    const isSystem = !!item.is_system || isReadOnlyCommonSpec(item.spec);
                    const canDelete = !isSystem && isMySpec;

                    const latestHistory =
                      item.change_history && item.change_history.length > 0
                        ? item.change_history[item.change_history.length - 1]
                        : null;

                    return (
                      <tr
                        key={item.program_id}
                        onClick={() => handleSelect(item)}
                        className={`hover:bg-blue-50/70 transition-colors cursor-pointer group ${
                          isCurrent ? 'bg-blue-50/50' : 'bg-white'
                        }`}
                      >
                        <td
                          className="px-3.5 py-2.5 font-mono font-bold text-blue-700 group-hover:text-blue-900"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelect(item);
                          }}
                        >
                          <div className="flex items-center gap-1.5" title="Click Program ID to load spec">
                            <FileCode className="w-4 h-4 text-blue-500 shrink-0" />
                            <span className="underline decoration-blue-300 group-hover:decoration-blue-700 cursor-pointer font-extrabold">
                              {item.program_id}
                            </span>
                            {isSystem && (
                              <span
                                className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-sans font-semibold border border-amber-200"
                                title="Standard SAP sample spec"
                              >
                                Sample
                              </span>
                            )}
                            {isCurrent && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-600 text-white font-sans font-bold">
                                Active
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Project */}
                        <td className="px-3.5 py-2.5 font-mono font-bold text-slate-700">
                          {item.project_code || TEMP_PROJECT_CODE}
                        </td>

                        {/* Type */}
                        <td className="px-3.5 py-2.5 font-mono text-[11px] font-semibold text-slate-700">
                          {item.sample_type === '01'
                            ? '01 (Single)'
                            : item.sample_type === '02'
                            ? '02 (Master-Detail)'
                            : item.sample_type === '03'
                            ? '03 (Tree)'
                            : item.sample_type === '04'
                            ? '04 (Pivot)'
                            : item.sample_type || '01'}
                        </td>

                        {/* Module */}
                        <td className="px-3.5 py-2.5 font-semibold text-slate-700">
                          {item.module}
                        </td>

                        {/* T-Code */}
                        <td className="px-3.5 py-2.5 font-mono text-slate-600">
                          {item.tcode}
                        </td>

                        {/* Title */}
                        <td className="px-3.5 py-2.5 text-slate-800 font-medium max-w-xs truncate" title={item.title}>
                          {item.title}
                        </td>

                        {/* Author */}
                        <td className="px-3.5 py-2.5">
                          <span
                            className={`font-medium ${
                              isMySpec ? 'text-blue-700 font-bold' : 'text-slate-600'
                            }`}
                          >
                            {item.author}
                          </span>
                        </td>

                        {/* History */}
                        <td
                          className="px-3.5 py-2.5"
                          onClick={(e) => {
                            e.stopPropagation();
                            setHistoryViewingItem(item);
                          }}
                        >
                          <div
                            className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-900 rounded border border-slate-200 transition-colors cursor-pointer text-[11px]"
                            title="View version history"
                          >
                            <History className="w-3 h-3 text-slate-500" />
                            <span className="font-mono font-bold text-blue-700">
                              {latestHistory?.version || 'v1.0'}
                            </span>
                            <span className="text-[10px] text-slate-500 max-w-28 truncate">
                              ({latestHistory?.comment || 'Initial'})
                            </span>
                          </div>
                        </td>

                        {/* Updated */}
                        <td className="px-3.5 py-2.5 font-mono text-slate-500 text-[11px] tabular-nums">
                          {item.updated_at}
                        </td>

                        {/* Actions */}
                        <td className="px-3.5 py-2.5 text-center sticky right-0 bg-white group-hover:bg-blue-50/70 border-l border-slate-200 shadow-xs">
                          <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={(e) => handleOpenCopyDialog(item, e)}
                              className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded transition-colors cursor-pointer"
                              title="Copy Spec"
                              aria-label={`Copy ${item.program_id}`}
                            >
                              <Copy className="w-3.5 h-3.5 text-amber-600" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleSelect(item)}
                              className="p-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded transition-colors cursor-pointer"
                              title="Load Spec"
                              aria-label={`Load ${item.program_id}`}
                            >
                              <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                            </button>

                            {isSystem ? (
                              <span
                                className="p-1 text-slate-300 cursor-not-allowed flex items-center"
                                title="System sample specs cannot be deleted"
                              >
                                <Lock className="w-3.5 h-3.5 text-slate-400" />
                              </span>
                            ) : canDelete ? (
                              confirmDeleteId === item.program_id ? (
                                <button
                                  type="button"
                                  onClick={(e) => handleDelete(item, e)}
                                  className="px-2 py-1 text-[10px] font-bold bg-rose-600 text-white rounded hover:bg-rose-700 cursor-pointer whitespace-nowrap"
                                  title="Confirm Delete"
                                >
                                  Confirm?
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => handleDelete(item, e)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                  title="Delete Spec"
                                  aria-label={`Delete ${item.program_id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )
                            ) : (
                              <span
                                className="p-1 text-slate-300 cursor-not-allowed flex items-center"
                                title={`Only author (${item.author}) can delete`}
                              >
                                <Shield className="w-3.5 h-3.5 text-slate-300" />
                              </span>
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

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 shrink-0">
          <div className="flex items-center gap-4">
            <span className="tabular-nums">
              Total <strong>{filteredSpecs.length}</strong> program specs
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Save Spec with Change History Modal */}
      {isSaveModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Save className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold">Save Spec & Version History</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                title="Close"
                aria-label="Close"
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Target Program ID
                </span>
                <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded text-xs font-mono font-bold text-blue-900">
                  {currentSpec.program_id} ({currentSpec.title})
                </div>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Author
                </span>
                <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span>{currentUser.name}</span>
                  <span className="text-[10px] text-slate-400">({currentUser.role})</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Change Description
                </label>
                <textarea
                  rows={3}
                  value={saveChangeComment}
                  onChange={(e) => setSaveChangeComment(e.target.value)}
                  placeholder="e.g. Updated ALV sort criteria and selection parameters"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-400">
                  A new version number will be assigned and saved to version history.
                </span>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSave}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Spec</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Detail Viewer Modal */}
      {historyViewingItem && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold">
                  [{historyViewingItem.program_id}] Version History
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHistoryViewingItem(null)}
                title="Close"
                aria-label="Close"
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 max-h-96 overflow-y-auto space-y-3">
              {historyViewingItem.change_history && historyViewingItem.change_history.length > 0 ? (
                historyViewingItem.change_history
                  .slice()
                  .reverse()
                  .map((h, idx) => (
                    <div
                      key={h.id || idx}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                          {h.version}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {h.changed_at}
                        </span>
                      </div>
                      <div className="text-xs text-slate-800 font-medium pt-1">
                        {h.comment}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Author: <span className="font-semibold text-slate-700">{h.author}</span>
                      </div>
                    </div>
                  ))
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No change history recorded.
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryViewingItem(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Specification Dialog */}
      {copyingSource && (
        <div className="fixed inset-0 z-60 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Copy className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold">Copy Spec</h3>
              </div>
              <button
                type="button"
                onClick={() => setCopyingSource(null)}
                title="Close"
                aria-label="Close"
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                  Source Program ID
                </span>
                <div className="px-3 py-1.5 bg-slate-100 border border-slate-200 rounded text-xs font-mono font-bold text-slate-700">
                  {copyingSource.program_id} ({copyingSource.title})
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Target Project <span className="text-rose-500">*</span>
                </label>
                <select
                  value={copyTargetProject}
                  onChange={(e) => setCopyTargetProject(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-slate-50 text-slate-800 focus:bg-white focus:border-blue-500 cursor-pointer"
                >
                  {accessibleProjects
                    .filter((p) => p.code !== COMMON_PROJECT_CODE)
                    .map((p) => (
                      <option key={p.code} value={p.code}>
                        [{p.code}] {p.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  New Program ID <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newProgramIdInput}
                  onChange={(e) => {
                    setNewProgramIdInput(e.target.value.toUpperCase());
                    setCopyError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleExecuteCopy();
                  }}
                  placeholder="e.g. ZRALV0040_COPY"
                  className={`w-full px-3 py-2 text-xs font-mono font-bold uppercase rounded-lg border focus:outline-none transition-colors ${
                    copyError
                      ? 'border-rose-400 bg-rose-50/50 text-rose-900 focus:border-rose-500'
                      : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                  }`}
                />
              </div>

              {copyError && (
                <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-lg text-xs text-rose-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span className="font-bold">{copyError}</span>
                </div>
              )}

              <p className="text-[11px] text-slate-500">
                Copied spec will be created under your account (<strong>{currentUser.name}</strong>) with full edit and delete permissions.
              </p>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setCopyingSource(null)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteCopy}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Spec</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
