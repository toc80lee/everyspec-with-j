import React, { useEffect, useMemo, useState } from 'react';
import { ProgramSpec } from '../types/sap';
import {
  computeSpecDiff,
  loadMergedSnapshotsForSpec,
  SpecSnapshotRecord,
} from '../utils/specSnapshotStorage';
import { GitCompare, History, RotateCcw, X, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface SpecSnapshotDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSpec: ProgramSpec;
  isReadOnly: boolean;
  onRestoreSnapshot: (restoredSpec: ProgramSpec) => void;
}

export const SpecSnapshotDiffModal: React.FC<SpecSnapshotDiffModalProps> = ({
  isOpen,
  onClose,
  currentSpec,
  isReadOnly,
  onRestoreSnapshot,
}) => {
  const { t } = useLanguage();
  const [snapshots, setSnapshots] = useState<SpecSnapshotRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSnapId, setSelectedSnapId] = useState<string>('');

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    loadMergedSnapshotsForSpec(currentSpec)
      .then((list) => {
        if (!active) return;
        setSnapshots(list);
        if (list.length > 0) {
          setSelectedSnapId(list[0].snapshotId);
        } else {
          setSelectedSnapId('');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, currentSpec.id, currentSpec.program_id]);

  const selectedSnapshot = useMemo(
    () => snapshots.find((s) => s.snapshotId === selectedSnapId) || null,
    [snapshots, selectedSnapId]
  );

  const diffs = useMemo(() => {
    if (!selectedSnapshot) return [];
    return computeSpecDiff(selectedSnapshot.spec, currentSpec);
  }, [selectedSnapshot, currentSpec]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <GitCompare className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-sm font-bold">{t('Compare & Restore Revision Snapshots', '리비전 스냅샷 비교 및 복원')}</h3>
              <p className="text-[11px] text-slate-300 font-mono">
                {currentSpec.program_id} — {t('Compare saved snapshots against working copy', '저장된 스냅샷과 현재 작업본 비교')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t('Close', '닫기')}
            aria-label={t('Close', '닫기')}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-3">
          {/* Snapshot List */}
          <div className="border-r border-slate-200 bg-slate-50 p-3 overflow-y-auto space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-1 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              {t('Saved Snapshots', '저장된 스냅샷')} ({snapshots.length})
            </div>

            {loading ? (
              <div className="text-xs text-slate-500 p-4 text-center">{t('Loading snapshots...', '스냅샷 불러오는 중...')}</div>
            ) : snapshots.length === 0 ? (
              <div className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg p-3">
                {t(
                  'No saved snapshots yet. Click Save Snapshot in the top bar to record revision history.',
                  '아직 저장된 스냅샷이 없습니다. 상단 바의 스냅샷 버튼을 눌러 이력을 저장하세요.'
                )}
              </div>
            ) : (
              snapshots.map((snap) => {
                const active = snap.snapshotId === selectedSnapId;
                return (
                  <button
                    key={snap.snapshotId}
                    type="button"
                    onClick={() => setSelectedSnapId(snap.snapshotId)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
                      active
                        ? 'bg-blue-50 border-blue-400 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-mono text-blue-700">{snap.version}</span>
                      <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                        {snap.status}
                      </span>
                    </div>
                    <p className="text-[11.5px] font-semibold text-slate-800 mt-1 line-clamp-2">
                      {snap.comment}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1 font-mono">
                      {snap.author} · {snap.changedAt}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          {/* Diff Viewer */}
          <div className="md:col-span-2 p-4 overflow-y-auto space-y-3 bg-white">
            {!selectedSnapshot ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                {t('Select a snapshot from the left to compare.', '비교할 스냅샷을 좌측에서 선택하세요.')}
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <div>
                    <div className="text-xs font-bold text-slate-800">
                      {t('Baseline', '기준')} <span className="font-mono text-blue-700">{selectedSnapshot.version}</span> {t('vs Working Copy', 'vs 현재 작업본')}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {t(`${diffs.length} change(s) detected`, `${diffs.length}건의 변경 사항 감지됨`)}
                    </div>
                  </div>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        onRestoreSnapshot({
                          ...selectedSnapshot.spec,
                          id: currentSpec.id,
                          project_code: currentSpec.project_code,
                        });
                        onClose();
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {t('Restore Version', '이 버전으로 복원')}
                    </button>
                  )}
                </div>

                {diffs.length === 0 ? (
                  <div className="flex items-center gap-2 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {t('No differences between the selected snapshot and current spec.', '선택한 스냅샷과 현재 사양 간 차이가 없습니다.')}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {diffs.map((d, i) => (
                      <div key={i} className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                        <div className="bg-slate-100 px-3 py-1.5 font-bold text-slate-700 flex items-center justify-between">
                          <span>{d.label}</span>
                          <span className="text-[10px] font-mono text-slate-500">{d.section}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
                          <div className="p-2.5 bg-rose-50/40">
                            <div className="text-[10px] font-bold text-rose-700 mb-1">
                              {t('Snapshot', '스냅샷')} ({selectedSnapshot.version})
                            </div>
                            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-slate-700 max-h-36 overflow-y-auto">
                              {d.before}
                            </pre>
                          </div>
                          <div className="p-2.5 bg-emerald-50/40">
                            <div className="text-[10px] font-bold text-emerald-700 mb-1">
                              {t('Working Copy', '현재 작업본')}
                            </div>
                            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] text-slate-700 max-h-36 overflow-y-auto">
                              {d.after}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
