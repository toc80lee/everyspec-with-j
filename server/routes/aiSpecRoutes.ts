import { Router } from 'express';
import {
  GEMINI_TEXT_MODEL,
  GEMINI_TRANSCRIBE_MODEL,
  SAP_AUDIO_GLOSSARY_HINT,
  formatCustomTablesContext,
  getGeminiClient,
} from '../geminiClient';
import {
  buildFullSpecFallback,
  extractSpecElementsFallback,
  generateFallbackSapRows,
  getFallbackTableSchema,
  normalizeGeneratedFullSpec,
  normalizeSapDataTypeServer,
  parseLegacyAbapDeterministic,
} from '../services/sapFallbackService';

export const aiSpecRoutes = Router();

// 1. Transcribe recorded audio with SAP glossary hints
aiSpecRoutes.post('/api/transcribe-audio', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { audioData, mimeType, glossaryHint } = req.body || {};

    if (!audioData) {
      return res.status(400).json({ error: '오디오 데이터가 전달되지 않았습니다.' });
    }

    const base64Data = audioData.includes(',') ? audioData.split(',')[1] : audioData;
    const resolvedMimeType = mimeType || 'audio/webm';

    const audioPart = {
      inlineData: {
        mimeType: resolvedMimeType,
        data: base64Data,
      },
    };

    const hintBlock = glossaryHint ? `${SAP_AUDIO_GLOSSARY_HINT}, ${glossaryHint}` : SAP_AUDIO_GLOSSARY_HINT;

    const response = await ai.models.generateContent({
      model: GEMINI_TRANSCRIBE_MODEL,
      contents: {
        parts: [
          audioPart,
          {
            text: `사용자가 말한 음성을 한국어로 정확하게 받아적어주세요. SAP ERP 도메인 용어(${hintBlock})는 정확한 영문/약어(예: ALV, BSEG, ACDOCA, VA03, T-Code)로 표기하세요. 인사말이나 부연 설명 없이 받아적은 텍스트만 출력하세요.`,
          },
        ],
      },
    });

    const transcribedText = response.text?.trim() || '';
    return res.json({ text: transcribedText });
  } catch (error: any) {
    console.error('Audio transcription error:', error);
    return res.status(500).json({
      error: error?.message || '음성 인식 중 오류가 발생했습니다.',
    });
  }
});

// 2. Suggest ABAP Data Extraction & Processing Logic (with custom DDIC context)
aiSpecRoutes.post('/api/generate-logic', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { business_purpose, module, program_id, title, customTables = [] } = req.body || {};

    if (!business_purpose || typeof business_purpose !== 'string') {
      return res.status(400).json({ error: '업무 개요를 입력해주세요.' });
    }

    const customContext = formatCustomTablesContext(customTables);
    const systemPrompt = `당신은 20년 경력의 SAP ERP ABAP 시니어 테크니컬 아키텍트입니다.
사용자가 입력한 [업무 개요 및 개발 목적], [SAP 모듈], [프로그램 정보]와 등록된 커스텀 DDIC 테이블 정보를 분석하여, SAP 표준 개발 문서 양식에 맞는 구조화된 [데이터 추출 및 가공 로직]을 한국어로 작성해주세요.

반드시 다음 4가지 섹션을 체계적으로 포함해야 합니다:
1. 주요 대상 테이블 및 조회 조건 (모듈별 SAP 표준 테이블 및 커스텀 Z*/Y* 테이블 필드 관계)
2. 테이블 조인 및 데이터 추출 로직 (INNER/LEFT JOIN 관계, FOR ALL ENTRIES 조건, 성능 최적화)
3. 예외 판정 및 신호등(상태) 처리 로직 (LIGHTS: 1-Green 정상, 2-Yellow 경고, 3-Red 오류 판정 기준)
4. 데이터 집계 및 ALV 가공 로직 (루프 처리, 통화/단위 변환, 합계/소계 처리)

불필요한 서론 없이 바로 로직 본문을 반환해주세요.`;

    const userPrompt = `[프로그램 정보]
- 프로그램 ID: ${program_id || 'Z_REPORT'}
- 타이틀: ${title || 'ALV Report'}
- 모듈: ${module || 'CO'}
${customContext}

[업무 개요 및 개발 목적]
${business_purpose}`;

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: userPrompt,
      config: { systemInstruction: systemPrompt },
    });

    return res.json({ logic: response.text || '' });
  } catch (error: any) {
    console.error('Logic generation error:', error);
    return res.status(500).json({ error: error?.message || '로직 제안 중 오류가 발생했습니다.' });
  }
});

