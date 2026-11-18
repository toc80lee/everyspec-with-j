import {
  AlvField,
  MeetingAiSuggestionItem,
  MeetingTranscriptSegment,
  ProgramSpec,
  SapModule,
  SelectionParameter,
} from '../types/sap';
import { SAMPLE_SPECS } from '../data/sampleSpecs';
import { COMMON_PROJECT_CODE, TEMP_PROJECT_CODE } from './projectStorage';
import { getDD02LTables, getDD03LFields } from './sapDdicStorage';
import { buildRichNodeDetailMarkdown, generateRichDataFlowFromSpec } from './dataFlowGenerator';
import {
  authorizedFetch,
  isAuthorizedFetchAbortError,
  isAuthorizedFetchTimeoutError,
} from './authorizedFetch';

/**
 * AI Data Extraction Logic Generator & Context-Aware Markdown Suggestion
 */

export type AiFallbackReason =
  | 'missing_api_key'
  | 'timeout'
  | 'server_unavailable'
  | 'ai_error';

export interface AiRequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class AiBlockingError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code = 'AI_BLOCKED') {
    super(message);
    this.name = 'AiBlockingError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

class AiFallbackTriggerError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'AiFallbackTriggerError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

async function throwForFailedAiResponse(res: Response): Promise<never> {
  const errData = await res.json().catch(() => ({} as Record<string, any>));
  const code = typeof errData?.code === 'string' ? errData.code : '';
  const serverMsg = typeof errData?.error === 'string' ? errData.error.trim() : '';

  if (res.status === 401) {
    throw new AiBlockingError(
      serverMsg || '인증이 만료되었거나 로그인이 필요합니다. 다시 로그인한 뒤 시도해 주세요.',
      401,
      code || 'UNAUTHORIZED'
    );
  }
  if (res.status === 403) {
    if (code === 'APPROVAL_REQUIRED') {
      throw new AiBlockingError(
        serverMsg ||
          '관리자 승인 대기 중이거나 접근 권한이 없는 계정입니다. 관리자에게 계정 승인을 요청해 주세요.',
        403,
        'APPROVAL_REQUIRED'
      );
    }
    if (code === 'EMAIL_NOT_VERIFIED') {
      throw new AiBlockingError(
        serverMsg || '이메일 인증이 완료된 Google 계정으로 로그인해 주세요.',
        403,
        'EMAIL_NOT_VERIFIED'
      );
    }
    throw new AiBlockingError(
      serverMsg || '이 AI 기능을 실행할 권한이 없습니다.',
      403,
      code || 'FORBIDDEN'
    );
  }
  if (res.status === 429) {
    throw new AiBlockingError(
      serverMsg || 'AI 요청 한도를 초과했습니다. 약 1분 후 다시 시도해 주세요.',
      429,
      code || 'RATE_LIMIT_EXCEEDED'
    );
  }
  if (res.status === 400) {
    throw new AiBlockingError(
      serverMsg || '요청 입력값을 확인한 뒤 다시 시도해 주세요.',
      400,
      code || 'BAD_REQUEST'
    );
  }

  throw new AiFallbackTriggerError(
    res.status,
    serverMsg || `서버 응답 오류 (${res.status})`,
    code || undefined
  );
}

function shouldRethrowAiError(err: unknown): boolean {
  if (!err) return false;
  if (isAuthorizedFetchAbortError(err)) return true;
  if (err instanceof AiBlockingError) return true;
  if (err instanceof Error && err.message.includes('로그인이 필요합니다')) return true;
  return false;
}

function classifyFallbackReason(err: unknown): AiFallbackReason {
  if (isAuthorizedFetchTimeoutError(err)) return 'timeout';
  if (err instanceof AiFallbackTriggerError) {
    if (err.code === 'MISSING_GEMINI_API_KEY') return 'missing_api_key';
    if (err.code === 'AI_TIMEOUT' || err.statusCode === 504) return 'timeout';
    if (err.statusCode === 404 || err.statusCode === 502 || err.statusCode === 503) {
      return 'server_unavailable';
    }
    return 'ai_error';
  }
  if (err instanceof TypeError) {
    return 'server_unavailable';
  }
  const msg = err instanceof Error ? err.message.toLowerCase() : '';
  if (msg.includes('timeout') || msg.includes('초과')) return 'timeout';
  if (msg.includes('gemini_api_key') || msg.includes('default credentials')) return 'missing_api_key';
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'server_unavailable';
  return 'ai_error';
}

function normalizeServerFallbackReason(raw: unknown): AiFallbackReason | undefined {
  if (raw === 'missing_api_key' || raw === 'timeout' || raw === 'server_unavailable' || raw === 'ai_error') {
    return raw;
  }
  return undefined;
}

export function getCustomDdicTablesPayload(referencedTables: string[] = []) {
  try {
    const tables = getDD02LTables();
    const fields = getDD03LFields();
    const refSet = new Set(referencedTables.map((t) => String(t || '').trim().toUpperCase()).filter(Boolean));
    return tables
      .filter((t) => t.is_custom || refSet.has(t.tabname.toUpperCase()))
      .slice(0, 15)
      .map((t) => ({
        tabname: t.tabname,
        ddtext: t.ddtext,
        module: t.module,
        fields: fields
          .filter((f) => f.tabname.toUpperCase() === t.tabname.toUpperCase())
          .slice(0, 20)
          .map((f) => ({
            fieldname: f.fieldname,
            datatype: f.datatype,
            leng: f.leng,
            scrtext_l: f.scrtext_l,
            keyflag: f.keyflag,
          })),
      }));
  } catch {
    return [];
  }
}

export interface MarkdownSuggestionRequest {
  section: 'business_purpose' | 'data_extraction_logic' | 'data_flow_node';
  sectionTitle?: string;
  spec: ProgramSpec;
  nodeInfo?: {
    id: string;
    label: string;
    shape?: string;
    prevNodes?: string[];
    nextNodes?: string[];
  };
  currentValue?: string;
}

export async function requestMarkdownAiSuggestion(
  req: MarkdownSuggestionRequest,
  options?: AiRequestOptions
): Promise<{ markdown: string; source: 'ai' | 'fallback'; fallbackReason?: AiFallbackReason; error?: string }> {
  const { spec, section, sectionTitle, nodeInfo, currentValue } = req;

  try {
    const res = await authorizedFetch('/api/suggest-markdown', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? 25_000,
      body: JSON.stringify({
        section,
        sectionTitle,
        programInfo: {
          program_id: spec.program_id,
          tcode: spec.tcode,
          title: spec.title,
          module: spec.module,
          sample_type: spec.sample_type || '01',
          target_sap_release: spec.target_sap_release,
          cds_view_table: spec.cds_view_table,
          business_purpose: spec.business_purpose,
        },
        selectionParams: spec.selection_params || [],
        fieldCatalog: spec.field_catalog || [],
        itemFieldCatalog: spec.item_grid?.field_catalog || [],
        layout: spec.layout,
        customToolbar: spec.custom_toolbar || [],
        nodeInfo,
        currentValue,
        customTables: getCustomDdicTablesPayload([
          spec.cds_view_table || '',
          ...(spec.field_catalog || []).map((f) => f.ref_table || ''),
        ]),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.markdown === 'string' && data.markdown.trim()) {
        return { markdown: data.markdown.trim(), source: 'ai' };
      }
      throw new AiFallbackTriggerError(500, 'AI 응답 형식이 올바르지 않습니다.');
    }
    await throwForFailedAiResponse(res);
    throw new AiFallbackTriggerError(res.status, `서버 응답 오류 (${res.status})`);
  } catch (err: any) {
    if (shouldRethrowAiError(err)) throw err;
    console.warn('Backend AI markdown suggestion failed, using screen-aware fallback:', err);
    const fallback = generateSmartMarkdownFallback(req);
    return {
      markdown: fallback,
      source: 'fallback',
      fallbackReason: classifyFallbackReason(err),
      error: err?.message,
    };
  }
}

function generateSmartMarkdownFallback(req: MarkdownSuggestionRequest): string {
  const { section, spec, nodeInfo } = req;
  const sampleTypeLabel =
    spec.sample_type === '02'
      ? 'Master-Detail 2-Grid ALV'
      : spec.sample_type === '03'
      ? 'Tree ALV Grid'
      : spec.sample_type === '04'
      ? 'Multi-Dimensional Pivot Browser'
      : 'Single ALV Grid';

  const paramList = (spec.selection_params || [])
    .slice(0, 6)
    .map((p) => `\`${p.name}\`(${p.text || p.datatype}${p.obligatory ? ', 필수' : ''})`)
    .join(', ');

  const refTables = Array.from(
    new Set(
      [...(spec.field_catalog || []), ...(spec.item_grid?.field_catalog || [])]
        .map((f) => f.ref_table?.trim().toUpperCase())
        .filter(Boolean)
    )
  );
  if (spec.cds_view_table?.trim()) {
    refTables.unshift(spec.cds_view_table.trim().toUpperCase());
  }

  const keyFields = (spec.field_catalog || [])
    .filter((f) => f.key && f.fieldname !== 'ZICON')
    .map((f) => `\`${f.fieldname}\`(${f.coltext})`)
    .join(', ');

  const sumFields = (spec.field_catalog || [])
    .filter((f) => f.do_sum)
    .map((f) => `\`${f.fieldname}\`(${f.coltext})`)
    .join(', ');

  const hotspotFields = (spec.field_catalog || [])
    .filter((f) => f.hotspot)
    .map((f) => `\`${f.fieldname}\`${f.drilldown_tcode ? ` → ${f.drilldown_tcode}` : ''}`)
    .join(', ');

  const toolbarText = (spec.custom_toolbar || [])
    .filter((b) => b.visible !== false)
    .map((b) => `\`${b.function}\`(${b.text || b.quickinfo || '기능'})`)
    .join(', ');

  if (section === 'business_purpose') {
    return `### 1. 개발 목적 및 업무 배경 (${spec.module} / ${spec.program_id})
- **프로그램명**: ${spec.title} (\`${spec.tcode || 'ZREP'}\`, ${sampleTypeLabel})
- **주요 목적**: ${paramList ? `${paramList} 조건으로 데이터를 실시간 조회하여` : '업무 조건별 데이터를 조회하여'} 현업 담당자가 직관적으로 현황을 모니터링하고 예외 건을 신속히 조치할 수 있도록 지원함.

### 2. 화면 구성 및 주요 기능
- **출력 구조**: ${sampleTypeLabel}${spec.layout?.grid_title ? ` (\`${spec.layout.grid_title}\`)` : ''} 기반 ${spec.field_catalog?.length || 0}개 컬럼 구성${spec.sample_type === '02' ? ` 및 하단 품목(${spec.item_grid?.field_catalog?.length || 0}개 컬럼) 연동` : ''}
- **참조 테이블**: ${refTables.length > 0 ? refTables.map((t) => `\`${t}\``).join(', ') : `${spec.module} 표준 원천 테이블`}${hotspotFields ? `\n- **드릴다운 연계**: ${hotspotFields} 클릭 시 상세 전표 조회` : ''}${sumFields ? `\n- **집계 항목**: ${sumFields} 자동 합계 제공` : ''}${toolbarText ? `\n- **사용자 기능**: ${toolbarText}` : ''}`;
  }

  if (section === 'data_extraction_logic') {
    return generateSmartFallbackLogic({
      business_purpose: spec.business_purpose || '',
      module: spec.module,
      program_id: spec.program_id,
      title: spec.title,
      existing_fields: (spec.field_catalog || []).map((f) => f.fieldname),
    });
  }

  // section === 'data_flow_node'
  return buildRichNodeDetailMarkdown(spec, {
    id: nodeInfo?.id || 'A',
    label: nodeInfo?.label || '단계 처리',
    shape: nodeInfo?.shape,
    prevNodes: nodeInfo?.prevNodes,
    nextNodes: nodeInfo?.nextNodes,
  });
}

export interface GenerateLogicRequest {
  business_purpose: string;
  module: string;
  program_id: string;
  title: string;
  existing_fields?: string[];
}

export async function requestAiLogicGeneration(
  req: GenerateLogicRequest,
  options?: AiRequestOptions
): Promise<{ logic: string; source: 'ai' | 'fallback'; fallbackReason?: AiFallbackReason; error?: string }> {
  try {
    const res = await authorizedFetch('/api/generate-logic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? 25_000,
      body: JSON.stringify({
        ...req,
        customTables: getCustomDdicTablesPayload(),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.logic) {
        return { logic: data.logic, source: 'ai' };
      }
      throw new AiFallbackTriggerError(500, 'AI 응답 형식이 올바르지 않습니다.');
    }
    await throwForFailedAiResponse(res);
    throw new AiFallbackTriggerError(res.status, `서버 응답 오류 (${res.status})`);
  } catch (err: any) {
    if (shouldRethrowAiError(err)) throw err;
    console.warn('Backend AI generation failed, using intelligent rule-based SAP architect generator:', err);
    // Intelligent fallback generator tailored to the SAP module
    const fallback = generateSmartFallbackLogic(req);
    return {
      logic: fallback,
      source: 'fallback',
      fallbackReason: classifyFallbackReason(err),
      error: err?.message,
    };
  }
}

function generateSmartFallbackLogic(req: GenerateLogicRequest): string {
  const mod = (req.module || 'CO').toUpperCase();
  const purpose = req.business_purpose || '';

  if (mod === 'CO') {
    return `1. 대상 테이블 및 조회 조건:
- CSKS (코스트 센터 마스터): KOKRS = '1000' AND DATBI >= SY-DATUM
- SETNODE / SETLEAF (원가요소/코스트센터 그룹 계층구조): SETCLASS = '0102' / '0101'
- COEP / COSP (코스트 센터 실제/계획 원가 라인 아이템): GJAHR = p_gjahr, KOKRS = p_kokrs

2. 데이터 추출 및 조인 로직:
- 입력된 코스트센터 및 원가요소 그룹(SETNODE)을 재귀(Recursive) 조회하여 하위 개별 원가요소(SETLEAF) 추출
- 추출된 원가요소 키를 바탕으로 COEP(실제 라인아이템)과 CSKS(마스터)를 FOR ALL ENTRIES로 조회
- 회계연도(GJAHR), 기간(PERIO), 코스트센터(KOSTL), 원가요소(KSTAR) 기준으로 내부 테이블(GT_DATA)에 SUM 집계

3. 상태(신호등) 판정 로직 (gs_alv-lights):
- 마스터 미존재 또는 그룹 코드 불일치 시: RED ('3')
- 당월 실적 금액이 0이거나 예산 초과 항목: YELLOW ('2')
- 정상 집계 및 마스터 검증 완료 항목: GREEN ('1')

4. ALV 그리드 가공 로직:
- 상위 노드(SET_NAME) 및 코스트센터 기준으로 정렬 (SORT)
- 통화(WAERK) 참조 지정 및 금액 필드(DMBTR, WKG001) 자동 합계(DO_SUM) 적용`;
  }

  if (mod === 'SD') {
    return `1. 대상 테이블 및 조회 조건:
- VBAK (영업 오더 헤더): VBELN IN s_vbeln, VKORG = p_vkorg, ERDAT IN s_erdat
- VBAP (영업 오더 품목): VBELN = VBAK-VBELN
- VBUK / VBUP (오더 처리 상태): VBELN = VBAK-VBELN
- LIKP / LIPS (출하 납품 헤더 및 품목): VGBEL = VBAP-VBELN
- VBRK / VBRP (대금청구 헤더 및 품목): AUBEL = VBAK-VBELN

2. 데이터 추출 및 조인 로직:
- 선택조건(s_vbeln, s_erdat)으로 VBAK를 조회 후, 결과 키로 VBAP을 FOR ALL ENTRIES 조회
- VBAP 품목별로 LIPS(납품문서)와 VBRP(청구문서) 진행 상태를 조인하여 출하 완료 여부 판정
- 미출하 수량 = VBAP-KWMENG - SUM(LIPS-LFIMG)

3. 상태(신호등) 판정 로직 (gs_alv-lights):
- 여신 블록(CMGST = 'B') 또는 납품 보류(LIFSK ≠ space): RED ('3')
- 출하 진행 중(GBSTK = 'B') 또는 일부 납품 완료: YELLOW ('2')
- 대금청구 및 출하 완료(GBSTK = 'C'): GREEN ('1')

4. ALV 그리드 가공 로직:
- 판매오더 번호(VBELN) 및 품목번호(POSNR) 키 필드 고정
- 순수 판매금액(NETWR) 통화키(WAERK) 연결 및 합계(DO_SUM) 처리`;
  }

  if (mod === 'MM') {
    return `1. 대상 테이블 및 조회 조건:
- EKKO (구매오더 헤더): EBELN IN s_ebeln, BUKRS = p_bukrs, BEDAT IN s_bedat
- EKPO (구매오더 품목): EBELN = EKKO-EBELN, WERKS IN s_werks
- MARA / MAKT (자재 마스터 및 텍스트): MATNR = EKPO-MATNR
- EKBE (구매오더 이력 / 입고 및 송장): EBELN = EKPO-EBELN, EBELP = EKPO-EBELP

2. 데이터 추출 및 조인 로직:
- 발주일자(BEDAT) 및 구매조직 조건으로 EKKO/EKPO 조인 추출
- EKBE를 집계하여 입고 수량(MENGE) 및 송장 검수 금액 산출
- 미입고 잔량 = EKPO-MENGE - SUM(EKBE-MENGE where VGABE = '1')

3. 상태(신호등) 판정 로직 (gs_alv-lights):
- 납기 지연(EINDT < SY-DATUM AND 미입고 잔량 > 0): RED ('3')
- 입고 완료 후 송장 미처리 상태: YELLOW ('2')
- 입고 및 송장 검수 완료: GREEN ('1')

4. ALV 그리드 가공 로직:
- 구매오더 번호 및 자재번호 핫스팟 링크 설정 (ME23N 연계)
- 발주수량, 입고수량, 단가 및 발주금액 합계 표시`;
  }

  return `1. 주요 대상 테이블 및 조회 조건:
- BKPF (회계전표 헤더): BUKRS = p_bukrs, GJAHR = p_gjahr, BUDAT IN s_budat
- BSEG (회계전표 세그먼트): BUKRS = BKPF-BUKRS, BELNR = BKPF-BELNR, GJAHR = BKPF-GJAHR
- SKA1 / SKAT (G/L 계정 마스터 및 계정명): SAKNR = BSEG-HKONT

2. 데이터 추출 및 조인 로직:
- 회계연도 및 전기일자 조건으로 BKPF 추출 후, BSEG 라인 아이템 FOR ALL ENTRIES 조회
- 계정별 차변(SHKZG = 'S')과 대변(SHKZG = 'H') 금액 분리 집계
- 환율(KURSF) 및 전표통화(WAERS) 기준 원화 환산액 산출

3. 상태(신호등) 판정 로직 (gs_alv-lights):
- 대차 불일치 또는 전기 오류: RED ('3')
- 미결제(Open Item) 라인 항목: YELLOW ('2')
- 반제 완료(Cleared Item): GREEN ('1')

4. ALV 그리드 가공 로직:
- 전표번호(BELNR) 핫스팟(FB03) 연결 및 계정별 소계(SUBTOTAL) 처리`;
}

// ============================================================================
// AI Design Automation Expansion:
// 1. Natural Language Requirement -> Full ProgramSpec Draft (AI Spec Copilot)
// 2. Logic / Business Purpose <-> Selection Params & Field Catalog Reverse Extract
// ============================================================================

export interface FullSpecDraftRequest {
  requirementPrompt: string;
  module?: SapModule | 'AUTO';
  sampleType?: string;
  targetSapRelease?: string;
  programId?: string;
  tcode?: string;
  projectCode?: string;
}

export interface FullSpecDraftResponse {
  spec: ProgramSpec;
  detectedTables: string[];
  source: 'ai' | 'fallback';
  fallbackReason?: AiFallbackReason;
  error?: string;
}

export async function requestAiFullSpecDraft(
  req: FullSpecDraftRequest,
  options?: AiRequestOptions
): Promise<FullSpecDraftResponse> {
  try {
    const res = await authorizedFetch('/api/generate-full-spec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? 40_000,
      body: JSON.stringify({
        ...req,
        customTables: getCustomDdicTablesPayload(),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.spec && Array.isArray(data.spec.field_catalog)) {
        const source = data.source === 'fallback' ? 'fallback' : 'ai';
        return {
          spec: data.spec as ProgramSpec,
          detectedTables: Array.isArray(data.detectedTables) ? data.detectedTables : [],
          source,
          ...(source === 'fallback'
            ? { fallbackReason: normalizeServerFallbackReason(data.fallbackReason) || 'ai_error' }
            : {}),
        };
      }
      throw new AiFallbackTriggerError(500, 'AI 사양서 응답 형식이 올바르지 않습니다.');
    }
    await throwForFailedAiResponse(res);
    throw new AiFallbackTriggerError(res.status, `서버 응답 오류 (${res.status})`);
  } catch (err: any) {
    if (shouldRethrowAiError(err)) throw err;
    console.warn('Backend full spec draft failed, using intelligent client fallback:', err);
    return {
      ...buildClientFullSpecFallback(req),
      source: 'fallback',
      fallbackReason: classifyFallbackReason(err),
      error: err?.message,
    };
  }
}

export interface SuggestedSelectionParamItem extends Omit<SelectionParameter, 'id'> {
  reason: string;
}

export interface SuggestedFieldCatalogItem extends Omit<AlvField, 'id' | 'col_pos'> {
  reason: string;
}

export interface ReverseExtractRequest {
  businessPurpose: string;
  dataExtractionLogic: string;
  module: SapModule;
  sampleType?: string;
  existingSelectionParams: SelectionParameter[];
  existingFieldCatalog: AlvField[];
}

export interface ReverseExtractResponse {
  detectedTables: string[];
  suggestedSelectionParams: SuggestedSelectionParamItem[];
  suggestedFieldCatalog: SuggestedFieldCatalogItem[];
  source: 'ai' | 'fallback';
  fallbackReason?: AiFallbackReason;
  error?: string;
}

export async function requestAiReverseExtract(
  req: ReverseExtractRequest,
  options?: AiRequestOptions
): Promise<ReverseExtractResponse> {
  try {
    const res = await authorizedFetch('/api/extract-spec-elements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? 25_000,
      body: JSON.stringify({
        businessPurpose: req.businessPurpose,
        dataExtractionLogic: req.dataExtractionLogic,
        module: req.module,
        sampleType: req.sampleType || '01',
        existingSelectionParams: req.existingSelectionParams.map((p) => ({ name: p.name })),
        existingFieldCatalog: req.existingFieldCatalog.map((f) => ({ fieldname: f.fieldname })),
        customTables: getCustomDdicTablesPayload(
          req.existingFieldCatalog.map((f) => f.ref_table || '')
        ),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.suggestedSelectionParams) && Array.isArray(data.suggestedFieldCatalog)) {
        const source = data.source === 'fallback' ? 'fallback' : 'ai';
        return {
          detectedTables: Array.isArray(data.detectedTables) ? data.detectedTables : [],
          suggestedSelectionParams: data.suggestedSelectionParams,
          suggestedFieldCatalog: data.suggestedFieldCatalog,
          source,
          ...(source === 'fallback'
            ? { fallbackReason: normalizeServerFallbackReason(data.fallbackReason) || 'ai_error' }
            : {}),
        };
      }
      throw new AiFallbackTriggerError(500, 'AI 추출 응답 형식이 올바르지 않습니다.');
    }
    await throwForFailedAiResponse(res);
    throw new AiFallbackTriggerError(res.status, `서버 응답 오류 (${res.status})`);
  } catch (err: any) {
    if (shouldRethrowAiError(err)) throw err;
    console.warn('Backend reverse extract failed, using rule-based SAP fallback:', err);
    return {
      ...buildClientReverseExtractFallback(req),
      source: 'fallback',
      fallbackReason: classifyFallbackReason(err),
      error: err?.message,
    };
  }
}

/**
 * Ensures existing mock_rows receive realistic values whenever new columns are merged from AI Reverse Extract.
 */
export function backfillMockRowsForFields(
  existingRows: Record<string, any>[],
  addedFields: AlvField[],
  fullCatalog: AlvField[],
  desiredCount = 5
): Record<string, any>[] {
  if (addedFields.length === 0 && existingRows.length > 0) return existingRows;
  const baseRows: Record<string, any>[] =
    existingRows.length > 0
      ? existingRows
      : Array.from({ length: desiredCount }, (): Record<string, any> => ({}));
  const partnerNames = ['(주)삼성전자 수원공장', '현대모비스 남양연구소', 'LG에너지솔루션 오창공장', 'SK하이닉스 이천캠퍼스', '포스코 포항제철소'];
  const glAccounts = ['11110100', '11310100', '21110100', '41110100', '51210300'];
  const glNames = ['보통예금-국민은행', '외상매출금(국내)', '외상매입금(원재료)', '제품매출(국내)', '복리후생비(판관)'];
  const fiDocTypes = ['SA', 'KR', 'DR', 'AB', 'KZ'];
  const fiHeaderTexts = ['10월 원재료 매입 전표', '국내 제품 매출 청구', '지급수수료 결산 대체', '월간 급여 및 상여 분개', '선급금 반제 정산'];
  const fiItemTexts = ['원재료 입고 대금 정산', '부가세 대급금 10%', '매출채권 수금 반제', '외주 가공비 비용 인식', '미지급금 대체 처리'];
  const matDescs = ['산업용 제어 보드 ASSY', '고압 인버터 모듈 V3', 'AL-6061 압출 프레임', '리튬셀 보호회로 PCB', '정밀 서보모터 400W'];
  const users = ['FIN_KIM01', 'FI_PARK02', 'SD_LEE03', 'MM_CHOI04', 'CO_JUNG05'];
  const amounts = [45000000, 38200000, 19800000, 52400000, 14500000];

  return baseRows.map((row, rIdx) => {
    const next: Record<string, any> = { ...row };
    fullCatalog.forEach((f) => {
      if (next[f.fieldname] !== undefined && next[f.fieldname] !== '') return;
      const fn = f.fieldname.toUpperCase();
      if (fn === 'ZICON' || fn === 'LIGHTS') {
        next[f.fieldname] = rIdx === 2 ? '2' : rIdx === 4 ? '3' : '1';
      } else if (fn === 'STATUS') {
        next[f.fieldname] = rIdx === 4 ? '51' : '53';
      } else if (fn === 'BUKRS' || fn === 'VKORG' || fn === 'EKORG') {
        next[f.fieldname] = '1000';
      } else if (fn === 'GJAHR') {
        next[f.fieldname] = '2026';
      } else if (fn === 'WERKS') {
        next[f.fieldname] = rIdx % 2 === 0 ? '1000' : '1100';
      } else if (fn === 'BLART') {
        next[f.fieldname] = fiDocTypes[rIdx % fiDocTypes.length];
      } else if (fn === 'AUART') {
        next[f.fieldname] = rIdx % 2 === 0 ? 'ZOR' : 'ZRE';
      } else if (fn === 'BSART') {
        next[f.fieldname] = 'NB';
      } else if (fn === 'BSCHL') {
        next[f.fieldname] = rIdx % 2 === 0 ? '40' : '50';
      } else if (fn === 'SHKZG') {
        next[f.fieldname] = rIdx % 2 === 0 ? 'S' : 'H';
      } else if (fn === 'MWSKZ') {
        next[f.fieldname] = rIdx % 2 === 0 ? 'V1' : 'A1';
      } else if (fn === 'BUZEI' || fn === 'EBELP' || fn === 'POSNR' || fn === 'RSPOS') {
        next[f.fieldname] = String((rIdx + 1) * 10).padStart(f.outputlen || 4, '0');
      } else if (fn === 'HKONT' || fn === 'SAKNR') {
        next[f.fieldname] = glAccounts[rIdx % glAccounts.length];
      } else if (fn === 'TXT50') {
        next[f.fieldname] = glNames[rIdx % glNames.length];
      } else if (fn === 'BKTXT') {
        next[f.fieldname] = fiHeaderTexts[rIdx % fiHeaderTexts.length];
      } else if (fn === 'SGTXT') {
        next[f.fieldname] = fiItemTexts[rIdx % fiItemTexts.length];
      } else if (fn === 'USNAM' || fn === 'ERNAM') {
        next[f.fieldname] = users[rIdx % users.length];
      } else if (fn.includes('VBELN') || fn.includes('DOC')) {
        next[f.fieldname] = `00100000${45 + rIdx}`;
      } else if (fn.includes('EBELN')) {
        next[f.fieldname] = `450001928${rIdx}`;
      } else if (fn.includes('BELNR')) {
        next[f.fieldname] = `100000001${rIdx}`;
      } else if (fn === 'AUFNR') {
        next[f.fieldname] = `000100023${rIdx}`;
      } else if (fn === 'PRUEFLOS') {
        next[f.fieldname] = `0300000012${rIdx}`;
      } else if (fn === 'PERNR') {
        next[f.fieldname] = `2026010${rIdx}`;
      } else if (fn === 'CODE_GRP') {
        next[f.fieldname] = `CM_GRP_0${rIdx + 1}`;
      } else if (fn === 'KUNNR' || fn === 'LIFNR') {
        next[f.fieldname] = `00001000${10 + rIdx}`;
      } else if (fn.includes('MATNR')) {
        next[f.fieldname] = `MAT-PART-00${rIdx + 1}`;
      } else if (fn === 'MAKTX' || fn === 'TXZ01' || fn === 'ARKTX') {
        next[f.fieldname] = matDescs[rIdx % matDescs.length];
      } else if (fn.includes('KOSTL')) {
        next[f.fieldname] = `1000CC0${rIdx + 1}`;
      } else if (fn.includes('KSTAR')) {
        next[f.fieldname] = `51000${rIdx + 1}00`;
      } else if (f.datatype === 'DATS' || fn.includes('DAT')) {
        next[f.fieldname] = `2026.10.${String(10 + rIdx * 3).padStart(2, '0')}`;
      } else if (fn === 'PLAN_AMT') {
        next[f.fieldname] = 50000000 + rIdx * 5000000;
      } else if (fn === 'ACT_AMT' || fn === 'WKGBTR') {
        next[f.fieldname] = amounts[rIdx % amounts.length];
      } else if (fn === 'VAR_AMT') {
        next[f.fieldname] = 50000000 + rIdx * 5000000 - amounts[rIdx % amounts.length];
      } else if (f.datatype === 'CURR' || fn.includes('NETWR') || fn.includes('DMBTR') || fn.includes('WKG')) {
        next[f.fieldname] = amounts[rIdx % amounts.length];
      } else if (fn === 'LFIMG' || fn === 'WEMNG' || fn === 'ENMNG') {
        next[f.fieldname] = (rIdx + 1) * 15;
      } else if (fn === 'OPEN_QTY') {
        next[f.fieldname] = (rIdx + 1) * 10;
      } else if (f.datatype === 'DEC' || f.datatype === 'INT4' || fn.includes('MENGE')) {
        next[f.fieldname] = (rIdx + 1) * 25;
      } else if (fn.includes('WAER') || fn.includes('CURR')) {
        next[f.fieldname] = 'KRW';
      } else if (fn.includes('MEINS') || fn.includes('VRKME') || fn === 'GMEIN') {
        next[f.fieldname] = 'EA';
      } else if (fn.includes('NAME')) {
        next[f.fieldname] = partnerNames[rIdx % partnerNames.length];
      } else if (f.datatype === 'NUMC') {
        next[f.fieldname] = String(rIdx + 1).padStart(f.outputlen || 4, '0');
      } else {
        next[f.fieldname] = `${f.coltext || f.fieldname} ${rIdx + 1}`;
      }
    });
    return next;
  });
}

interface ClientModuleStandardProfile {
  headerTables: string[];
  itemTables: string[];
  masterTables: string[];
  foreignKey: string;
  defaultTitleKo: string;
  headerGridTitleKo: string;
  itemGridTitleKo: string;
  selectionParams: Array<Omit<SelectionParameter, 'id'>>;
  headerFields: Array<Omit<AlvField, 'id' | 'col_pos'>>;
  itemFields: Array<Omit<AlvField, 'id' | 'col_pos'>>;
  authorityObject: string;
  authorityFields: string;
  authorityDesc: string;
}

const CLIENT_MODULE_PROFILES: Record<SapModule, ClientModuleStandardProfile> = {
  FI: {
    headerTables: ['BKPF', 'T001'],
    itemTables: ['BSEG', 'ACDOCA', 'SKAT'],
    masterTables: ['SKA1', 'SKAT', 'KNA1', 'LFA1'],
    foreignKey: 'BELNR',
    defaultTitleKo: '회계전표 헤더 및 분개 상세 조회',
    headerGridTitleKo: '회계전표 헤더 목록 (BKPF)',
    itemGridTitleKo: '선택 전표 분개 상세 내역 (BSEG / ACDOCA)',
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_BUKRS', text: '회사코드 (Company Code)', ref_table: 'BKPF', ref_field: 'BUKRS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', low: '1000', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'PARAMETER', name: 'P_GJAHR', text: '회계연도 (Fiscal Year)', ref_table: 'BKPF', ref_field: 'GJAHR', datatype: 'NUMC', length: 4, obligatory: true, default_val: '2026', low: '2026', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_BUDAT', text: '전기일자 (Posting Date)', ref_table: 'BKPF', ref_field: 'BUDAT', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', low: '2026.10.01', high: '2026.10.31', sign: 'I', option: 'BT', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_BELNR', text: '회계전표번호 (Doc No.)', ref_table: 'BKPF', ref_field: 'BELNR', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_id: 'b2', block_title: '전표 및 계정 필터' },
      { kind: 'SELECT_OPTION', name: 'S_BLART', text: '전표유형 (Doc Type)', ref_table: 'BKPF', ref_field: 'BLART', datatype: 'CHAR', length: 2, obligatory: false, default_val: '', block_id: 'b2', block_title: '전표 및 계정 필터' },
      { kind: 'SELECT_OPTION', name: 'S_HKONT', text: 'G/L 계정 (G/L Account)', ref_table: 'BSEG', ref_field: 'HKONT', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_id: 'b2', block_title: '전표 및 계정 필터' },
      { kind: 'RADIOBUTTON', name: 'P_ALL', text: '전체 전표 조회', datatype: 'CHAR', length: 1, obligatory: false, default_val: 'X', low: 'X', block_id: 'b3', block_title: '조회 옵션', radio_group: 'R1' },
      { kind: 'RADIOBUTTON', name: 'P_OPEN', text: '미결 포함 전표만', datatype: 'CHAR', length: 1, obligatory: false, default_val: '', low: '', block_id: 'b3', block_title: '조회 옵션', radio_group: 'R1' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', icon_type: 'LIGHTS' },
      { fieldname: 'BUKRS', coltext: '회사코드', datatype: 'CHAR', outputlen: 6, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'BKPF', ref_field: 'BUKRS' },
      { fieldname: 'BELNR', coltext: '회계전표', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'FB03', ref_table: 'BKPF', ref_field: 'BELNR' },
      { fieldname: 'GJAHR', coltext: '회계연도', datatype: 'NUMC', outputlen: 6, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'BKPF', ref_field: 'GJAHR' },
      { fieldname: 'BLART', coltext: '유형', datatype: 'CHAR', outputlen: 4, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'BKPF', ref_field: 'BLART' },
      { fieldname: 'BUDAT', coltext: '전기일자', datatype: 'DATS', outputlen: 10, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'BKPF', ref_field: 'BUDAT' },
      { fieldname: 'BKTXT', coltext: '전표헤더텍스트', datatype: 'CHAR', outputlen: 28, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'BKPF', ref_field: 'BKTXT' },
      { fieldname: 'DMBTR', coltext: '총전표금액', datatype: 'CURR', outputlen: 15, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', cfieldname: 'WAERS', ref_table: 'BSEG', ref_field: 'DMBTR' },
      { fieldname: 'WAERS', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'BKPF', ref_field: 'WAERS' },
      { fieldname: 'USNAM', coltext: '입력자', datatype: 'CHAR', outputlen: 12, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'BKPF', ref_field: 'USNAM' },
    ],
    itemFields: [
      { fieldname: 'BELNR', coltext: '회계전표', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'BSEG', ref_field: 'BELNR' },
      { fieldname: 'BUZEI', coltext: '항번', datatype: 'NUMC', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'BSEG', ref_field: 'BUZEI' },
      { fieldname: 'BSCHL', coltext: '전기키', datatype: 'CHAR', outputlen: 4, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'BSEG', ref_field: 'BSCHL' },
      { fieldname: 'SHKZG', coltext: '차/대', datatype: 'CHAR', outputlen: 4, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'BSEG', ref_field: 'SHKZG' },
      { fieldname: 'HKONT', coltext: 'G/L계정', datatype: 'CHAR', outputlen: 10, just: 'C', key: false, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'FS03', ref_table: 'BSEG', ref_field: 'HKONT' },
      { fieldname: 'TXT50', coltext: '계정과목명', datatype: 'CHAR', outputlen: 32, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'SKAT', ref_field: 'TXT50' },
      { fieldname: 'KOSTL', coltext: '코스트센터', datatype: 'CHAR', outputlen: 10, just: 'C', key: false, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'KS03', ref_table: 'BSEG', ref_field: 'KOSTL' },
      { fieldname: 'MWSKZ', coltext: '세금코드', datatype: 'CHAR', outputlen: 4, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'BSEG', ref_field: 'MWSKZ' },
      { fieldname: 'DMBTR', coltext: '현지금액', datatype: 'CURR', outputlen: 15, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', cfieldname: 'WAERS', ref_table: 'BSEG', ref_field: 'DMBTR' },
      { fieldname: 'WAERS', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'BKPF', ref_field: 'WAERS' },
      { fieldname: 'SGTXT', coltext: '항목적요', datatype: 'CHAR', outputlen: 36, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'BSEG', ref_field: 'SGTXT' },
    ],
    authorityObject: 'F_BKPF_BUK',
    authorityFields: "BUKRS = P_BUKRS, ACTVT = '03'",
    authorityDesc: '회사코드별 회계전표 조회 권한 점검',
  },
  MM: {
    headerTables: ['EKKO', 'LFA1'],
    itemTables: ['EKPO', 'EKET', 'EKBE', 'MAKT'],
    masterTables: ['LFA1', 'MARA', 'MAKT'],
    foreignKey: 'EBELN',
    defaultTitleKo: '구매오더 헤더 및 입고 진행 상세 모니터링',
    headerGridTitleKo: '구매오더 헤더 목록 (EKKO)',
    itemGridTitleKo: '구매오더 품목 및 입고 이력 상세 (EKPO / EKBE)',
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_BUKRS', text: '회사코드 (Company Code)', ref_table: 'EKKO', ref_field: 'BUKRS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', low: '1000', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_WERKS', text: '플랜트 (Plant)', ref_table: 'EKPO', ref_field: 'WERKS', datatype: 'CHAR', length: 4, obligatory: false, default_val: '1000', low: '1000', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_BEDAT', text: '발주일자 (PO Date)', ref_table: 'EKKO', ref_field: 'BEDAT', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_EBELN', text: '구매오더 (PO No.)', ref_table: 'EKKO', ref_field: 'EBELN', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_id: 'b2', block_title: '발주 필터' },
      { kind: 'SELECT_OPTION', name: 'S_LIFNR', text: '공급업체 (Vendor)', ref_table: 'EKKO', ref_field: 'LIFNR', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_id: 'b2', block_title: '발주 필터' },
      { kind: 'RADIOBUTTON', name: 'P_ALL', text: '전체 발주', datatype: 'CHAR', length: 1, obligatory: false, default_val: 'X', low: 'X', block_id: 'b3', block_title: '조회 옵션', radio_group: 'R1' },
      { kind: 'RADIOBUTTON', name: 'P_OPEN', text: '미입고/납기지연 건만', datatype: 'CHAR', length: 1, obligatory: false, default_val: '', low: '', block_id: 'b3', block_title: '조회 옵션', radio_group: 'R1' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', icon_type: 'LIGHTS' },
      { fieldname: 'EBELN', coltext: '구매오더', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'ME23N', ref_table: 'EKKO', ref_field: 'EBELN' },
      { fieldname: 'BSART', coltext: '유형', datatype: 'CHAR', outputlen: 6, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'EKKO', ref_field: 'BSART' },
      { fieldname: 'BEDAT', coltext: '발주일자', datatype: 'DATS', outputlen: 10, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'EKKO', ref_field: 'BEDAT' },
      { fieldname: 'LIFNR', coltext: '공급업체', datatype: 'CHAR', outputlen: 10, just: 'C', key: false, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'XK03', ref_table: 'EKKO', ref_field: 'LIFNR' },
      { fieldname: 'NAME1', coltext: '공급업체명', datatype: 'CHAR', outputlen: 28, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'LFA1', ref_field: 'NAME1' },
      { fieldname: 'NETWR', coltext: '총발주금액', datatype: 'CURR', outputlen: 15, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', cfieldname: 'WAERS', ref_table: 'EKPO', ref_field: 'NETWR' },
      { fieldname: 'WAERS', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'EKKO', ref_field: 'WAERS' },
    ],
    itemFields: [
      { fieldname: 'EBELN', coltext: '구매오더', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'EKPO', ref_field: 'EBELN' },
      { fieldname: 'EBELP', coltext: '품목', datatype: 'NUMC', outputlen: 5, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'EKPO', ref_field: 'EBELP' },
      { fieldname: 'MATNR', coltext: '자재코드', datatype: 'CHAR', outputlen: 16, just: 'L', key: false, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'MM03', ref_table: 'EKPO', ref_field: 'MATNR' },
      { fieldname: 'TXZ01', coltext: '자재내역', datatype: 'CHAR', outputlen: 30, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'EKPO', ref_field: 'TXZ01' },
      { fieldname: 'MENGE', coltext: '발주수량', datatype: 'DEC', outputlen: 12, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', qfieldname: 'MEINS', ref_table: 'EKPO', ref_field: 'MENGE' },
      { fieldname: 'WEMNG', coltext: '입고수량', datatype: 'DEC', outputlen: 12, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', qfieldname: 'MEINS', ref_table: 'EKET', ref_field: 'WEMNG' },
      { fieldname: 'OPEN_QTY', coltext: '미입고잔량', datatype: 'DEC', outputlen: 12, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', qfieldname: 'MEINS', ref_table: 'EKPO', ref_field: 'MENGE' },
      { fieldname: 'MEINS', coltext: '단위', datatype: 'UNIT', outputlen: 4, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'EKPO', ref_field: 'MEINS' },
      { fieldname: 'NETWR', coltext: '발주금액', datatype: 'CURR', outputlen: 15, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', cfieldname: 'WAERS', ref_table: 'EKPO', ref_field: 'NETWR' },
    ],
    authorityObject: 'M_BEST_WRK',
    authorityFields: "WERKS IN S_WERKS, ACTVT = '03'",
    authorityDesc: '플랜트별 구매오더 조회 권한 점검',
  },
  CO: {
    headerTables: ['CSKS', 'CSKT', 'SETNODE'],
    itemTables: ['COEP', 'COSP', 'CSKU'],
    masterTables: ['CSKS', 'CSKT', 'CSKU'],
    foreignKey: 'KOSTL',
    defaultTitleKo: '코스트센터별 계획 대비 실적 원가 차이 분석',
    headerGridTitleKo: '코스트센터 마스터 및 원가 요약 (CSKS / COSP)',
    itemGridTitleKo: '원가요소별 실제/계획 라인 상세 (COEP / COSP)',
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_KOKRS', text: '관리회계영역 (Controlling Area)', ref_table: 'CSKS', ref_field: 'KOKRS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', low: '1000', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'PARAMETER', name: 'P_GJAHR', text: '회계연도 (Fiscal Year)', ref_table: 'COEP', ref_field: 'GJAHR', datatype: 'NUMC', length: 4, obligatory: true, default_val: '2026', low: '2026', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_KOSTL', text: '코스트센터 (Cost Center)', ref_table: 'CSKS', ref_field: 'KOSTL', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_id: 'b2', block_title: '원가 필터' },
      { kind: 'SELECT_OPTION', name: 'S_KSTAR', text: '원가요소 (Cost Element)', ref_table: 'COEP', ref_field: 'KSTAR', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_id: 'b2', block_title: '원가 필터' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', icon_type: 'LIGHTS' },
      { fieldname: 'KOSTL', coltext: '코스트센터', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'KS03', ref_table: 'CSKS', ref_field: 'KOSTL' },
      { fieldname: 'KTEXT', coltext: '코스트센터명', datatype: 'CHAR', outputlen: 28, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'CSKT', ref_field: 'KTEXT' },
      { fieldname: 'PLAN_AMT', coltext: '계획금액', datatype: 'CURR', outputlen: 15, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', cfieldname: 'WAERS', ref_table: 'COSP', ref_field: 'WKG001' },
      { fieldname: 'ACT_AMT', coltext: '실적금액', datatype: 'CURR', outputlen: 15, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', cfieldname: 'WAERS', ref_table: 'COEP', ref_field: 'WKGBTR' },
      { fieldname: 'VAR_AMT', coltext: '차이금액', datatype: 'CURR', outputlen: 15, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', cfieldname: 'WAERS', ref_table: 'COEP', ref_field: 'WKGBTR' },
      { fieldname: 'WAERS', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'COEP', ref_field: 'OWAER' },
    ],
    itemFields: [
      { fieldname: 'KOSTL', coltext: '코스트센터', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'COEP', ref_field: 'OBJNR' },
      { fieldname: 'KSTAR', coltext: '원가요소', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'KA03', ref_table: 'COEP', ref_field: 'KSTAR' },
      { fieldname: 'LTEXT', coltext: '원가요소명', datatype: 'CHAR', outputlen: 30, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'CSKU', ref_field: 'LTEXT' },
      { fieldname: 'BELNR', coltext: 'CO전표', datatype: 'CHAR', outputlen: 10, just: 'C', key: false, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'KSB1', ref_table: 'COEP', ref_field: 'BELNR' },
      { fieldname: 'WKGBTR', coltext: '실적금액', datatype: 'CURR', outputlen: 15, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', cfieldname: 'WAERS', ref_table: 'COEP', ref_field: 'WKGBTR' },
      { fieldname: 'WAERS', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'COEP', ref_field: 'OWAER' },
    ],
    authorityObject: 'K_CCA',
    authorityFields: "KOKRS = P_KOKRS, KOSTL IN S_KOSTL, ACTVT = '03'",
    authorityDesc: '코스트센터 원가 조회 권한 점검',
  },
  SD: {
    headerTables: ['VBAK', 'KNA1', 'VBUK'],
    itemTables: ['VBAP', 'LIPS', 'VBRP'],
    masterTables: ['KNA1', 'MARA', 'MAKT'],
    foreignKey: 'VBELN',
    defaultTitleKo: '판매오더 헤더 및 납품 품목 상세 현황',
    headerGridTitleKo: '판매오더 헤더 목록 (VBAK)',
    itemGridTitleKo: '선택 오더 품목 및 납품 상세 (VBAP / LIPS)',
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_VKORG', text: '영업조직 (Sales Org)', ref_table: 'VBAK', ref_field: 'VKORG', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', low: '1000', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_ERDAT', text: '오더일자 (Order Date)', ref_table: 'VBAK', ref_field: 'ERDAT', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', low: '2026.10.01', high: '2026.10.31', sign: 'I', option: 'BT', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_VBELN', text: '판매오더 (Sales Order)', ref_table: 'VBAK', ref_field: 'VBELN', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_id: 'b2', block_title: '오더 필터' },
      { kind: 'SELECT_OPTION', name: 'S_KUNNR', text: '고객코드 (Customer)', ref_table: 'VBAK', ref_field: 'KUNNR', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_id: 'b2', block_title: '오더 필터' },
      { kind: 'RADIOBUTTON', name: 'P_ALL', text: '전체 판매오더', datatype: 'CHAR', length: 1, obligatory: false, default_val: 'X', low: 'X', block_id: 'b3', block_title: '조회 옵션', radio_group: 'R1' },
      { kind: 'RADIOBUTTON', name: 'P_OPEN', text: '미납/출하대기 건만', datatype: 'CHAR', length: 1, obligatory: false, default_val: '', low: '', block_id: 'b3', block_title: '조회 옵션', radio_group: 'R1' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', icon_type: 'LIGHTS' },
      { fieldname: 'VBELN', coltext: '판매오더', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'VA03', ref_table: 'VBAK', ref_field: 'VBELN' },
      { fieldname: 'AUART', coltext: '오더유형', datatype: 'CHAR', outputlen: 6, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'VBAK', ref_field: 'AUART' },
      { fieldname: 'ERDAT', coltext: '오더일자', datatype: 'DATS', outputlen: 10, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'VBAK', ref_field: 'ERDAT' },
      { fieldname: 'KUNNR', coltext: '고객코드', datatype: 'CHAR', outputlen: 10, just: 'C', key: false, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'XD03', ref_table: 'VBAK', ref_field: 'KUNNR' },
      { fieldname: 'NAME1', coltext: '고객명', datatype: 'CHAR', outputlen: 30, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'KNA1', ref_field: 'NAME1' },
      { fieldname: 'NETWR', coltext: '공급가액', datatype: 'CURR', outputlen: 15, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', cfieldname: 'WAERK', ref_table: 'VBAK', ref_field: 'NETWR' },
      { fieldname: 'WAERK', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'VBAK', ref_field: 'WAERK' },
    ],
    itemFields: [
      { fieldname: 'VBELN', coltext: '판매오더', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'VBAP', ref_field: 'VBELN' },
      { fieldname: 'POSNR', coltext: '품목', datatype: 'NUMC', outputlen: 6, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'VBAP', ref_field: 'POSNR' },
      { fieldname: 'MATNR', coltext: '자재코드', datatype: 'CHAR', outputlen: 16, just: 'L', key: false, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'MM03', ref_table: 'VBAP', ref_field: 'MATNR' },
      { fieldname: 'ARKTX', coltext: '자재내역', datatype: 'CHAR', outputlen: 32, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'VBAP', ref_field: 'ARKTX' },
      { fieldname: 'KWMENG', coltext: '주문수량', datatype: 'DEC', outputlen: 12, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', qfieldname: 'VRKME', ref_table: 'VBAP', ref_field: 'KWMENG' },
      { fieldname: 'LFIMG', coltext: '납품수량', datatype: 'DEC', outputlen: 12, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', qfieldname: 'VRKME', ref_table: 'LIPS', ref_field: 'LFIMG' },
      { fieldname: 'OPEN_QTY', coltext: '미납잔량', datatype: 'DEC', outputlen: 12, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', qfieldname: 'VRKME', ref_table: 'VBAP', ref_field: 'KWMENG' },
      { fieldname: 'VRKME', coltext: '단위', datatype: 'UNIT', outputlen: 4, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'VBAP', ref_field: 'VRKME' },
      { fieldname: 'NETWR', coltext: '품목금액', datatype: 'CURR', outputlen: 15, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', cfieldname: 'WAERK', ref_table: 'VBAP', ref_field: 'NETWR' },
    ],
    authorityObject: 'V_VBAK_VKO',
    authorityFields: "VKORG = P_VKORG, ACTVT = '03'",
    authorityDesc: '영업조직별 판매오더 조회 권한 점검',
  },
  PP: {
    headerTables: ['AFKO', 'AUFK', 'AFPO'],
    itemTables: ['RESB', 'AFVC', 'MAKT'],
    masterTables: ['MARA', 'MAKT', 'CRHD'],
    foreignKey: 'AUFNR',
    defaultTitleKo: '생산오더 진행 및 자재 투입 상세 현황',
    headerGridTitleKo: '생산오더 헤더 목록 (AFKO / AUFK)',
    itemGridTitleKo: '구성품 소요 및 출고 상세 (RESB)',
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_WERKS', text: '플랜트 (Plant)', ref_table: 'AUFK', ref_field: 'WERKS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', low: '1000', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_GSTRP', text: '시작예정일 (Start Date)', ref_table: 'AFKO', ref_field: 'GSTRP', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_AUFNR', text: '생산오더 (Prod Order)', ref_table: 'AFKO', ref_field: 'AUFNR', datatype: 'CHAR', length: 12, obligatory: false, default_val: '', block_id: 'b2', block_title: '오더 필터' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', icon_type: 'LIGHTS' },
      { fieldname: 'AUFNR', coltext: '생산오더', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'CO03', ref_table: 'AFKO', ref_field: 'AUFNR' },
      { fieldname: 'MATNR', coltext: '생산자재', datatype: 'CHAR', outputlen: 16, just: 'L', key: false, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'MM03', ref_table: 'AFPO', ref_field: 'MATNR' },
      { fieldname: 'MAKTX', coltext: '자재내역', datatype: 'CHAR', outputlen: 30, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'MAKT', ref_field: 'MAKTX' },
      { fieldname: 'GAMNG', coltext: '계획수량', datatype: 'DEC', outputlen: 12, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', qfieldname: 'GMEIN', ref_table: 'AFKO', ref_field: 'GAMNG' },
      { fieldname: 'GMEIN', coltext: '단위', datatype: 'UNIT', outputlen: 4, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'AFKO', ref_field: 'GMEIN' },
    ],
    itemFields: [
      { fieldname: 'AUFNR', coltext: '생산오더', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'RESB', ref_field: 'AUFNR' },
      { fieldname: 'RSPOS', coltext: '항번', datatype: 'NUMC', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'RESB', ref_field: 'RSPOS' },
      { fieldname: 'MATNR', coltext: '투입자재', datatype: 'CHAR', outputlen: 16, just: 'L', key: false, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'MM03', ref_table: 'RESB', ref_field: 'MATNR' },
      { fieldname: 'MAKTX', coltext: '자재내역', datatype: 'CHAR', outputlen: 30, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'MAKT', ref_field: 'MAKTX' },
      { fieldname: 'BDMNG', coltext: '소요수량', datatype: 'DEC', outputlen: 12, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', qfieldname: 'MEINS', ref_table: 'RESB', ref_field: 'BDMNG' },
      { fieldname: 'ENMNG', coltext: '출고수량', datatype: 'DEC', outputlen: 12, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', qfieldname: 'MEINS', ref_table: 'RESB', ref_field: 'ENMNG' },
      { fieldname: 'MEINS', coltext: '단위', datatype: 'UNIT', outputlen: 4, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'RESB', ref_field: 'MEINS' },
    ],
    authorityObject: 'C_AFKO_AWK',
    authorityFields: "WERKS = P_WERKS, ACTVT = '03'",
    authorityDesc: '생산오더 조회 권한 점검',
  },
  QM: {
    headerTables: ['QALS', 'MAKT'],
    itemTables: ['QAMV', 'QAVE', 'QAMR'],
    masterTables: ['MARA', 'MAKT'],
    foreignKey: 'PRUEFLOS',
    defaultTitleKo: '품질 검사로트 및 특성 결과 상세 조회',
    headerGridTitleKo: '검사로트 목록 (QALS)',
    itemGridTitleKo: '검사항목 특성 결과 상세 (QAMV / QAMR)',
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_WERKS', text: '플랜트 (Plant)', ref_table: 'QALS', ref_field: 'WERKS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', low: '1000', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_MATNR', text: '자재코드 (Material)', ref_table: 'QALS', ref_field: 'MATNR', datatype: 'CHAR', length: 18, obligatory: false, default_val: '', block_id: 'b1', block_title: '기본 조회 조건' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', icon_type: 'LIGHTS' },
      { fieldname: 'PRUEFLOS', coltext: '검사로트', datatype: 'NUMC', outputlen: 12, just: 'C', key: true, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'QA03', ref_table: 'QALS', ref_field: 'PRUEFLOS' },
      { fieldname: 'MATNR', coltext: '자재코드', datatype: 'CHAR', outputlen: 16, just: 'L', key: false, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'MM03', ref_table: 'QALS', ref_field: 'MATNR' },
      { fieldname: 'KTEXTMAT', coltext: '자재내역', datatype: 'CHAR', outputlen: 30, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'QALS', ref_field: 'KTEXTMAT' },
      { fieldname: 'LOSMENGE', coltext: '로트수량', datatype: 'DEC', outputlen: 12, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', qfieldname: 'MENGENEINH', ref_table: 'QALS', ref_field: 'LOSMENGE' },
    ],
    itemFields: [
      { fieldname: 'PRUEFLOS', coltext: '검사로트', datatype: 'NUMC', outputlen: 12, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'QAMV', ref_field: 'PRUEFLOS' },
      { fieldname: 'MERKNR', coltext: '특성번호', datatype: 'NUMC', outputlen: 6, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'QAMV', ref_field: 'MERKNR' },
      { fieldname: 'KURZTEXT', coltext: '검사항목명', datatype: 'CHAR', outputlen: 30, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'QAMV', ref_field: 'KURZTEXT' },
    ],
    authorityObject: 'Q_INSPLOT',
    authorityFields: "WERKS = P_WERKS, ACTVT = '03'",
    authorityDesc: '검사로트 조회 권한 점검',
  },
  PM: {
    headerTables: ['AFIH', 'AUFK', 'EQUI'],
    itemTables: ['AFVC', 'RESB'],
    masterTables: ['EQUI', 'EQKT'],
    foreignKey: 'AUFNR',
    defaultTitleKo: '설비 정비오더 및 작업 상세 모니터링',
    headerGridTitleKo: '설비 정비오더 목록 (AFIH / AUFK)',
    itemGridTitleKo: '정비 작업 상세 (AFVC)',
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_IWERK', text: '보전플랜트 (Maint. Plant)', ref_table: 'AFIH', ref_field: 'IWERK', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', low: '1000', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_EQUNR', text: '설비번호 (Equipment)', ref_table: 'AFIH', ref_field: 'EQUNR', datatype: 'CHAR', length: 18, obligatory: false, default_val: '', block_id: 'b1', block_title: '기본 조회 조건' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', icon_type: 'LIGHTS' },
      { fieldname: 'AUFNR', coltext: '정비오더', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'IW33', ref_table: 'AFIH', ref_field: 'AUFNR' },
      { fieldname: 'EQUNR', coltext: '설비번호', datatype: 'CHAR', outputlen: 16, just: 'C', key: false, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'IE03', ref_table: 'AFIH', ref_field: 'EQUNR' },
      { fieldname: 'EQKTX', coltext: '설비명', datatype: 'CHAR', outputlen: 30, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'EQKT', ref_field: 'EQKTX' },
    ],
    itemFields: [
      { fieldname: 'AUFNR', coltext: '정비오더', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'AFVC', ref_field: 'AUFNR' },
      { fieldname: 'VORNR', coltext: '작업번호', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'AFVC', ref_field: 'VORNR' },
      { fieldname: 'LTXA1', coltext: '작업내역', datatype: 'CHAR', outputlen: 36, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'AFVC', ref_field: 'LTXA1' },
    ],
    authorityObject: 'I_AUART',
    authorityFields: "AUART = '*', ACTVT = '03'",
    authorityDesc: '정비오더 조회 권한 점검',
  },
  HR: {
    headerTables: ['PA0001', 'PA0002', 'HRP1000'],
    itemTables: ['PA2001', 'PA0008'],
    masterTables: ['PA0001', 'PA0002'],
    foreignKey: 'PERNR',
    defaultTitleKo: '인사 마스터 및 근태 이력 상세 조회',
    headerGridTitleKo: '사원 조직 인사 목록 (PA0001)',
    itemGridTitleKo: '사원별 근태 상세 내역 (PA2001)',
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_BUKRS', text: '회사코드 (Company Code)', ref_table: 'PA0001', ref_field: 'BUKRS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', low: '1000', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_PERNR', text: '사번 (Personnel No.)', ref_table: 'PA0001', ref_field: 'PERNR', datatype: 'NUMC', length: 8, obligatory: false, default_val: '', block_id: 'b1', block_title: '기본 조회 조건' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', icon_type: 'LIGHTS' },
      { fieldname: 'PERNR', coltext: '사번', datatype: 'NUMC', outputlen: 8, just: 'C', key: true, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'PA20', ref_table: 'PA0001', ref_field: 'PERNR' },
      { fieldname: 'ENAME', coltext: '성명', datatype: 'CHAR', outputlen: 24, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'PA0001', ref_field: 'ENAME' },
    ],
    itemFields: [
      { fieldname: 'PERNR', coltext: '사번', datatype: 'NUMC', outputlen: 8, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'PA2001', ref_field: 'PERNR' },
      { fieldname: 'AWART', coltext: '근태유형', datatype: 'CHAR', outputlen: 6, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'PA2001', ref_field: 'AWART' },
      { fieldname: 'ABWTG', coltext: '근태일수', datatype: 'DEC', outputlen: 8, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', ref_table: 'PA2001', ref_field: 'ABWTG' },
    ],
    authorityObject: 'P_ORGIN',
    authorityFields: "INFTY = '0001', AUTHC = 'R'",
    authorityDesc: '인사 마스터 조회 권한 점검',
  },
  BC: {
    headerTables: ['EDIDC', 'TBTCO'],
    itemTables: ['EDIDS', 'TBTCP'],
    masterTables: ['USR02', 'TBTCO'],
    foreignKey: 'DOCNUM',
    defaultTitleKo: '인터페이스 및 배치 모니터링 로그 상세',
    headerGridTitleKo: '인터페이스 전표 헤더 (EDIDC)',
    itemGridTitleKo: '상태 이력 및 오류 로그 상세 (EDIDS)',
    selectionParams: [
      { kind: 'SELECT_OPTION', name: 'S_CREDAT', text: '생성일자 (Created Date)', ref_table: 'EDIDC', ref_field: 'CREDAT', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', block_id: 'b1', block_title: '기본 조회 조건' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', icon_type: 'LIGHTS' },
      { fieldname: 'DOCNUM', coltext: 'IDoc번호', datatype: 'NUMC', outputlen: 16, just: 'C', key: true, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'WE02', ref_table: 'EDIDC', ref_field: 'DOCNUM' },
      { fieldname: 'MESTYP', coltext: '메시지유형', datatype: 'CHAR', outputlen: 14, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'EDIDC', ref_field: 'MESTYP' },
      { fieldname: 'STATUS', coltext: '상태코드', datatype: 'CHAR', outputlen: 6, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'EDIDC', ref_field: 'STATUS' },
    ],
    itemFields: [
      { fieldname: 'DOCNUM', coltext: 'IDoc번호', datatype: 'NUMC', outputlen: 16, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'EDIDS', ref_field: 'DOCNUM' },
      { fieldname: 'COUNTR', coltext: '순번', datatype: 'NUMC', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'EDIDS', ref_field: 'COUNTR' },
      { fieldname: 'STATXT', coltext: '상세메시지', datatype: 'CHAR', outputlen: 50, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'EDIDS', ref_field: 'STATXT' },
    ],
    authorityObject: 'S_IDOCMONI',
    authorityFields: "ACTVT = '03'",
    authorityDesc: '인터페이스 모니터링 권한 점검',
  },
  CM: {
    headerTables: ['ZTCM_CODE_H', 'T001'],
    itemTables: ['ZTCM_CODE_D'],
    masterTables: ['T001', 'TCURR'],
    foreignKey: 'CODE_GRP',
    defaultTitleKo: '전사 공통코드 그룹 및 상세 코드 관리',
    headerGridTitleKo: '공통코드 그룹 헤더 (ZTCM_CODE_H)',
    itemGridTitleKo: '그룹별 상세 코드 목록 (ZTCM_CODE_D)',
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_BUKRS', text: '회사코드 (Company Code)', ref_table: 'T001', ref_field: 'BUKRS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', low: '1000', block_id: 'b1', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_GRP', text: '코드그룹 (Code Group)', ref_table: 'ZTCM_CODE_H', ref_field: 'CODE_GRP', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_id: 'b1', block_title: '기본 조회 조건' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', icon_type: 'LIGHTS' },
      { fieldname: 'CODE_GRP', coltext: '코드그룹', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: 'SM30', ref_table: 'ZTCM_CODE_H', ref_field: 'CODE_GRP' },
      { fieldname: 'GRP_NAME', coltext: '그룹명칭', datatype: 'CHAR', outputlen: 30, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'ZTCM_CODE_H', ref_field: 'GRP_NAME' },
    ],
    itemFields: [
      { fieldname: 'CODE_GRP', coltext: '코드그룹', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'ZTCM_CODE_D', ref_field: 'CODE_GRP' },
      { fieldname: 'CODE_VAL', coltext: '상세코드', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'ZTCM_CODE_D', ref_field: 'CODE_VAL' },
      { fieldname: 'CODE_TXT', coltext: '코드명칭', datatype: 'CHAR', outputlen: 32, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'ZTCM_CODE_D', ref_field: 'CODE_TXT' },
    ],
    authorityObject: 'S_TABU_NAM',
    authorityFields: "TABLE = 'ZTCM_CODE_H', ACTVT = '03'",
    authorityDesc: '공통코드 관리 권한 점검',
  },
};

function detectClientSapModule(text: string, preferred?: SapModule | 'AUTO'): SapModule {
  if (preferred && preferred !== 'AUTO' && preferred in CLIENT_MODULE_PROFILES) {
    return preferred;
  }
  const upper = (text || '').toUpperCase();
  const scores: Record<SapModule, number> = {
    FI: 0, CO: 0, SD: 0, MM: 0, PP: 0, QM: 0, PM: 0, HR: 0, BC: 0, CM: 0,
  };
  const addMatch = (mod: SapModule, terms: string[], weight: number) => {
    for (const term of terms) {
      if (upper.includes(term.toUpperCase())) scores[mod] += weight;
    }
  };
  addMatch('FI', ['BKPF', 'BSEG', 'ACDOCA', 'BSID', 'BSIK', 'SKAT', 'FB03', 'FS03', 'FBL', '회계', '전표', '재무', '분개', '계정과목', '차변', '대변', '미결', '반제', '채권', '채무'], 5);
  addMatch('CO', ['CSKS', 'COEP', 'COSP', 'SETNODE', 'KS03', 'KSB1', '코스트', '원가', '예산', '관리회계', '손익'], 5);
  addMatch('MM', ['EKKO', 'EKPO', 'EKBE', 'MIGO', 'ME23N', '구매', '발주', '입고', '자재', '공급업체', '미입고'], 5);
  addMatch('SD', ['VBAK', 'VBAP', 'LIKP', 'LIPS', 'VBRK', 'VA03', 'VL03N', '판매', '영업', '수주', '납품', '출하', '대금청구'], 5);
  addMatch('PP', ['AFKO', 'AFPO', 'RESB', 'CO03', '생산', '작업지시', '공정', 'BOM'], 5);
  addMatch('QM', ['QALS', 'QAMV', 'QA03', '품질', '검사', '검사로트'], 5);
  addMatch('PM', ['AFIH', 'EQUI', 'IW33', '설비', '보전', '정비'], 5);
  addMatch('HR', ['PA0001', 'PA2001', 'PA20', '인사', '급여', '근태', '사번'], 5);
  addMatch('BC', ['EDIDC', 'EDIDS', 'TBTCO', 'WE02', 'SM37', '인터페이스', '배치잡', 'IDOC'], 5);
  addMatch('CM', ['ZTCM_', '공통 영역', '공통영역', '공통코드'], 5);

  if (/\bFI\b/.test(upper)) scores.FI += 8;
  if (/\bCO\b/.test(upper)) scores.CO += 8;
  if (/\bMM\b/.test(upper)) scores.MM += 8;
  if (/\bSD\b/.test(upper)) scores.SD += 8;
  if (/\bPP\b/.test(upper)) scores.PP += 8;

  const order: SapModule[] = ['FI', 'CO', 'MM', 'SD', 'PP', 'QM', 'PM', 'HR', 'BC', 'CM'];
  let best: SapModule = 'SD';
  let bestScore = 0;
  for (const m of order) {
    if (scores[m] > bestScore) {
      bestScore = scores[m];
      best = m;
    }
  }
  return best;
}

function detectClientMasterDetail(text: string): boolean {
  const upper = (text || '').toUpperCase();
  return (
    text.includes('상단') ||
    text.includes('하단') ||
    text.includes('헤더') ||
    text.includes('품목') ||
    text.includes('상세 조회') ||
    text.includes('상세 내역') ||
    text.includes('분개') ||
    upper.includes('MASTER') ||
    upper.includes('DETAIL') ||
    upper.includes('ITEM')
  );
}

function buildClientFullSpecFallback(req: FullSpecDraftRequest): { spec: ProgramSpec; detectedTables: string[] } {
  const ts = Date.now();
  const mod = detectClientSapModule(req.requirementPrompt, req.module);
  const prof = CLIENT_MODULE_PROFILES[mod];
  const sampleType = req.sampleType || '01';

  const programId = (req.programId || `Z${mod}_R_COPILOT`).toUpperCase();
  const tcode = (req.tcode || `Z${mod}010`).toUpperCase();

  const selectionParams: SelectionParameter[] = prof.selectionParams.map((p, idx) => ({
    ...p,
    id: `p-${ts}-${idx + 1}`,
  }));

  const fields: AlvField[] = prof.headerFields.map((f, idx) => ({
    ...f,
    id: `f-${ts}-${idx + 1}`,
    col_pos: idx + 1,
  }));

  const mockRows = backfillMockRowsForFields([], fields, fields, 5);

  let item_grid: ProgramSpec['item_grid'] = undefined;
  if (sampleType === '02') {
    const itemFields: AlvField[] = prof.itemFields.map((f, idx) => ({
      ...f,
      id: `if-${ts}-${idx + 1}`,
      col_pos: idx + 1,
    }));
    const rawItemRows = backfillMockRowsForFields([], itemFields, itemFields, 8);
    const fk = prof.foreignKey;
    const headerKeys = mockRows.map((r) => r[fk]).filter(Boolean);
    const linkedItemRows = rawItemRows.map((row, idx) => ({
      ...row,
      ...(headerKeys.length > 0 && itemFields.some((f) => f.fieldname === fk)
        ? { [fk]: headerKeys[idx % headerKeys.length] }
        : {}),
    }));

    item_grid = {
      grid_name: 'Item ALV Grid',
      grid_title: prof.itemGridTitleKo,
      foreign_key: fk,
      layout: {
        grid_title: prof.itemGridTitleKo,
        zebra: true,
        sel_mode: 'A',
        cwidth_opt: true,
        show_row_numbers: true,
      },
      field_catalog: itemFields,
      mock_rows: linkedItemRows,
    };
  }

  const detectedTables = Array.from(
    new Set([...prof.headerTables, ...(sampleType === '02' ? prof.itemTables : []), ...prof.masterTables])
  );

  const draftSpec: ProgramSpec = {
    id: `spec-ai-${ts}`,
    sample_type: sampleType,
    program_id: programId.startsWith('Z') || programId.startsWith('Y') ? programId : `Z${programId}`,
    tcode: tcode.startsWith('Z') || tcode.startsWith('Y') ? tcode : `Z${tcode}`,
    title: prof.defaultTitleKo,
    module: mod,
    author: 'Josh Lee',
    created_date: new Date().toISOString().slice(0, 10),
    target_sap_release: req.targetSapRelease || 'SAP S/4HANA 2023 / ECC 6.0',
    program_type: 'REPORT',
    business_purpose: `### 개발 목적 및 업무 배경 (${mod})\n- ${req.requirementPrompt.slice(0, 400)}\n- 상단(${prof.headerTables.join('/')}) 및 ${sampleType === '02' ? `하단 상세(${prof.itemTables.join('/')})를 \`${prof.foreignKey}\` 키로 실시간 연동 조회합니다.` : '핵심 현황을 모니터링합니다.'}`,
    data_extraction_logic: generateSmartFallbackLogic({
      business_purpose: req.requirementPrompt,
      module: mod,
      program_id: programId,
      title: prof.defaultTitleKo,
    }),
    authority_checks: [
      {
        id: `auth-${ts}-1`,
        object: prof.authorityObject,
        fields: prof.authorityFields,
        trigger_point: 'START-OF-SELECTION',
        description: prof.authorityDesc,
      },
    ],
    sap_messages: [
      {
        id: `msg-${ts}-1`,
        msg_class: 'Z01',
        msg_no: '001',
        msg_type: 'S',
        text: `${mod} 조회가 정상 완료되었습니다.`,
        trigger_condition: 'ALV 데이터 추출 성공 시',
      },
    ],
    selection_params: selectionParams,
    field_catalog: fields,
    layout: {
      grid_title: prof.headerGridTitleKo,
      zebra: true,
      sel_mode: 'A',
      cwidth_opt: true,
      excp_fname: 'ZICON',
      excp_led: true,
      show_row_numbers: true,
    },
    custom_toolbar: [],
    test_cases: [
      { id: `tc-${ts}-1`, scenario: '정상 조회 및 합계 검증', condition: '필수 조회 조건 입력 후 실행', expected: 'ALV 그리드 출력 및 금액 합계 표시' },
      ...(sampleType === '02'
        ? [{ id: `tc-${ts}-2`, scenario: '상단-하단 마스터-디테일 연동 검증', condition: `상단 ALV에서 ${prof.foreignKey} 행 선택`, expected: `하단 상세 그리드(${prof.itemTables[0]})가 선택 키 기준으로 필터 갱신됨` }]
        : []),
    ],
    mock_rows: mockRows,
    item_grid,
  };

  draftSpec.data_flow = generateRichDataFlowFromSpec(draftSpec);

  return {
    detectedTables,
    spec: draftSpec,
  };
}

function buildClientReverseExtractFallback(req: ReverseExtractRequest) {
  const upper = `${req.businessPurpose}\n${req.dataExtractionLogic}`.toUpperCase();
  const existingParams = new Set(req.existingSelectionParams.map((p) => p.name.toUpperCase()));
  const existingFields = new Set(req.existingFieldCatalog.map((f) => f.fieldname.toUpperCase()));
  const knownTables = ['VBAK', 'VBAP', 'KNA1', 'LIKP', 'LIPS', 'EKKO', 'EKPO', 'MARA', 'MAKT', 'BKPF', 'BSEG', 'ACDOCA', 'SKAT', 'CSKS', 'COEP', 'T001'];
  const detectedTables = knownTables.filter((t) => new RegExp(`\\b${t}\\b`).test(upper));

  const suggestedSelectionParams: SuggestedSelectionParamItem[] = [];
  const suggestedFieldCatalog: SuggestedFieldCatalogItem[] = [];

  if ((detectedTables.includes('KNA1') || upper.includes('고객')) && !existingParams.has('S_KUNNR')) {
    suggestedSelectionParams.push({
      kind: 'SELECT_OPTION',
      name: 'S_KUNNR',
      text: '고객코드 (Customer)',
      datatype: 'CHAR',
      length: 10,
      ref_table: 'KNA1',
      ref_field: 'KUNNR',
      obligatory: false,
      default_val: '',
      block_title: '기본 조회 조건',
      reason: '고객 테이블(KNA1) 기준 조회 필터 추천',
    });
  }
  if ((detectedTables.includes('KNA1') || upper.includes('고객')) && !existingFields.has('NAME1')) {
    suggestedFieldCatalog.push({
      fieldname: 'NAME1',
      coltext: '고객명',
      datatype: 'CHAR',
      outputlen: 35,
      just: 'L',
      key: false,
      hotspot: false,
      checkbox: false,
      edit: false,
      do_sum: false,
      emphasize: '',
      ref_table: 'KNA1',
      ref_field: 'NAME1',
      reason: 'KNA1 고객명 출력 컬럼 추천',
    });
  }

  return {
    detectedTables: detectedTables.length > 0 ? detectedTables : ['VBAK', 'VBAP'],
    suggestedSelectionParams,
    suggestedFieldCatalog,
  };
}

export interface MeetingMinutesRequest {
  rawTranscript: string;
  supplementalNotes?: string;
  existingMinutes?: string;
  projectName?: string;
  targetRelease?: string;
  mode: 'create' | 'enrich';
  segments?: MeetingTranscriptSegment[];
}

export interface MeetingMinutesResult {
  title: string;
  detectedModule: SapModule;
  minutesMarkdown: string;
  aiSuggestions?: MeetingAiSuggestionItem[];
  source: 'ai' | 'fallback';
  fallbackReason?: AiFallbackReason;
}

export async function requestAiMeetingMinutes(
  req: MeetingMinutesRequest,
  options?: AiRequestOptions
): Promise<MeetingMinutesResult> {
  let fallbackReason: AiFallbackReason = 'ai_error';
  try {
    const res = await authorizedFetch('/api/summarize-meeting-minutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? 32_000,
      body: JSON.stringify(req),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.minutesMarkdown === 'string') {
        const source = data.source === 'fallback' ? 'fallback' : 'ai';
        return {
          title: data.title || '신규 SAP 프로그램 설계 회의',
          detectedModule: data.detectedModule || 'SD',
          minutesMarkdown: data.minutesMarkdown,
          aiSuggestions: Array.isArray(data.aiSuggestions) ? data.aiSuggestions : [],
          source,
          ...(source === 'fallback'
            ? { fallbackReason: normalizeServerFallbackReason(data.fallbackReason) || 'ai_error' }
            : {}),
        };
      }
      throw new AiFallbackTriggerError(500, '회의록 AI 응답 형식이 올바르지 않습니다.');
    }
    await throwForFailedAiResponse(res);
  } catch (err: any) {
    if (shouldRethrowAiError(err)) throw err;
    fallbackReason = classifyFallbackReason(err);
    console.warn('Meeting minutes endpoint unavailable, using local fallback:', err);
  }

  const combined = `${req.rawTranscript}\n${req.supplementalNotes || ''}`;
  const mod = detectClientSapModule(combined);
  const prof = CLIENT_MODULE_PROFILES[mod];
  const isMasterDetail = detectClientMasterDetail(combined);
  const todayStr = new Date().toISOString().slice(0, 10);
  const cleanPipe = (v: string) => v.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();

  const speakerSet = new Set<string>();
  const evidenceRows: string[] = [];

  if (Array.isArray(req.segments) && req.segments.length > 0) {
    req.segments.forEach((seg) => {
      const text = cleanPipe(seg.text || '');
      if (!text) return;
      const spk = cleanPipe(seg.speaker || '현업 담당자');
      speakerSet.add(spk);
      evidenceRows.push(
        `| \`${seg.timestamp || '회의 중'}\` · ${spk} | ${text.slice(0, 120)} | ${mod} 표준 업무 정합성 및 조회 효율 확보 | ${isMasterDetail ? `상단(${prof.headerTables[0]})-하단(${prof.itemTables[0]}) 키(\`${prof.foreignKey}\`) 연동 반영` : `${mod} 표준 ALV 사양 반영`} |`
      );
    });
  } else {
    req.rawTranscript
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        const m = line.match(/^\[([^\]]+)\]\s*([^:]+):\s*(.+)$/);
        if (m) {
          speakerSet.add(cleanPipe(m[2]));
          evidenceRows.push(
            `| \`${cleanPipe(m[1])}\` · ${cleanPipe(m[2])} | ${cleanPipe(m[3]).slice(0, 120)} | ${mod} 표준 업무 정합성 및 조회 효율 확보 | ${isMasterDetail ? `2단 Master-Detail 구조(${prof.foreignKey}) 반영` : '표준 ALV 구조 반영'} |`
          );
        } else {
          speakerSet.add('회의 참여자');
          evidenceRows.push(
            `| 메모 · 참여자 | ${cleanPipe(line).slice(0, 120)} | 현업 요구사항 팩트 기록 | 사양서 조건·컬럼·로직 반영 |`
          );
        }
      });
  }

