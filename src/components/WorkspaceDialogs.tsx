import React from 'react';
import { AlertTriangle, Copy, RefreshCw, Save } from 'lucide-react';
import { ProgramSpec } from '../types/sap';
import { useLanguage } from '../contexts/LanguageContext';

export interface SyncConflictState {
  specId: string;
  programId: string;
  localSpec: ProgramSpec;
  remoteSpec: ProgramSpec;
  remoteEditor: string;
  expectedRevision: number;
  remoteRevision: number;
}

interface PendingNavigationDialogProps {
  programId: string;
  onKeepEditing: () => void;
  onLeaveWithoutSnapshot: () => void;
  onSaveSnapshotAndLeave: () => void;
}

export const PendingNavigationDialog: React.FC<PendingNavigationDialogProps> = ({
  programId,
  onKeepEditing,
  onLeaveWithoutSnapshot,
  onSaveSnapshotAndLeave,
}) => {
  const { t } = useLanguage();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="leave-confirm-title"
      className="no-print fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[1px] flex items-center justify-center p-4"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 text-slate-900">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 id="leave-confirm-title" className="text-sm font-bold text-slate-900">
              {t('Leave without saving a revision snapshot?', '리비전 스냅샷을 저장하지 않고 이동하시겠습니까?')}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {t(
                'Edits are auto-saved locally and to the cloud, but no version snapshot has been recorded yet for ',
                '편집 내용은 로컬과 클라우드에 자동 저장되지만, 다음 프로그램의 버전 스냅샷이 아직 기록되지 않았습니다: '
              )}
              <span className="font-mono font-semibold">{programId}</span>.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onKeepEditing}
            className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            {t('Keep Editing', '계속 편집')}
          </button>
          <button
            type="button"
            onClick={onLeaveWithoutSnapshot}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
          >
            {t('Leave Without Snapshot', '저장 없이 이동')}
          </button>
          <button
            type="button"
            onClick={onSaveSnapshotAndLeave}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{t('Save Snapshot & Leave', '스냅샷 저장 후 이동')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface SyncConflictDialogProps {
  conflict: SyncConflictState;
  onLoadRemote: () => void;
  onBackupToTempAndLoadRemote: () => void;
  onOverwriteRemote: () => void;
}

export const SyncConflictDialog: React.FC<SyncConflictDialogProps> = ({
  conflict,
  onLoadRemote,
  onBackupToTempAndLoadRemote,
  onOverwriteRemote,
}) => {
  const { t } = useLanguage();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-conflict-title"
      className="no-print fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-[1px] flex items-center justify-center p-4"
    >
      <div className="bg-white border border-rose-200 rounded-xl shadow-2xl max-w-lg w-full p-5 space-y-4 text-slate-900">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <h3 id="sync-conflict-title" className="text-sm font-bold text-slate-900">
              {t(
                `Sync Conflict Detected (${conflict.programId})`,
                `동시 편집 충돌 감지 (${conflict.programId})`
              )}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {t(
                `${conflict.remoteEditor} saved a newer revision (rev ${conflict.remoteRevision}) while you were editing from rev ${conflict.expectedRevision}. Choose how to resolve:`,
                `편집 중이던 기준 버전(rev ${conflict.expectedRevision})보다 최신 서버 버전(rev ${conflict.remoteRevision})이 ${conflict.remoteEditor}님에 의해 먼저 저장되었습니다. 해결 방법을 선택하세요.`
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onLoadRemote}
            className="w-full px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>
              {t(
                `Load Remote Version (rev ${conflict.remoteRevision})`,
                `서버 최신 버전 불러오기 (rev ${conflict.remoteRevision})`
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={onBackupToTempAndLoadRemote}
            className="w-full px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>
              {t(
                'Backup My Changes to TEMP & Load Remote Version',
                '내 변경사항을 TEMP에 백업 후 서버 버전 불러오기'
              )}
            </span>
          </button>

          <button
            type="button"
            onClick={onOverwriteRemote}
            className="w-full px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>
              {t(
                'Keep My Changes & Overwrite Remote',
                '내 변경사항 유지 및 서버에 덮어쓰기'
              )}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