// 3. Fetch SAP Table Schema & Metadata
aiSpecRoutes.post('/api/fetch-sap-table-schema', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { tableName } = req.body || {};
    if (!tableName || typeof tableName !== 'string') {
      return res.status(400).json({ error: '테이블명을 입력해주세요.' });
    }

    const cleanTableName = tableName.trim().toUpperCase();
    const systemPrompt = `You are a senior SAP ABAP Data Dictionary (DDIC) architect.
Return a valid JSON object: { "table": string, "name": string, "module": string, "description": string, "fields": [{ "field": string, "label": string, "datatype": "CHAR"|"NUMC"|"DATS"|"TIMS"|"CURR"|"DEC"|"UNIT"|"INT4", "length": number, "isKey": boolean, "description": string }] } with 8 to 20 essential fields.`;

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `Provide the DDIC schema metadata for SAP table ${cleanTableName}.`,
      config: { systemInstruction: systemPrompt, responseMimeType: 'application/json' },
    });

    let schemaData: any = null;
    try {
      schemaData = JSON.parse(response.text?.trim() || '{}');
    } catch {
      schemaData = null;
    }

    if (!schemaData || !Array.isArray(schemaData.fields) || schemaData.fields.length === 0) {
      schemaData = getFallbackTableSchema(cleanTableName);
    }

    schemaData.table = cleanTableName;
    if (!schemaData.name) schemaData.name = `${cleanTableName} SAP Table Data`;
    return res.json({ schema: schemaData });
  } catch (error: any) {
    console.warn('Gemini schema fetch issue, using fallback:', error?.message);
    const cleanTableName = String(req.body?.tableName || 'CUSTOM_TABLE').trim().toUpperCase();
    return res.json({ schema: getFallbackTableSchema(cleanTableName), fallback: true });
  }
});

// 4. Generate realistic SAP ALV mock data records
aiSpecRoutes.post('/api/generate-mock-data', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { field_catalog, module, title, business_purpose, count = 5 } = req.body || {};

    if (!Array.isArray(field_catalog) || field_catalog.length === 0) {
      return res.status(400).json({ error: '필드 카탈로그 정보가 없습니다.' });
    }

    const rowTarget = Math.min(Math.max(Number(count) || 5, 3), 10);
    const fieldDescriptions = field_catalog.map((f: any) => ({
      fieldname: f.fieldname,
      coltext: f.coltext,
      datatype: f.datatype,
      length: f.outputlen || 10,
      ref_table: f.ref_table || '',
      ref_field: f.ref_field || '',
    }));

    const systemPrompt = `Generate ${rowTarget} realistic SAP ALV records as a JSON array matching exact fieldnames. ZICON/STATUS use '1'|'2'|'3', DATS uses 'YYYY.MM.DD', CURR uses numeric values.`;
    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: `Title: ${title}\nModule: ${module}\nPurpose: ${business_purpose}\nFields:\n${JSON.stringify(fieldDescriptions, null, 2)}`,
      config: { systemInstruction: systemPrompt, responseMimeType: 'application/json' },
    });

    let parsedRows: any[] = [];
    try {
      const parsed = JSON.parse(response.text?.trim() || '[]');
      if (Array.isArray(parsed)) parsedRows = parsed;
      else if (parsed && typeof parsed === 'object') {
        const arrayVal = Object.values(parsed).find((v) => Array.isArray(v));
        if (arrayVal) parsedRows = arrayVal as any[];
      }
    } catch {
      parsedRows = [];
    }

    if (!parsedRows || parsedRows.length === 0) {
      parsedRows = generateFallbackSapRows(field_catalog, rowTarget);
    }

    return res.json({ rows: parsedRows });
  } catch (error: any) {
    console.warn('Gemini mock data issue, using fallback:', error?.message);
    return res.json({
      rows: generateFallbackSapRows(req.body?.field_catalog || [], Number(req.body?.count) || 5),
      fallback: true,
    });
  }
});

