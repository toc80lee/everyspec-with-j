import { Router } from 'express';
import { GEMINI_TEXT_MODEL, getGeminiClient } from '../geminiClient';
import {
  buildMeetingMinutesFallback,
  buildSampleRecommendationFallback,
} from '../services/sapFallbackService';

export const meetingRoutes = Router();

// Step 1 -> Step 2: Summarize or enrich SAP meeting minutes
meetingRoutes.post('/api/summarize-meeting-minutes', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const {
      rawTranscript = '',
      supplementalNotes = '',
      existingMinutes = '',
      projectName = 'SAP 프로젝트',
      targetRelease = 'SAP S/4HANA 2023',
      mode = 'create',
    } = req.body || {};

    const combinedInput = `${rawTranscript}\n${supplementalNotes}\n${existingMinutes}`.trim();
    if (!combinedInput) {
      return res.status(400).json({ error: '회의 녹음 내용 또는 메모 텍스트가 비어 있습니다.' });
    }

    const systemPrompt = `You are a Principal SAP ERP Business Analyst & Solution Architect.
Convert raw meeting transcripts/notes (in Korean or mixed Korean/SAP terms) into structured, actionable SAP Program Design Meeting Minutes in Korean Markdown.

Return ONLY valid JSON with:
{
  "title": "concise Korean meeting/program topic title (max 45 chars)",
  "detectedModule": "SD" | "MM" | "FI" | "CO" | "PP" | "HR" | "QM" | "PM" | "BC" | "CM",
  "minutesMarkdown": "structured Korean markdown"
}

Markdown structure:
## 1. 회의 개요
## 2. 핵심 업무 요구사항
## 3. 화면 및 조회 조건(Selection Screen) 요구사항
## 4. 출력 레이아웃(ALV) 및 인터랙션 요구사항
## 5. 결정 사항 및 확인 필요 사항 (Open Items)

If mode is "enrich", preserve valid points from existingMinutes and integrate supplementalNotes.`;

    const userPrompt = `Project: ${projectName} (${targetRelease})
Mode: ${mode}

[Raw Meeting Transcript / Notes]
${rawTranscript || '(없음)'}

[Existing Minutes (if enriching)]
${existingMinutes || '(없음)'}

[Supplemental Voice / Text Notes]
${supplementalNotes || '(없음)'}`;

    let parsed: any = null;
    let source: 'ai' | 'fallback' = 'ai';

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
        },
      });
      parsed = JSON.parse(response.text?.trim() || '{}');
    } catch (err: any) {
      console.warn('Gemini summarize-meeting-minutes issue, using fallback:', err?.message);
      source = 'fallback';
    }

    const fallback = buildMeetingMinutesFallback({
      rawTranscript,
      supplementalNotes,
      existingMinutes,
      projectName,
      mode,
    });

    const validModules = ['SD', 'MM', 'FI', 'CO', 'PP', 'HR', 'QM', 'PM', 'BC', 'CM'];
    const detectedModule = validModules.includes(String(parsed?.detectedModule || '').toUpperCase())
      ? String(parsed.detectedModule).toUpperCase()
      : fallback.detectedModule;

    const minutesMarkdown =
      typeof parsed?.minutesMarkdown === 'string' && parsed.minutesMarkdown.trim().length > 20
        ? parsed.minutesMarkdown.trim()
        : fallback.minutesMarkdown;

    const title =
      typeof parsed?.title === 'string' && parsed.title.trim()
        ? parsed.title.trim().slice(0, 60)
        : fallback.title;

    return res.json({
      title,
      detectedModule,
      minutesMarkdown,
      source: typeof parsed?.minutesMarkdown === 'string' && parsed.minutesMarkdown.trim() ? source : 'fallback',
    });
  } catch (error: any) {
    console.error('Summarize meeting minutes error:', error);
    return res.status(500).json({
      error: error?.message || '회의록 요약 생성 중 오류가 발생했습니다.',
    });
  }
});

