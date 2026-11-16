import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Database,
  FileCode,
  MessageSquareText,
  Search,
  X,
} from 'lucide-react';
import { ProgramSpec, ProjectMeetingMinute } from '../types/sap';
import { SavedProgramSpecItem } from '../utils/specStorage';
import { getDD02LTables, getDD03LFields } from '../utils/sapDdicStorage';
import { useLanguage } from '../contexts/LanguageContext';

interface GlobalCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  specs: SavedProgramSpecItem[];
  minutes: ProjectMeetingMinute[];
  onSelectSpec: (spec: ProgramSpec) => void;
  onSelectMinute: (minute: ProjectMeetingMinute) => void;
  onSelectDdicTable?: (tabname: string) => void;
}

type SearchCategory = 'ALL' | 'SPEC' | 'MINUTE' | 'DDIC';

interface CommandSearchItem {
  key: string;
  category: 'SPEC' | 'MINUTE' | 'DDIC';
  primaryText: string;
  secondaryText: string;
  metaText: string;
  spec?: ProgramSpec;
  minute?: ProjectMeetingMinute;
  ddicTabname?: string;
}

export const GlobalCommandPalette: React.FC<GlobalCommandPaletteProps> = ({
  isOpen,
  onClose,
  specs,
  minutes,
  onSelectSpec,
  onSelectMinute,
  onSelectDdicTable,
}) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('ALL');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setCategory('ALL');
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 20);
  }, [isOpen]);

  const ddicTables = useMemo(() => (isOpen ? getDD02LTables() : []), [isOpen]);

  const results = useMemo<CommandSearchItem[]>(() => {
    if (!isOpen) return [];
    const q = query.trim().toLowerCase();
    const list: CommandSearchItem[] = [];

    if (category === 'ALL' || category === 'SPEC') {
      specs.forEach((item) => {
        const hay = `${item.program_id} ${item.tcode} ${item.title} ${item.module} ${item.project_code} ${item.author}`.toLowerCase();
        if (!q || hay.includes(q)) {
          list.push({
            key: `spec-${item.project_code}-${item.program_id}`,
            category: 'SPEC',
            primaryText: item.program_id,
            secondaryText: item.title,
            metaText: `${item.project_code} · ${item.module} · ${item.tcode}`,
            spec: item.spec,
          });
        }
      });
    }

    if (category === 'ALL' || category === 'MINUTE') {
      minutes.forEach((m) => {
        const linkedIds = [m.generated_program_id, ...(m.generated_program_ids || [])]
          .filter(Boolean)
          .join(' ');
        const hay = `${m.title} ${m.author} ${m.project_code} ${linkedIds}`.toLowerCase();
        if (!q || hay.includes(q)) {
          list.push({
            key: `min-${m.id}`,
            category: 'MINUTE',
            primaryText: m.title,
            secondaryText: m.generated_program_id
              ? t(`Linked Spec: ${m.generated_program_id}`, `연결 스펙: ${m.generated_program_id}`)
              : t('Open meeting minutes', '회의록 열기'),
            metaText: `${m.project_code} · ${m.author} · ${m.updated_at}`,
            minute: m,
          });
        }
      });
    }

    if (category === 'ALL' || category === 'DDIC') {
      ddicTables.forEach((tbl) => {
        const hay = `${tbl.tabname} ${tbl.ddtext} ${tbl.module || ''}`.toLowerCase();
        if (!q || hay.includes(q)) {
          list.push({
            key: `ddic-${tbl.tabname}`,
            category: 'DDIC',
            primaryText: tbl.tabname,
            secondaryText: tbl.ddtext,
            metaText: `${tbl.module || 'SAP'} · ${tbl.tabclass || 'TRANSP'}`,
            ddicTabname: tbl.tabname,
          });
        }
      });
    }

    return list.slice(0, 40);
  }, [isOpen, query, category, specs, minutes, ddicTables]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, category]);

  const activeItem = results[activeIndex] || null;
  const activeDdicFields = useMemo(() => {
    if (!activeItem?.ddicTabname) return [];
    return getDD03LFields(activeItem.ddicTabname).slice(0, 8);
  }, [activeItem?.ddicTabname]);

  const handleActivate = (item: CommandSearchItem) => {
    if (item.category === 'SPEC' && item.spec) {
      onSelectSpec(item.spec);
      onClose();
      return;
    }
    if (item.category === 'MINUTE' && item.minute) {
      onSelectMinute(item.minute);
      onClose();
      return;
    }
    if (item.category === 'DDIC' && item.ddicTabname) {
      onSelectDdicTable?.(item.ddicTabname);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-start justify-center pt-[10vh] px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Global Quick Search', '전체 빠른 검색')}
        className="w-full max-w-3xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden text-slate-900"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((prev) => (results.length === 0 ? 0 : (prev + 1) % results.length));
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((prev) =>
              results.length === 0 ? 0 : (prev - 1 + results.length) % results.length
            );
            return;
          }
          if (e.key === 'Enter' && activeItem) {
            e.preventDefault();
            handleActivate(activeItem);
          }
        }}
      >
        {/* Search Input Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-3">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              'Search Program ID, T-Code, title, meeting minutes, or DDIC table (VBAK, ACDOCA...)',
              'Program ID, T-Code, 제목, 회의록, DDIC 테이블 검색 (VBAK, ACDOCA...)'
            )}
            className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
            title={t('Close', '닫기')}
            aria-label={t('Close', '닫기')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {(
              [
                { key: 'ALL', label: t('All', '전체') },
                { key: 'SPEC', label: t('Specs', '사양서') },
                { key: 'MINUTE', label: t('Minutes', '회의록') },
                { key: 'DDIC', label: t('DDIC Tables', 'DDIC 테이블') },
              ] as { key: SearchCategory; label: string }[]
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setCategory(tab.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  category === tab.key
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <span className="text-[11px] font-mono tabular-nums text-slate-500">
            {results.length}
          </span>
        </div>

        {/* Results + Optional DDIC Quick Field Preview */}
        <div className="flex max-h-[54vh]">
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {results.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                {t(
                  'No matching specs, meeting minutes, or DDIC tables found.',
                  '일치하는 사양서, 회의록 또는 DDIC 테이블이 없습니다.'
                )}
              </div>
            ) : (
              results.map((item, idx) => {
                const selected = idx === activeIndex;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleActivate(item)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      selected ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.category === 'SPEC' ? (
                        <FileCode className="w-4 h-4 text-blue-600 shrink-0" />
                      ) : item.category === 'MINUTE' ? (
                        <MessageSquareText className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <Database className="w-4 h-4 text-indigo-600 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span
                            className={`font-bold truncate ${
                              item.category !== 'MINUTE' ? 'font-mono text-slate-900' : 'text-slate-900'
                            }`}
                          >
                            {item.primaryText}
                          </span>
                          <span className="text-[11px] text-slate-500 truncate">
                            {item.secondaryText}
                          </span>
                        </div>
                        <div className="text-[10.5px] font-mono text-slate-400 mt-0.5 truncate">
                          {item.metaText}
                        </div>
                      </div>
                    </div>

                    <ArrowRight
                      className={`w-3.5 h-3.5 shrink-0 ${
                        selected ? 'text-blue-600' : 'text-slate-300'
                      }`}
                    />
                  </button>
                );
              })
            )}
          </div>

          {activeItem?.category === 'DDIC' && activeDdicFields.length > 0 && (
            <aside className="hidden md:block w-64 border-l border-slate-200 bg-slate-50 p-3 overflow-y-auto shrink-0 space-y-2">
              <div className="text-[11px] font-mono font-bold text-indigo-700">
                {activeItem.ddicTabname} {t('Key Fields', '주요 필드')}
              </div>
              <div className="space-y-1">
                {activeDdicFields.map((fld) => (
                  <div
                    key={fld.fieldname}
                    className="flex items-center justify-between gap-2 text-[11px] border-b border-slate-200/70 pb-1"
                  >
                    <span className="font-mono font-semibold text-slate-800 truncate">
                      {fld.keyflag ? '* ' : ''}
                      {fld.fieldname}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 shrink-0">
                      {fld.datatype}({fld.leng})
                    </span>
                  </div>
                ))}
              </div>
            </aside>
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-4 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <div className="flex items-center gap-3 font-mono">
            <span>{t('↑↓ Navigate', '↑↓ 이동')}</span>
            <span>{t('Enter Open', 'Enter 열기')}</span>
            <span>{t('Esc Close', 'Esc 닫기')}</span>
          </div>
          <span>{t('Select a DDIC item to open in SE11 Table Manager', 'DDIC 항목을 선택하면 SE11 테이블 관리에서 열립니다')}</span>
        </div>
      </div>
    </div>
  );
};