// 5. Context-aware Markdown suggestion
aiSpecRoutes.post('/api/suggest-markdown', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const {
      section,
      sectionTitle,
      programInfo,
      selectionParams = [],
      fieldCatalog = [],
      itemFieldCatalog = [],
      layout = {},
      customToolbar = [],
      nodeInfo,
      currentValue = '',
      customTables = [],
    } = req.body || {};

    if (!section) {
      return res.status(400).json({ error: '마크다운 섹션 위치 정보가 필요합니다.' });
    }

    const customContext = formatCustomTablesContext(customTables);
    const systemPrompt = `당신은 20년 경력의 SAP ERP ABAP 시니어 테크니컬 아키텍트입니다.
현재 화면 구성과 등록된 커스텀 DDIC 테이블을 반영해 바로 적용 가능한 최적의 한국어 마크다운 본문만 반환하세요.`;

    const screenContextSummary = {
      programInfo,
      selectionParams: selectionParams.slice(0, 15).map((p: any) => ({
        kind: p.kind,
        name: p.name,
        text: p.text,
        ref: p.ref_table ? `${p.ref_table}-${p.ref_field}` : p.datatype,
        obligatory: p.obligatory,
      })),
      headerFields: fieldCatalog.slice(0, 20).map((f: any) => ({
        fieldname: f.fieldname,
        coltext: f.coltext,
        datatype: f.datatype,
        ref: f.ref_table ? `${f.ref_table}-${f.ref_field}` : '',
        key: f.key,
        hotspot: f.hotspot,
        do_sum: f.do_sum,
        drilldown_tcode: f.drilldown_tcode,
      })),
      itemFields: itemFieldCatalog.slice(0, 15),
      layout,
      customToolbar: customToolbar.filter((b: any) => b.visible !== false),
      nodeInfo,
    };

    const userPrompt = `[섹션]: ${sectionTitle || section}
${customContext}
[현재 구성(JSON)]:
${JSON.stringify(screenContextSummary, null, 2)}
[기존 작성 내용]:
${currentValue ? String(currentValue).slice(0, 1200) : '(비어 있음)'}`;

    const response = await ai.models.generateContent({
      model: GEMINI_TEXT_MODEL,
      contents: userPrompt,
      config: { systemInstruction: systemPrompt },
    });

    return res.json({ markdown: (response.text || '').trim() });
  } catch (error: any) {
    console.error('Markdown suggestion error:', error);
    return res.status(500).json({ error: error?.message || 'AI 마크다운 제안 중 오류가 발생했습니다.' });
  }
});

