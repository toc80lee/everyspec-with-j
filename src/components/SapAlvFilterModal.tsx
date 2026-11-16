import React, { useState, useEffect } from 'react';
import { Check, Filter, Search, X, RotateCcw } from 'lucide-react';
import { AlvField } from '../types/sap';
import { useLanguage } from '../contexts/LanguageContext';

export interface AlvColumnFilter {
  fieldname: string; // '__ALL__' or specific fieldname
  operator: 'contains' | 'equals' | 'gt' | 'lt';
  value: string;
}

interface SapAlvFilterModalProps {
  isOpen: boolean;
  mode: 'find' | 'filter';
  fieldCatalog: AlvField[];
  currentFilter: AlvColumnFilter;
  onClose: () => void;
  onApplyFilter: (next: AlvColumnFilter) => void;
  onFindText: (term: string) => void;
}

export const SapAlvFilterModal: React.FC<SapAlvFilterModalProps> = ({
  isOpen,
  mode,
  fieldCatalog,
  currentFilter,
  onClose,
  onApplyFilter,
  onFindText,
}) => {
  const { t } = useLanguage();
  const [fieldname, setFieldname] = useState(currentFilter.fieldname || '__ALL__');
  const [operator, setOperator] = useState<AlvColumnFilter['operator']>(
    currentFilter.operator || 'contains'
  );
  const [value, setValue] = useState(currentFilter.value || '');

  useEffect(() => {
    if (isOpen) {
      setFieldname(currentFilter.fieldname || '__ALL__');
      setOperator(currentFilter.operator || 'contains');
      setValue(currentFilter.value || '');
    }
  }, [isOpen, currentFilter]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'find') {
      onFindText(value);
    } else {
      onApplyFilter({ fieldname, operator, value });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded border border-slate-400 bg-[#ECE9D8] shadow-2xl text-slate-800 text-xs font-sans overflow-hidden"
      >
        <div className="flex items-center justify-between bg-gradient-to-r from-[#2B547E] to-[#4863A0] px-3 py-1.5 text-white font-medium">
          <div className="flex items-center gap-1.5">
            {mode === 'find' ? (
              <Search className="w-3.5 h-3.5 text-sky-200" />
            ) : (
              <Filter className="w-3.5 h-3.5 text-sky-200" />
            )}
            <span>
              {mode === 'find'
                ? t('Find in ALV Grid (Ctrl+F)', 'ALV 그리드에서 찾기 (Ctrl+F)')
                : t('Define Filter Criteria (Ctrl+F6)', '필터 조건 설정 (Ctrl+F6)')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {mode === 'filter' && (
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {t('Target Column', '대상 컬럼')}
                </label>
                <select
                  value={fieldname}
                  onChange={(e) => setFieldname(e.target.value)}
                  className="w-full bg-white border border-slate-400 px-2 py-1 text-xs focus:outline-none focus:border-blue-600"
                >
                  <option value="__ALL__">{t('All Columns (*)', '전체 컬럼 (*)')}</option>
                  {fieldCatalog.map((f) => (
                    <option key={f.fieldname} value={f.fieldname}>
                      {f.coltext} ({f.fieldname})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  {t('Condition', '조건')}
                </label>
                <select
                  value={operator}
                  onChange={(e) =>
                    setOperator(e.target.value as AlvColumnFilter['operator'])
                  }
                  className="w-full bg-white border border-slate-400 px-2 py-1 text-xs focus:outline-none focus:border-blue-600"
                >
                  <option value="contains">{t('Contains (CP)', '포함 (CP)')}</option>
                  <option value="equals">{t('Equals (EQ)', '일치 (EQ)')}</option>
                  <option value="gt">{t('Greater Than (>)', '초과 (> )')}</option>
                  <option value="lt">{t('Less Than (<)', '미만 (< )')}</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">
              {mode === 'find' ? t('Search Term', '검색어') : t('Filter Value', '필터 값')}
            </label>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={
                mode === 'find'
                  ? t('Enter text to locate in grid rows...', '그리드 행에서 찾을 텍스트 입력...')
                  : t('Enter value to filter grid rows...', '그리드 행 필터링 값 입력...')
              }
              autoFocus
              className="w-full bg-white border border-slate-400 px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-300 bg-[#E3E1D4] px-3 py-2">
          <button
            type="button"
            onClick={() => {
              onApplyFilter({ fieldname: '__ALL__', operator: 'contains', value: '' });
              onClose();
            }}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-slate-700 bg-[#F4F2E6] border border-slate-400 hover:bg-white cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            {t('Clear Filter', '필터 초기화')}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex items-center gap-1 px-3 py-1 text-[11px] font-semibold text-white bg-[#2B547E] border border-[#1A385C] hover:bg-[#1E3F66] cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {mode === 'find' ? t('Find', '찾기') : t('Apply Filter', '필터 적용')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 text-[11px] text-slate-700 bg-[#ECE9D8] border border-slate-400 hover:bg-white cursor-pointer"
            >
              {t('Cancel', '취소')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
