import { Router } from 'express';
import {
  GEMINI_TEXT_MODEL,
  GeminiTimeoutError,
  getGeminiClient,
  isCredentialOrMissingKeyError,
  withGeminiTimeout,
} from '../geminiClient.ts';
import { requireStandardAiAuth } from '../middleware/authMiddleware.ts';
import {
  buildMeetingMinutesFallback,
  buildSampleRecommendationFallback,
} from '../services/sapFallbackService.ts';
import {
  buildSapPromptReferenceBlock,
  detectSapModuleWithScores,
} from '../services/sapStandardCatalog.ts';

export const meetingRoutes = Router();

// Step 1 -> Step 2: Summarize or enrich SAP meeting minutes
meetingRoutes.post('/api/summarize-meeting-minutes', requireStandardAiAuth, async (req, res) => {
  try {
    const {
      rawTranscript = '',
      supplementalNotes = '',
      existingMinutes = '',
      projectName = 'SAP 프로젝트',
      targetRelease = 'SAP S/4HANA 2023',
      mode = 'create',
      segments = [],
    } = req.body || {};

    const combinedInput = `${rawTranscript}\n${supplementalNotes}\n${existingMinutes}`.trim();
    if (!combinedInput) {
      return res.status(400).json({ error: '회의 녹음 내용 또는 메모 텍스트가 비어 있습니다.' });
    }
    if (combinedInput.length > 30_000) {
      return res.status(400).json({ error: '회의록 입력 길이가 허용 한도(30,000자)를 초과했습니다.' });
    }

    const preDetected = detectSapModuleWithScores(combinedInput);
    const sapRefBlock = buildSapPromptReferenceBlock(preDetected.module);

    const systemPrompt = `You are a Principal SAP ERP Business Analyst & Solution Architect (FI/CO/SD/MM/PP/QM/PM/HR/BC/CM).
Convert raw meeting transcripts/notes into a FIXED-STRUCTURE, fact- & evidence-based SAP Program Design Meeting Minutes document in Korean Markdown, plus interactive AI review suggestions.

CRITICAL REQUIREMENTS:
1. Accurately classify the SAP module ("FI", "CO", "SD", "MM", "PP", "HR", "QM", "PM", "BC", or "CM") from business terminology, T-codes, and table names. Note: Accounting documents / 전표 / 분개 / G/L / 차대변 / 채권·채무 belong to "FI" (BKPF/BSEG/ACDOCA), NOT "SD".
2. ALWAYS preserve the EXACT 7-section Markdown headings & tables below so the meeting minutes format remains consistent across every session.
3. Ground EVERY requirement in Who said What & When (speaker/timestamp attribution), Why (business rationale), and Result (concrete SAP spec decision) inside Section 1 (5W1H) and Section 2 (Decision & Evidence Log).
4. Explicitly map SAP Standard Tables split by **상단 (Header 영역)** vs **하단 (Item/상세 영역)** and specify Join/Foreign Keys and Master Text tables (e.g., BKPF -> BSEG/ACDOCA -> SKAT for FI; VBAK -> VBAP/LIPS -> KNA1/MAKT for SD; EKKO -> EKPO/EKBE -> LFA1 for MM).
5. Draft concrete ABAP Selection Screen items (max 8-char variable names like P_BUKRS, S_BUDAT with Table-Field references) and BOTH Upper Header ALV columns AND Lower Item/Detail ALV columns (with hotspot T-codes, DO_SUM, ZICON traffic-light logic, custom toolbar, and AUTHORITY-CHECK objects).
6. Produce 2~4 actionable, domain-specific "aiSuggestions" that spot missing edge cases (e.g., reversal docs STBLG, open-item AUGBL, tolerance thresholds, performance caps) or confirm business rules with the user.

Return ONLY valid JSON:
{
  "title": "concise Korean meeting/program topic title (max 45 chars)",
  "detectedModule": "SD" | "MM" | "FI" | "CO" | "PP" | "HR" | "QM" | "PM" | "BC" | "CM",
  "minutesMarkdown": "rich structured Korean markdown following exact 7 sections below",
  "aiSuggestions": [
    {
      "id": "sug-1",
      "category": "missing_fact" | "enhancement" | "question",
      "title": "concise Korean review comment title",
      "detail": "specific SAP domain rationale & what needs confirmation",
      "suggestedAction": "concrete rule/parameter/column proposal user can adopt with 1 click"
    }
  ]
}

MANDATORY FIXED 7-SECTION MARKDOWN STRUCTURE:
## 1. 회의 개요 및 육하원칙 (5W1H Summary)
(Markdown table with columns: 구분 (육하원칙) | 확정 · 논의 내용 (팩트 및 근거 기준) covering rows: **Who (참여자 / 발화자)**, **When (일시 / 회의 시점)**, **Where (대상 시스템 · 모듈)**, **Why (개발 목적 · 배경)**, **What (개발 범위 · 화면 유형)**, **How & Result (구현 방향 · 합의 결론)**)
## 2. 논의 근거 및 결정 로그 (Decision & Evidence Log)
(Markdown table with columns: 시각 · 발화자 | 논의 · 요구 내용 | 배경 및 근거 (Why) | 확정 결론 / 사양 반영 (Result))
## 3. 참조 SAP 표준 테이블 (상단/하단 매핑표)
(Markdown table with columns: 구분 (영역) | SAP 표준 테이블 | 연결 키 / 조인 기준 | 주요 역할)
## 4. 선택화면(Selection Screen) 확정 조건
(List PARAMETERS, SELECT-OPTIONS, RADIOBUTTON/CHECKBOX with <=8-char variable names and Ref Table-Field)
## 5. 출력 레이아웃(ALV) 상단/하단 및 인터랙션 요구사항
(Explicitly detail 상단 Header Grid columns vs 하단 Item/Detail Grid columns, ZICON traffic light rules 1/2/3, hotspot T-Code drilldowns, DO_SUM, custom toolbar actions)
## 6. 권한 점검 · 메시지 및 성능/예외 기준
(AUTHORITY-CHECK objects, SE91 message expectations, performance/zero-row handling)
## 7. AI 리뷰 코멘트 및 추가 도출 제안 (Enrichment Comments)
(Categorized bullet summary of missing facts, enhancements, and confirmation questions matching aiSuggestions)

If mode is "enrich", strictly keep all 7 section headings intact, preserve confirmed facts from existingMinutes, weave supplementalNotes into Section 1 (Who/How), Section 2 (new Decision & Evidence Log rows), and Sections 3~6 (tables/selection/ALV/auth), and refresh Section 7 & aiSuggestions to reflect what remains open.`;

    const formattedSegments = Array.isArray(segments) && segments.length > 0
      ? segments
          .slice(0, 40)
          .map((s: any) => `[${s?.timestamp || '회의 중'}] ${s?.speaker || '참여자'}: ${s?.text || ''}`)
          .join('\n')
      : '';

    const userPrompt = `Project: ${projectName} (${targetRelease})
Mode: ${mode}
Pre-scored Module Hint: ${preDetected.module} (Matched Tables: ${preDetected.matchedTables.join(', ') || 'None'})

${sapRefBlock}

[Structured Transcript Segments (Speaker / Timestamp)]
${formattedSegments || '(별도 세그먼트 없음 — 아래 원문 참조)'}

[Raw Meeting Transcript / Notes]
${rawTranscript || '(없음)'}

[Existing Minutes (if enriching)]
${existingMinutes || '(없음)'}

[Supplemental Voice / Text Notes / Adopted AI Suggestions]
${supplementalNotes || '(없음)'}`;

    let parsed: any = null;
    let source: 'ai' | 'fallback' = 'ai';
    let fallbackReason: 'missing_api_key' | 'timeout' | 'ai_error' | undefined;

    try {
      const ai = getGeminiClient();
      const response = await withGeminiTimeout(
        ai.models.generateContent({
          model: GEMINI_TEXT_MODEL,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
          },
        }),
        28_000,
        'Meeting minutes AI'
      );
      parsed = JSON.parse(response.text?.trim() || '{}');
    } catch (err: any) {
      console.warn('Gemini summarize-meeting-minutes issue, using fallback:', err?.message);
      source = 'fallback';
      fallbackReason = isCredentialOrMissingKeyError(err)
        ? 'missing_api_key'
        : err instanceof GeminiTimeoutError
        ? 'timeout'
        : 'ai_error';
    }

    const fallback = buildMeetingMinutesFallback({
      rawTranscript,
      supplementalNotes,
      existingMinutes,
      projectName,
      targetRelease,
      mode,
      segments: Array.isArray(segments) ? segments : [],
    });

    const validModules = ['SD', 'MM', 'FI', 'CO', 'PP', 'HR', 'QM', 'PM', 'BC', 'CM'];
    const detectedModule = validModules.includes(String(parsed?.detectedModule || '').toUpperCase())
      ? String(parsed.detectedModule).toUpperCase()
      : fallback.detectedModule;

    const minutesMarkdown =
      typeof parsed?.minutesMarkdown === 'string' && parsed.minutesMarkdown.trim().length > 40
        ? parsed.minutesMarkdown.trim()
        : fallback.minutesMarkdown;

    const title =
      typeof parsed?.title === 'string' && parsed.title.trim()
        ? parsed.title.trim().slice(0, 60)
        : fallback.title;

    const validCategories = ['missing_fact', 'enhancement', 'question'];
    const normalizedAiSuggestions = Array.isArray(parsed?.aiSuggestions) && parsed.aiSuggestions.length > 0
      ? parsed.aiSuggestions
          .filter((item: any) => item && typeof item.title === 'string' && item.title.trim())
          .slice(0, 6)
          .map((item: any, idx: number) => ({
            id: String(item.id || `sug-ai-${idx + 1}`).trim(),
            category: validCategories.includes(String(item.category))
              ? (String(item.category) as 'missing_fact' | 'enhancement' | 'question')
              : 'enhancement',
            title: String(item.title).trim(),
            detail: String(item.detail || '').trim(),
            suggestedAction: String(item.suggestedAction || item.title).trim(),
          }))
      : [];

    const aiSuggestions =
      normalizedAiSuggestions.length > 0 ? normalizedAiSuggestions : fallback.aiSuggestions;

    const finalSource =
      typeof parsed?.minutesMarkdown === 'string' && parsed.minutesMarkdown.trim().length > 40
        ? source
        : 'fallback';

    return res.json({
      title,
      detectedModule,
      minutesMarkdown,
      aiSuggestions,
      source: finalSource,
      ...(finalSource === 'fallback' ? { fallbackReason: fallbackReason || 'ai_error' } : {}),
    });
  } catch (error: any) {
    console.error('Summarize meeting minutes error:', error);
    return res.status(500).json({
      error: error?.message || '회의록 요약 생성 중 오류가 발생했습니다.',
    });
  }
});