// 6. AI Spec Copilot: Generate full ProgramSpec draft (injecting custom DDIC tables)
aiSpecRoutes.post('/api/generate-full-spec', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const {
      requirementPrompt,
      module = 'AUTO',
      sampleType = '01',
      targetSapRelease = 'SAP S/4HANA 2023 / ECC 6.0',
      programId = '',
      tcode = '',
      customTables = [],
    } = req.body || {};

    if (!requirementPrompt || typeof requirementPrompt !== 'string' || !requirementPrompt.trim()) {
      return res.status(400).json({ error: '프로그램 요구사항을 입력해 주세요.' });
    }

    const cleanSampleType = ['01', '02', '03', '04'].includes(String(sampleType)) ? String(sampleType) : '01';
    const explicitModule = module && module !== 'AUTO' ? String(module).toUpperCase() : '';
    const customContext = formatCustomTablesContext(customTables);

    const systemPrompt = `You are a Principal SAP ERP ABAP Architect.
Convert a business requirement into a realistic SAP ALV Functional Specification JSON object.
Rules:
1. program_id & tcode MUST start with 'Z' or 'Y'.
2. selection_params: Parameter/Select-Option names MUST BE <= 8 characters (SAP ABAP standard!). Group into boxes with block_id & block_title.
3. field_catalog: Start with ZICON (icon_type: "LIGHTS"), include ref_table, ref_field, key, hotspot/drilldown_tcode, do_sum+cfieldname/qfieldname.
4. Prefer registered project Z*/Y* custom DDIC tables when relevant to the prompt!
5. Return ONLY valid JSON matching ProgramSpec fields plus detectedTables.`;

    const userPrompt = `Business Requirement:
${requirementPrompt.trim()}
${customContext}
Constraints:
- Requested Module: ${explicitModule || 'Auto-detect'}
- Sample Type: ${cleanSampleType}
- Target SAP Release: ${targetSapRelease}
- Preferred Program ID: ${programId || '(auto-generate Z*)'}
- Preferred T-Code: ${tcode || '(auto-generate Z*)'}`;

    let rawDraft: any = null;
    let source: 'ai' | 'fallback' = 'ai';

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: userPrompt,
        config: { systemInstruction: systemPrompt, responseMimeType: 'application/json' },
      });
      rawDraft = JSON.parse(response.text?.trim() || '{}');
    } catch (err: any) {
      console.warn('Gemini full-spec generation issue, using fallback:', err?.message);
      source = 'fallback';
    }

    if (!rawDraft || !Array.isArray(rawDraft.field_catalog) || rawDraft.field_catalog.length === 0) {
      rawDraft = buildFullSpecFallback({
        requirementPrompt: requirementPrompt.trim(),
        module: explicitModule,
        sampleType: cleanSampleType,
        targetSapRelease,
        programId,
        tcode,
      });
      source = 'fallback';
    }

    const normalized = normalizeGeneratedFullSpec(rawDraft, {
      requirementPrompt: requirementPrompt.trim(),
      module: explicitModule,
      sampleType: cleanSampleType,
      targetSapRelease,
      programId,
      tcode,
    });

    return res.json({
      spec: normalized.spec,
      detectedTables: normalized.detectedTables,
      source,
    });
  } catch (error: any) {
    console.error('Full spec generation error:', error);
    return res.status(500).json({ error: error?.message || 'AI 전체 사양서 생성 중 오류가 발생했습니다.' });
  }
});