// Step 2 -> Step 3: Recommend best COMMON sample type 01~04 + Program ID / T-Code
meetingRoutes.post('/api/recommend-sample-from-minutes', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const {
      minutesMarkdown = '',
      projectName = 'SAP 프로젝트',
      existingProgramIds = [],
    } = req.body || {};

    if (!minutesMarkdown || typeof minutesMarkdown !== 'string' || !minutesMarkdown.trim()) {
      return res.status(400).json({ error: '분석할 회의록 본문이 비어 있습니다.' });
    }

    const systemPrompt = `You are a Principal SAP ABAP Architect.
Analyze finalized SAP Meeting Minutes and recommend the BEST matching COMMON Sample Program Type:
- "01" (ZRALV0010): Single ALV Grid
- "02" (ZRALV0020): Master-Detail 2-Grid ALV
- "03" (ZRALV0030): Tree ALV Grid
- "04" (ZRALV0040): Multi-Dimensional Pivot Browser

Return ONLY valid JSON:
{
  "recommendedSampleType": "01" | "02" | "03" | "04",
  "confidenceReason": "2~3 sentences in Korean explaining WHY",
  "suggestedModule": "SD" | "MM" | "FI" | "CO" | "PP" | "HR" | "QM" | "PM" | "BC" | "CM",
  "suggestedProgramId": "ZR_...",
  "suggestedTcode": "Z...",
  "suggestedTitle": "concise Korean title",
  "requirementPrompt": "detailed synthesized prompt for full spec generation",
  "alternatives": [
    { "sampleType": "01", "sampleProgramId": "ZRALV0010", "label": "Single ALV Grid", "fitSummary": "..." },
    { "sampleType": "02", "sampleProgramId": "ZRALV0020", "label": "Master-Detail 2-Grid ALV", "fitSummary": "..." },
    { "sampleType": "03", "sampleProgramId": "ZRALV0030", "label": "Tree ALV Grid", "fitSummary": "..." },
    { "sampleType": "04", "sampleProgramId": "ZRALV0040", "label": "Multi-Dimensional Pivot Browser", "fitSummary": "..." }
  ]
}`;

    const userPrompt = `Project: ${projectName}
Existing Program IDs (avoid duplicates): ${(Array.isArray(existingProgramIds) ? existingProgramIds : []).join(', ') || '(None)'}

[Finalized Meeting Minutes]
${minutesMarkdown.slice(0, 6000)}`;

    let parsed: any = null;
    let source: 'ai' | 'fallback' = 'ai';

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
        },
      });
      parsed = JSON.parse(response.text?.trim() || '{}');
    } catch (err: any) {
      console.warn('Gemini recommend-sample-from-minutes issue, using fallback:', err?.message);
      source = 'fallback';
    }

    const fallback = buildSampleRecommendationFallback({
      minutesMarkdown,
      existingProgramIds,
    });

    const validTypes = ['01', '02', '03', '04'];
    const recommendedSampleType = validTypes.includes(String(parsed?.recommendedSampleType))
      ? (String(parsed.recommendedSampleType) as '01' | '02' | '03' | '04')
      : fallback.recommendedSampleType;

    const validModules = ['SD', 'MM', 'FI', 'CO', 'PP', 'HR', 'QM', 'PM', 'BC', 'CM'];
    const suggestedModule = validModules.includes(String(parsed?.suggestedModule || '').toUpperCase())
      ? String(parsed.suggestedModule).toUpperCase()
      : fallback.suggestedModule;

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
      requirementPrompt:
        typeof parsed?.requirementPrompt === 'string' && parsed.requirementPrompt.trim()
          ? parsed.requirementPrompt.trim()
          : fallback.requirementPrompt,
      alternatives:
        Array.isArray(parsed?.alternatives) && parsed.alternatives.length === 4
          ? parsed.alternatives
          : fallback.alternatives,
      source: parsed?.recommendedSampleType ? source : 'fallback',
    });
  } catch (error: any) {
    console.error('Recommend sample error:', error);
    return res.status(500).json({
      error: error?.message || '샘플 유형 추천 중 오류가 발생했습니다.',
    });
  }
});
