import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Layers,
  Loader2,
  Mic,
  MicOff,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import {
  MeetingTranscriptSegment,
  ProgramSpec,
  ProjectMeetingMinute,
  SapModule,
  SapProject,
} from '../types/sap';
import { CurrentUser } from '../utils/authStorage';
import {
  COMMON_PROJECT_CODE,
  TEMP_PROJECT_CODE,
  getProjectAbapStandards,
} from '../utils/projectStorage';
import { suggestCompliantIdsForProject } from '../utils/sapValidation';
import { formatNowDateTime, saveMeetingMinute } from '../utils/meetingStorage';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { MarkdownFieldEditor } from './MarkdownFieldEditor';
import {
  SampleRecommendationResult,
  cloneAndApplyCommonSampleSpine,
  requestAiFullSpecDraft,
  requestAiMeetingMinutes,
  requestAiSampleRecommendation,
} from '../utils/aiLogicGenerator';
import { SAMPLE_SPECS } from '../data/sampleSpecs';

const SAP_MODULES: SapModule[] = ['SD', 'MM', 'FI', 'CO', 'PP', 'HR', 'QM', 'PM', 'BC', 'CM'];

const SAMPLE_MEETING_PRESETS = [
  {
    label: 'SD Header-Item Delivery Status (02)',
    speaker: 'Sales Lead',
    text:
      'Weekly Sales meeting. Search sales order headers by Sales Org, Document Date, and Customer. Selecting a sales order row in the top grid should filter the bottom Item grid to show delivered quantity and open quantity. Add traffic-light status, VA03 hotspot drilldown, and a Post Goods Issue button on the header.',
  },
  {
    label: 'CO Cost Center Hierarchy Tree (03)',
    speaker: 'Controlling Lead',
    text:
      'Cost center hierarchy report requirements. Use Controlling Area, Fiscal Year, and Period as obligatory selection parameters, and display the cost center group hierarchy in a Tree ALV with automatic node-level plan, actual, and variance subtotals.',
  },
  {
    label: 'MM Purchase Order Monitoring (01)',
    speaker: 'Procurement Lead',
    text:
      'Purchase order delivery delay monitor in a single ALV grid. Filter by Company Code, Plant, PO Date, and Vendor with a radio button for open receipts only. Show red traffic lights for overdue items, ME23N drilldown, and a Goods Receipt toolbar action.',
  },
  {
    label: 'FI Monthly Account Pivot (04)',
    speaker: 'Finance Closing Lead',
    text:
      'Multi-dimensional pivot analysis over ACDOCA journal entries by Company Code, G/L Account, and Fiscal Period so users can compare month-over-month variances across rows and columns.',
  },
];

const SAMPLE_TYPE_META: Record<
  '01' | '02' | '03' | '04',
  { sampleId: string; title: string; subtitle: string }
> = {
  '01': {
    sampleId: 'ZRALV0010',
    title: '01 · Single ALV Grid',
    subtitle: 'Single list view, status icons, hotspot drilldown, custom toolbar',
  },
  '02': {
    sampleId: 'ZRALV0020',
    title: '02 · Master-Detail 2-Grid',
    subtitle: 'Selecting a header row dynamically updates the item grid below',
  },
  '03': {
    sampleId: 'ZRALV0030',
    title: '03 · Tree ALV Grid',
    subtitle: 'Expandable parent-child hierarchy with node subtotals & variances',
  },
  '04': {
    sampleId: 'ZRALV0040',
    title: '04 · Pivot Browser',
    subtitle: 'Multi-dimensional cross-tab aggregation over CDS / ACDOCA',
  },
};

type WizardStep = 1 | 2 | 3 | 4;
type ConfirmationGate = null | 'gate1_minutes' | 'gate2_recommend' | 'gate3_generate' | 'gate4_save';

interface MeetingSpecWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: CurrentUser;
  accessibleProjects: SapProject[];
  defaultProjectCode: string;
  existingProgramIds: string[];
  initialMinute?: ProjectMeetingMinute | null;
  startInSpecGen?: boolean;
  onMinutesSaved: () => void;
  onSpecFinalized: (spec: ProgramSpec, savedMinute: ProjectMeetingMinute) => void;
}