// 7. Reverse-extract missing Selection Params & Field Catalog columns (with customTables)
aiSpecRoutes.post('/api/extract-spec-elements', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const {
      businessPurpose = '',
      dataExtractionLogic = '',
      module = 'SD',
      sampleType = '01',
      existingSelectionParams = [],
      existingFieldCatalog = [],
      customTables = [],
    } = req.body || {};

    const combinedText = `${businessPurpose}\n${dataExtractionLogic}`.trim();
    if (!combinedText) {
      return res.status(400).json({ error: '분석할 업무 개요 또는 데이터 추출 로직이 비어 있습니다.' });
    }

    const existingParamNames = new Set(
      (Array.isArray(existingSelectionParams) ? existingSelectionParams : [])
        .map((p: any) => String(p?.name || '').trim().toUpperCase())
        .filter(Boolean)
    );
    const existingFieldNames = new Set(
      (Array.isArray(existingFieldCatalog) ? existingFieldCatalog : [])
        .map((f: any) => String(f?.fieldname || '').trim().toUpperCase())
        .filter(Boolean)
    );

    const customContext = formatCustomTablesContext(customTables);
    const systemPrompt = `You are a senior SAP ABAP Architect reverse-extracting missing Selection Screen params (max 8 chars name!) and ALV Field Catalog columns from specification text and custom DDIC tables. Return JSON { detectedTables, suggestedSelectionParams, suggestedFieldCatalog }.`;

    const userPrompt = `Module: ${module}, Sample Type: ${sampleType}
${customContext}
[Existing Selection]: ${Array.from(existingParamNames).join(', ') || '(None)'}
[Existing Fields]: ${Array.from(existingFieldNames).join(', ') || '(None)'}
[Business Purpose]: ${businessPurpose}
[Data Extraction & Logic]: ${dataExtractionLogic}`;

    let extracted: any = null;
    let source: 'ai' | 'fallback' = 'ai';

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: userPrompt,
        config: { systemInstruction: systemPrompt, responseMimeType: 'application/json' },
      });
      extracted = JSON.parse(response.text?.trim() || '{}');
    } catch (err: any) {
      console.warn('Gemini reverse-extract issue, using rule-based fallback:', err?.message);
      source = 'fallback';
    }

    const fallback = extractSpecElementsFallback({
      combinedText,
      module: String(module || 'SD').toUpperCase(),
      existingParamNames,
      existingFieldNames,
    });

    const detectedTables: string[] = Array.from(
      new Set([
        ...(Array.isArray(extracted?.detectedTables) ? extracted.detectedTables : []).map((t: any) =>
          String(t || '').trim().toUpperCase()
        ),
        ...fallback.detectedTables,
      ])
    ).filter(Boolean);

    const rawParams =
      Array.isArray(extracted?.suggestedSelectionParams) && extracted.suggestedSelectionParams.length > 0
        ? extracted.suggestedSelectionParams
        : fallback.suggestedSelectionParams;

    const rawFields =
      Array.isArray(extracted?.suggestedFieldCatalog) && extracted.suggestedFieldCatalog.length > 0
        ? extracted.suggestedFieldCatalog
        : fallback.suggestedFieldCatalog;

    const seenParamNames = new Set(existingParamNames);
    const suggestedSelectionParams = rawParams
      .filter((p: any) => {
        const name = String(p?.name || '').trim().toUpperCase().slice(0, 8);
        if (!name || seenParamNames.has(name)) return false;
        seenParamNames.add(name);
        return true;
      })
      .map((p: any) => {
        const kind = ['PARAMETER', 'SELECT_OPTION', 'RADIOBUTTON', 'CHECKBOX'].includes(p.kind)
          ? p.kind
          : String(p.name || '').toUpperCase().startsWith('S_')
          ? 'SELECT_OPTION'
          : 'PARAMETER';
        const isToggle = kind === 'RADIOBUTTON' || kind === 'CHECKBOX';
        const dt = isToggle ? 'CHAR' : normalizeSapDataTypeServer(p.datatype);
        return {
          kind,
          name: String(p.name).trim().toUpperCase().slice(0, 8),
          text: String(p.text || p.name).trim(),
          datatype: dt,
          length: isToggle ? 1 : Math.max(1, Number(p.length) || 10),
          ref_table: String(p.ref_table || '').trim().toUpperCase(),
          ref_field: String(p.ref_field || '').trim().toUpperCase(),
          obligatory: isToggle ? false : Boolean(p.obligatory),
          default_val: String(p.default_val || '').trim(),
          block_title: String(p.block_title || '조회 조건').trim(),
          radio_group:
            kind === 'RADIOBUTTON' ? String(p.radio_group || 'R1').toUpperCase().slice(0, 4) : undefined,
          reason: String(p.reason || '로직 조건 및 테이블 참조 기반 추천').trim(),
        };
      });

    const seenFieldNames = new Set(existingFieldNames);
    const suggestedFieldCatalog = rawFields
      .filter((f: any) => {
        const fn = String(f?.fieldname || '').trim().toUpperCase();
        if (!fn || fn === 'ZICON' || seenFieldNames.has(fn)) return false;
        seenFieldNames.add(fn);
        return true;
      })
      .map((f: any) => {
        const dt = normalizeSapDataTypeServer(f.datatype);
        const isNumeric = dt === 'CURR' || dt === 'DEC' || dt === 'INT4';
        return {
          fieldname: String(f.fieldname).trim().toUpperCase(),
          coltext: String(f.coltext || f.fieldname).trim(),
          datatype: dt,
          outputlen: Math.max(1, Number(f.outputlen) || (dt === 'CURR' ? 15 : dt === 'DATS' ? 10 : 12)),
          just: ['L', 'C', 'R'].includes(f.just) ? f.just : isNumeric ? 'R' : dt === 'DATS' ? 'C' : 'L',
          key: Boolean(f.key),
          hotspot: Boolean(f.hotspot),
          drilldown_tcode: f.hotspot ? String(f.drilldown_tcode || '').trim().toUpperCase() : '',
          do_sum: isNumeric && Boolean(f.do_sum),
          cfieldname: dt === 'CURR' ? String(f.cfieldname || 'WAERK').trim().toUpperCase() : '',
          qfieldname: String(f.qfieldname || '').trim().toUpperCase(),
          ref_table: String(f.ref_table || '').trim().toUpperCase(),
          ref_field: String(f.ref_field || '').trim().toUpperCase(),
          emphasize: String(f.emphasize || '').trim().toUpperCase(),
          reason: String(f.reason || '데이터 추출 로직 출력 항목 기반 추천').trim(),
        };
      });

    return res.json({
      detectedTables,
      suggestedSelectionParams,
      suggestedFieldCatalog,
      source,
    });
  } catch (error: any) {
    console.error('Reverse extraction error:', error);
    return res.status(500).json({ error: error?.message || 'AI 역추출 분석 중 오류가 발생했습니다.' });
  }
});