  const speakers = speakerSet.size > 0 ? Array.from(speakerSet).join(', ') : '현업 담당자, SAP 설계자';
  const clientSuggestions: MeetingAiSuggestionItem[] = [
    {
      id: `sug-${mod}-1`,
      category: 'missing_fact',
      title: `${mod} 원천 데이터 제외/필터 기준 확정 필요`,
      detail: `${prof.headerTables[0]} 조회 시 취소·삭제·역분개 건을 기본 제외할지, 적색 신호등으로 구분 표시할지 현업 확인이 필요합니다.`,
      suggestedAction: '선택화면에 취소/제외 옵션 체크박스를 추가하고 오류/지연 건은 적색 신호등(3)으로 표기',
    },
    ...(isMasterDetail
      ? [
          {
            id: `sug-${mod}-2`,
            category: 'question' as const,
            title: `상·하단 그리드 초기 연동 및 분할 비율 확인 (${prof.foreignKey})`,
            detail: `F8 실행 직후 상단 1행(${prof.foreignKey})을 자동 선택해 하단(${prof.itemTables[0]})을 바로 조회할지 확인이 필요합니다.`,
            suggestedAction: '초기 실행 시 상단 첫 번째 행 자동 선택으로 하단 즉시 연동 (분할 비율 45:55)',
          },
        ]
      : []),
    {
      id: `sug-${mod}-3`,
      category: 'enhancement',
      title: '대용량 조회 제한 및 권한 점검(AUTHORITY-CHECK) 보강',
      detail: `실행 전 ${prof.authorityObject} 권한 점검과 조회 건수 0건 시 SE91 안내 메시지 처리를 명문화하는 것이 안전합니다.`,
      suggestedAction: `START-OF-SELECTION 진입 전 ${prof.authorityObject} 권한 점검 및 0건 안내 메시지 반영`,
    },
  ];

