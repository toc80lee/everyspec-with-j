import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CheckSquare,
  Clock,
  Layers,
  ListTodo,
  Loader2,
  MessageSquareText,
  Mic,
  Plus,
  Save,
  Search,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import {
  MeetingActionItem,
  MeetingMinuteStatus,
  ProgramSpec,
  ProjectMeetingMinute,
  SapModule,
  SapProject,
} from '../types/sap';
import { CurrentUser } from '../utils/authStorage';
import { COMMON_PROJECT_CODE, TEMP_PROJECT_CODE } from '../utils/projectStorage';
import {
  formatNowDateTime,
  getVisibleMinutesForProject,
  saveMeetingMinute,
} from '../utils/meetingStorage';
import { SavedProgramSpecItem } from '../utils/specStorage';
import { MarkdownFieldEditor } from './MarkdownFieldEditor';
import { requestAiMeetingMinutes } from '../utils/aiLogicGenerator';
import { useLanguage } from '../contexts/LanguageContext';

const STATUS_META: Record<
  MeetingMinuteStatus,
  { label: string; labelKo: string; textColor: string; dotColor: string }
> = {
  recording: {
    label: 'Draft / Recording',
    labelKo: '작성중 / 녹음',
    textColor: 'text-amber-700',
    dotColor: 'bg-amber-500',
  },
  minutes_ready: {
    label: 'Minutes Ready',
    labelKo: '회의록 완료',
    textColor: 'text-slate-700',
    dotColor: 'bg-slate-500',
  },
  recommended: {
    label: 'Type Suggested',
    labelKo: '유형 추천',
    textColor: 'text-blue-700',
    dotColor: 'bg-blue-600',
  },
  spec_generated: {
    label: 'Spec Done',
    labelKo: '스펙 완료',
    textColor: 'text-emerald-700',
    dotColor: 'bg-emerald-600',
  },
};

const SAMPLE_TYPE_NAMES: Record<string, { en: string; ko: string }> = {
  '01': { en: '01 · Single ALV Grid (ZRALV0010)', ko: '01 · 단일 ALV 그리드 (ZRALV0010)' },
  '02': { en: '02 · Master-Detail 2-Grid (ZRALV0020)', ko: '02 · 마스터-디테일 2그리드 (ZRALV0020)' },
  '03': { en: '03 · Tree ALV Grid (ZRALV0030)', ko: '03 · 트리 ALV 그리드 (ZRALV0030)' },
  '04': { en: '04 · Pivot Browser (ZRALV0040)', ko: '04 · 피벗 브라우저 (ZRALV0040)' },
};

interface MeetingMinutesPageProps {
  currentUser: CurrentUser;
  accessibleProjects: SapProject[];
  selectedProjectCode: string;
  onSelectProject: (code: string) => void;
  allSpecs: SavedProgramSpecItem[];
  initialSelectedMinuteId?: string | null;
  meetingRefreshKey: number;
  onMinutesChanged: () => void;
  onBackToOverview: () => void;
  onStartNewMeeting: () => void;
  onResumeWizard: (minute: ProjectMeetingMinute) => void;
  onEnterSpecGeneration: (minute: ProjectMeetingMinute) => void;
  onDeleteMinute: (id: string) => void;
  onOpenProgram: (spec: ProgramSpec) => void;
  onNotify?: (msg: string) => void;
}

