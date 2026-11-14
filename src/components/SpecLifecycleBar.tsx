import React, { useState } from 'react';
import {
  ProgramSpec,
  SpecLifecycleStatus,
  UserProjectRole,
} from '../types/sap';
import { createRevisionSnapshot } from '../utils/specSnapshotStorage';
import {
  Camera,
  CheckCircle2,
  FileCheck2,
  GitCompare,
  Lock,
  ShieldCheck,
  Unlock,
  Send,
  Wrench,
} from 'lucide-react';

interface SpecLifecycleBarProps {
  spec: ProgramSpec;
  currentUserName: string;
  projectRole: UserProjectRole;
  isReadOnlyCommon: boolean;
  onChange: (updated: ProgramSpec) => void;
  onOpenDiffModal: () => void;
}

const STATUS_META: Record<
  SpecLifecycleStatus,
  { label: string; bg: string; text: string; border: string; desc: string }
> = {
  draft: {
    label: 'Draft',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-300',
    desc: 'Designing functional logic and field catalog',
  },
  in_review: {
    label: 'In Review',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-300',
    desc: 'Awaiting PM / Architect approval',
  },
  approved: {
    label: 'Approved',
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-300',
    desc: 'Locked specification (PM / Admin only)',
  },
  developed: {
    label: 'Developed',
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-300',
    desc: 'ABAP implementation and unit testing complete',
  },
  qa_passed: {
    label: 'QA Passed',
    bg: 'bg-indigo-50',
    text: 'text-indigo-800',
    border: 'border-indigo-300',
    desc: 'UAT and quality verification passed',
  },
};

export const SpecLifecycleBar: React.FC<SpecLifecycleBarProps> = ({
  spec,
  currentUserName,
  projectRole,
  isReadOnlyCommon,
  onChange,
  onOpenDiffModal,
}) => {
  const [snapshotNote, setSnapshotNote] = useState('');
  const [showSnapshotPrompt, setShowSnapshotPrompt] = useState(false);
  const [savingSnap, setSavingSnap] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const status: SpecLifecycleStatus = spec.status || 'draft';
  const meta = STATUS_META[status];
  const canApprove = projectRole === 'PM' || projectRole === 'ADMIN';
  const isLockedApproved = status === 'approved' && !canApprove;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2600);
  };

  const handleTransitionStatus = async (nextStatus: SpecLifecycleStatus) => {
    if (isReadOnlyCommon) return;
    if ((nextStatus === 'approved' || status === 'approved') && !canApprove) {
      showToast('Only PM or ADMIN roles can approve or unlock specifications.');
      return;
    }

    const nowDateTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const comment = `Status changed: ${STATUS_META[status].label} → ${STATUS_META[nextStatus].label}`;

    const updatedBase: ProgramSpec = {
      ...spec,
      status: nextStatus,
      approved_by:
        nextStatus === 'approved'
          ? currentUserName
          : nextStatus === 'draft'
          ? undefined
          : spec.approved_by,
      approved_at:
        nextStatus === 'approved'
          ? nowDateTime
          : nextStatus === 'draft'
          ? undefined
          : spec.approved_at,
    };

    const { historyItem } = await createRevisionSnapshot(updatedBase, comment, currentUserName);

    onChange({
      ...updatedBase,
      change_history: [...(spec.change_history || []), historyItem],
    });
    showToast(`Status updated to '${STATUS_META[nextStatus].label}' with revision snapshot.`);
  };

  const handleCreateManualSnapshot = async () => {
    if (isReadOnlyCommon) return;
    setSavingSnap(true);
    try {
      const comment = snapshotNote.trim() || `${spec.program_id} design snapshot`;
      const { historyItem } = await createRevisionSnapshot(spec, comment, currentUserName);
      onChange({
        ...spec,
        change_history: [...(spec.change_history || []), historyItem],
      });
      setSnapshotNote('');
      setShowSnapshotPrompt(false);
      showToast(`Saved revision snapshot ${historyItem.version}.`);
    } finally {
      setSavingSnap(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-2xs space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            title={`${meta.desc}${isLockedApproved ? ` · Read-only lock (${projectRole})` : ''}`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold cursor-help ${meta.bg} ${meta.text} ${meta.border}`}
          >
            {status === 'approved' ? (
              <Lock className="w-3.5 h-3.5" />
            ) : status === 'qa_passed' ? (
              <ShieldCheck className="w-3.5 h-3.5" />
            ) : (
              <FileCheck2 className="w-3.5 h-3.5" />
            )}
            <span>{meta.label}</span>
          </span>
          {spec.approved_by && (
            <span
              title={`Approved at: ${spec.approved_at || '-'}`}
              className="text-[11px] font-mono text-emerald-700"
            >
              Approved by: {spec.approved_by}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!isReadOnlyCommon && (
            <>
              {status === 'draft' && (
                <button
                  type="button"
                  onClick={() => handleTransitionStatus('in_review')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Send className="w-3 h-3" />
                  Request Review
                </button>
              )}

              {(status === 'draft' || status === 'in_review') && (
                <button
                  type="button"
                  onClick={() => handleTransitionStatus('approved')}
                  disabled={!canApprove}
                  title={
                    canApprove
                      ? 'Approve specification and lock edits for non-admins'
                      : 'Only PM or ADMIN roles can approve'
                  }
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                    canApprove
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 cursor-pointer'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  Approve
                </button>
              )}

              {status === 'approved' && (
                <>
                  <button
                    type="button"
                    onClick={() => handleTransitionStatus('developed')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Wrench className="w-3 h-3" />
                    Developed
                  </button>
                  {canApprove && (
                    <button
                      type="button"
                      onClick={() => handleTransitionStatus('draft')}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Unlock className="w-3 h-3" />
                      Unlock
                    </button>
                  )}
                </>
              )}

              {status === 'developed' && (
                <button
                  type="button"
                  onClick={() => handleTransitionStatus('qa_passed')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  QA Passed
                </button>
              )}

              {status === 'qa_passed' && canApprove && (
                <button
                  type="button"
                  onClick={() => handleTransitionStatus('draft')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Unlock className="w-3 h-3" />
                  Revise
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowSnapshotPrompt((v) => !v)}
                title="Save Revision Snapshot"
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Camera className="w-3 h-3" />
                Snapshot
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onOpenDiffModal}
            title="Compare revisions and restore history"
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <GitCompare className="w-3 h-3" />
            Diff / History
          </button>
        </div>
      </div>

      {showSnapshotPrompt && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2">
          <input
            type="text"
            value={snapshotNote}
            onChange={(e) => setSnapshotNote(e.target.value)}
            placeholder="Snapshot note (e.g., Added business validation v1.2)"
            className="flex-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            disabled={savingSnap}
            onClick={handleCreateManualSnapshot}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            {savingSnap ? 'Saving...' : 'Save Snapshot'}
          </button>
          <button
            type="button"
            onClick={() => setShowSnapshotPrompt(false)}
            className="px-2 py-1.5 rounded text-xs text-slate-500 hover:bg-slate-200 cursor-pointer whitespace-nowrap shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {toastMsg && (
        <div className="text-[11px] font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded px-2.5 py-1">
          {toastMsg}
        </div>
      )}
    </div>
  );
};