// Step 2 -> Step 3: Recommend best COMMON sample type 01~04 + Program ID / T-Code
meetingRoutes.post('/api/recommend-sample-from-minutes', requireStandardAiAuth, async (req, res) => {
  try {
    const {
      minutesMarkdown = '',
      projectName = 'SAP 프로젝트',
      existingProgramIds = [],
      preferredModule,
    } = req.body || {};

    if (!minutesMarkdown || typeof minutesMarkdown !== 'string' || !minutesMarkdown.trim()) {
      return res.status(400).json({ error: '분석할 회의록 본문이 비어 있습니다.' });
    }
    if (minutesMarkdown.length > 25_000) {
      return res.status(400).json({ error: '회의록 분석 길이가 허용 한도(25,000자)를 초과했습니다.' });
    }

    const preDetected = detectSapModuleWithScores(minutesMarkdown);
    const validModules = ['SD', 'MM', 'FI', 'CO', 'PP', 'HR', 'QM', 'PM', 'BC', 'CM'];
    const cleanPreferred =
      typeof preferredModule === 'string' && validModules.includes(preferredModule.trim().toUpperCase())
        ? preferredModule.trim().toUpperCase()
        : undefined;
    const candidateModule = cleanPreferred || preDetected.module;
    const sapRefBlock = buildSapPromptReferenceBlock(candidateModule);

    const systemPrompt = `You are a Principal SAP ABAP Architect.
Analyze the finalized SAP Meeting Minutes and recommend the BEST matching COMMON Sample Program Type:
- "01" (ZRALV0010): Single ALV Grid (단일 목록 조회, 상태 신호등, 툴바 처리)
- "02" (ZRALV0020): Master-Detail 2-Grid ALV (상단 헤더/전표 선택 시 하단 품목/분개/상세 내역이 동적 연동되는 2단 구조 — ALWAYS pick "02" if the user mentions 상단/하단, 헤더/상세, 마스터-디테일, 전표+분개/품목 상세 조회!)
- "03" (ZRALV0030): Tree ALV Grid (조직·코스트센터·BOM·WBS 계층 트리 전개)
- "04" (ZRALV0040): Multi-Dimensional Pivot Browser (CDS View / ACDOCA 기반 다차원 월별/항목별 피벗 분석)

Return ONLY valid JSON:
{
  "recommendedSampleType": "01" | "02" | "03" | "04",
  "confidenceReason": "2~3 sentences in Korean explaining WHY including which standard header/item tables fit best",
  "suggestedModule": "SD" | "MM" | "FI" | "CO" | "PP" | "HR" | "QM" | "PM" | "BC" | "CM",
  "suggestedProgramId": "ZR_...",
  "suggestedTcode": "Z...",
  "suggestedTitle": "concise Korean program title",
  "detectedTables": ["TABLE1", "TABLE2", ...],
  "requirementPrompt": "comprehensive SAP technical blueprint prompt specifying: (1) SAP module, (2) standard Header tables & Item tables + foreign key, (3) Selection Screen parameters (<=8 chars) with Ref Table-Field, (4) Upper Header ALV fields & hotspot T-codes, (5) Lower Item ALV fields (if 02), (6) ZICON traffic light logic & AUTHORITY-CHECK objects",
  "alternatives": [
    { "sampleType": "01", "sampleProgramId": "ZRALV0010", "label": "Single ALV Grid", "fitSummary": "..." },
    { "sampleType": "02", "sampleProgramId": "ZRALV0020", "label": "Master-Detail 2-Grid ALV", "fitSummary": "..." },
    { "sampleType": "03", "sampleProgramId": "ZRALV0030", "label": "Tree ALV Grid", "fitSummary": "..." },
    { "sampleType": "04", "sampleProgramId": "ZRALV0040", "label": "Multi-Dimensional Pivot Browser", "fitSummary": "..." }
  ]
}`;

    const userPrompt = `Project: ${projectName}
Module Hint: ${candidateModule}${cleanPreferred ? ' (User-confirmed in Step 2)' : ''}
Existing Program IDs (avoid duplicates): ${(Array.isArray(existingProgramIds) ? existingProgramIds : []).join(', ') || '(None)'}

${sapRefBlock}

[Finalized Meeting Minutes]
${minutesMarkdown.slice(0, 7500)}`;

    let parsed: any = null;
    let source: 'ai' | 'fallback' = 'ai';
    let fallbackReason: 'missing_api_key' | 'timeout' | 'ai_error' | undefined;

    try {
      const ai = getGeminiClient();
      const response = await withGeminiTimeout(
        ai.models.generateContent({
          model: GEMINI_TEXT_MODEL,
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
          },
        }),
        28_000,
        'Sample recommendation AI'
      );
      parsed = JSON.parse(response.text?.trim() || '{}');
    } catch (err: any) {
      console.warn('Gemini recommend-sample-from-minutes issue, using fallback:', err?.message);
      source = 'fallback';
      fallbackReason = isCredentialOrMissingKeyError(err)
        ? 'missing_api_key'
        : err instanceof GeminiTimeoutError
        ? 'timeout'
        : 'ai_error';
    }

    const fallback = buildSampleRecommendationFallback({
      minutesMarkdown,
      existingProgramIds,
    });

    const validTypes = ['01', '02', '03', '04'];
    const recommendedSampleType = validTypes.includes(String(parsed?.recommendedSampleType))
      ? (String(parsed.recommendedSampleType) as '01' | '02' | '03' | '04')
      : fallback.recommendedSampleType;

    const suggestedModule = validModules.includes(String(parsed?.suggestedModule || '').toUpperCase())
      ? String(parsed.suggestedModule).toUpperCase()
      : cleanPreferred || fallback.suggestedModule;

    const existingSet = new Set(
      (Array.isArray(existingProgramIds) ? existingProgramIds : []).map((id: any) =>
        String(id || '').trim().toUpperCase()
      )
    );
    const cleanPid = String(parsed?.suggestedProgramId || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '');
    const suggestedProgramId =
      cleanPid && (cleanPid.startsWith('Z') || cleanPid.startsWith('Y')) && !existingSet.has(cleanPid)
        ? cleanPid.slice(0, 30)
        : fallback.suggestedProgramId;

    const cleanTcode = String(parsed?.suggestedTcode || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '');
    const suggestedTcode =
      cleanTcode && (cleanTcode.startsWith('Z') || cleanTcode.startsWith('Y'))
        ? cleanTcode.slice(0, 20)
        : fallback.suggestedTcode;

    const detectedTables: string[] = Array.from(
      new Set([
        ...(Array.isArray(parsed?.detectedTables)
          ? parsed.detectedTables.map((t: any) => String(t || '').trim().toUpperCase())
          : []),
        ...fallback.detectedTables,
      ])
    ).filter(Boolean);

    const finalSource = parsed?.recommendedSampleType ? source : 'fallback';

    return res.json({
      recommendedSampleType,
      confidenceReason:
        typeof parsed?.confidenceReason === 'string' && parsed.confidenceReason.trim()
          ? parsed.confidenceReason.trim()
          : fallback.confidenceReason,
      suggestedModule,
      suggestedProgramId,
      suggestedTcode,
      suggestedTitle:
        typeof parsed?.suggestedTitle === 'string' && parsed.suggestedTitle.trim()
          ? parsed.suggestedTitle.trim().slice(0, 60)
          : fallback.suggestedTitle,
      detectedTables,
      requirementPrompt:
        typeof parsed?.requirementPrompt === 'string' && parsed.requirementPrompt.trim()
          ? parsed.requirementPrompt.trim()
          : fallback.requirementPrompt,
      alternatives:
        Array.isArray(parsed?.alternatives) && parsed.alternatives.length === 4
          ? parsed.alternatives
          : fallback.alternatives,
      source: finalSource,
      ...(finalSource === 'fallback' ? { fallbackReason: fallbackReason || 'ai_error' } : {}),
    });
  } catch (error: any) {
    console.error('Recommend sample error:', error);
    return res.status(500).json({
      error: error?.message || '샘플 유형 추천 중 오류가 발생했습니다.',
    });
  }
});
