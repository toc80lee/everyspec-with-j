import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Code2,
  Compass,
  ExternalLink,
  FileText,
  Layers,
  Lightbulb,
  MapPin,
  Mic,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  SplitSquareVertical,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { PageHeader } from './PageHeader';
import {
  GUIDE_CATEGORIES,
  GuideActionId,
  GuideCategory,
  STANDARD_SAMPLE_TYPES,
  USER_GUIDE_CASES,
  UserGuideCase,
} from '../data/userGuideData';

interface UserGuidePageProps {
  onExecuteAction: (actionId: GuideActionId) => void;
  currentProgramId?: string;
}

const CASE_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  'ai-meeting-spec': Mic,
  'sample-type-creation': Layers,
  'legacy-abap-import': Upload,
  'text-ai-reverse-ddic': Sparkles,
  'sap-gui-prototyping': SplitSquareVertical,
  'abap-code-generation': Code2,
  'governance-export': ShieldCheck,
};

const CATEGORY_BADGE_CLASS: Record<Exclude<GuideCategory, 'all'>, string> = {
  creation: 'bg-blue-50 text-blue-700 border-blue-200',
  design: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  code: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  governance: 'bg-amber-50 text-amber-800 border-amber-200',
};

export const UserGuidePage: React.FC<UserGuidePageProps> = ({
  onExecuteAction,
  currentProgramId,
}) => {
  const { lang, t } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<GuideCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string>(USER_GUIDE_CASES[0].id);

  const pickText = (item: { en: string; ko: string }) => (lang === 'ko' ? item.ko : item.en);

  const filteredCases = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return USER_GUIDE_CASES.filter((c) => {
      const matchesCat = selectedCategory === 'all' || c.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      const haystack = [
        c.caseNumber,
        c.title.en,
        c.title.ko,
        c.summary.en,
        c.summary.ko,
        c.badge.en,
        c.badge.ko,
        ...c.keywords,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [selectedCategory, searchQuery]);

  const activeCase: UserGuideCase | null = useMemo(() => {
    if (filteredCases.length === 0) return null;
    return filteredCases.find((c) => c.id === selectedCaseId) || filteredCases[0];
  }, [filteredCases, selectedCaseId]);

  const ActiveIcon = activeCase ? CASE_ICON_MAP[activeCase.id] || BookOpen : BookOpen;

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      <PageHeader
        icon={BookOpen}
        eyebrow={t('Documentation · Workflow Reference', '사용 안내 · 유형별 워크플로우')}
        title={t('User Guide', '사용 가이드')}
        titleBadge={
          <>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
              {USER_GUIDE_CASES.length} {t('Workflow Cases', '유형별 워크플로우')}
            </span>
            {currentProgramId && (
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                {t('Active Spec', '현재 사양서')}: {currentProgramId}
              </span>
            )}
          </>
        }
        subtitle={t(
          'Step-by-step usage guides organized by workflow type: AI Meetings, Standard Samples (01–04), Legacy ABAP Import, GUI Simulation, and Code/Doc Export.',
          'AI 미팅 기반 생성, 샘플 타입(01~04) 활용, 기존 ABAP 소스 업로드, GUI 시뮬레이션, 코드·문서 내보내기까지 유형별 사용 방법을 안내합니다.'
        )}
        actions={
          <div className="relative w-full md:w-72 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t(
                'Search cases (e.g., AI, upload, sample)...',
                '가이드 검색 (예: AI 미팅, 샘플, 소스)...'
              )}
              className="h-9 w-full pl-8 pr-8 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={t('Clear search', '검색어 지우기')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        }
      >
        {/* Category Filter Tabs + End-to-End Strip */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            {GUIDE_CATEGORIES.map((cat) => {
              const count =
                cat.id === 'all'
                  ? USER_GUIDE_CASES.length
                  : USER_GUIDE_CASES.filter((c) => c.category === cat.id).length;
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span>{pickText(cat.label)}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                      active ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hidden xl:flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <Compass className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="font-semibold text-slate-700">
              {t('Pipeline:', '전체 흐름:')}
            </span>
            <span>{t('1. Capture Input', '1. 입력·추출')}</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
            <span>{t('2. Simulate UI', '2. GUI 검증')}</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
            <span>{t('3. Audit & Approve', '3. 진단·승인')}</span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
            <span className="font-medium text-blue-700">
              {t('4. ABAP & Docs', '4. ABAP·산출물')}
            </span>
          </div>
        </div>
      </PageHeader>

      {/* Master-Detail Content Body */}
      <div className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto h-full grid grid-cols-1 lg:grid-cols-12 gap-5 px-6 py-5 overflow-hidden">
          {/* Left Master Column: Use Case Directory + Standard Samples Reference */}
          <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto pr-1">
            <div className="bg-white border border-slate-200 rounded-xl p-2.5 space-y-1.5">
              <div className="px-2 py-1 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {t('Usage Cases by Type', '유형별 사용 케이스')}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {filteredCases.length}
                </span>
              </div>

              {filteredCases.length === 0 ? (
                <div className="py-8 px-4 text-center text-xs text-slate-500">
                  {t(
                    'No guide cases match your search.',
                    '검색 조건에 일치하는 가이드 케이스가 없습니다.'
                  )}
                </div>
              ) : (
                filteredCases.map((guideCase) => {
                  const Icon = CASE_ICON_MAP[guideCase.id] || BookOpen;
                  const isSelected = activeCase?.id === guideCase.id;
                  return (
                    <button
                      key={guideCase.id}
                      type="button"
                      onClick={() => setSelectedCaseId(guideCase.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-all cursor-pointer flex items-start gap-2.5 ${
                        isSelected
                          ? 'bg-blue-50/80 border-blue-400 shadow-xs'
                          : 'bg-white border-slate-200/80 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-mono font-bold text-slate-400">
                            CASE {guideCase.caseNumber}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                              CATEGORY_BADGE_CLASS[guideCase.category]
                            }`}
                          >
                            {pickText(guideCase.badge)}
                          </span>
                        </div>
                        <div
                          className={`text-xs font-bold mt-0.5 leading-snug ${
                            isSelected ? 'text-blue-950' : 'text-slate-900'
                          }`}
                        >
                          {pickText(guideCase.title)}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {pickText(guideCase.summary)}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Quick Standard Sample Type Launcher */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2.5 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-xs font-bold text-slate-800">
                    {t('COMM Standard Sample Quick-Open', 'COMM 표준 샘플 바로 열기')}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">01–04</span>
              </div>
              <div className="space-y-1.5">
                {STANDARD_SAMPLE_TYPES.map((sample) => (
                  <div
                    key={sample.typeCode}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200/80 hover:border-blue-300 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-white">
                          {sample.typeCode}
                        </span>
                        <span className="text-xs font-bold font-mono text-slate-800">
                          {sample.programId}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 truncate mt-0.5">
                        {pickText(sample.name)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onExecuteAction(sample.actionId)}
                      className="px-2.5 py-1 rounded-md bg-white hover:bg-blue-600 text-slate-700 hover:text-white border border-slate-200 hover:border-blue-600 text-[11px] font-semibold transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                    >
                      <Play className="w-3 h-3" />
                      <span>{t('Open', '열기')}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Detail Column: Selected Guide Walkthrough */}
          <div className="lg:col-span-8 overflow-y-auto pr-1">
            {activeCase ? (
              <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
                {/* Detail Header */}
                <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-400/30">
                          CASE {activeCase.caseNumber}
                        </span>
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-white/10 text-slate-200 border border-white/15">
                          {pickText(activeCase.badge)}
                        </span>
                        <span className="text-[11px] text-slate-300 inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {pickText(activeCase.estimatedTime)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <ActiveIcon className="w-5 h-5 text-blue-300 shrink-0" />
                        <h3 className="text-xl font-bold tracking-tight">
                          {pickText(activeCase.title)}
                        </h3>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                        {pickText(activeCase.summary)}
                      </p>

                      <div className="flex items-center gap-1.5 text-[11px] text-slate-300 pt-1">
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium">{t('Recommended for:', '추천 대상:')}</span>
                        <span className="text-white">{pickText(activeCase.audience)}</span>
                      </div>
                    </div>

                    {/* Action Launch Buttons */}
                    <div className="flex flex-col sm:flex-row lg:flex-col gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onExecuteAction(activeCase.primaryAction.id)}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{pickText(activeCase.primaryAction.label)}</span>
                      </button>
                      {activeCase.secondaryAction && (
                        <button
                          type="button"
                          onClick={() => onExecuteAction(activeCase.secondaryAction!.id)}
                          className="px-4 py-2 rounded-lg bg-slate-700/80 hover:bg-slate-700 text-slate-100 border border-slate-600 text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>{pickText(activeCase.secondaryAction.label)}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Detail Body */}
                <div className="p-6 space-y-6">
                  {/* When to Use Callout */}
                  <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 flex items-start gap-3">
                    <Compass className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-blue-950">
                        {t('When to Use This Workflow', '이 유형을 사용하면 좋은 경우')}
                      </div>
                      <p className="text-xs text-blue-900/90 mt-1 leading-relaxed">
                        {pickText(activeCase.whenToUse)}
                      </p>
                    </div>
                  </div>

                  {/* Step-by-Step Guide */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      <span>{t('Step-by-Step Procedure', '단계별 사용 절차')}</span>
                    </h4>
                    <div className="space-y-2.5">
                      {activeCase.steps.map((step, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex items-start gap-3.5"
                        >
                          <div className="w-6 h-6 rounded-full bg-slate-900 text-white text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h5 className="text-sm font-bold text-slate-900">
                                {pickText(step.title)}
                              </h5>
                              {step.location && (
                                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 inline-flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-blue-600" />
                                  {pickText(step.location)}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                              {pickText(step.detail)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sample Types Comparison Grid (Highlighted specifically on Case 02) */}
                  {activeCase.id === 'sample-type-creation' && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-blue-600" />
                        <span>
                          {t(
                            '4 Standard SAP Sample Types Reference',
                            '4대 표준 SAP 샘플 유형 상세 비교'
                          )}
                        </span>
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {STANDARD_SAMPLE_TYPES.map((sample) => (
                          <div
                            key={sample.typeCode}
                            className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col justify-between gap-3 hover:border-blue-300 transition-colors"
                          >
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                                  Type {sample.typeCode} · {sample.programId}
                                </span>
                              </div>
                              <div className="text-xs font-bold text-slate-900 mt-2">
                                {pickText(sample.name)}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-1">
                                <span className="font-semibold text-slate-700">
                                  {t('Pattern:', '화면 구조:')}
                                </span>{' '}
                                {pickText(sample.layoutPattern)}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                <span className="font-semibold text-slate-700">
                                  {t('Best for:', '주요 활용:')}
                                </span>{' '}
                                {pickText(sample.useCase)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onExecuteAction(sample.actionId)}
                              className="w-full py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-blue-600 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Play className="w-3 h-3" />
                              <span>
                                {t(`Open ${sample.programId}`, `${sample.programId} 샘플 열기`)}
                              </span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Input -> Output Example */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-900 text-slate-100">
                      <div className="px-3.5 py-2 bg-slate-800 border-b border-slate-700 text-[11px] font-bold text-slate-200 flex items-center justify-between">
                        <span>{pickText(activeCase.sampleFlow.inputLabel)}</span>
                        <span className="text-[10px] font-mono text-slate-400">INPUT</span>
                      </div>
                      <pre className="p-3.5 text-[11px] font-mono leading-relaxed whitespace-pre-wrap text-slate-200 overflow-x-auto">
                        {activeCase.sampleFlow.inputSnippet}
                      </pre>
                    </div>

                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 overflow-hidden">
                      <div className="px-3.5 py-2 bg-emerald-100/70 border-b border-emerald-200 text-[11px] font-bold text-emerald-950 flex items-center justify-between">
                        <span>{pickText(activeCase.sampleFlow.outputLabel)}</span>
                        <span className="text-[10px] font-mono text-emerald-700">OUTPUT</span>
                      </div>
                      <ul className="p-3.5 space-y-2">
                        {activeCase.sampleFlow.outputBullets.map((b, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{pickText(b)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Tips */}
                  <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
                    <div className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                      <Lightbulb className="w-4 h-4 text-amber-600" />
                      <span>{t('Practical Tips & Guardrails', '실무 활용 팁 및 주의사항')}</span>
                    </div>
                    <ul className="space-y-1.5">
                      {activeCase.tips.map((tip, idx) => (
                        <li
                          key={idx}
                          className="text-xs text-amber-900/90 flex items-start gap-2 leading-relaxed"
                        >
                          <span className="text-amber-600 font-bold">•</span>
                          <span>{pickText(tip)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
                {t(
                  'Select a guide case on the left to view detailed instructions.',
                  '왼쪽 목록에서 사용 가이드를 선택하세요.'
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