export const MeetingMinutesPage: React.FC<MeetingMinutesPageProps> = ({
  currentUser,
  accessibleProjects,
  selectedProjectCode,
  onSelectProject,
  allSpecs,
  initialSelectedMinuteId,
  meetingRefreshKey,
  onMinutesChanged,
  onBackToOverview: _onBackToOverview,
  onStartNewMeeting,
  onResumeWizard,
  onEnterSpecGeneration,
  onDeleteMinute,
  onOpenProgram,
  onNotify,
}) => {
  const { t } = useLanguage();
  const nonCommonProjects = useMemo(
    () => accessibleProjects.filter((p) => p.code !== COMMON_PROJECT_CODE),
    [accessibleProjects]
  );

  // If user came from COMMON project, default to first non-COMMON project (or TEMP)
  const activeProjectCode = useMemo(() => {
    const clean = (selectedProjectCode || '').toUpperCase();
    if (clean && clean !== COMMON_PROJECT_CODE && nonCommonProjects.some((p) => p.code === clean)) {
      return clean;
    }
    return nonCommonProjects[0]?.code || TEMP_PROJECT_CODE;
  }, [selectedProjectCode, nonCommonProjects]);

  const activeProject = useMemo(
    () => nonCommonProjects.find((p) => p.code === activeProjectCode) || nonCommonProjects[0],
    [nonCommonProjects, activeProjectCode]
  );

  const projectMinutes = useMemo(() => {
    return getVisibleMinutesForProject(activeProjectCode, currentUser.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectCode, currentUser.name, meetingRefreshKey]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | MeetingMinuteStatus>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedMinuteId || null);

  // Sync external initialSelectedMinuteId when passed
  useEffect(() => {
    if (initialSelectedMinuteId) {
      setSelectedId(initialSelectedMinuteId);
    }
  }, [initialSelectedMinuteId]);

  const filteredMinutes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projectMinutes.filter((m) => {
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        (m.minutes_markdown || '').toLowerCase().includes(q) ||
        (m.author || '').toLowerCase().includes(q) ||
        (m.generated_program_id || '').toLowerCase().includes(q) ||
        (m.suggested_program_id || '').toLowerCase().includes(q)
      );
    });
  }, [projectMinutes, statusFilter, searchQuery]);

  // Keep selectedId valid
  useEffect(() => {
    if (filteredMinutes.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredMinutes.some((m) => m.id === selectedId)) {
      setSelectedId(filteredMinutes[0].id);
    }
  }, [filteredMinutes, selectedId]);

  const selectedMinute = useMemo(
    () => projectMinutes.find((m) => m.id === selectedId) || null,
    [projectMinutes, selectedId]
  );

  // Detail pane local editable state
  const [detailTab, setDetailTab] = useState<'minutes' | 'transcript'>('minutes');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftModule, setDraftModule] = useState<SapModule>('SD');
  const [draftMarkdown, setDraftMarkdown] = useState('');
  const [supplementInput, setSupplementInput] = useState('');
  const [isEnriching, setIsEnriching] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [newActionText, setNewActionText] = useState('');
  const [newActionAssignee, setNewActionAssignee] = useState('');
  const [newActionDueDate, setNewActionDueDate] = useState('');

  useEffect(() => {
    if (!selectedMinute) return;
    setDraftTitle(selectedMinute.title || '');
    setDraftModule(selectedMinute.suggested_module || 'SD');
    setDraftMarkdown(selectedMinute.minutes_markdown || '');
    setSupplementInput('');
    setNewActionText('');
    setNewActionAssignee('');
    setNewActionDueDate('');
    setIsDirty(false);
  }, [selectedMinute?.id, selectedMinute?.updated_at]);

  const statusCounts = useMemo(() => {
    const counts: Record<'ALL' | MeetingMinuteStatus, number> = {
      ALL: projectMinutes.length,
      recording: 0,
      minutes_ready: 0,
      recommended: 0,
      spec_generated: 0,
    };
    projectMinutes.forEach((m) => {
      if (counts[m.status] !== undefined) counts[m.status] += 1;
    });
    return counts;
  }, [projectMinutes]);

  const buildUpdatedRecord = (overrides: Partial<ProjectMeetingMinute> = {}): ProjectMeetingMinute | null => {
    if (!selectedMinute) return null;
    return {
      ...selectedMinute,
      title: draftTitle.trim() || selectedMinute.title,
      suggested_module: draftModule,
      minutes_markdown: draftMarkdown,
      status:
        selectedMinute.status === 'recording' && draftMarkdown.trim()
          ? 'minutes_ready'
          : selectedMinute.status,
      updated_at: formatNowDateTime(),
      ...overrides,
    };
  };

  const handleSaveDetail = () => {
    const updated = buildUpdatedRecord();
    if (!updated) return;
    saveMeetingMinute(updated);
    setIsDirty(false);
    onMinutesChanged();
    onNotify?.(t(`Saved changes to '${updated.title}'.`, `'${updated.title}' 변경 사항이 저장되었습니다.`));
  };

  const handleEnrichWithSupplement = async () => {
    if (!selectedMinute || !supplementInput.trim()) return;
    setIsEnriching(true);
    try {
      const res = await requestAiMeetingMinutes({
        mode: 'enrich',
        rawTranscript: selectedMinute.raw_transcript || '',
        existingMinutes: draftMarkdown,
        supplementalNotes: supplementInput.trim(),
        projectName: activeProject?.name || activeProjectCode,
        targetRelease: activeProject?.target_sap_release || 'SAP S/4HANA 2023',
      });
      setDraftMarkdown(res.minutesMarkdown);
      setDraftModule(res.detectedModule);
      if (res.title && !isDirty) {
        setDraftTitle(res.title);
      }
      const updated = buildUpdatedRecord({
        title: draftTitle.trim() || res.title,
        suggested_module: res.detectedModule,
        minutes_markdown: res.minutesMarkdown,
        status:
          selectedMinute.status === 'recording' ? 'minutes_ready' : selectedMinute.status,
      });
      if (updated) {
        saveMeetingMinute(updated);
        onMinutesChanged();
      }
      setSupplementInput('');
      setIsDirty(false);
      onNotify?.(t('Supplemental notes merged into AI meeting minutes and saved.', '추가 메모가 AI 회의록에 반영되어 저장되었습니다.'));
    } catch (err: any) {
      onNotify?.(err?.message || t('Failed to apply supplemental notes.', '추가 메모 반영에 실패했습니다.'));
    } finally {
      setIsEnriching(false);
    }
  };

  const handleLaunchSpecGeneration = () => {
    const updated = buildUpdatedRecord();
    if (!updated) return;
    if (isDirty) {
      saveMeetingMinute(updated);
      setIsDirty(false);
      onMinutesChanged();
    }
    onEnterSpecGeneration(updated);
  };

  const linkedSpecItems = useMemo(() => {
    if (!selectedMinute) return [];
    const ids = new Set<string>();
    if (selectedMinute.generated_program_id) {
      ids.add(selectedMinute.generated_program_id.toUpperCase());
    }
    (selectedMinute.generated_program_ids || []).forEach((id) => {
      if (id) ids.add(id.toUpperCase());
    });
    return Array.from(ids)
      .map((id) => allSpecs.find((s) => s.program_id.toUpperCase() === id))
      .filter((item): item is SavedProgramSpecItem => Boolean(item));
  }, [allSpecs, selectedMinute]);

  const actionItems: MeetingActionItem[] = selectedMinute?.action_items || [];

  const updateActionItems = (nextItems: MeetingActionItem[]) => {
    const updated = buildUpdatedRecord({ action_items: nextItems });
    if (!updated) return;
    saveMeetingMinute(updated);
    onMinutesChanged();
  };

  const handleExtractActionItems = () => {
    if (!selectedMinute) return;
    const md = draftMarkdown || selectedMinute.minutes_markdown || '';
    const lines = md.split('\n');
    let inOpenSection = false;
    const extractedTexts: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^#{1,4}\s*5\.|확인\s*필요|open\s*items|미결/i.test(trimmed)) {
        inOpenSection = true;
        continue;
      }
      if (inOpenSection && /^#{1,4}\s+\d*\./.test(trimmed)) {
        inOpenSection = false;
        continue;
      }
      if (inOpenSection && /^[-*•]\s+/.test(trimmed)) {
        const clean = trimmed.replace(/^[-*•]\s*(\[[ xX]\]\s*)?/, '').trim();
        if (clean) extractedTexts.push(clean);
      }
    }

    if (extractedTexts.length === 0) {
      onNotify?.(t('No bullet items (-) found under Section 5 / Open Items.', '5번 섹션(확인 필요 / Open Items) 아래에서 항목(-)을 찾지 못했습니다.'));
      return;
    }

    const existingTexts = new Set(actionItems.map((i) => i.text.trim().toLowerCase()));
    const nowIso = new Date().toISOString();
    const newItems: MeetingActionItem[] = extractedTexts
      .filter((txt) => !existingTexts.has(txt.toLowerCase()))
      .map((txt, idx) => ({
        id: `act-${Date.now()}-${idx}`,
        text: txt,
        completed: false,
        created_at: nowIso,
      }));

    if (newItems.length === 0) {
      onNotify?.(t('All extracted open items are already in the checklist.', '추출된 미결 항목이 이미 체크리스트에 모두 등록되어 있습니다.'));
      return;
    }

    updateActionItems([...actionItems, ...newItems]);
    onNotify?.(t(`Extracted ${newItems.length} open item(s) into the action checklist.`, `${newItems.length}건의 미결 항목을 체크리스트로 추출했습니다.`));
  };

  const handleAddActionItem = (e: React.FormEvent) => {
    e.preventDefault();
    const txt = newActionText.trim();
    if (!txt || !selectedMinute) return;
    const item: MeetingActionItem = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      text: txt,
      assignee: newActionAssignee.trim() || undefined,
      due_date: newActionDueDate.trim() || undefined,
      completed: false,
      created_at: new Date().toISOString(),
    };
    updateActionItems([...actionItems, item]);
    setNewActionText('');
    setNewActionAssignee('');
    setNewActionDueDate('');
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* Compact Page Header */}
      <header className="px-6 py-3.5 bg-white border-b border-slate-200 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-blue-400 flex items-center justify-center shrink-0">
              <MessageSquareText className="w-4 h-4" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">
              {t('Project Meeting Minutes', '프로젝트 회의록')}
            </h1>
            {activeProjectCode === TEMP_PROJECT_CODE && (
              <span className="text-[11px] font-medium text-slate-500">
                ({currentUser.name} {t('Private', '개인 전용')})
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={t('Select project', '프로젝트 선택')}
              value={activeProjectCode}
              onChange={(e) => onSelectProject(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer"
            >
              {nonCommonProjects.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onStartNewMeeting}
              title={t('New Recording', '새 회의 녹음')}
              aria-label={t('New Recording', '새 회의 녹음')}
              className="w-8 h-8 bg-slate-900 hover:bg-slate-800 text-white rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            >
              <Plus className="w-4 h-4 text-blue-300" />
            </button>
          </div>
        </div>
      </header>

      {/* Main 2-Pane Split Body */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full px-6 py-5 flex flex-col lg:flex-row gap-5 overflow-hidden">
          {/* LEFT PANE: Filterable Meeting History List */}
          <aside className="w-full lg:w-[360px] shrink-0 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden max-h-[340px] lg:max-h-full">
            <div className="p-4 border-b border-slate-200 space-y-3 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('Search title, content, author, Program ID...', '회의록 제목, 내용, 작성자, Program ID 검색...')}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { key: 'ALL', label: t('All', '전체') },
                    { key: 'recording', label: t('Draft', '작성중') },
                    { key: 'minutes_ready', label: t('Minutes', '회의록') },
                    { key: 'recommended', label: t('Type Pick', '유형추천') },
                    { key: 'spec_generated', label: t('Spec Done', '스펙완료') },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      statusFilter === tab.key
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label} ({statusCounts[tab.key]})
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {filteredMinutes.length === 0 ? (
                <div className="p-8 text-center space-y-3">
                  <p className="text-xs text-slate-500">
                    {projectMinutes.length === 0
                      ? t(
                          `No saved meeting minutes in '${activeProject?.name || activeProjectCode}'.`,
                          `'${activeProject?.name || activeProjectCode}' 프로젝트에 저장된 회의록이 없습니다.`
                        )
                      : t('No meeting minutes match your filters.', '검색 조건에 맞는 회의록이 없습니다.')}
                  </p>
                  <button
                    type="button"
                    onClick={onStartNewMeeting}
                    title={t('Start New Recording', '새 회의 녹음 시작')}
                    aria-label={t('Start New Recording', '새 회의 녹음 시작')}
                    className="w-9 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg inline-flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                filteredMinutes.map((item) => {
                  const isSelected = selectedMinute?.id === item.id;
                  const meta = STATUS_META[item.status] || STATUS_META.minutes_ready;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/70 ring-1 ring-inset ring-blue-500'
                          : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-900 line-clamp-1">
                        {item.title}
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px]">
                        <div className="flex items-center gap-1.5 text-slate-500 min-w-0 truncate">
                          <span className={`inline-flex items-center gap-1 font-semibold shrink-0 ${meta.textColor}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${meta.dotColor}`} />
                            {t(meta.label, meta.labelKo)}
                          </span>
                          {item.suggested_module && (
                            <span className="font-mono font-bold text-slate-700 shrink-0">
                              · {item.suggested_module}
                            </span>
                          )}
                          <span className="font-mono tabular-nums truncate">
                            · {item.updated_at}
                          </span>
                        </div>
                        {item.generated_program_id && (
                          <span className="font-mono text-[10.5px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded shrink-0">
                            {item.generated_program_id}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </aside>

          {/* RIGHT PANE: Meeting Minute Detail Page */}
          <section className="flex-1 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden min-w-0">
            {!selectedMinute ? (
              <div className="flex-1 flex flex-col items-center justify-center p-10 text-center space-y-3">
                <MessageSquareText className="w-10 h-10 text-slate-300" />
                <div className="text-sm font-bold text-slate-700">
                  {t('Select meeting minutes to view details', '상세 내용을 확인할 회의록을 선택해 주세요')}
                </div>
                <p className="text-xs text-slate-500 max-w-md">
                  {t(
                    'Select an item from the history list on the left to review, enrich, and enter Generate Program Spec mode.',
                    '좌측 목록에서 회의록을 선택하면 내용을 검토·보충하고 바로 프로그램 스펙 생성 모드로 진입할 수 있습니다.'
                  )}
                </p>
              </div>
            ) : (
              <>
                {/* Detail Header with Primary 'Generate Program Spec' Button */}
                <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0 space-y-3">
                  <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        <span className="font-mono font-bold text-blue-700">
                          {selectedMinute.project_code}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-semibold ${
                            (STATUS_META[selectedMinute.status] || STATUS_META.minutes_ready).textColor
                          }`}
                        >
                          {t(
                            (STATUS_META[selectedMinute.status] || STATUS_META.minutes_ready).label,
                            (STATUS_META[selectedMinute.status] || STATUS_META.minutes_ready).labelKo
                          )}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{t('Author:', '작성자:')} {selectedMinute.author}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {t('Updated', '수정일')} {selectedMinute.updated_at}
                        </span>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <input
                          type="text"
                          value={draftTitle}
                          onChange={(e) => {
                            setDraftTitle(e.target.value);
                            setIsDirty(true);
                          }}
                          aria-label={t('Meeting title', '회의록 제목')}
                          className="flex-1 px-3 py-1.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 focus:border-blue-500 rounded-lg text-base font-bold text-slate-900"
                        />
                        <select
                          aria-label={t('SAP Module', 'SAP 모듈')}
                          value={draftModule}
                          onChange={(e) => {
                            setDraftModule(e.target.value as SapModule);
                            setIsDirty(true);
                          }}
                          className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 cursor-pointer"
                        >
                          {(['SD', 'MM', 'FI', 'CO', 'PP', 'HR', 'QM', 'PM', 'BC', 'CM'] as SapModule[]).map(
                            (m) => (
                              <option key={m} value={m}>
                                {m === 'CM' ? t('CM (Common)', 'CM (공통)') : m}
                              </option>
                            )
                          )}
                        </select>
                      </div>
                    </div>

                    {/* Action Buttons inside Meeting Detail Page */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={handleLaunchSpecGeneration}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>{t('Generate Program Spec', '프로그램 스펙 생성')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onResumeWizard(selectedMinute)}
                        className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Mic className="w-3.5 h-3.5 text-blue-300" />
                        <span>{t('Recording Wizard', '녹음 마법사')}</span>
                      </button>

                      <button
                        type="button"
                        disabled={!isDirty}
                        onClick={handleSaveDetail}
                        className="px-3 py-2 bg-white hover:bg-slate-100 disabled:opacity-45 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{t('Save', '저장')}</span>
                      </button>

                      {selectedMinute.author === currentUser.name && (
                        <button
                          type="button"
                          onClick={() => onDeleteMinute(selectedMinute.id)}
                          className="p-2 text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg cursor-pointer"
                          title={t('Delete minutes', '회의록 삭제')}
                          aria-label={t('Delete minutes', '회의록 삭제')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Compact Recommendation / Linked Programs Strip */}
                  {(selectedMinute.recommended_sample_type || linkedSpecItems.length > 0) && (
                    <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div
                        className="flex flex-wrap items-center gap-2 min-w-0 font-semibold text-slate-800"
                        title={selectedMinute.recommendation_reason || undefined}
                      >
                        <Layers className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        {selectedMinute.recommended_sample_type && (
                          <span>
                            {t('Suggested Type:', '추천 유형:')}{' '}
                            <strong className="font-mono text-blue-700">
                              {SAMPLE_TYPE_NAMES[selectedMinute.recommended_sample_type]
                                ? t(
                                    SAMPLE_TYPE_NAMES[selectedMinute.recommended_sample_type].en,
                                    SAMPLE_TYPE_NAMES[selectedMinute.recommended_sample_type].ko
                                  )
                                : selectedMinute.recommended_sample_type}
                            </strong>
                          </span>
                        )}
                        {selectedMinute.suggested_program_id && (
                          <span className="font-mono text-slate-600">
                            · {selectedMinute.suggested_program_id} ({selectedMinute.suggested_tcode || '-'})
                          </span>
                        )}
                      </div>

                      {linkedSpecItems.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {linkedSpecItems.map((item) => (
                            <button
                              key={item.program_id}
                              type="button"
                              onClick={() => onOpenProgram(item.spec)}
                              title={item.title}
                              className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span className="font-mono">{item.program_id}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Detail Sub-tabs */}
                <div className="px-6 border-b border-slate-200 bg-slate-50/70 flex items-center gap-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => setDetailTab('minutes')}
                    className={`py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                      detailTab === 'minutes'
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t('Review & Enrich Minutes', '회의록 검토 및 보충')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailTab('transcript')}
                    className={`py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                      detailTab === 'transcript'
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t(`Raw Recording & Notes (${selectedMinute.segments?.length || 0})`, `원본 녹취 및 메모 (${selectedMinute.segments?.length || 0})`)}
                  </button>
                </div>

                {/* Scrollable Detail Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {detailTab === 'minutes' ? (
                    <>
                      <MarkdownFieldEditor
                        value={draftMarkdown}
                        onChange={(val) => {
                          setDraftMarkdown(val);
                          setIsDirty(true);
                        }}
                        rows={11}
                        minHeight="260px"
                        placeholder={t(
                          'Meeting minutes are empty. Enter notes or generate AI minutes via the recording wizard...',
                          '회의록이 비어 있습니다. 내용을 입력하거나 녹음 마법사를 통해 AI 회의록을 생성하세요...'
                        )}
                      />

                      {/* Quick AI Supplement Box right inside Detail Page */}
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
                        <div className="text-xs font-bold text-slate-800">
                          {t('Enrich Minutes with AI', 'AI로 회의록 보완하기')}
                        </div>
                        <textarea
                          rows={2}
                          value={supplementInput}
                          onChange={(e) => setSupplementInput(e.target.value)}
                          placeholder={t(
                            'Add post-meeting updates or changed criteria to merge into existing minutes...',
                            '회의 후 추가 결정 사항이나 변경된 조건을 입력하면 기존 회의록에 반영됩니다...'
                          )}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:border-blue-500"
                        />
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            disabled={!supplementInput.trim() || isEnriching}
                            onClick={handleEnrichWithSupplement}
                            className="px-3.5 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {isEnriching ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            <span>{t('Apply AI Update & Save', 'AI 반영 및 저장')}</span>
                          </button>
                        </div>
                      </div>

                      {/* Open Items / Action Items Checklist */}
                      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <ListTodo className="w-4 h-4 text-blue-600" />
                            <h4 className="text-xs font-bold text-slate-900">
                              {t('Open Items & Action Checklist', '미결 항목 및 실행 체크리스트')}
                            </h4>
                            <span className="font-mono tabular-nums text-[11px] text-slate-500">
                              {t('Done', '완료')} {actionItems.filter((i) => i.completed).length}/{actionItems.length}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleExtractActionItems}
                            className="px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md text-[11px] font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {t('Extract from Minutes', '회의록에서 추출')}
                          </button>
                        </div>

                        <form onSubmit={handleAddActionItem} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          <input
                            type="text"
                            value={newActionText}
                            onChange={(e) => setNewActionText(e.target.value)}
                            placeholder={t('Enter open item or follow-up action...', '미결 항목 또는 후속 조치를 입력하세요...')}
                            className="sm:col-span-6 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs focus:bg-white focus:border-blue-500"
                          />
                          <input
                            type="text"
                            value={newActionAssignee}
                            onChange={(e) => setNewActionAssignee(e.target.value)}
                            placeholder={t('Assignee (e.g. Josh Lee)', '담당자 (예: Josh Lee)')}
                            className="sm:col-span-2 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs focus:bg-white focus:border-blue-500"
                          />
                          <input
                            type="date"
                            value={newActionDueDate}
                            onChange={(e) => setNewActionDueDate(e.target.value)}
                            aria-label={t('Due date', '기한')}
                            className="sm:col-span-2 px-2 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono focus:bg-white focus:border-blue-500"
                          />
                          <button
                            type="submit"
                            disabled={!newActionText.trim()}
                            className="sm:col-span-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer"
                          >
                            {t('Add Item', '항목 추가')}
                          </button>
                        </form>

                        {actionItems.length === 0 ? (
                          <div className="py-4 text-center text-xs text-slate-400">
                            {t(
                              'No action items yet. Extract open items from the minutes above or add manually.',
                              '등록된 실행 항목이 없습니다. 상단 회의록에서 추출하거나 직접 추가하세요.'
                            )}
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                            {actionItems.map((act) => (
                              <div
                                key={act.id}
                                className="px-3 py-2 flex items-center justify-between gap-3 text-xs hover:bg-slate-50"
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateActionItems(
                                      actionItems.map((i) =>
                                        i.id === act.id ? { ...i, completed: !i.completed } : i
                                      )
                                    )
                                  }
                                  className="flex items-start gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                                >
                                  {act.completed ? (
                                    <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                  ) : (
                                    <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                                  )}
                                  <span
                                    className={
                                      act.completed
                                        ? 'line-through text-slate-400'
                                        : 'text-slate-800 font-medium'
                                    }
                                  >
                                    {act.text}
                                  </span>
                                </button>

                                <div className="flex items-center gap-2 shrink-0 text-[11px] text-slate-500">
                                  {act.assignee && (
                                    <span className="font-medium text-slate-700">{act.assignee}</span>
                                  )}
                                  {act.due_date && (
                                    <span className="font-mono tabular-nums">{act.due_date}</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateActionItems(actionItems.filter((i) => i.id !== act.id))
                                    }
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                    title={t('Delete item', '항목 삭제')}
                                    aria-label={t('Delete item', '항목 삭제')}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-3">
                      {!selectedMinute.segments || selectedMinute.segments.length === 0 ? (
                        <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-xl">
                          {t('No voice or note segments recorded.', '기록된 음성 또는 메모 세그먼트가 없습니다.')}
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
                          {selectedMinute.segments.map((seg) => (
                            <div key={seg.id} className="p-4 space-y-1">
                              <div className="text-[11px] font-mono text-slate-500 flex items-center gap-2">
                                <span>{seg.timestamp}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-sans font-semibold text-slate-700">
                                  {seg.speaker || t('Participant', '참여자')}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {seg.kind === 'voice'
                                    ? t('Voice', '음성')
                                    : seg.kind === 'supplement'
                                    ? t('Supplement', '보충')
                                    : t('Note', '메모')}
                                </span>
                              </div>
                              <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
                                {seg.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Sticky Detail Bottom Footer */}
                <footer className="px-6 py-3 bg-slate-50 border-t border-slate-200 shrink-0 flex items-center justify-between gap-3">
                  <div className="text-[11px] text-amber-700 font-medium">
                    {isDirty ? t('Unsaved changes (auto-saved when generating spec).', '저장되지 않은 변경사항이 있습니다 (스펙 생성 시 자동 저장됨).') : ''}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={!isDirty}
                      onClick={handleSaveDetail}
                      className="px-3.5 py-1.5 bg-white hover:bg-slate-100 disabled:opacity-45 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{t('Save', '저장')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleLaunchSpecGeneration}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>{t('Generate Program Spec', '프로그램 스펙 생성')}</span>
                    </button>
                  </div>
                </footer>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