  let minutesMarkdown = '';
  if (req.mode === 'enrich' && req.existingMinutes?.trim() && req.existingMinutes.includes('## 2.')) {
    let baseDoc = req.existingMinutes.trim();
    if (req.supplementalNotes?.trim()) {
      const tsNow = new Date().toTimeString().slice(0, 8);
      const newRows = req.supplementalNotes
        .split('\n')
        .map((l) => cleanPipe(l))
        .filter(Boolean)
        .map((line) => `| \`${tsNow}\` · 추가 보완 | ${line.slice(0, 120)} | 회의 검토 중 추가 확인·합의된 기준 반영 | 사양서 조건/로직 즉시 반영 확정 |`)
        .join('\n');
      const sec3Idx = baseDoc.indexOf('\n## 3.');
      if (sec3Idx !== -1 && newRows) {
        baseDoc = `${baseDoc.slice(0, sec3Idx)}\n${newRows}${baseDoc.slice(sec3Idx)}`;
      }
      const sec7Idx = baseDoc.indexOf('\n## 7.');
      const resolvedLine = `\n- **[보완 반영 완료]** ${cleanPipe(req.supplementalNotes)}`;
      if (sec7Idx !== -1) {
        baseDoc = `${baseDoc.slice(0, sec7Idx)}${resolvedLine}${baseDoc.slice(sec7Idx)}`;
      } else {
        baseDoc = `${baseDoc}\n\n### 추가 보완 반영 내역${resolvedLine}`;
      }
    }
    minutesMarkdown = baseDoc;
  } else {
    const rawDigest = cleanPipe(req.rawTranscript || req.supplementalNotes || prof.defaultTitleKo).slice(0, 220);
    minutesMarkdown = `## 1. 회의 개요 및 육하원칙 (5W1H Summary)
| 구분 (육하원칙) | 확정 · 논의 내용 (팩트 및 근거 기준) |
| :--- | :--- |
| **Who (참여자 / 발화자)** | ${speakers} |
| **When (일시 / 회의 시점)** | ${todayStr} |
| **Where (대상 시스템 · 모듈)** | ${req.projectName || 'SAP 프로젝트'} · ${req.targetRelease || 'SAP S/4HANA 2023'} · \`${mod}\` |
| **Why (개발 목적 · 배경)** | ${prof.defaultTitleKo} 업무의 실시간 조회·검증 효율화 |
| **What (개발 범위 · 화면 유형)** | ${isMasterDetail ? `상단(Header) - 하단(Detail) 2단 연동형 (\`ZRALV0020\`, 연결 키: \`${prof.foreignKey}\`)` : '표준 ALV 리포트'} |
| **How & Result (구현 방향 · 합의 결론)** | **표준 테이블**: 상단 \`${prof.headerTables.join(', ')}\` / 하단 \`${prof.itemTables.join(', ')}\` · **원문 요구**: ${rawDigest} |

## 2. 논의 근거 및 결정 로그 (Decision & Evidence Log)
| 시각 · 발화자 | 논의 · 요구 내용 | 배경 및 근거 (Why) | 확정 결론 / 사양 반영 (Result) |
| :--- | :--- | :--- | :--- |
${evidenceRows.join('\n') || `| \`${todayStr}\` · 현업 | ${rawDigest} | 업무 프로세스 표준화 | ${mod} 표준 사양 반영 |`}

## 3. 참조 SAP 표준 테이블 (상단/하단 매핑표)
| 구분 (영역) | SAP 표준 테이블 | 연결 키 / 조인 기준 | 주요 역할 |
| :--- | :--- | :--- | :--- |
| **상단 (Header 영역)** | \`${prof.headerTables.join(', ')}\` | Primary Key (\`${prof.foreignKey}\`) | 마스터 목록 요약 및 상태 신호등 |
| **하단 (Item/상세 영역)** | \`${prof.itemTables.join(', ')}\` | \`${prof.foreignKey}\` 기준 동적 필터링 | 선택 건의 상세 내역 조회 |
| **마스터 참조 (Text)** | \`${prof.masterTables.join(', ')}\` | 코드-명칭 매핑 (\`SPRAS = SY-LANGU\`) | 계정/거래처/자재 명칭 보강 |

## 4. 선택화면(Selection Screen) 확정 조건
${prof.selectionParams.map((p) => `- \`${p.name}\` (\`${p.kind}\`, ${p.ref_table ? `\`${p.ref_table}-${p.ref_field}\`` : p.datatype}): ${p.text}`).join('\n')}

## 5. 출력 레이아웃(ALV) 상단/하단 및 인터랙션 요구사항
- **상단 컬럼**: ${prof.headerFields.map((f) => `\`${f.fieldname}\`(${f.coltext})`).join(', ')}
- **하단 컬럼**: ${prof.itemFields.map((f) => `\`${f.fieldname}\`(${f.coltext})`).join(', ')}
- **상호작용**: 상단 행 클릭 시 \`${prof.foreignKey}\` 키 기준 하단 상세 ALV 동기화 및 주요 키 T-Code 드릴다운

## 6. 권한 점검 · 메시지 및 성능/예외 기준
- **권한 오브젝트**: \`${prof.authorityObject}\` (${prof.authorityFields} — ${prof.authorityDesc})
- **성능 및 예외**: \`FOR ALL ENTRIES\` 실행 전 \`IS NOT INITIAL\` 점검 및 조회 결과 0건 안내 메시지 출력

## 7. AI 리뷰 코멘트 및 추가 도출 제안 (Enrichment Comments)
${clientSuggestions.map((s) => `- **[${s.category === 'missing_fact' ? '누락 확인' : s.category === 'question' ? '현업 확인 질문' : '보완 제안'}] ${s.title}**: ${s.detail} → *권장안*: ${s.suggestedAction}`).join('\n')}`;
  }

  return {
    title: `${mod} ${prof.defaultTitleKo}`,
    detectedModule: mod,
    minutesMarkdown,
    aiSuggestions: clientSuggestions,
    source: 'fallback',
    fallbackReason,
  };
}

