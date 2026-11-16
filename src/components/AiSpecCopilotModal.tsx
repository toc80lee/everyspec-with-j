import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Wand2,
  X,
  Loader2,
  CheckCircle2,
  Database,
  Sliders,
  Table,
  Layers,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { ProgramSpec, SapModule } from '../types/sap';
import { DEFAULT_ALV_TOOLBAR_BUTTONS } from '../data/defaultToolbarButtons';
import {
  requestAiFullSpecDraft,
  FullSpecDraftResponse,
  requestAiPatchSpec,
  applyAiPatchToSpec,
  AiSpecPatchResult,
} from '../utils/aiLogicGenerator';
import { useLanguage } from '../contexts/LanguageContext';

interface AiSpecCopilotModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSpec: ProgramSpec;
  onApplySpec: (generatedSpec: ProgramSpec) => void;
}

const QUICK_PROMPTS: {
  label: string;
  labelKo: string;
  module: SapModule;
  sampleType: string;
  prompt: string;
  promptKo: string;
}[] = [
  {
    label: 'SD Sales Order Delivery Delay',
    labelKo: 'SD 판매오더 출하 지연 현황',
    module: 'SD',
    sampleType: '01',
    prompt:
      'Query sales orders by sales org, document date, order number, and delivery status radio button (All/Open Only) displaying customer delivery status traffic lights, net value totals, and VA03 drilldown.',
    promptKo:
      '영업조직, 전표일, 판매오더 번호 및 납품 상태 라디오버튼(전체/미납만)으로 조회하여 고객별 납품 상태 신호등, 순금액 합계 및 VA03 드릴다운을 표시하는 단일 ALV 리포트를 설계해 주세요.',
  },
  {
    label: 'MM Purchase Order Master-Detail',
    labelKo: 'MM 구매오더 헤더-아이템 모니터링',
    module: 'MM',
    sampleType: '02',
    prompt:
      'Display PO headers (EKKO) in top grid by company code, plant, and PO date; row click loads PO items (EKPO) with open GR quantity and a custom MIGO goods receipt toolbar button.',
    promptKo:
      '회사코드, 플랜트, 발주일 기준으로 상단에 구매오더 헤더(EKKO)를 조회하고 행 클릭 시 하단에 품목(EKPO)과 미입고 수량, 커스텀 MIGO 입고 처리 툴바 버튼을 제공하는 Master-Detail 2-Grid를 설계해 주세요.',
  },
  {
    label: 'FI Open AR Aging Analysis',
    labelKo: 'FI 미결 매출채권 연령 분석',
    module: 'FI',
    sampleType: '01',
    prompt:
      'Query open AR documents (BSID/BKPF/KNA1) by company code, posting date, and customer with overdue traffic-light alerts, local currency totals, FB03 drilldown, and batch clearing.',
    promptKo:
      '회사코드, 전기일, 고객별로 미결 채권 전표(BSID/BKPF/KNA1)를 조회하고 연체 신호등 경고, 현지통화 합계, FB03 드릴다운 및 일괄 반제 기능을 갖춘 ALV 리포트를 설계해 주세요.',
  },
  {
    label: 'CO Cost Center Plan vs Actual',
    labelKo: 'CO 코스트센터 계획 대비 실적 피벗',
    module: 'CO',
    sampleType: '04',
    prompt:
      'Analyze cost center plan vs actual amounts and variance % across cost elements (CSKS/COEP/COSP) by controlling area (KOKRS), fiscal year (GJAHR), and period (PERIO) in a pivot grid.',
    promptKo:
      '관리회계영역(KOKRS), 회계연도(GJAHR), 기간(PERIO)별로 코스트센터·원가요소(CSKS/COEP/COSP) 기준 계획 대비 실적 금액 및 차이율을 피벗 그리드로 분석하는 프로그램을 설계해 주세요.',
  },
];

