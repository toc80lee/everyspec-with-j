import React, { useEffect } from 'react';
import { ArrowLeft, Keyboard } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_GROUPS: {
  title: string;
  items: { keys: string[]; desc: string }[];
}[] = [
  {
    title: 'Workspace & Layout',
    items: [
      { keys: ['Alt', '1'], desc: 'Dual View (Split Screen)' },
      { keys: ['Alt', '2'], desc: 'SAP GUI Simulator Only' },
      { keys: ['Alt', '3'], desc: 'Spec Editor Only' },
      { keys: ['Alt', '4'], desc: 'ABAP Source Code' },
      { keys: ['Alt', '5'], desc: 'Document / Print View' },
      { keys: ['Alt', 'L'], desc: 'Cycle Split Layout (4-Way)' },
      { keys: ['Double-Click'], desc: 'Reset Split Divider to 50 : 50' },
    ],
  },
  {
    title: 'Specification History',
    items: [
      { keys: ['Ctrl', 'Z'], desc: 'Undo Spec Change (outside text inputs)' },
      { keys: ['Ctrl', 'Y'], desc: 'Redo Spec Change' },
      { keys: ['Ctrl', 'Shift', 'Z'], desc: 'Redo Spec Change (Alt)' },
      { keys: ['?'], desc: 'Open / Close Keyboard Shortcuts' },
    ],
  },
  {
    title: 'Markdown Editor',
    items: [
      { keys: ['Double-Click'], desc: 'Switch Preview to Edit Mode' },
      { keys: ['Ctrl', 'B'], desc: 'Bold Selected Text (**...**)' },
      { keys: ['Ctrl', 'E'], desc: 'Toggle Edit / Preview Mode' },
      { keys: ['Tab'], desc: 'Indent Line (2 spaces)' },
    ],
  },
  {
    title: 'Tables & SAP GUI Simulator',
    items: [
      { keys: ['Ctrl', 'C'], desc: 'Copy Selected Grid Range (TSV)' },
      { keys: ['Ctrl', 'V'], desc: 'Paste Rows from Excel / Sheets' },
      { keys: ['Esc'], desc: 'Clear Grid Selection / Close Popups' },
      { keys: ['F4'], desc: 'Open SAP Value Help (Inside Inputs)' },
      { keys: ['F8'], desc: 'Execute Selection Screen Simulation' },
    ],
  },
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useLanguage();
  const shortcutGroups = [
    {
      title: t('Workspace & Layout', '작업 공간 및 화면 레이아웃'),
      items: [
        { keys: ['Alt', '1'], desc: t('Dual View (Split Screen)', '동시 보기 (분할 화면)') },
        { keys: ['Alt', '2'], desc: t('SAP GUI Simulator Only', 'SAP GUI 시뮬레이터 전용') },
        { keys: ['Alt', '3'], desc: t('Spec Editor Only', 'Spec Editor 전용') },
        { keys: ['Alt', '4'], desc: t('ABAP Source Code', 'ABAP 소스 코드 보기') },
        { keys: ['Alt', '5'], desc: t('Document / Print View', '사양서 문서 / 인쇄 보기') },
        { keys: ['Alt', 'L'], desc: t('Cycle Split Layout (4-Way)', '분할 방향 순환 (4방향)') },
        { keys: ['Double-Click'], desc: t('Reset Split Divider to 50 : 50', '분할 비율 50 : 50 초기화') },
      ],
    },
    {
      title: t('Specification History', '사양 변경 이력'),
      items: [
        { keys: ['Ctrl', 'Z'], desc: t('Undo Spec Change (outside text inputs)', '사양 변경 실행 취소 (입력창 외부)') },
        { keys: ['Ctrl', 'Y'], desc: t('Redo Spec Change', '사양 변경 다시 실행') },
        { keys: ['Ctrl', 'Shift', 'Z'], desc: t('Redo Spec Change (Alt)', '사양 변경 다시 실행 (보조)') },
        { keys: ['?'], desc: t('Open / Close Keyboard Shortcuts', '단축키 안내 열기 / 닫기') },
      ],
    },
    {
      title: t('Markdown Editor', '마크다운 편집기'),
      items: [
        { keys: ['Double-Click'], desc: t('Switch Preview to Edit Mode', '미리보기에서 편집 모드로 전환') },
        { keys: ['Ctrl', 'B'], desc: t('Bold Selected Text (**...**)', '선택 텍스트 굵게 (**...**)') },
        { keys: ['Ctrl', 'E'], desc: t('Toggle Edit / Preview Mode', '편집 / 미리보기 전환') },
        { keys: ['Tab'], desc: t('Indent Line (2 spaces)', '줄 들여쓰기 (공백 2칸)') },
      ],
    },
    {
      title: t('Tables & SAP GUI Simulator', '테이블 및 SAP GUI 시뮬레이터'),
      items: [
        { keys: ['Ctrl', 'C'], desc: t('Copy Selected Grid Range (TSV)', '선택된 그리드 영역 복사 (TSV)') },
        { keys: ['Ctrl', 'V'], desc: t('Paste Rows from Excel / Sheets', 'Excel / 시트 행 붙여넣기') },
        { keys: ['Esc'], desc: t('Clear Grid Selection / Close Popups', '그리드 선택 해제 / 팝업 닫기') },
        { keys: ['F4'], desc: t('Open SAP Value Help (Inside Inputs)', 'SAP 탐색 도움말 열기 (입력창 내부)') },
        { keys: ['F8'], desc: t('Execute Selection Screen Simulation', 'Selection Screen 시뮬레이션 실행') },
      ],
    },
  ];

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="h-full overflow-y-auto bg-slate-50 text-slate-900 font-sans">
      <div className="max-w-6xl mx-auto px-6 py-7 space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-blue-400 flex items-center justify-center shrink-0">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {t('Keyboard Shortcuts', '키보드 단축키 안내')}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {t(
                  'Shortcuts supported in Spec Editor, Markdown Editor, and SAP GUI Simulator. Press Esc to return.',
                  'Spec Editor, 마크다운 편집기, SAP GUI 시뮬레이터에서 지원하는 단축키입니다. Esc 키로 돌아갈 수 있습니다.'
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title={t('Back', '돌아가기')}
            aria-label={t('Back', '돌아가기')}
            className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t('Back', '돌아가기')}</span>
          </button>
        </div>

        {/* Shortcut Groups Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {shortcutGroups.map((group) => (
            <div
              key={group.title}
              className="border border-slate-200 rounded-xl p-5 bg-white space-y-3"
            >
              <h2 className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-2">
                {group.title}
              </h2>
              <div className="space-y-2.5">
                {group.items.map((item) => (
                  <div
                    key={item.desc}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="text-slate-600">{item.desc}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {item.keys.map((k, idx) => (
                        <React.Fragment key={`${k}-${idx}`}>
                          <kbd className="px-2 py-0.5 bg-slate-50 border border-slate-300 rounded shadow-2xs font-mono text-[11px] font-bold text-slate-800">
                            {k}
                          </kbd>
                          {idx < item.keys.length - 1 && (
                            <span className="text-slate-400 text-[11px]">+</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
