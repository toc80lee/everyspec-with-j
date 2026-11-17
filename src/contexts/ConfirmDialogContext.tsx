import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Save, Trash2, X } from 'lucide-react';
import { useLanguage } from './LanguageContext';

export interface ConfirmDialogOptions {
  title?: string;
  message?: string;
  description?: string;
  targetName?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'primary';
}

interface ConfirmDialogContextValue {
  confirmDelete: (options?: ConfirmDialogOptions) => Promise<boolean>;
  confirmAction: (options?: ConfirmDialogOptions) => Promise<boolean>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);

interface PendingDialogState {
  options: ConfirmDialogOptions;
  resolve: (result: boolean) => void;
}

export const ConfirmDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useLanguage();
  const [pending, setPending] = useState<PendingDialogState | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  const openConfirmDialog = useCallback((options: ConfirmDialogOptions = {}): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setPending((prev) => {
        if (prev) {
          prev.resolve(false);
        }
        return { options, resolve };
      });
    });
  }, []);

  const handleClose = useCallback((result: boolean) => {
    setPending((prev) => {
      if (prev) {
        prev.resolve(result);
      }
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        handleClose(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    const timer = window.setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 10);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.clearTimeout(timer);
    };
  }, [pending, handleClose]);

  const tone = pending?.options.tone || 'danger';
  const isWarning = tone === 'warning';
  const isPrimary = tone === 'primary';

  return (
    <ConfirmDialogContext.Provider value={{ confirmDelete: openConfirmDialog, confirmAction: openConfirmDialog }}>
      {children}

      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="global-confirm-delete-title"
          className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-[1.5px] flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => handleClose(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden text-slate-900 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    isPrimary
                      ? 'bg-blue-500/20 text-blue-300'
                      : isWarning
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {isPrimary ? (
                    <Save className="w-4 h-4" />
                  ) : isWarning ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </div>
                <h3 id="global-confirm-delete-title" className="text-sm font-bold leading-tight">
                  {pending.options.title ||
                    (isPrimary ? t('Confirm Save', '저장 확인') : t('Confirm Deletion', '삭제 확인'))}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
                title={t('Close', '닫기')}
                aria-label={t('Close', '닫기')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                {pending.options.message ||
                  (isPrimary
                    ? t('Are you sure you want to save?', '저장하시겠습니까?')
                    : t('Are you sure you want to delete this item?', '삭제하시겠습니까?'))}
              </p>

              {pending.options.targetName && (
                <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-slate-800 break-all">
                  {pending.options.targetName}
                </div>
              )}

              {pending.options.description && (
                <p className="text-xs text-slate-500 leading-relaxed">
                  {pending.options.description}
                </p>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                {pending.options.cancelLabel || t('Cancel', '취소')}
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={() => handleClose(true)}
                className={`px-4 py-2 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer ${
                  isPrimary
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : isWarning
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isPrimary ? (
                  <Save className="w-3.5 h-3.5" />
                ) : !isWarning ? (
                  <Trash2 className="w-3.5 h-3.5" />
                ) : null}
                <span>
                  {pending.options.confirmLabel ||
                    (isPrimary
                      ? t('Save', '저장')
                      : isWarning
                      ? t('Confirm', '확인')
                      : t('Delete', '삭제'))}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
};

export function useConfirmDialog(): ConfirmDialogContextValue {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) {
    return {
      confirmDelete: async () => true,
      confirmAction: async () => true,
    };
  }
  return ctx;
}