export const AiSpecCopilotModal: React.FC<AiSpecCopilotModalProps> = ({
  isOpen,
  onClose,
  currentSpec,
  onApplySpec,
}) => {
  const { t, lang } = useLanguage();
  const [copilotMode, setCopilotMode] = useState<'full' | 'patch'>('full');
  const [requirementPrompt, setRequirementPrompt] = useState('');
  const [selectedModule, setSelectedModule] = useState<SapModule | 'AUTO'>('AUTO');
  const [sampleType, setSampleType] = useState<string>(currentSpec.sample_type || '01');
  const [programId, setProgramId] = useState('');
  const [tcode, setTcode] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draftResult, setDraftResult] = useState<FullSpecDraftResponse | null>(null);
  const [patchResult, setPatchResult] = useState<{ patch: AiSpecPatchResult; source: 'ai' | 'fallback' } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setSampleType(currentSpec.sample_type || '01');
    }
  }, [isOpen, currentSpec.sample_type]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!requirementPrompt.trim()) {
      setErrorMsg(
        copilotMode === 'patch'
          ? t('Please enter modification instructions for the existing specification.', '기존 사양서에 반영할 수정/추가 지시사항을 입력하세요.')
          : t('Please enter business requirements for the SAP program.', 'SAP 프로그램의 업무 요구사항을 입력하세요.')
      );
      return;
    }
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      if (copilotMode === 'patch') {
        const res = await requestAiPatchSpec(requirementPrompt.trim(), currentSpec);
        setPatchResult({ patch: res.patch, source: res.source });
      } else {
        const targetProjectCode =
          currentSpec.project_code &&
          currentSpec.project_code !== 'COMMON' &&
          currentSpec.project_code !== 'COMM'
            ? currentSpec.project_code
            : 'TEMP';
        const res = await requestAiFullSpecDraft({
          requirementPrompt: requirementPrompt.trim(),
          module: selectedModule,
          sampleType,
          targetSapRelease: currentSpec.target_sap_release || 'SAP S/4HANA 2023 / ECC 6.0',
          programId: programId.trim() || undefined,
          tcode: tcode.trim() || undefined,
          projectCode: targetProjectCode,
        });
        setDraftResult(res);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || t('Failed to generate program specification.', '프로그램 사양서 생성에 실패했습니다.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleApplyPatch = () => {
    if (!patchResult?.patch) return;
    const patched = applyAiPatchToSpec(currentSpec, patchResult.patch);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    onApplySpec({
      ...patched,
      source_code: undefined,
      change_history: [
        ...(currentSpec.change_history || []),
        {
          id: `hist-patch-${Date.now()}`,
          version: `v1.${(currentSpec.change_history?.length || 0) + 1}`,
          changed_at: nowStr,
          author: currentSpec.author || 'Josh Lee',
          comment: `AI incremental patch: ${patchResult.patch.summary}`,
        },
      ],
    });
    onClose();
  };

  const handleApplyDraft = () => {
    if (!draftResult?.spec) return;
    const d = draftResult.spec;
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const targetProjectCode =
      currentSpec.project_code &&
      currentSpec.project_code !== 'COMMON' &&
      currentSpec.project_code !== 'COMM'
        ? currentSpec.project_code
        : d.project_code && d.project_code !== 'COMMON' && d.project_code !== 'COMM'
        ? d.project_code
        : 'TEMP';
    const mergedSpec: ProgramSpec = {
      ...d,
      id: currentSpec.id,
      project_code: targetProjectCode,
      author: currentSpec.author || d.author,
      toolbar_buttons:
        d.toolbar_buttons && d.toolbar_buttons.length > 0
          ? d.toolbar_buttons
          : DEFAULT_ALV_TOOLBAR_BUTTONS.map((b) => ({ ...b })),
      source_code: undefined,
      change_history: [
        ...(currentSpec.change_history || []),
        {
          id: `hist-ai-${Date.now()}`,
          version: `v${((currentSpec.change_history?.length || 0) + 1).toFixed(1)}`,
          changed_at: nowStr,
          author: currentSpec.author || 'Josh Lee',
          comment: `AI Spec Copilot draft (${d.program_id} / ${d.module})`,
        },
      ],
    };
    onApplySpec(mergedSpec);
    onClose();
  };

  const draft = draftResult?.spec;
  const distinctBoxes = draft
    ? Array.from(new Set(draft.selection_params.map((p) => p.block_title).filter(Boolean)))
    : [];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center">
              <Wand2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold leading-tight">
                {t('AI Spec Copilot (Requirements → Full Spec Draft)', 'AI 사양 코파일럿 (요구사항 → 전체 사양서 초안)')}
              </h3>
              <p className="text-[11px] text-slate-300">
                {t(
                  'Generates selection parameters, field catalog, extraction logic, data flow, and mock data from requirements.',
                  '업무 요구사항을 바탕으로 선택 화면, 필드 카탈로그, 추출 로직, 흐름도 및 테스트 데이터를 자동 생성합니다.'
                )}
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

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {/* Copilot Mode Switcher */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setCopilotMode('full');
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 px-3 rounded-md font-bold text-xs transition-colors cursor-pointer ${
                copilotMode === 'full'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('Full Draft', '신규 전체 초안')}
            </button>
            <button
              type="button"
              onClick={() => {
                setCopilotMode('patch');
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 px-3 rounded-md font-bold text-xs transition-colors cursor-pointer ${
                copilotMode === 'patch'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t('Incremental Patch', '부분 증분 수정')}
            </button>
          </div>

          {copilotMode === 'patch' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-[11.5px] text-emerald-900">
              <b>{t(`Incremental Patch (${currentSpec.program_id})`, `부분 증분 수정 (${currentSpec.program_id})`)}</b>:{' '}
              {t(
                'Preserves existing selection parameters, field catalog, and logic while appending requested items.',
                '기존 선택 화면, 필드 카탈로그, 로직을 유지한 채 요청한 항목만 안전하게 추가합니다.'
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {[
                  {
                    en: 'Add Plant (S_WERKS) and Material Group (S_MATKL) to Selection Screen',
                    ko: '조회 조건에 플랜트(S_WERKS)와 자재그룹(S_MATKL) 추가',
                  },
                  {
                    en: 'Add Net Price (NETPR), Currency (WAERS), and Batch Approve toolbar button',
                    ko: 'ALV에 단가(NETPR), 통화(WAERS) 컬럼과 일괄 승인 툴바 버튼 추가',
                  },
                  {
                    en: 'Add V_VBAK_VKO authority check and SE91 no-data error message',
                    ko: 'V_VBAK_VKO 권한 점검과 SE91 데이터 없음 오류 메시지 추가',
                  },
                ].map((sample) => {
                  const text = lang === 'ko' ? sample.ko : sample.en;
                  return (
                    <button
                      key={sample.en}
                      type="button"
                      onClick={() => setRequirementPrompt(text)}
                      className="px-2 py-0.5 rounded bg-white hover:bg-emerald-100 border border-emerald-300 text-[10.5px] text-emerald-800 cursor-pointer"
                    >
                      + {text}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Presets (Full Mode) */}
          {copilotMode === 'full' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
              <div className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>{t('Quick Examples (Click to Populate)', '빠른 예시 (클릭 시 입력)')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => {
                      setRequirementPrompt(lang === 'ko' ? q.promptKo : q.prompt);
                      setSelectedModule(q.module);
                      setSampleType(q.sampleType);
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-blue-50 hover:border-blue-300 border border-slate-200 rounded text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer"
                  >
                    [{q.module}] {lang === 'ko' ? q.labelKo : q.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Requirement Input + Options */}
          <div className="space-y-3">
            <div>
              <label className="block font-bold text-slate-800 mb-1">
                {t('Business Requirements', '업무 요구사항')} <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={4}
                value={requirementPrompt}
                onChange={(e) => setRequirementPrompt(e.target.value)}
                placeholder={t(
                  'e.g., Design an ALV report displaying overdue purchase orders by company code, plant, and PO date with red traffic-light indicators and ME23N drilldown.',
                  '예: 회사코드, 플랜트, 발주일 기준으로 납기 지연 구매오더를 조회하고 빨간 신호등 표시 및 ME23N 드릴다운을 지원하는 ALV 리포트를 설계해 주세요.'
                )}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 leading-relaxed"
              />
            </div>

            {copilotMode === 'full' && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{t('SAP Module', 'SAP 모듈')}</label>
                  <select
                    value={selectedModule}
                    onChange={(e) => setSelectedModule(e.target.value as SapModule | 'AUTO')}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-semibold text-slate-800 focus:bg-white focus:border-blue-500 cursor-pointer"
                  >
                    <option value="AUTO">{t('Auto Detect', '자동 판별')}</option>
                    <option value="SD">SD ({t('Sales & Distribution', '영업/출하')})</option>
                    <option value="MM">MM ({t('Materials Management', '구매/자재')})</option>
                    <option value="FI">FI ({t('Financial Accounting', '재무회계')})</option>
                    <option value="CO">CO ({t('Controlling', '관리회계')})</option>
                    <option value="PP">PP ({t('Production Planning', '생산관리')})</option>
                    <option value="HR">HR ({t('Human Resources', '인사관리')})</option>
                    <option value="QM">QM ({t('Quality Management', '품질관리')})</option>
                    <option value="PM">PM ({t('Plant Maintenance', '설비보전')})</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{t('Screen Pattern', '화면 유형')}</label>
                  <select
                    value={sampleType}
                    onChange={(e) => setSampleType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-semibold text-slate-800 focus:bg-white focus:border-blue-500 cursor-pointer"
                  >
                    <option value="01">01 (Single ALV Grid)</option>
                    <option value="02">02 (Master-Detail ALV)</option>
                    <option value="03">03 (Tree ALV Grid)</option>
                    <option value="04">04 (Pivot Browser)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{t('Program ID (Optional)', 'Program ID (선택)')}</label>
                  <input
                    type="text"
                    value={programId}
                    onChange={(e) => setProgramId(e.target.value.toUpperCase())}
                    placeholder={t('Auto (Z...)', '자동 생성 (Z...)')}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono font-bold uppercase text-blue-900 focus:bg-white focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">{t('T-Code (Optional)', 'T-Code (선택)')}</label>
                  <input
                    type="text"
                    value={tcode}
                    onChange={(e) => setTcode(e.target.value.toUpperCase())}
                    placeholder={t('Auto (Z...)', '자동 생성 (Z...)')}
                    className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 font-mono font-bold uppercase text-blue-900 focus:bg-white focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-500">
                {copilotMode === 'patch'
                  ? t('Review the incremental patch preview below before merging into the current spec.', '아래 증분 패치 미리보기를 확인한 뒤 현재 사양서에 병합하세요.')
                  : t('Preview the generated spec below before applying it to the current program.', '아래 생성된 사양서 초안을 검토한 뒤 현재 프로그램에 적용하세요.')}
              </span>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg font-bold shadow-xs flex items-center gap-2 transition-colors cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{copilotMode === 'patch' ? t('Analyzing patch...', '패치 분석 중...') : t('Generating draft...', '초안 생성 중...')}</span>
                  </>
                ) : copilotMode === 'patch' ? (
                  <>
                    <Wand2 className="w-4 h-4" />
                    <span>{t('Generate Patch', '패치 생성')}</span>
                  </>
                ) : draft ? (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>{t('Regenerate Draft', '초안 다시 생성')}</span>
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    <span>{t('Generate Full Draft', '전체 초안 생성')}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Generated Draft Preview */}
          {copilotMode === 'patch' && patchResult && (
            <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-slate-900">{patchResult.patch.summary}</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-emerald-200 text-emerald-700">
                  {patchResult.source === 'ai' ? t('AI Patch', 'AI 패치') : t('Deterministic Patch', '규칙 기반 패치')}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] tabular-nums">
                <div className="bg-white border border-slate-200 rounded p-2">
                  <span className="text-slate-500">{t('Added Selection:', '추가 조회 조건:')}</span>{' '}
                  <b>{patchResult.patch.add_selection_params?.length || 0}</b>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2">
                  <span className="text-slate-500">{t('Added ALV Columns:', '추가 ALV 컬럼:')}</span>{' '}
                  <b>{patchResult.patch.add_field_catalog?.length || 0}</b>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2">
                  <span className="text-slate-500">{t('Auth / Messages:', '권한 / 메시지:')}</span>{' '}
                  <b>
                    {(patchResult.patch.add_authority_checks?.length || 0) +
                      (patchResult.patch.add_messages?.length || 0)}
                  </b>
                </div>
                <div className="bg-white border border-slate-200 rounded p-2">
                  <span className="text-slate-500">{t('Added Toolbar:', '추가 툴바:')}</span>{' '}
                  <b>{patchResult.patch.add_toolbar_buttons?.length || 0}</b>
                </div>
              </div>
              {patchResult.patch.data_extraction_logic_append && (
                <pre className="bg-white border border-slate-200 rounded p-2.5 text-[11px] font-mono whitespace-pre-wrap text-slate-700">
                  {patchResult.patch.data_extraction_logic_append}
                </pre>
              )}
            </div>
          )}

          {copilotMode === 'full' && draft && (
            <div className="border border-blue-200 bg-blue-50/30 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-slate-900 text-sm">{draft.title}</span>
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 bg-white border border-slate-300 rounded text-blue-900">
                    {draft.program_id} / {draft.tcode}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 bg-blue-600 text-white rounded">
                    {draft.module} · {t('Type', '유형')} {draft.sample_type}
                  </span>
                </div>
                {draftResult.detectedTables.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <Database className="w-3.5 h-3.5 text-slate-500" />
                    {draftResult.detectedTables.map((t) => (
                      <span
                        key={t}
                        className="font-mono text-[10px] font-bold px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <Sliders className="w-3 h-3 text-blue-600" />
                    <span>{t('Selection Screen', '조회 조건')}</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                    {t(
                      `${draft.selection_params.length} fields (${distinctBoxes.length} boxes)`,
                      `${draft.selection_params.length}개 (${distinctBoxes.length}박스)`
                    )}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <Table className="w-3 h-3 text-indigo-600" />
                    <span>{t('ALV Field Catalog', 'ALV 필드 카탈로그')}</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                    {draft.field_catalog.length} {t('columns', '컬럼')}
                    {draft.item_grid ? ` + ${draft.item_grid.field_catalog.length} ${t('items', '품목')}` : ''}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-emerald-600" />
                    <span>{t('Mock Data & Tests', '테스트 데이터 및 시나리오')}</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                    {draft.mock_rows.length} {t('rows', '행')} · {draft.test_cases.length} TCs
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    <span>{t('Custom Toolbar', '커스텀 툴바')}</span>
                  </div>
                  <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                    {draft.custom_toolbar.length} {t('custom buttons', '개 버튼')}
                  </div>
                </div>
              </div>

              {/* Detail Preview Columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] font-bold text-slate-700 mb-1.5">
                    {t('Generated Selection Parameters', '생성된 조회 조건 파라미터')}
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {draft.selection_params.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between text-[11px] px-2 py-1 bg-slate-50 rounded border border-slate-100"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono text-[10px] font-bold px-1 py-0.2 rounded bg-blue-100 text-blue-800 shrink-0">
                            {p.kind === 'SELECT_OPTION'
                              ? 'S-OPT'
                              : p.kind === 'RADIOBUTTON'
                              ? 'RADIO'
                              : p.kind === 'CHECKBOX'
                              ? 'CHK'
                              : 'PARAM'}
                          </span>
                          <span className="font-mono font-bold text-slate-900 shrink-0">{p.name}</span>
                          <span className="text-slate-600 truncate">{p.text}</span>
                        </div>
                        {p.block_title && (
                          <span className="text-[10px] text-slate-400 shrink-0 ml-2">{p.block_title}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="text-[11px] font-bold text-slate-700 mb-1.5">
                    {t('Generated ALV Columns (Field Catalog)', '생성된 ALV 컬럼 (필드 카탈로그)')}
                  </div>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {draft.field_catalog.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between text-[11px] px-2 py-1 bg-slate-50 rounded border border-slate-100"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono text-[10px] text-slate-400 w-4 shrink-0">
                            {f.col_pos}
                          </span>
                          <span className="font-mono font-bold text-slate-900 shrink-0">
                            {f.fieldname}
                          </span>
                          <span className="text-slate-600 truncate">{f.coltext}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2 font-mono text-[10px]">
                          {f.key && <span className="px-1 bg-amber-100 text-amber-800 rounded font-bold">KEY</span>}
                          {f.hotspot && (
                            <span className="px-1 bg-indigo-100 text-indigo-800 rounded font-bold">
                              {f.drilldown_tcode || 'HOT'}
                            </span>
                          )}
                          {f.do_sum && <span className="px-1 bg-emerald-100 text-emerald-800 rounded font-bold">Σ</span>}
                          <span className="text-slate-500">{f.datatype}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0 text-xs">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded-md font-semibold cursor-pointer"
          >
            {t('Cancel', '취소')}
          </button>
          {copilotMode === 'patch' ? (
            <button
              type="button"
              disabled={!patchResult}
              onClick={handleApplyPatch}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-md font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{t('Merge Patch', '패치 병합')}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={!draft}
              onClick={handleApplyDraft}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-md font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{t('Apply Draft', '초안 적용')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
