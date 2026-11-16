import React, { useState, useEffect } from 'react';
import { Copy, FolderKanban, X, AlertCircle } from 'lucide-react';
import { ProgramSpec, SapProject } from '../types/sap';
import {
  COMMON_PROJECT_CODE,
  TEMP_PROJECT_CODE,
  getAccessibleProjectsForUser,
  getProjectAbapStandards,
} from '../utils/projectStorage';
import { copySpecInStorage } from '../utils/specStorage';
import { getCurrentUser } from '../utils/authStorage';
import { suggestCompliantIdsForProject } from '../utils/sapValidation';
import { useLanguage } from '../contexts/LanguageContext';

interface CopySpecModalProps {
  isOpen: boolean;
  sourceSpec: ProgramSpec | null;
  defaultTargetProject?: string;
  onClose: () => void;
  onCopied: (newSpec: ProgramSpec) => void;
}

export const CopySpecModal: React.FC<CopySpecModalProps> = ({
  isOpen,
  sourceSpec,
  defaultTargetProject,
  onClose,
  onCopied,
}) => {
  const { t } = useLanguage();
  const currentUser = getCurrentUser();
  const [projects, setProjects] = useState<SapProject[]>([]);
  const [targetProject, setTargetProject] = useState<string>(TEMP_PROJECT_CODE);
  const [newProgramId, setNewProgramId] = useState<string>('');
  const [newTcode, setNewTcode] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !sourceSpec) return;
    const accessible = getAccessibleProjectsForUser(currentUser.name).filter(
      (p) => p.code !== COMMON_PROJECT_CODE
    );
    setProjects(accessible);

    const suggestedProj =
      defaultTargetProject &&
      defaultTargetProject !== COMMON_PROJECT_CODE &&
      accessible.some((p) => p.code === defaultTargetProject)
        ? defaultTargetProject
        : accessible.find((p) => p.code !== TEMP_PROJECT_CODE)?.code || TEMP_PROJECT_CODE;

    setTargetProject(suggestedProj);
    const std = getProjectAbapStandards(suggestedProj);
    const baseId = `${(sourceSpec.program_id || 'ZR_PROG').toUpperCase()}_COPY`;
    const compliant = suggestCompliantIdsForProject(
      baseId,
      sourceSpec.tcode || 'Z01',
      sourceSpec.module,
      std
    );
    setNewProgramId(compliant.program_id);
    setNewTcode(compliant.tcode);
    setNewTitle(`${sourceSpec.title} (Copy)`);
    setErrorMsg(null);
  }, [isOpen, sourceSpec, defaultTargetProject, currentUser.name]);

  const targetStandards = getProjectAbapStandards(targetProject);

  const handleApplyTargetNaming = (projCode: string) => {
    if (!sourceSpec) return;
    const std = getProjectAbapStandards(projCode);
    const compliant = suggestCompliantIdsForProject(
      newProgramId || `${sourceSpec.program_id}_COPY`,
      newTcode || sourceSpec.tcode || 'Z01',
      sourceSpec.module,
      std
    );
    setNewProgramId(compliant.program_id);
    setNewTcode(compliant.tcode);
  };

  if (!isOpen || !sourceSpec) return null;

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = newProgramId.trim().toUpperCase();
    if (!cleanId) {
      setErrorMsg(t('Please enter a new Program ID.', '새 Program ID를 입력하세요.'));
      return;
    }
    if (!targetProject) {
      setErrorMsg(t('Please select a target project.', '복사할 대상 프로젝트를 선택하세요.'));
      return;
    }

    const res = copySpecInStorage(
      sourceSpec.program_id,
      cleanId,
      currentUser.name,
      targetProject,
      newTitle,
      newTcode
    );

    if (!res.success || !res.newSpec) {
      setErrorMsg(res.message || t('Failed to copy specification.', '사양서 복사에 실패했습니다.'));
      return;
    }

    onCopied(res.newSpec);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Copy className="w-4 h-4 text-blue-400" />
            <div>
              <h3 className="text-sm font-bold leading-tight">
                {t('Copy Spec to Project', '프로젝트로 사양서 복사')}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {t('Source:', '원본:')} {sourceSpec.program_id} ({sourceSpec.project_code || COMMON_PROJECT_CODE})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded cursor-pointer"
            title={t('Close', '닫기')}
            aria-label={t('Close', '닫기')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('Target Project', '대상 프로젝트')} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <FolderKanban className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <select
                required
                value={targetProject}
                onChange={(e) => {
                  const nextProj = e.target.value;
                  setTargetProject(nextProj);
                  handleApplyTargetNaming(nextProj);
                }}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:border-blue-500 cursor-pointer"
              >
                {projects.map((p) => (
                  <option key={p.code} value={p.code}>
                    [{p.code}] {p.name}
                    {p.code === TEMP_PROJECT_CODE ? t(' (Private)', ' (개인 전용)') : ''}
                  </option>
                ))}
              </select>
            </div>
            {(targetStandards.program_prefix || targetStandards.tcode_pattern) && (
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                <span className="font-mono">
                  {t('Naming Rule:', '표준 규칙:')} Program {targetStandards.program_prefix || 'Z*'} · T-Code{' '}
                  {targetStandards.tcode_pattern || 'Z*'}
                </span>
                <button
                  type="button"
                  onClick={() => handleApplyTargetNaming(targetProject)}
                  className="text-blue-700 hover:underline font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {t('Apply Rule', '규칙 적용')}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('New Program ID', '새 Program ID')} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newProgramId}
                onChange={(e) => {
                  setNewProgramId(e.target.value.toUpperCase());
                  setErrorMsg(null);
                }}
                placeholder={t('e.g. ZRSD0010', '예: ZRSD0010')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold uppercase text-blue-900 focus:bg-white focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('New T-Code', '새 T-Code')} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={newTcode}
                onChange={(e) => setNewTcode(e.target.value.toUpperCase())}
                placeholder={t('e.g. ZSD010', '예: ZSD010')}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold uppercase text-slate-800 focus:bg-white focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('Program Title', '프로그램 제목')}
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white focus:border-blue-500"
            />
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              {t('Cancel', '취소')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{t('Copy & Edit', '복사 후 편집')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