export interface SampleRecommendationAlternative {
  sampleType: '01' | '02' | '03' | '04';
  sampleProgramId: string;
  label: string;
  fitSummary: string;
}

export interface SampleRecommendationRequest {
  minutesMarkdown: string;
  projectName?: string;
  existingProgramIds?: string[];
  preferredModule?: SapModule;
}

export interface SampleRecommendationResult {
  recommendedSampleType: '01' | '02' | '03' | '04';
  confidenceReason: string;
  suggestedModule: SapModule;
  suggestedProgramId: string;
  suggestedTcode: string;
  suggestedTitle: string;
  detectedTables?: string[];
  requirementPrompt: string;
  alternatives: SampleRecommendationAlternative[];
  source: 'ai' | 'fallback';
  fallbackReason?: AiFallbackReason;
}

export async function requestAiSampleRecommendation(
  req: SampleRecommendationRequest,
  options?: AiRequestOptions
): Promise<SampleRecommendationResult> {
  let fallbackReason: AiFallbackReason = 'ai_error';
  try {
    const res = await authorizedFetch('/api/recommend-sample-from-minutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? 32_000,
      body: JSON.stringify(req),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.recommendedSampleType) {
        const source = data.source === 'fallback' ? 'fallback' : 'ai';
        return {
          recommendedSampleType: data.recommendedSampleType,
          confidenceReason: data.confidenceReason || '',
          suggestedModule: data.suggestedModule || 'SD',
          suggestedProgramId: data.suggestedProgramId || 'ZR_SD_MON_10',
          suggestedTcode: data.suggestedTcode || 'ZSD010',
          suggestedTitle: data.suggestedTitle || '업무 현황 모니터링 프로그램',
          detectedTables: Array.isArray(data.detectedTables) ? data.detectedTables : undefined,
          requirementPrompt: data.requirementPrompt || req.minutesMarkdown.slice(0, 1500),
          alternatives: Array.isArray(data.alternatives) ? data.alternatives : [],
          source,
          ...(source === 'fallback'
            ? { fallbackReason: normalizeServerFallbackReason(data.fallbackReason) || 'ai_error' }
            : {}),
        };
      }
      throw new AiFallbackTriggerError(500, '샘플 추천 AI 응답 형식이 올바르지 않습니다.');
    }
    await throwForFailedAiResponse(res);
  } catch (err: any) {
    if (shouldRethrowAiError(err)) throw err;
    fallbackReason = classifyFallbackReason(err);
    console.warn('Recommend sample endpoint unavailable, using local fallback:', err);
  }

  const txt = req.minutesMarkdown || '';
  const mod = detectClientSapModule(txt, req.preferredModule);
  const prof = CLIENT_MODULE_PROFILES[mod];

  const recommendedSampleType: '01' | '02' | '03' | '04' =
    detectClientMasterDetail(txt) || (txt.includes('전표') && txt.includes('상세'))
      ? '02'
      : txt.includes('계층') || txt.includes('트리')
      ? '03'
      : txt.includes('피벗') || txt.includes('교차')
      ? '04'
      : '01';

  return {
    recommendedSampleType,
    confidenceReason:
      recommendedSampleType === '02'
        ? `상단(${prof.headerTables.join('/')}) 선택 시 하단 상세(${prof.itemTables.join('/')})가 \`${prof.foreignKey}\` 키로 동적 연동되는 Master-Detail 2-Grid ALV(02 · ZRALV0020) 구조가 적합합니다.`
        : 'Selected the best-fit COMM sample architecture based on data query structure and UI interaction requirements.',
    suggestedModule: mod,
    suggestedProgramId: `ZR_${mod}_${recommendedSampleType === '02' ? 'DTL' : 'MON'}_10`,
    suggestedTcode: `Z${mod}010`,
    suggestedTitle: prof.defaultTitleKo,
    detectedTables: Array.from(
      new Set([...prof.headerTables, ...(recommendedSampleType === '02' ? prof.itemTables : [])])
    ),
    requirementPrompt: `[SAP 모듈]: ${mod}\n[상단 테이블]: ${prof.headerTables.join(', ')}\n[하단 테이블]: ${prof.itemTables.join(', ')} (Key: ${prof.foreignKey})\n${txt.slice(0, 1800)}`,
    alternatives: [
      { sampleType: '01', sampleProgramId: 'ZRALV0010', label: 'Single ALV Grid', fitSummary: '단일 목록 조회 및 일괄 처리' },
      { sampleType: '02', sampleProgramId: 'ZRALV0020', label: 'Master-Detail 2-Grid ALV', fitSummary: '상단 헤더-하단 상세 2단 연동' },
      { sampleType: '03', sampleProgramId: 'ZRALV0030', label: 'Tree ALV Grid', fitSummary: '상하위 계층 트리 및 노드 집계' },
      { sampleType: '04', sampleProgramId: 'ZRALV0040', label: 'Multi-Dimensional Pivot Browser', fitSummary: '다차원 피벗 및 교차 집계 분석' },
    ],
    source: 'fallback',
    fallbackReason,
  };
}

