import React, { useState, useMemo } from 'react';
import { Check, Search, X } from 'lucide-react';
import { ProgramSpec, SelectionParameter } from '../types/sap';
import { getF4SuggestionsForParam, F4SuggestionItem } from '../utils/sapSimulatorHelpers';
import { useLanguage } from '../contexts/LanguageContext';

interface SapF4ValueHelpModalProps {
  isOpen: boolean;
  param: SelectionParameter | null;
  targetSide: 'low' | 'high';
  spec: ProgramSpec;
  onClose: () => void;
  onSelectValue: (value: string) => void;
}

export const SapF4ValueHelpModal: React.FC<SapF4ValueHelpModalProps> = ({
  isOpen,
  param,
  targetSide,
  spec,
  onClose,
  onSelectValue,
}) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [selectedValue, setSelectedValue] = useState<string>('');

  const suggestions = useMemo<F4SuggestionItem[]>(() => {
    if (!param) return [];
    return getF4SuggestionsForParam(param, spec);
  }, [param, spec]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter(
      (s) =>
        s.value.toLowerCase().includes(q) ||
        s.label.toLowerCase().includes(q) ||
        s.source.toLowerCase().includes(q)
    );
  }, [suggestions, query]);

  if (!isOpen || !param) return null;

  const handleConfirm = (val?: string) => {
    const finalVal = val ?? selectedValue;
    if (!finalVal) return;
    onSelectValue(finalVal);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded border border-slate-400 bg-[#ECE9D8] shadow-2xl text-slate-800 text-xs font-sans overflow-hidden">
        {/* SAP GUI Dialog Titlebar */}
        <div className="flex items-center justify-between bg-gradient-to-r from-[#2B547E] to-[#4863A0] px-3 py-1.5 text-white font-medium">
          <div className="flex items-center gap-1.5">
            <Search className="w-3.5 h-3.5 text-sky-200" />
            <span>
              {t('F4 Input Help:', 'F4 입력 도움말:')} {param.text} ({param.name} - {targetSide.toUpperCase()})
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            title={t('Close', '닫기')}
            className="rounded p-0.5 hover:bg-white/20 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        <div className="p-3 space-y-2.5">
          {/* Search input */}
          <div className="flex items-center gap-2 bg-white border border-slate-400 px-2 py-1">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Search value or description...', '값 또는 설명 검색...')}
              autoFocus
              className="flex-1 text-xs focus:outline-none bg-transparent"
            />
          </div>

          {/* Results Table */}
          <div className="border border-slate-400 bg-white max-h-60 overflow-y-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-[#d8e4f0] border-b border-[#9bbadb] text-slate-800 font-semibold">
                <tr>
                  <th className="px-2 py-1 text-left border-r border-[#9bbadb] w-28">{t('Value', '값')}</th>
                  <th className="px-2 py-1 text-left border-r border-[#9bbadb]">{t('Description', '설명')}</th>
                  <th className="px-2 py-1 text-left w-24">{t('Source', '출처')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-400">
                      {t('No matching F4 entries found.', '일치하는 F4 항목이 없습니다.')}
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => {
                    const isSelected = selectedValue === item.value;
                    return (
                      <tr
                        key={item.value}
                        onClick={() => setSelectedValue(item.value)}
                        onDoubleClick={() => handleConfirm(item.value)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#fff5cc] font-semibold' : 'hover:bg-[#ebf3fb]'
                        }`}
                      >
                        <td className="px-2 py-1.5 border-r border-slate-200 font-mono text-blue-800">
                          {item.value}
                        </td>
                        <td className="px-2 py-1.5 border-r border-slate-200 text-slate-800">
                          {item.label}
                        </td>
                        <td className="px-2 py-1.5 text-[10px] text-slate-500">
                          {item.source}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-slate-600">
            {t(
              'Double-click a row or select and press Copy to insert the value.',
              '행을 더블클릭하거나 선택 후 복사 버튼을 눌러 값을 입력하세요.'
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-300 bg-[#E3E1D4] px-3 py-2">
          <button
            type="button"
            disabled={!selectedValue}
            onClick={() => handleConfirm()}
            className="flex items-center gap-1 px-3 py-1 text-[11px] font-semibold text-white bg-[#2B547E] border border-[#1A385C] hover:bg-[#1E3F66] disabled:opacity-40 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            {t('Copy (Enter)', '복사 (Enter)')}
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
    </div>
  );
};
