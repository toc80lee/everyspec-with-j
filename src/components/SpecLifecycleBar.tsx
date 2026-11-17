import React, { useState } from 'react';
import {
  ProgramSpec,
  SpecLifecycleStatus,
  UserProjectRole,
} from '../types/sap';
import { createRevisionSnapshot } from '../utils/specSnapshotStorage';
import { useLanguage } from '../contexts/LanguageContext';
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
  const { t } = useLanguage();
  const [snapshotNote, setSnapshotNote] = useState('');
  const [showSnapshotPrompt, setShowSnapshotPrompt] = useState(false);
  const [savingSnap, setSavingSnap] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const STATUS_KO: Record<SpecLifecycleStatus, { label: string; desc: string }> = {
    draft: { label: '초안 (Draft)', desc: '기능 로직 및 필드 카탈로그 설계 중' },
    in_review: { label: '검토중 (In Review)', desc: 'PM / 아키텍트 승인 대기 중' },
    approved: { label: '승인됨 (Approved)', desc: '사양 확정 및 잠금 (PM / 관리자 전용)' },
    developed: { label: '개발 완료', desc: 'ABAP 구현 및 단위 테스트 완료' },
    qa_passed: { label: 'QA 통과', desc: 'UAT 및 품질 검증 완료' },
  };

  const status: SpecLifecycleStatus = spec.status || 'draft';
  const meta = STATUS_META[status];
  const statusLabel = t(meta.label, STATUS_KO[status].label);
  const statusDesc = t(meta.desc, STATUS_KO[status].desc);
  const canApprove = projectRole === 'PM' || projectRole === 'ADMIN';
  const canDevelop = projectRole === 'ABAP' || canApprove;
  const canQaPass = projectRole === 'QA' || canApprove;
  const isLockedApproved = (status === 'approved' || status === 'qa_passed') && !canApprove;

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2600);
  };

  const handleTransitionStatus = async (nextStatus: SpecLifecycleStatus) => {
    if (isReadOnlyCommon) return;
    if (nextStatus === 'approved' && !canApprove) {
      showToast(t('Only PM or ADMIN roles can approve specifications.', 'PM 또는 ADMIN 권한만 사양을 승인할 수 있습니다.'));
      return;
    }
    if (status === 'qa_passed' && !canApprove) {
      showToast(t('Only PM or ADMIN roles can revise a QA Passed specification.', 'QA 통과된 사양은 PM 또는 ADMIN 권한만 개정(잠금 해제)할 수 있습니다.'));
      return;
    }
    if (status === 'approved' && nextStatus !== 'developed' && !canApprove) {
      showToast(t('Only PM or ADMIN roles can unlock an Approved specification.', 'PM 또는 ADMIN 권한만 승인된 사양의 잠금을 해제할 수 있습니다.'));
      return;
    }
    if (status === 'approved' && nextStatus === 'developed' && !canDevelop) {
      showToast(t('Only ABAP, PM, or ADMIN roles can mark an Approved spec as Developed.', 'ABAP, PM 또는 ADMIN 권한만 개발 완료 처리할 수 있습니다.'));
      return;
    }
    if (nextStatus === 'qa_passed' && !canQaPass) {
      showToast(t('Only QA, PM, or ADMIN roles can mark QA Passed.', 'QA, PM 또는 ADMIN 권한만 QA 통과 처리할 수 있습니다.'));
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
    showToast(
      t(
        `Status updated to '${STATUS_META[nextStatus].label}' with revision snapshot.`,
        `상태가 '${STATUS_KO[nextStatus].label}'(으)로 변경되고 리비전 스냅샷이 저장되었습니다.`
      )
    );
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
      showToast(t(`Saved revision snapshot ${historyItem.version}.`, `리비전 스냅샷 ${historyItem.version}이(가) 저장되었습니다.`));
    } finally {
      setSavingSnap(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-2xs space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            title={`${statusDesc}${isLockedApproved ? t(` · Read-only lock (${projectRole})`, ` · 읽기 전용 잠금 (${projectRole})`) : ''}`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-bold cursor-help ${meta.bg} ${meta.text} ${meta.border}`}
          >
            {status === 'approved' ? (
              <Lock className="w-3.5 h-3.5" />
            ) : status === 'qa_passed' ? (
              <ShieldCheck className="w-3.5 h-3.5" />
            ) : (
              <FileCheck2 className="w-3.5 h-3.5" />
            )}
            <span>{statusLabel}</span>
          </span>
          {spec.approved_by && (
            <span
              title={t(`Approved at: ${spec.approved_at || '-'}`, `승인 일시: ${spec.approved_at || '-'}`)}
              className="text-[11px] font-mono text-emerald-700"
            >
              {t(`Approved by: ${spec.approved_by}`, `승인자: ${spec.approved_by}`)}
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
                  {t('Request Review', '검토 요청')}
                </button>
              )}

              {(status === 'draft' || status === 'in_review') && (
                <button
                  type="button"
                  onClick={() => handleTransitionStatus('approved')}
                  disabled={!canApprove}
                  title={
                    canApprove
                      ? t('Approve specification and lock edits for non-admins', '사양을 승인하고 비관리자의 편집을 잠급니다')
                      : t('Only PM or ADMIN roles can approve', 'PM 또는 ADMIN 권한만 승인할 수 있습니다')
                  }
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                    canApprove
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 cursor-pointer'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  {t('Approve', '승인')}
                </button>
              )}

              {status === 'approved' && (
                <>
                  <button
                    type="button"
                    onClick={() => handleTransitionStatus('developed')}
                    disabled={!canDevelop}
                    title={
                      canDevelop
                        ? t('Mark ABAP implementation complete', 'ABAP 개발 완료 상태로 전환합니다')
                        : t('Only ABAP, PM, or ADMIN roles can mark as Developed', 'ABAP, PM 또는 ADMIN 권한만 개발 완료 처리할 수 있습니다')
                    }
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      canDevelop
                        ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                        : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    }`}
                  >
                    <Wrench className="w-3 h-3" />
                    {t('Developed', '개발 완료')}
                  </button>
                  {canApprove && (
                    <button
                      type="button"
                      onClick={() => handleTransitionStatus('draft')}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Unlock className="w-3 h-3" />
                      {t('Unlock', '잠금 해제')}
                    </button>
                  )}
                </>
              )}

              {status === 'developed' && (
                <button
                  type="button"
                  onClick={() => handleTransitionStatus('qa_passed')}
                  disabled={!canQaPass}
                  title={
                    canQaPass
                      ? t('Mark UAT / QA verification passed', 'QA/UAT 검증 통과 상태로 전환합니다')
                      : t('Only QA, PM, or ADMIN roles can mark QA Passed', 'QA, PM 또는 ADMIN 권한만 QA 통과 처리할 수 있습니다')
                  }
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    canQaPass
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  {t('QA Passed', 'QA 통과')}
                </button>
              )}

              {status === 'qa_passed' && canApprove && (
                <button
                  type="button"
                  onClick={() => handleTransitionStatus('draft')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Unlock className="w-3 h-3" />
                  {t('Revise', '개정')}
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowSnapshotPrompt((v) => !v)}
                title={t('Save Revision Snapshot', '리비전 스냅샷 저장')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Camera className="w-3 h-3" />
                {t('Snapshot', '스냅샷')}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onOpenDiffModal}
            title={t('Compare revisions and restore history', '리비전 비교 및 이력 복원')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <GitCompare className="w-3 h-3" />
            {t('Diff / History', '비교/이력')}
          </button>
        </div>
      </div>

      {showSnapshotPrompt && (
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2">
          <input
            type="text"
            value={snapshotNote}
            onChange={(e) => setSnapshotNote(e.target.value)}
            placeholder={t('Snapshot note (e.g., Added business validation v1.2)', '스냅샷 메모 (예: 업무 검증 로직 v1.2 추가)')}
            className="flex-1 bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            disabled={savingSnap}
            onClick={handleCreateManualSnapshot}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold disabled:opacity-50 cursor-pointer whitespace-nowrap shrink-0"
          >
            {savingSnap ? t('Saving...', '저장 중...') : t('Save Snapshot', '스냅샷 저장')}
          </button>
          <button
            type="button"
            onClick={() => setShowSnapshotPrompt(false)}
            className="px-2 py-1.5 rounded text-xs text-slate-500 hover:bg-slate-200 cursor-pointer whitespace-nowrap shrink-0"
          >
            {t('Cancel', '취소')}
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