/**
 * Safely clone COMM sample baseline structure (ZRALV0010~0040) without mutating originals,
 * and apply AI-generated spec content for the target project (never COMM).
 */
export function cloneAndApplyCommonSampleSpine(opts: {
  generatedSpec: ProgramSpec;
  sampleType: '01' | '02' | '03' | '04';
  targetProjectCode: string;
  programId: string;
  tcode: string;
  title: string;
  module: SapModule;
  author: string;
  targetSapRelease: string;
}): ProgramSpec {
  const baseline =
    SAMPLE_SPECS.find((s) => (s.sample_type || '01') === opts.sampleType) || SAMPLE_SPECS[0];
  const clonedBaseline: ProgramSpec = JSON.parse(JSON.stringify(baseline));
  const safeProjectCode =
    opts.targetProjectCode.trim().toUpperCase() === COMMON_PROJECT_CODE
      ? TEMP_PROJECT_CODE
      : opts.targetProjectCode.trim().toUpperCase() || TEMP_PROJECT_CODE;

  const nowDate = new Date().toISOString().split('T')[0];
  const nowDateTime = `${nowDate} ${new Date().toTimeString().slice(0, 8)}`;

  const cleanPid = opts.programId.trim().toUpperCase() || opts.generatedSpec.program_id;
  const cleanTcode = opts.tcode.trim().toUpperCase() || opts.generatedSpec.tcode;
  const cleanTitle = opts.title.trim() || opts.generatedSpec.title;

  return {
    ...clonedBaseline,
    ...opts.generatedSpec,
    id: `spec-mtg-${Date.now()}`,
    project_code: safeProjectCode,
    sample_type: opts.sampleType,
    program_id: cleanPid,
    tcode: cleanTcode,
    title: cleanTitle,
    module: opts.module,
    author: opts.author,
    created_date: nowDate,
    target_sap_release: opts.targetSapRelease || opts.generatedSpec.target_sap_release,
    is_system: false,
    layout: {
      ...clonedBaseline.layout,
      ...opts.generatedSpec.layout,
      grid_title: opts.generatedSpec.layout?.grid_title || cleanTitle,
    },
    authority_checks:
      opts.generatedSpec.authority_checks && opts.generatedSpec.authority_checks.length > 0
        ? opts.generatedSpec.authority_checks
        : clonedBaseline.authority_checks,
    sap_messages:
      opts.generatedSpec.sap_messages && opts.generatedSpec.sap_messages.length > 0
        ? opts.generatedSpec.sap_messages
        : clonedBaseline.sap_messages,
    custom_toolbar:
      opts.generatedSpec.custom_toolbar && opts.generatedSpec.custom_toolbar.length > 0
        ? opts.generatedSpec.custom_toolbar
        : clonedBaseline.custom_toolbar,
    toolbar_buttons:
      opts.generatedSpec.toolbar_buttons && opts.generatedSpec.toolbar_buttons.length > 0
        ? opts.generatedSpec.toolbar_buttons
        : clonedBaseline.toolbar_buttons,
    test_cases:
      opts.generatedSpec.test_cases && opts.generatedSpec.test_cases.length > 0
        ? opts.generatedSpec.test_cases
        : clonedBaseline.test_cases,
    data_flow:
      opts.generatedSpec.data_flow?.mermaid_code &&
      Object.keys(opts.generatedSpec.data_flow.node_details || {}).length > 0
        ? opts.generatedSpec.data_flow
        : generateRichDataFlowFromSpec({
            ...clonedBaseline,
            ...opts.generatedSpec,
            sample_type: opts.sampleType,
            program_id: cleanPid,
            tcode: cleanTcode,
            title: cleanTitle,
            module: opts.module,
          }),
    item_grid:
      opts.sampleType === '02'
        ? opts.generatedSpec.item_grid && opts.generatedSpec.item_grid.field_catalog?.length > 0
          ? {
              ...clonedBaseline.item_grid,
              ...opts.generatedSpec.item_grid,
              layout: {
                ...(clonedBaseline.item_grid?.layout || {
                  grid_title: opts.generatedSpec.item_grid.grid_title || '상세 내역',
                  zebra: true,
                  sel_mode: 'A',
                  cwidth_opt: true,
                }),
                ...opts.generatedSpec.item_grid.layout,
              },
            }
          : clonedBaseline.item_grid
        : undefined,
    change_history: [
      {
        id: `hist-${Date.now()}`,
        version: 'v1.0',
        changed_at: nowDateTime,
        author: opts.author,
        comment: `회의록 기반 AI 자동 설계 (${baseline.program_id} · 유형 ${opts.sampleType} 구조 복제)`,
      },
    ],
  };
}