// 8. Incremental AI Spec Patching (Modify only requested parts without overwriting the whole spec)
aiSpecRoutes.post('/api/patch-spec', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { instruction, currentSpec, customTables = [] } = req.body || {};

    if (!instruction || typeof instruction !== 'string' || !instruction.trim()) {
      return res.status(400).json({ error: '수정 요청 내용을 입력해 주세요.' });
    }
    if (!currentSpec || typeof currentSpec !== 'object') {
      return res.status(400).json({ error: '현재 사양서 정보가 전달되지 않았습니다.' });
    }

    const customContext = formatCustomTablesContext(customTables);
    const systemPrompt = `You are a Principal SAP ABAP Architect applying an INCREMENTAL PATCH to an existing SAP ProgramSpec.
Analyze the user's instruction and return ONLY valid JSON representing a partial update patch (only include fields that need to be added/updated):
{
  "summary": "1-sentence Korean summary of what was modified",
  "title": optional string,
  "data_extraction_logic_append": optional markdown string to append/update,
  "add_selection_params": optional array of new SelectionParameter objects (name <= 8 chars),
  "add_field_catalog": optional array of new AlvField objects,
  "add_authority_checks": optional array of { object, field_values, message_on_fail },
  "add_messages": optional array of { msgno, msgty, text },
  "add_toolbar_buttons": optional array of { function, text, quickinfo, icon }
}
Do NOT replace existing items unless directly requested.`;

    const compactSpec = {
      program_id: currentSpec.program_id,
      title: currentSpec.title,
      module: currentSpec.module,
      sample_type: currentSpec.sample_type,
      selection_params: (currentSpec.selection_params || []).map((p: any) => ({
        name: p.name,
        kind: p.kind,
        text: p.text,
      })),
      field_catalog: (currentSpec.field_catalog || []).map((f: any) => ({
        fieldname: f.fieldname,
        coltext: f.coltext,
        datatype: f.datatype,
      })),
    };

    let patch: any = null;
    let source: 'ai' | 'fallback' = 'ai';
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: `[Current Spec]\n${JSON.stringify(compactSpec, null, 2)}\n${customContext}\n\n[User Modification Instruction]\n${instruction.trim()}`,
        config: { systemInstruction: systemPrompt, responseMimeType: 'application/json' },
      });
      patch = JSON.parse(response.text?.trim() || '{}');
    } catch (err: any) {
      console.warn('Gemini patch-spec issue, using deterministic fallback:', err?.message);
      source = 'fallback';
      patch = {
        summary: `요청 사항("${instruction.trim().slice(0, 30)}")을 로직 주석에 반영했습니다.`,
        data_extraction_logic_append: `\n- **추가 변경 요청**: ${instruction.trim()}`,
      };
    }

    return res.json({ patch, source });
  } catch (error: any) {
    console.error('Patch spec error:', error);
    return res.status(500).json({ error: error?.message || '부분 사양 패치 중 오류가 발생했습니다.' });
  }
});