export const MeetingSpecWizardModal: React.FC<MeetingSpecWizardModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  accessibleProjects,
  defaultProjectCode,
  existingProgramIds,
  initialMinute,
  startInSpecGen = false,
  onMinutesSaved,
  onSpecFinalized,
}) => {
  const nonCommonProjects = useMemo(
    () => accessibleProjects.filter((p) => p.code !== COMMON_PROJECT_CODE),
    [accessibleProjects]
  );

  const resolveSafeTargetProject = (code?: string) => {
    const clean = (code || '').trim().toUpperCase();
    if (clean && clean !== COMMON_PROJECT_CODE && nonCommonProjects.some((p) => p.code === clean)) {
      return clean;
    }
    return nonCommonProjects.find((p) => p.code !== TEMP_PROJECT_CODE)?.code || TEMP_PROJECT_CODE;
  };

  // Wizard core state
  const [minuteId, setMinuteId] = useState<string>(() => `mtg-${Date.now()}`);
  const [createdAt, setCreatedAt] = useState<string>(() => formatNowDateTime());
  const [step, setStep] = useState<WizardStep>(1);
  const [gate, setGate] = useState<ConfirmationGate>(null);
  const [targetProjectCode, setTargetProjectCode] = useState<string>(() =>
    resolveSafeTargetProject(defaultProjectCode)
  );

  // Step 1: Recording & segments
  const [speakerName, setSpeakerName] = useState<string>('Business Lead');
  const [segments, setSegments] = useState<MeetingTranscriptSegment[]>([]);
  const [manualNoteInput, setManualNoteInput] = useState<string>('');
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);

  // Step 2: Structured minutes & enrichment
  const [meetingTitle, setMeetingTitle] = useState<string>('New Program Design Meeting');
  const [minutesMarkdown, setMinutesMarkdown] = useState<string>('');
  const [supplementalNotes, setSupplementalNotes] = useState<string>('');
  const [isProcessingAi, setIsProcessingAi] = useState<boolean>(false);
  const [aiFeedbackMsg, setAiFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Step 3: Recommendation & Program ID confirmation
  const [recommendation, setRecommendation] = useState<SampleRecommendationResult | null>(null);
  const [selectedSampleType, setSelectedSampleType] = useState<'01' | '02' | '03' | '04'>('01');
  const [selectedModule, setSelectedModule] = useState<SapModule>('SD');
  const [programId, setProgramId] = useState<string>('ZR_SD_MON_10');
  const [tcode, setTcode] = useState<string>('ZSD010');
  const [programTitle, setProgramTitle] = useState<string>('New ALV Program');

  // Step 4: Generated spec preview
  const [generatedSpec, setGeneratedSpec] = useState<ProgramSpec | null>(null);
  const [detectedTables, setDetectedTables] = useState<string[]>([]);
  const [previewTab, setPreviewTab] = useState<'overview' | 'fields' | 'flow'>('overview');

  // Initialize / hydrate when modal opens or initialMinute changes
  useEffect(() => {
    if (!isOpen) return;
    setGate(null);
    setErrorMsg(null);
    setAiFeedbackMsg(null);
    setPreviewTab('overview');

    if (initialMinute) {
      setMinuteId(initialMinute.id);
      setCreatedAt(initialMinute.created_at);
      setTargetProjectCode(resolveSafeTargetProject(initialMinute.project_code));
      setSegments(initialMinute.segments || []);
      setMeetingTitle(initialMinute.title || 'New Program Design Meeting');
      setMinutesMarkdown(initialMinute.minutes_markdown || '');
      setSupplementalNotes(initialMinute.supplemental_notes || '');
      setSelectedSampleType(initialMinute.recommended_sample_type || '01');
      setSelectedModule(initialMinute.suggested_module || 'SD');
      setProgramId(initialMinute.suggested_program_id || 'ZR_SD_MON_10');
      setTcode(initialMinute.suggested_tcode || 'ZSD010');
      setProgramTitle(initialMinute.suggested_title || initialMinute.title || 'New ALV Program');
      setGeneratedSpec(null);

      if (initialMinute.recommended_sample_type && initialMinute.suggested_program_id) {
        setRecommendation({
          recommendedSampleType: initialMinute.recommended_sample_type,
          confidenceReason:
            initialMinute.recommendation_reason ||
            'Recommended COMM sample type based on saved meeting minutes.',
          suggestedModule: initialMinute.suggested_module || 'SD',
          suggestedProgramId: initialMinute.suggested_program_id,
          suggestedTcode: initialMinute.suggested_tcode || 'ZSD010',
          suggestedTitle: initialMinute.suggested_title || initialMinute.title,
          requirementPrompt: initialMinute.minutes_markdown,
          alternatives: Object.entries(SAMPLE_TYPE_META).map(([k, v]) => ({
            sampleType: k as '01' | '02' | '03' | '04',
            sampleProgramId: v.sampleId,
            label: v.title,
            fitSummary: v.subtitle,
          })),
          source: 'ai',
        });
        setStep(3);
      } else if (initialMinute.minutes_markdown?.trim()) {
        if (startInSpecGen) {
          setStep(2);
          setIsProcessingAi(true);
          const safeProj = resolveSafeTargetProject(initialMinute.project_code);
          const projObj = nonCommonProjects.find((p) => p.code === safeProj);
          requestAiSampleRecommendation({
            minutesMarkdown: initialMinute.minutes_markdown.trim(),
            projectName: projObj?.name || safeProj,
            existingProgramIds,
          })
            .then((res) => {
              const std = getProjectAbapStandards(safeProj);
              const compliant = suggestCompliantIdsForProject(
                res.suggestedProgramId,
                res.suggestedTcode,
                res.suggestedModule,
                std
              );
              setRecommendation(res);
              setSelectedSampleType(res.recommendedSampleType);
              setSelectedModule(res.suggestedModule);
              setProgramId(compliant.program_id);
              setTcode(compliant.tcode);
              setProgramTitle(res.suggestedTitle);
              setStep(3);
              setAiFeedbackMsg(
                `Recommended COMM sample type ${res.recommendedSampleType} (${SAMPLE_TYPE_META[res.recommendedSampleType].sampleId}). Review details before generating the spec.`
              );
            })
            .catch((err: any) => {
              setErrorMsg(err?.message || 'Failed to recommend sample type.');
            })
            .finally(() => {
              setIsProcessingAi(false);
            });
        } else {
          setStep(2);
        }
      } else {
        setStep(1);
      }
    } else {
      setMinuteId(`mtg-${Date.now()}`);
      setCreatedAt(formatNowDateTime());
      setTargetProjectCode(resolveSafeTargetProject(defaultProjectCode));
      setSegments([]);
      setManualNoteInput('');
      setMeetingTitle('New Program Design Meeting');
      setMinutesMarkdown('');
      setSupplementalNotes('');
      setRecommendation(null);
      setSelectedSampleType('01');
      setSelectedModule('SD');
      setProgramId('ZR_SD_MON_10');
      setTcode('ZSD010');
      setProgramTitle('New ALV Program');
      setGeneratedSpec(null);
      setStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialMinute?.id, defaultProjectCode, startInSpecGen]);

  const appendSegment = (
    text: string,
    kind: 'voice' | 'supplement' | 'note' = 'voice',
    speaker?: string
  ) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const nowTime = new Date().toTimeString().slice(0, 8);
    const seg: MeetingTranscriptSegment = {
      id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: nowTime,
      speaker: speaker || speakerName || currentUser.name,
      text: trimmed,
      kind,
    };
    setSegments((prev) => [...prev, seg]);
  };

  // Primary meeting voice hook (Step 1)
  const mainVoice = useVoiceInput({
    lang: 'ko-KR',
    onResult: (finalText) => {
      appendSegment(finalText, 'voice', speakerName);
    },
  });

  // Supplemental voice hook (Step 2)
  const supplementVoice = useVoiceInput({
    lang: 'ko-KR',
    onResult: (finalText) => {
      appendSegment(finalText, 'supplement', currentUser.name);
      setSupplementalNotes((prev) => (prev.trim() ? `${prev.trim()}\n${finalText}` : finalText));
    },
  });

  // Recording elapsed timer
  useEffect(() => {
    if (!mainVoice.isListening) {
      setRecordingSeconds(0);
      return;
    }
    const timer = window.setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mainVoice.isListening]);

  // Stop active microphones when modal closes
  const mainVoiceRef = useRef(mainVoice);
  const suppVoiceRef = useRef(supplementVoice);
  mainVoiceRef.current = mainVoice;
  suppVoiceRef.current = supplementVoice;

  useEffect(() => {
    if (!isOpen) {
      if (mainVoiceRef.current.isListening) mainVoiceRef.current.stopListening();
      if (suppVoiceRef.current.isListening) suppVoiceRef.current.stopListening();
    }
  }, [isOpen]);

  const isDuplicateProgramId = useMemo(() => {
    const clean = programId.trim().toUpperCase();
    return Boolean(clean) && existingProgramIds.some((id) => id.toUpperCase() === clean);
  }, [programId, existingProgramIds]);

  if (!isOpen) return null;

  const rawTranscriptText = segments
    .map((s) => `[${s.timestamp}] ${s.speaker ? `${s.speaker}: ` : ''}${s.text}`)
    .join('\n');

  const formatDuration = (sec: number) => {
    const mm = String(Math.floor(sec / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const persistProgress = (
    overrides: Partial<ProjectMeetingMinute> = {}
  ): ProjectMeetingMinute => {
    const record: ProjectMeetingMinute = {
      id: minuteId,
      project_code: targetProjectCode,
      title: meetingTitle.trim() || 'New Program Design Meeting',
      created_at: createdAt,
      updated_at: formatNowDateTime(),
      author: initialMinute?.author || currentUser.name,
      status:
        overrides.status ||
        (generatedSpec
          ? 'spec_generated'
          : recommendation
          ? 'recommended'
          : minutesMarkdown.trim()
          ? 'minutes_ready'
          : 'recording'),
      segments,
      raw_transcript: rawTranscriptText,
      supplemental_notes: supplementalNotes,
      minutes_markdown: minutesMarkdown,
      recommended_sample_type: selectedSampleType,
      recommendation_reason: recommendation?.confidenceReason,
      suggested_module: selectedModule,
      suggested_program_id: programId,
      suggested_tcode: tcode,
      suggested_title: programTitle,
      generated_program_id: initialMinute?.generated_program_id,
      ...overrides,
    };
    saveMeetingMinute(record);
    onMinutesSaved();
    return record;
  };

  const activeTargetProject = nonCommonProjects.find((p) => p.code === targetProjectCode);

  const handleAddManualNote = () => {
    if (!manualNoteInput.trim()) return;
    appendSegment(manualNoteInput, 'note', speakerName);
    setManualNoteInput('');
  };

  // Gate 1 -> Generate Step 2 structured minutes
  const handleConfirmGenerateMinutes = async () => {
    if (mainVoice.isListening) mainVoice.stopListening();
    const combinedTranscript = rawTranscriptText.trim() || manualNoteInput.trim();
    if (!combinedTranscript) {
      setErrorMsg('Please record audio or enter meeting notes first.');
      setGate(null);
      return;
    }

    setGate(null);
    setErrorMsg(null);
    setIsProcessingAi(true);
    try {
      const res = await requestAiMeetingMinutes({
        mode: 'create',
        rawTranscript: combinedTranscript,
        projectName: activeTargetProject?.name || targetProjectCode,
        targetRelease: activeTargetProject?.target_sap_release || 'SAP S/4HANA 2023',
      });
      setMeetingTitle(res.title);
      setMinutesMarkdown(res.minutesMarkdown);
      setSelectedModule(res.detectedModule);
      setStep(2);
      setAiFeedbackMsg(
        res.source === 'ai'
          ? 'AI generated structured SAP meeting minutes. Review and enrich before confirming.'
          : 'Draft meeting minutes prepared. Review and refine before proceeding.'
      );
      persistProgress({
        title: res.title,
        minutes_markdown: res.minutesMarkdown,
        suggested_module: res.detectedModule,
        status: 'minutes_ready',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to generate meeting minutes.');
    } finally {
      setIsProcessingAi(false);
    }
  };

  // Step 2: Enrich existing minutes with supplemental recording / text
  const handleEnrichMinutes = async () => {
    if (supplementVoice.isListening) supplementVoice.stopListening();
    if (!supplementalNotes.trim()) {
      setErrorMsg('Please enter or record supplemental notes first.');
      return;
    }
    setErrorMsg(null);
    setIsProcessingAi(true);
    try {
      const res = await requestAiMeetingMinutes({
        mode: 'enrich',
        rawTranscript: rawTranscriptText,
        existingMinutes: minutesMarkdown,
        supplementalNotes,
        projectName: activeTargetProject?.name || targetProjectCode,
        targetRelease: activeTargetProject?.target_sap_release || 'SAP S/4HANA 2023',
      });
      setMinutesMarkdown(res.minutesMarkdown);
      if (res.title) setMeetingTitle(res.title);
      setSelectedModule(res.detectedModule);
      setSupplementalNotes('');
      setAiFeedbackMsg('Supplemental notes merged into meeting minutes.');
      persistProgress({
        title: res.title || meetingTitle,
        minutes_markdown: res.minutesMarkdown,
        supplemental_notes: '',
        suggested_module: res.detectedModule,
        status: 'minutes_ready',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to apply supplemental notes.');
    } finally {
      setIsProcessingAi(false);
    }
  };

  // Gate 2 -> Recommend COMM Sample Type (Step 3)
  const handleConfirmRecommendSample = async () => {
    if (supplementVoice.isListening) supplementVoice.stopListening();
    const combinedMinutes = supplementalNotes.trim()
      ? `${minutesMarkdown.trim()}\n\n### Additional Notes\n${supplementalNotes.trim()}`
      : minutesMarkdown.trim();

    if (!combinedMinutes) {
      setErrorMsg('Meeting minutes cannot be empty.');
      setGate(null);
      return;
    }

    setGate(null);
    setErrorMsg(null);
    setIsProcessingAi(true);
    try {
      const res = await requestAiSampleRecommendation({
        minutesMarkdown: combinedMinutes,
        projectName: activeTargetProject?.name || targetProjectCode,
        existingProgramIds,
      });
      const std = getProjectAbapStandards(targetProjectCode);
      const compliant = suggestCompliantIdsForProject(
        res.suggestedProgramId,
        res.suggestedTcode,
        res.suggestedModule,
        std
      );
      setMinutesMarkdown(combinedMinutes);
      if (supplementalNotes.trim()) setSupplementalNotes('');
      setRecommendation(res);
      setSelectedSampleType(res.recommendedSampleType);
      setSelectedModule(res.suggestedModule);
      setProgramId(compliant.program_id);
      setTcode(compliant.tcode);
      setProgramTitle(res.suggestedTitle);
      setStep(3);
      setAiFeedbackMsg(
        `Recommended COMM sample type ${res.recommendedSampleType} (${SAMPLE_TYPE_META[res.recommendedSampleType].sampleId}) and suggested IDs.`
      );
      persistProgress({
        minutes_markdown: combinedMinutes,
        supplemental_notes: '',
        recommended_sample_type: res.recommendedSampleType,
        recommendation_reason: res.confidenceReason,
        suggested_module: res.suggestedModule,
        suggested_program_id: compliant.program_id,
        suggested_tcode: compliant.tcode,
        suggested_title: res.suggestedTitle,
        status: 'recommended',
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to recommend sample type.');
    } finally {
      setIsProcessingAi(false);
    }
  };

  // Gate 3 -> Clone COMM sample spine & generate full ProgramSpec (Step 4)
  const handleConfirmGenerateFullSpec = async () => {
    const cleanPid = programId.trim().toUpperCase();
    if (!cleanPid || (!cleanPid.startsWith('Z') && !cleanPid.startsWith('Y'))) {
      setErrorMsg('Program ID must start with Z or Y (SAP customer namespace).');
      setGate(null);
      return;
    }
    if (isDuplicateProgramId) {
      setErrorMsg(`Program ID '${cleanPid}' already exists. Please enter another ID.`);
      setGate(null);
      return;
    }

    setGate(null);
    setErrorMsg(null);
    setIsProcessingAi(true);
    try {
      const promptPayload = `[Project]: ${activeTargetProject?.name || targetProjectCode}
[Program Title]: ${programTitle}
[Selected COMM Sample Type]: ${selectedSampleType} (${SAMPLE_TYPE_META[selectedSampleType].sampleId} - ${SAMPLE_TYPE_META[selectedSampleType].title})

[Confirmed Design Minutes]
${minutesMarkdown}`;

      const draft = await requestAiFullSpecDraft({
        requirementPrompt: promptPayload,
        module: selectedModule,
        sampleType: selectedSampleType,
        targetSapRelease: activeTargetProject?.target_sap_release || 'SAP S/4HANA 2023',
        programId: cleanPid,
        tcode: tcode.trim().toUpperCase() || `Z${selectedModule}010`,
      });

      const baseSpec = cloneAndApplyCommonSampleSpine({
        generatedSpec: draft.spec,
        sampleType: selectedSampleType,
        targetProjectCode,
        programId: cleanPid,
        tcode: tcode.trim().toUpperCase() || draft.spec.tcode,
        title: programTitle.trim() || draft.spec.title,
        module: selectedModule,
        author: currentUser.name,
        targetSapRelease: activeTargetProject?.target_sap_release || 'SAP S/4HANA 2023',
      });

      const finalSpec: ProgramSpec = {
        ...baseSpec,
        source_meeting_id: minuteId,
        source_meeting_title: meetingTitle.trim() || 'Design Meeting Minutes',
      };

      setGeneratedSpec(finalSpec);
      setDetectedTables(draft.detectedTables);
      setStep(4);
      setAiFeedbackMsg(
        `Cloned COMM '${SAMPLE_TYPE_META[selectedSampleType].sampleId}' structure into '${finalSpec.program_id}'.`
      );
      persistProgress({
        recommended_sample_type: selectedSampleType,
        suggested_module: selectedModule,
        suggested_program_id: finalSpec.program_id,
        suggested_tcode: finalSpec.tcode,
        suggested_title: finalSpec.title,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to build specification.');
    } finally {
      setIsProcessingAi(false);
    }
  };

  // Gate 4 -> Save final spec & jump to Dual View detail editor
  const handleConfirmRegisterAndOpen = () => {
    if (!generatedSpec) return;
    setGate(null);
    const mergedGeneratedIds = Array.from(
      new Set([
        ...(initialMinute?.generated_program_ids || []),
        ...(initialMinute?.generated_program_id ? [initialMinute.generated_program_id] : []),
        generatedSpec.program_id,
      ])
    );
    const savedMinute = persistProgress({
      status: 'spec_generated',
      generated_program_id: generatedSpec.program_id,
      generated_program_ids: mergedGeneratedIds,
      recommended_sample_type: selectedSampleType,
      suggested_module: selectedModule,
      suggested_program_id: generatedSpec.program_id,
      suggested_tcode: generatedSpec.tcode,
      suggested_title: generatedSpec.title,
    });
    onSpecFinalized(generatedSpec, savedMinute);
  };

  const baselineSample =
    SAMPLE_SPECS.find((s) => (s.sample_type || '01') === selectedSampleType) || SAMPLE_SPECS[0];

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-hidden">
      {/* Page Header & 4-Step Progress Indicator */}
      <header className="px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-mono font-semibold text-blue-700 flex items-center gap-2">
                <span>AI MEETING-TO-SPEC WIZARD</span>
                <span aria-hidden="true">·</span>
                <span>Target Project: {targetProjectCode}</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 mt-0.5">
                AI Meeting-to-Spec Designer
              </h1>
            </div>

            <button
              type="button"
              onClick={() => {
                persistProgress();
                onClose();
              }}
              className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
              title="Save draft and return to overview"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Save Draft & Back</span>
            </button>
          </div>

          {/* Stepper Bar */}
          <nav className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2" aria-label="Wizard steps">
            {[
              { num: 1 as WizardStep, label: '1. Record & Notes' },
              { num: 2 as WizardStep, label: '2. Review Minutes' },
              { num: 3 as WizardStep, label: '3. Select Sample Type' },
              { num: 4 as WizardStep, label: '4. Build & Register' },
            ].map((item) => {
              const isActive = step === item.num;
              const isDone =
                (item.num === 1 && Boolean(minutesMarkdown.trim())) ||
                (item.num === 2 && Boolean(recommendation)) ||
                (item.num === 3 && Boolean(generatedSpec)) ||
                step > item.num;
              const canJump =
                item.num === 1 ||
                (item.num === 2 && Boolean(minutesMarkdown.trim())) ||
                (item.num === 3 && Boolean(recommendation)) ||
                (item.num === 4 && Boolean(generatedSpec));

              return (
                <button
                  key={item.num}
                  type="button"
                  disabled={!canJump || isProcessingAi}
                  onClick={() => {
                    if (canJump) {
                      setGate(null);
                      setStep(item.num);
                    }
                  }}
                  className={`px-3.5 py-2.5 rounded-lg text-left text-xs font-semibold transition-all border flex items-center justify-between gap-2 ${
                    isActive
                      ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                      : isDone
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 cursor-pointer'
                      : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <span className="truncate">{item.label}</span>
                  {isDone && !isActive && <Check className="w-3.5 h-3.5 shrink-0 text-emerald-600" />}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Scrollable Step Body */}
      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
              <button
                type="button"
                onClick={() => setErrorMsg(null)}
                aria-label="Dismiss error"
                className="text-rose-500 hover:text-rose-800 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {aiFeedbackMsg && (
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{aiFeedbackMsg}</div>
              <button
                type="button"
                onClick={() => setAiFeedbackMsg(null)}
                aria-label="Dismiss message"
                className="text-blue-500 hover:text-blue-800 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 1: RECORDING & MEETING NOTES                                 */}
          {/* ================================================================= */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Step 1. Voice Recording & Requirement Notes
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Record live meeting audio or capture requirement notes below before generating minutes.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <label className="text-[11px] font-semibold text-slate-600">
                      Project
                    </label>
                    <select
                      value={targetProjectCode}
                      onChange={(e) => setTargetProjectCode(e.target.value)}
                      className="px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer"
                    >
                      {nonCommonProjects.map((proj) => (
                        <option key={proj.code} value={proj.code}>
                          {proj.code} ({proj.name})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Microphone Controls Bar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-xl bg-slate-900 text-white">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (mainVoice.isListening) {
                          mainVoice.stopListening();
                        } else {
                          mainVoice.startListening();
                        }
                      }}
                      className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${
                        mainVoice.isListening
                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                          : 'bg-blue-600 hover:bg-blue-500 text-white'
                      }`}
                    >
                      {mainVoice.isListening ? (
                        <>
                          <MicOff className="w-4 h-4" />
                          <span>Stop Recording</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4" />
                          <span>Start Recording</span>
                        </>
                      )}
                    </button>

                    <div className="text-xs">
                      {mainVoice.isListening ? (
                        <div className="flex items-center gap-2 text-rose-300 font-mono tabular-nums font-semibold">
                          <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                          <span>Recording · {formatDuration(recordingSeconds)}</span>
                        </div>
                      ) : mainVoice.isTranscribing ? (
                        <div className="flex items-center gap-1.5 text-blue-300 font-medium">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Transcribing audio...</span>
                        </div>
                      ) : (
                        <span className="text-slate-300">
                          Click Start Recording to capture meeting audio.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">Speaker:</span>
                    <input
                      type="text"
                      value={speakerName}
                      onChange={(e) => setSpeakerName(e.target.value)}
                      placeholder="Speaker name"
                      className="w-28 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-md text-xs text-white focus:border-blue-400"
                    />
                  </div>
                </div>

                {mainVoice.isListening && mainVoice.transcript && (
                  <div className="px-3.5 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-center gap-2">
                    <Volume2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span className="italic">{mainVoice.transcript}</span>
                  </div>
                )}

                {mainVoice.errorMessage && (
                  <div className="px-3.5 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                    {mainVoice.errorMessage}
                  </div>
                )}

                {/* Preset Sample Voice Buttons for quick demo/testing */}
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500">
                    Quick Sample Inputs (No Mic Needed):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SAMPLE_MEETING_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => appendSegment(preset.text, 'voice', preset.speaker)}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 hover:border-blue-300 rounded-md text-[11px] font-semibold text-slate-700 transition-colors cursor-pointer"
                      >
                        + {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Manual Quick Note Entry */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualNoteInput}
                    onChange={(e) => setManualNoteInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddManualNote();
                      }
                    }}
                    placeholder="Type a requirement note and press Enter or Add..."
                    className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddManualNote}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Note</span>
                  </button>
                </div>
              </div>

              {/* Captured Transcript Segments List */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                  <div className="text-xs font-bold text-slate-800 tabular-nums">
                    Captured Segments & Notes ({segments.length})
                  </div>
                  {segments.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSegments([])}
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {segments.length === 0 ? (
                  <div className="px-6 py-10 text-center text-xs text-slate-500">
                    No segments recorded yet. Click <strong>Start Recording</strong> above or add a sample/manual note.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {segments.map((seg) => (
                      <div key={seg.id} className="px-5 py-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] text-slate-500 flex items-center gap-2 font-mono">
                            <span>{seg.timestamp}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-sans font-semibold text-slate-700">
                              {seg.speaker || 'Participant'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {seg.kind === 'voice'
                                ? 'Voice'
                                : seg.kind === 'supplement'
                                ? 'Supplement'
                                : 'Note'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-800 mt-1 leading-relaxed whitespace-pre-wrap">
                            {seg.text}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSegments((prev) => prev.filter((item) => item.id !== seg.id))
                          }
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                          title="Delete segment"
                          aria-label="Delete segment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 2: AI STRUCTURED MINUTES REVIEW & VOICE/TEXT ENRICHMENT      */}
          {/* ================================================================= */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Step 2. Review & Enrich Meeting Minutes
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Edit the AI-generated meeting minutes or merge supplemental notes below before confirming.
                    </p>
                  </div>
                  <div className="text-xs font-mono font-semibold text-slate-600 shrink-0">
                    Project: {targetProjectCode}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Meeting Title
                    </label>
                    <input
                      type="text"
                      value={meetingTitle}
                      onChange={(e) => setMeetingTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Target Project
                    </label>
                    <select
                      value={targetProjectCode}
                      onChange={(e) => setTargetProjectCode(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer"
                    >
                      {nonCommonProjects.map((proj) => (
                        <option key={proj.code} value={proj.code}>
                          {proj.code} ({proj.name})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Meeting Minutes (Markdown & Preview)
                  </label>
                  <MarkdownFieldEditor
                    value={minutesMarkdown}
                    onChange={setMinutesMarkdown}
                    rows={10}
                    minHeight="220px"
                    placeholder="Review and edit the meeting minutes in Markdown..."
                  />
                </div>
              </div>

              {/* Enrichment / Supplemental Voice & Notes Panel */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Add Supplemental Recording or Notes
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Record or type missing business rules or criteria and merge them into the minutes.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (supplementVoice.isListening) {
                        supplementVoice.stopListening();
                      } else {
                        supplementVoice.startListening();
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 ${
                      supplementVoice.isListening
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {supplementVoice.isListening ? (
                      <>
                        <MicOff className="w-3.5 h-3.5" />
                        <span>Stop Supplement</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3.5 h-3.5" />
                        <span>Record Supplement</span>
                      </>
                    )}
                  </button>
                </div>

                {supplementVoice.isListening && supplementVoice.transcript && (
                  <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800 italic">
                    {supplementVoice.transcript}
                  </div>
                )}

                {supplementVoice.errorMessage && (
                  <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                    {supplementVoice.errorMessage}
                  </div>
                )}

                <textarea
                  rows={3}
                  value={supplementalNotes}
                  onChange={(e) => setSupplementalNotes(e.target.value)}
                  placeholder="e.g. Also show open AR balance per customer and add an authority check before Excel export..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white focus:border-blue-500"
                />

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={!supplementalNotes.trim() || isProcessingAi}
                    onClick={handleEnrichMinutes}
                    className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isProcessingAi ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>Merge into Minutes</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 3: COMM SAMPLE RECOMMENDATION & PROGRAM ID EDITING           */}
          {/* ================================================================= */}
          {step === 3 && (
            <div className="space-y-5">
              {/* AI Recommendation Rationale */}
              <div className="bg-white border border-blue-200 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-blue-700 font-bold text-xs">
                    <Sparkles className="w-4 h-4" />
                    <span>Recommended COMM Sample Type</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-700">
                    Type {selectedSampleType} ({SAMPLE_TYPE_META[selectedSampleType].sampleId})
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed bg-blue-50/70 border border-blue-100 rounded-lg p-3">
                  {recommendation?.confidenceReason ||
                    'Recommended the closest COMM standard ALV pattern based on meeting requirements.'}
                </p>

                {/* 4 Selectable COMM Sample Type Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  {(['01', '02', '03', '04'] as const).map((typeCode) => {
                    const meta = SAMPLE_TYPE_META[typeCode];
                    const alt = recommendation?.alternatives?.find(
                      (a) => a.sampleType === typeCode
                    );
                    const isAiTop = recommendation?.recommendedSampleType === typeCode;
                    const isChosen = selectedSampleType === typeCode;

                    return (
                      <button
                        key={typeCode}
                        type="button"
                        onClick={() => setSelectedSampleType(typeCode)}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                          isChosen
                            ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                            : 'bg-white border-slate-200 hover:border-blue-400 text-slate-800'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span
                              className={`font-mono text-xs font-bold ${
                                isChosen ? 'text-blue-300' : 'text-blue-700'
                              }`}
                            >
                              {meta.sampleId}
                            </span>
                            {isAiTop && (
                              <span
                                className={`text-[10px] font-bold ${
                                  isChosen ? 'text-emerald-300' : 'text-emerald-600'
                                }`}
                              >
                                Suggested
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-bold mt-1">{meta.title}</div>
                          <p
                            className={`text-[11px] mt-1 leading-snug ${
                              isChosen ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            {alt?.fitSummary || meta.subtitle}
                          </p>
                        </div>
                        <div
                          className={`text-[11px] font-semibold pt-2 border-t ${
                            isChosen
                              ? 'border-slate-700 text-blue-300'
                              : 'border-slate-100 text-slate-500'
                          }`}
                        >
                          {isChosen ? 'Selected' : 'Click to select'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Editable AI-Suggested Program Identifiers & Target Project */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Confirm Target Program Details
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    COMM original ({baselineSample.program_id}) stays protected; a new spec will be generated in the target project.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Target Project (Required)
                    </label>
                    <select
                      value={targetProjectCode}
                      onChange={(e) => setTargetProjectCode(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer"
                    >
                      {nonCommonProjects.map((proj) => (
                        <option key={proj.code} value={proj.code}>
                          {proj.code} — {proj.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      SAP Module
                    </label>
                    <select
                      value={selectedModule}
                      onChange={(e) => setSelectedModule(e.target.value as SapModule)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-semibold text-slate-800 cursor-pointer"
                    >
                      {SAP_MODULES.map((m) => (
                        <option key={m} value={m}>
                          {m === 'CM' ? 'CM (Common)' : m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      T-Code (Z*/Y*)
                    </label>
                    <input
                      type="text"
                      value={tcode}
                      onChange={(e) =>
                        setTcode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))
                      }
                      maxLength={20}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Program ID (Z*/Y*)
                    </label>
                    <input
                      type="text"
                      value={programId}
                      onChange={(e) =>
                        setProgramId(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))
                      }
                      maxLength={30}
                      className={`w-full px-3 py-2 bg-white border rounded-lg text-xs font-mono font-bold focus:outline-none ${
                        isDuplicateProgramId
                          ? 'border-rose-500 text-rose-700'
                          : 'border-slate-300 text-slate-900 focus:border-blue-500'
                      }`}
                    />
                    {isDuplicateProgramId && (
                      <p className="text-[11px] text-rose-600 mt-1 font-medium">
                        Program ID already exists. Please enter another ID.
                      </p>
                    )}
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Program Title
                    </label>
                    <input
                      type="text"
                      value={programTitle}
                      onChange={(e) => setProgramTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 4: GENERATED SPEC PREVIEW & REGISTER TO PROJECT              */}
          {/* ================================================================= */}
          {step === 4 && generatedSpec && (
            <div className="space-y-4">
              {/* Summary Banner */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-mono font-semibold text-blue-700 flex items-center gap-2">
                    <span>{generatedSpec.project_code}</span>
                    <span aria-hidden="true">·</span>
                    <span>Type {generatedSpec.sample_type} (from {baselineSample.program_id})</span>
                    <span aria-hidden="true">·</span>
                    <span>{generatedSpec.module}</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-1">
                    {generatedSpec.program_id} — {generatedSpec.title}
                  </h3>
                  <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-3 tabular-nums">
                    <span>T-Code: <strong className="font-mono text-slate-800">{generatedSpec.tcode}</strong></span>
                    <span>Selection: <strong className="font-mono text-slate-800">{generatedSpec.selection_params.length}</strong></span>
                    <span>ALV Columns: <strong className="font-mono text-slate-800">{generatedSpec.field_catalog.length}</strong></span>
                    {generatedSpec.item_grid && (
                      <span>Item Columns: <strong className="font-mono text-slate-800">{generatedSpec.item_grid.field_catalog.length}</strong></span>
                    )}
                    <span>Test Cases: <strong className="font-mono text-slate-800">{generatedSpec.test_cases.length}</strong></span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isProcessingAi}
                  onClick={() => setGate('gate3_generate')}
                  className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Regenerate Spec</span>
                </button>
              </div>

              {/* Preview Tabs */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
                  {[
                    { id: 'overview' as const, label: 'Purpose & Extraction Logic' },
                    {
                      id: 'fields' as const,
                      label: `Selection (${generatedSpec.selection_params.length}) & ALV Fields (${generatedSpec.field_catalog.length})`,
                    },
                    {
                      id: 'flow' as const,
                      label: `Data Flow & Tests (${generatedSpec.test_cases.length}) / Mock (${generatedSpec.mock_rows.length})`,
                    },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setPreviewTab(tab.id)}
                      className={`px-3.5 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                        previewTab === tab.id
                          ? 'border-blue-600 text-blue-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="p-5 space-y-4">
                  {previewTab === 'overview' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-slate-800">
                          Business Purpose
                        </div>
                        <pre className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
                          {generatedSpec.business_purpose}
                        </pre>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-bold text-slate-800">
                            Data Extraction Logic
                          </div>
                          {detectedTables.length > 0 && (
                            <span className="text-[11px] font-mono text-blue-700">
                              Tables: {detectedTables.join(', ')}
                            </span>
                          )}
                        </div>
                        <pre className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
                          {generatedSpec.data_extraction_logic}
                        </pre>
                      </div>
                    </div>
                  )}

                  {previewTab === 'fields' && (
                    <div className="space-y-5">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 mb-2">
                          Selection Parameters ({generatedSpec.selection_params.length})
                        </h4>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-700 font-bold">
                              <tr>
                                <th className="px-3 py-2">Block</th>
                                <th className="px-3 py-2">Kind</th>
                                <th className="px-3 py-2">Name</th>
                                <th className="px-3 py-2">Label</th>
                                <th className="px-3 py-2">Ref Field / Type</th>
                                <th className="px-3 py-2">Req</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {generatedSpec.selection_params.map((p) => (
                                <tr key={p.id}>
                                  <td className="px-3 py-2 text-slate-600">{p.block_title || '-'}</td>
                                  <td className="px-3 py-2 font-mono text-slate-700">{p.kind}</td>
                                  <td className="px-3 py-2 font-mono font-bold text-blue-700">{p.name}</td>
                                  <td className="px-3 py-2 text-slate-800">{p.text}</td>
                                  <td className="px-3 py-2 font-mono text-slate-600">
                                    {p.ref_table ? `${p.ref_table}-${p.ref_field || ''}` : p.datatype}
                                  </td>
                                  <td className="px-3 py-2 font-mono">
                                    {p.obligatory ? 'Y' : '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-xs font-bold text-slate-800 mb-2">
                          ALV Field Catalog ({generatedSpec.field_catalog.length})
                        </h4>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-700 font-bold">
                              <tr>
                                <th className="px-3 py-2">Pos</th>
                                <th className="px-3 py-2">Fieldname</th>
                                <th className="px-3 py-2">Header Text</th>
                                <th className="px-3 py-2">Type</th>
                                <th className="px-3 py-2">Key</th>
                                <th className="px-3 py-2">Hotspot / T-Code</th>
                                <th className="px-3 py-2">Sum</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {generatedSpec.field_catalog.map((f) => (
                                <tr key={f.id}>
                                  <td className="px-3 py-2 font-mono tabular-nums">{f.col_pos}</td>
                                  <td className="px-3 py-2 font-mono font-bold text-slate-900">{f.fieldname}</td>
                                  <td className="px-3 py-2 text-slate-800">{f.coltext}</td>
                                  <td className="px-3 py-2 font-mono text-slate-600">{f.datatype}</td>
                                  <td className="px-3 py-2 font-mono">{f.key ? 'X' : '-'}</td>
                                  <td className="px-3 py-2 font-mono text-blue-700">
                                    {f.hotspot ? f.drilldown_tcode || 'YES' : '-'}
                                  </td>
                                  <td className="px-3 py-2 font-mono">{f.do_sum ? 'Σ' : '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}

                  {previewTab === 'flow' && (
                    <div className="space-y-4">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 mb-2">
                          QA Test Scenarios ({generatedSpec.test_cases.length})
                        </h4>
                        <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                          {generatedSpec.test_cases.map((tc) => (
                            <div key={tc.id} className="p-3 text-xs space-y-1">
                              <div className="font-bold text-slate-900">{tc.scenario}</div>
                              <div className="text-slate-600">Condition: {tc.condition}</div>
                              <div className="text-blue-700 font-medium">Expected: {tc.expected}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {generatedSpec.data_flow?.mermaid_code && (
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 mb-1.5">
                            Data Flow Diagram
                          </h4>
                          <pre className="p-3 bg-slate-900 text-slate-200 rounded-lg text-[11px] font-mono overflow-x-auto">
                            {generatedSpec.data_flow.mermaid_code}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* EXPLICIT STEP-BY-STEP CONFIRMATION GATE BANNER                     */}
      {/* ================================================================= */}
      {gate && (
        <div className="px-6 py-4 bg-blue-50 border-t border-blue-200 shrink-0">
          <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-900">
                <div className="font-bold">Confirm Next Step</div>
                <p className="text-slate-700 mt-0.5">
                  {gate === 'gate1_minutes' &&
                    'Finish capturing meeting notes and generate structured AI meeting minutes?'}
                  {gate === 'gate2_recommend' &&
                    'Save these meeting minutes and get a recommended COMM sample type?'}
                  {gate === 'gate3_generate' &&
                    `Clone COMM sample (Type ${selectedSampleType} · ${SAMPLE_TYPE_META[selectedSampleType].sampleId}) to generate spec '${programId}'?`}
                  {gate === 'gate4_save' &&
                    `Register '${generatedSpec?.program_id}' in project '${targetProjectCode}' and open the Spec Editor?`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setGate(null)}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer"
              >
                No, Keep Editing
              </button>
              <button
                type="button"
                disabled={isProcessingAi}
                onClick={() => {
                  if (gate === 'gate1_minutes') handleConfirmGenerateMinutes();
                  else if (gate === 'gate2_recommend') handleConfirmRecommendSample();
                  else if (gate === 'gate3_generate') handleConfirmGenerateFullSpec();
                  else if (gate === 'gate4_save') handleConfirmRegisterAndOpen();
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>
                  {gate === 'gate1_minutes' && 'Yes, Generate Minutes'}
                  {gate === 'gate2_recommend' && 'Yes, Recommend Sample'}
                  {gate === 'gate3_generate' && 'Yes, Build Spec'}
                  {gate === 'gate4_save' && 'Yes, Register & Open'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Action Bar */}
      <footer className="px-6 py-3.5 bg-white border-t border-slate-200 shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                disabled={isProcessingAi}
                onClick={() => {
                  setGate(null);
                  setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : 1));
                }}
                className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
            )}
            <button
              type="button"
              disabled={isProcessingAi}
              onClick={() => {
                persistProgress();
                onClose();
              }}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Save Draft & Back
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            {isProcessingAi && (
              <div className="text-xs font-semibold text-blue-700 flex items-center gap-1.5 mr-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing with AI...</span>
              </div>
            )}

            {step === 1 && (
              <button
                type="button"
                disabled={isProcessingAi || (segments.length === 0 && !manualNoteInput.trim())}
                onClick={() => setGate('gate1_minutes')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <span>Generate Minutes</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 2 && (
              <button
                type="button"
                disabled={isProcessingAi || !minutesMarkdown.trim()}
                onClick={() => setGate('gate2_recommend')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <span>Recommend Sample Type</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 3 && (
              <button
                type="button"
                disabled={isProcessingAi || !programId.trim() || isDuplicateProgramId}
                onClick={() => setGate('gate3_generate')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Build AI Spec</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}

            {step === 4 && (
              <button
                type="button"
                disabled={isProcessingAi || !generatedSpec}
                onClick={() => setGate('gate4_save')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Register & Open Editor</span>
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
};