// ============================================================================
// Incremental Spec Patching & Legacy ABAP Reverse Import
// ============================================================================

export interface AiSpecPatchResult {
  summary: string;
  title?: string;
  data_extraction_logic_append?: string;
  add_selection_params?: Array<Partial<SelectionParameter> & { name: string }>;
  add_field_catalog?: Array<Partial<AlvField> & { fieldname: string }>;
  add_authority_checks?: Array<{ object: string; field_values?: string; fields?: string; message_on_fail?: string; description?: string }>;
  add_messages?: Array<{ msgno?: string; msg_no?: string; msgty?: string; msg_type?: 'E' | 'W' | 'I' | 'S'; text: string }>;
  add_toolbar_buttons?: Array<{ function: string; text: string; quickinfo?: string; icon?: string }>;
}

export async function requestAiPatchSpec(
  instruction: string,
  currentSpec: ProgramSpec,
  options?: AiRequestOptions
): Promise<{ patch: AiSpecPatchResult; source: 'ai' | 'fallback'; fallbackReason?: AiFallbackReason; error?: string }> {
  try {
    const res = await authorizedFetch('/api/patch-spec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? 25_000,
      body: JSON.stringify({
        instruction,
        currentSpec,
        customTables: getCustomDdicTablesPayload([
          currentSpec.cds_view_table || '',
          ...(currentSpec.field_catalog || []).map((f) => f.ref_table || ''),
        ]),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.patch) {
        const source = data.source === 'fallback' ? 'fallback' : 'ai';
        return {
          patch: data.patch as AiSpecPatchResult,
          source,
          ...(source === 'fallback'
            ? { fallbackReason: normalizeServerFallbackReason(data.fallbackReason) || 'ai_error' }
            : {}),
        };
      }
      throw new AiFallbackTriggerError(500, 'AI 패치 응답 형식이 올바르지 않습니다.');
    }
    await throwForFailedAiResponse(res);
    throw new AiFallbackTriggerError(res.status, `서버 응답 오류 (${res.status})`);
  } catch (err: any) {
    if (shouldRethrowAiError(err)) throw err;
    return {
      patch: {
        summary: `요청 사항("${instruction.trim().slice(0, 32)}")을 로직 메모에 추가했습니다.`,
        data_extraction_logic_append: `\n- **AI 부분 패치 요청**: ${instruction.trim()}`,
      },
      source: 'fallback',
      fallbackReason: classifyFallbackReason(err),
      error: err?.message,
    };
  }
}

export function applyAiPatchToSpec(spec: ProgramSpec, patch: AiSpecPatchResult): ProgramSpec {
  const ts = Date.now();
  const nextSelection = [...(spec.selection_params || [])];
  const existingSelNames = new Set(nextSelection.map((p) => p.name.toUpperCase()));

  (patch.add_selection_params || []).forEach((p, idx) => {
    const cleanName = String(p.name || '').trim().toUpperCase().slice(0, 8);
    if (!cleanName || existingSelNames.has(cleanName)) return;
    existingSelNames.add(cleanName);
    nextSelection.push({
      id: `p-patch-${ts}-${idx}`,
      kind: p.kind || (cleanName.startsWith('S_') ? 'SELECT_OPTION' : 'PARAMETER'),
      name: cleanName,
      text: p.text || cleanName,
      datatype: p.datatype || 'CHAR',
      length: p.length || 10,
      ref_table: p.ref_table ? p.ref_table.toUpperCase() : '',
      ref_field: p.ref_field ? p.ref_field.toUpperCase() : '',
      obligatory: Boolean(p.obligatory),
      default_val: p.default_val || '',
      block_id: p.block_id || 'b1',
      block_title: p.block_title || '기본 조회 조건',
      matchcode_object: p.matchcode_object ? p.matchcode_object.toUpperCase() : undefined,
    });
  });

  const nextCatalog = [...(spec.field_catalog || [])];
  const existingFieldNames = new Set(nextCatalog.map((f) => f.fieldname.toUpperCase()));

  (patch.add_field_catalog || []).forEach((f, idx) => {
    const cleanFn = String(f.fieldname || '').trim().toUpperCase();
    if (!cleanFn || existingFieldNames.has(cleanFn)) return;
    existingFieldNames.add(cleanFn);
    const dt = f.datatype || 'CHAR';
    nextCatalog.push({
      id: `f-patch-${ts}-${idx}`,
      col_pos: nextCatalog.length + 1,
      fieldname: cleanFn,
      coltext: f.coltext || cleanFn,
      datatype: dt,
      outputlen: f.outputlen || (dt === 'CURR' ? 15 : dt === 'DATS' ? 10 : 14),
      just: f.just || (dt === 'CURR' || dt === 'DEC' || dt === 'INT4' ? 'R' : 'L'),
      key: Boolean(f.key),
      hotspot: Boolean(f.hotspot),
      checkbox: Boolean(f.checkbox),
      edit: Boolean(f.edit),
      do_sum: Boolean(f.do_sum),
      emphasize: f.emphasize || '',
      ref_table: f.ref_table ? f.ref_table.toUpperCase() : '',
      ref_field: f.ref_field ? f.ref_field.toUpperCase() : '',
      cfieldname: dt === 'CURR' ? f.cfieldname || 'WAERK' : '',
      drilldown_tcode: f.drilldown_tcode ? f.drilldown_tcode.toUpperCase() : '',
    });
  });

  const nextAuth = [...(spec.authority_checks || [])];
  (patch.add_authority_checks || []).forEach((a, idx) => {
    const obj = String(a.object || '').trim().toUpperCase();
    if (!obj || nextAuth.some((x) => x.object.toUpperCase() === obj)) return;
    nextAuth.push({
      id: `auth-patch-${ts}-${idx}`,
      object: obj,
      description: a.description || a.message_on_fail || `${obj} 실행 권한 점검`,
      fields: a.fields || a.field_values || "ACTVT = '03'",
      trigger_point: 'START-OF-SELECTION',
    });
  });

  const nextMessages = [...(spec.sap_messages || [])];
  (patch.add_messages || []).forEach((m, idx) => {
    const no = String(m.msg_no || m.msgno || String(nextMessages.length + 1).padStart(3, '0')).slice(0, 3);
    nextMessages.push({
      id: `msg-patch-${ts}-${idx}`,
      msg_class: spec.message_class || 'Z01',
      msg_no: no,
      msg_type: (m.msg_type || m.msgty || 'E') as 'E' | 'W' | 'I' | 'S',
      text: m.text || '처리에 실패했습니다.',
      trigger_condition: '검증 실패 시',
    });
  });

  const nextToolbar = [...(spec.custom_toolbar || [])];
  (patch.add_toolbar_buttons || []).forEach((b, idx) => {
    const fn = String(b.function || '').trim().toUpperCase();
    if (!fn || nextToolbar.some((x) => x.function.toUpperCase() === fn)) return;
    nextToolbar.push({
      id: `tb-patch-${ts}-${idx}`,
      function: fn,
      text: b.text || fn,
      quickinfo: b.quickinfo || b.text || fn,
      icon: b.icon || 'ICON_EXECUTE_OBJECT',
      disabled: false,
      visible: true,
      is_standard: false,
    });
  });

  const appendedLogic = patch.data_extraction_logic_append?.trim()
    ? `${spec.data_extraction_logic || ''}\n\n${patch.data_extraction_logic_append.trim()}`.trim()
    : spec.data_extraction_logic;

  return {
    ...spec,
    title: patch.title?.trim() || spec.title,
    data_extraction_logic: appendedLogic,
    selection_params: nextSelection,
    field_catalog: nextCatalog,
    authority_checks: nextAuth,
    sap_messages: nextMessages,
    custom_toolbar: nextToolbar,
    mock_rows: backfillMockRowsForFields(spec.mock_rows || [], nextCatalog, nextCatalog),
  };
}

export async function requestLegacyAbapImport(
  abapSource: string,
  targetSapRelease: string = 'SAP S/4HANA 2023 / ECC 6.0',
  options?: AiRequestOptions
): Promise<{ spec: ProgramSpec; detectedTables: string[]; source: 'ai' | 'fallback'; fallbackReason?: AiFallbackReason; error?: string }> {
  try {
    const res = await authorizedFetch('/api/reverse-import-abap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options?.signal,
      timeoutMs: options?.timeoutMs ?? 30_000,
      body: JSON.stringify({ abapSource, targetSapRelease }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.spec) {
        const rawSpec = data.spec as any;
        // Normalize legacy field shape if needed
        const authChecks = Array.isArray(rawSpec.authority_checks)
          ? rawSpec.authority_checks.map((a: any, i: number) => ({
              id: a.id || `auth-imp-${Date.now()}-${i}`,
              object: String(a.object || 'S_TCODE').toUpperCase(),
              description: String(a.description || a.message_on_fail || 'Legacy AUTHORITY-CHECK 역분석 항목'),
              fields: String(a.fields || a.field_values || "ACTVT = '03'"),
              trigger_point: String(a.trigger_point || 'START-OF-SELECTION'),
            }))
          : [];

        const source = data.source === 'fallback' ? 'fallback' : 'ai';
        return {
          spec: {
            ...rawSpec,
            authority_checks: authChecks,
          },
          detectedTables: Array.isArray(data.detectedTables) ? data.detectedTables : [],
          source,
          ...(source === 'fallback'
            ? { fallbackReason: normalizeServerFallbackReason(data.fallbackReason) || 'ai_error' }
            : {}),
        };
      }
      throw new AiFallbackTriggerError(500, 'ABAP 역분석 AI 응답 형식이 올바르지 않습니다.');
    }
    await throwForFailedAiResponse(res);
    throw new AiFallbackTriggerError(res.status, `서버 응답 오류 (${res.status})`);
  } catch (err: any) {
    if (shouldRethrowAiError(err)) throw err;
    const fallbackSpec = parseLegacyAbapClientFallback(abapSource, targetSapRelease);
    return {
      spec: fallbackSpec.spec,
      detectedTables: fallbackSpec.detectedTables,
      source: 'fallback',
      fallbackReason: classifyFallbackReason(err),
      error: err?.message,
    };
  }
}

function parseLegacyAbapClientFallback(abapSource: string, targetSapRelease: string) {
  const ts = Date.now();
  const reportMatch = abapSource.match(/\bREPORT\s+([A-Z0-9_]+)/i);
  const programId = (reportMatch?.[1] || 'Z_LEGACY_IMPORT').toUpperCase().slice(0, 30);

  const selection_params: SelectionParameter[] = [];
  const paramRegex = /^\s*PARAMETERS?\s*:\s*([A-Z0-9_]+)\s+(?:TYPE|LIKE)\s+([A-Z0-9_-]+)/gim;
  let m: RegExpExecArray | null;
  while ((m = paramRegex.exec(abapSource)) !== null) {
    const name = m[1].toUpperCase().slice(0, 8);
    const refParts = m[2].toUpperCase().split('-');
    selection_params.push({
      id: `p-leg-${ts}-${selection_params.length}`,
      kind: 'PARAMETER',
      name,
      text: name,
      ref_table: refParts.length > 1 ? refParts[0] : '',
      ref_field: refParts.length > 1 ? refParts[1] : refParts[0],
      datatype: 'CHAR',
      length: 10,
      obligatory: /OBLIGATORY/i.test(m[0]),
      default_val: '',
      block_id: 'b1',
      block_title: 'Legacy Selection Screen',
    });
  }

  const selOptRegex = /^\s*SELECT-OPTIONS?\s*:\s*([A-Z0-9_]+)\s+FOR\s+([A-Z0-9_-]+)/gim;
  while ((m = selOptRegex.exec(abapSource)) !== null) {
    const name = m[1].toUpperCase().slice(0, 8);
    const refParts = m[2].toUpperCase().split('-');
    selection_params.push({
      id: `p-leg-${ts}-${selection_params.length}`,
      kind: 'SELECT_OPTION',
      name,
      text: name,
      ref_table: refParts.length > 1 ? refParts[0] : '',
      ref_field: refParts.length > 1 ? refParts[1] : refParts[0],
      datatype: 'CHAR',
      length: 10,
      obligatory: false,
      default_val: '',
      block_id: 'b1',
      block_title: 'Legacy Selection Screen',
    });
  }

  const tablesMatch = Array.from(
    new Set(
      (abapSource.match(/\b(VBAK|VBAP|KNA1|LIKP|LIPS|VBRK|VBRP|EKKO|EKPO|MARA|MAKT|BKPF|BSEG|ACDOCA|CSKS|COEP|T001|Z[A-Z0-9_]{3,})\b/gi) || []).map(
        (t) => t.toUpperCase()
      )
    )
  );

  const authMatches = Array.from(abapSource.matchAll(/AUTHORITY-CHECK\s+OBJECT\s+'([A-Z0-9_]+)'/gi)).map((a, idx) => ({
    id: `auth-leg-${ts}-${idx}`,
    object: a[1].toUpperCase(),
    description: `${a[1].toUpperCase()} 권한 점검 (Legacy Import)`,
    fields: "ACTVT = '03'",
    trigger_point: 'START-OF-SELECTION',
  }));

  const fields: AlvField[] = [
    { id: `f-leg-${ts}-0`, col_pos: 1, fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', icon_type: 'LIGHTS' },
    { id: `f-leg-${ts}-1`, col_pos: 2, fieldname: 'DOC_NO', coltext: '전표번호', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '' },
    { id: `f-leg-${ts}-2`, col_pos: 3, fieldname: 'AMOUNT', coltext: '금액', datatype: 'CURR', outputlen: 15, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', cfieldname: 'WAERK' },
    { id: `f-leg-${ts}-3`, col_pos: 4, fieldname: 'WAERK', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '' },
  ];

  return {
    detectedTables: tablesMatch.length > 0 ? tablesMatch : ['VBAK'],
    spec: {
      id: `spec-leg-${ts}`,
      sample_type: '01',
      program_id: programId,
      tcode: programId.slice(0, 12),
      title: `${programId} (Legacy ABAP Reverse Import)`,
      module: 'SD' as SapModule,
      author: 'Legacy Importer',
      created_date: new Date().toISOString().slice(0, 10),
      target_sap_release: targetSapRelease,
      program_type: 'REPORT' as const,
      business_purpose: `### Legacy ABAP 역분석\n- 원본 프로그램 \`${programId}\` 소스 코드로부터 자동 추출된 사양서입니다.`,
      data_extraction_logic: `### 추출 대상 테이블\n- ${tablesMatch.join(', ') || '표준 테이블'}\n\n\`\`\`abap\n${abapSource.slice(0, 1000)}\n\`\`\``,
      selection_params: selection_params.length > 0 ? selection_params : [
        { id: `p-leg-def`, kind: 'PARAMETER', name: 'P_BUKRS', text: '회사코드', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', block_id: 'b1', block_title: '기본 조건' },
      ],
      field_catalog: fields,
      authority_checks: authMatches,
      layout: { grid_title: `${programId} Legacy ALV`, zebra: true, sel_mode: 'A', cwidth_opt: true, excp_fname: 'ZICON', excp_led: true, show_row_numbers: true },
      custom_toolbar: [],
      test_cases: [],
      mock_rows: backfillMockRowsForFields([], fields, fields),
    } as ProgramSpec,
  };
}