// 9. Reverse Import Legacy ABAP / SE11 code into ProgramSpec
aiSpecRoutes.post('/api/reverse-import-abap', async (req, res) => {
  try {
    const ai = getGeminiClient();
    const { abapSource, targetSapRelease = 'SAP S/4HANA 2023 / ECC 6.0' } = req.body || {};

    if (!abapSource || typeof abapSource !== 'string' || !abapSource.trim()) {
      return res.status(400).json({ error: '분석할 ABAP 소스 코드 또는 SE11 구조를 입력해 주세요.' });
    }

    const deterministic = parseLegacyAbapDeterministic(abapSource);
    let source: 'ai' | 'fallback' = 'ai';
    let parsedSpec = deterministic.spec;
    let detectedTables = deterministic.detectedTables;

    try {
      const systemPrompt = `You are a Principal SAP ABAP Reverse Engineering Architect.
Analyze pasted Legacy ABAP source code (REPORT, TOP, SELECTION-SCREEN, TYPES, FORM, AUTHORITY-CHECK) or SE11 definitions, and extract a complete ProgramSpec JSON:
{
  "program_id": "Z...",
  "tcode": "Z...",
  "title": "Korean program title",
  "module": "SD"|"MM"|"FI"|"CO"|"PP"|"HR"|"QM"|"PM"|"BC"|"CM",
  "business_purpose": "Korean markdown summary",
  "data_extraction_logic": "Korean markdown extraction/processing logic",
  "selection_params": [...],
  "field_catalog": [...],
  "authority_checks": [{ "object": "...", "fields": "ACTVT = '03'", "trigger_point": "START-OF-SELECTION", "description": "..." }],
  "detectedTables": [...]
}
Note: SelectionParameter name max 8 chars!`;

      const response = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: `Analyze this Legacy ABAP source and return ProgramSpec JSON:\n\n${abapSource.slice(0, 12000)}`,
        config: { systemInstruction: systemPrompt, responseMimeType: 'application/json' },
      });

      const aiJson = JSON.parse(response.text?.trim() || '{}');
      if (aiJson && Array.isArray(aiJson.field_catalog) && aiJson.field_catalog.length > 0) {
        const normalized = normalizeGeneratedFullSpec(aiJson, {
          requirementPrompt: 'Legacy ABAP Reverse Import',
          module: aiJson.module || deterministic.spec.module,
          sampleType: '01',
          targetSapRelease,
          programId: aiJson.program_id || deterministic.spec.program_id,
          tcode: aiJson.tcode || deterministic.spec.tcode,
        });
        parsedSpec = {
          ...normalized.spec,
          authority_checks:
            normalized.spec.authority_checks || deterministic.spec.authority_checks,
        };
        detectedTables = normalized.detectedTables;
      } else {
        source = 'fallback';
      }
    } catch (err: any) {
      console.warn('Gemini reverse-import-abap issue, using deterministic parser:', err?.message);
      source = 'fallback';
    }

    return res.json({
      spec: parsedSpec,
      detectedTables,
      source,
    });
  } catch (error: any) {
    console.error('Reverse import ABAP error:', error);
    return res.status(500).json({ error: error?.message || '레거시 ABAP 역분석 중 오류가 발생했습니다.' });
  }
});
