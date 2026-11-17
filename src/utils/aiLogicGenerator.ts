import { AlvField, ProgramSpec, SapModule, SelectionParameter } from '../types/sap';
import { SAMPLE_SPECS } from '../data/sampleSpecs';
import { COMMON_PROJECT_CODE, TEMP_PROJECT_CODE } from './projectStorage';
import { getDD02LTables, getDD03LFields } from './sapDdicStorage';
import { authorizedFetch } from './authorizedFetch';

/**
 * AI Data Extraction Logic Generator & Context-Aware Markdown Suggestion
 */

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
  req: MarkdownSuggestionRequest
): Promise<{ markdown: string; source: 'ai' | 'fallback'; error?: string }> {
  const { spec, section, sectionTitle, nodeInfo, currentValue } = req;

  try {
    const res = await authorizedFetch('/api/suggest-markdown', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `서버 응답 오류 (${res.status})`);
  } catch (err: any) {
    console.warn('Backend AI markdown suggestion failed, using screen-aware fallback:', err);
    const fallback = generateSmartMarkdownFallback(req);
    return { markdown: fallback, source: 'fallback', error: err.message };
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
  const nId = nodeInfo?.id || 'A';
  const nLabel = nodeInfo?.label || '단계 처리';
  const prevText = nodeInfo?.prevNodes?.length ? nodeInfo.prevNodes.join(', ') : '프로그램 기동';
  const nextText = nodeInfo?.nextNodes?.length ? nodeInfo.nextNodes.join(', ') : '화면 반환 / 종료';
  const upperLabel = nLabel.toUpperCase();

  if (upperLabel.includes('INITIAL') || upperLabel.includes('시작')) {
    return `### [${nId}] ${nLabel}
- **처리 목적**: \`${spec.program_id}\` (\`${spec.tcode}\`) 실행 시 전역 변수 및 ${sampleTypeLabel} 제어 객체 초기화
- **주요 로직**:
  - ${paramList ? `선택화면 기본값(${paramList}) 자동 세팅` : '조회 기준일자 및 회사코드 기본값 세팅'}
  - \`AUTHORITY-CHECK\`를 통한 ${spec.module} 모듈 실행 권한 검증
- **후속 흐름**: ${nextText}`;
  }

  if (upperLabel.includes('SELECTION') || upperLabel.includes('선택') || upperLabel.includes('조회 조건') || upperLabel.includes('입력')) {
    return `### [${nId}] ${nLabel}
- **선행 단계**: ${prevText}
- **화면 파라미터 구성**: ${paramList || '표준 조회 조건 파라미터'}
- **입력값 검증 규칙**:
  - 필수 입력 항목 누락 여부 및 유효 범위(\`LOW <= HIGH\`) 점검
  - 오류 발생 시 \`MESSAGE E001\` 출력 및 해당 입력 필드로 커서 이동
- **후속 흐름**: ${nextText}`;
  }

  if (upperLabel.includes('SELECT') || upperLabel.includes('추출') || upperLabel.includes('조회') || nodeInfo?.shape === 'cylinder') {
    return `### [${nId}] ${nLabel}
- **선행 단계**: ${prevText}
- **대상 테이블**: ${refTables.length > 0 ? refTables.map((t) => `\`${t}\``).join(', ') : `${spec.module} 원천 테이블`}
- **추출 및 조인 로직**:
  - 선택 조건(${paramList || '조회 조건'}) 기반으로 원천 테이블 조회 후 \`GT_DATA\` 적재
  - 키 필드(${keyFields || '주요 식별자'}) 기준 정렬 및 불필요한 중복 조회 방지(\`FOR ALL ENTRIES\` 전 \`IS NOT INITIAL\` 체크)
- **후속 흐름**: ${nextText}`;
  }

  if (upperLabel.includes('ALV') || upperLabel.includes('PBO') || upperLabel.includes('출력') || upperLabel.includes('바인딩') || upperLabel.includes('갱신')) {
    return `### [${nId}] ${nLabel}
- **선행 단계**: ${prevText}
- **화면 구성 (${sampleTypeLabel})**:
  - 그리드 타이틀: \`${spec.layout?.grid_title || spec.title}\` (Zebra: ${spec.layout?.zebra ? 'ON' : 'OFF'}, 선택모드: \`${spec.layout?.sel_mode || 'A'}\`)
  - 필드 카탈로그(${spec.field_catalog?.length || 0}개 컬럼) 및 신호등(\`ZICON\`) 바인딩${sumFields ? `\n  - 자동 합계(\`DO_SUM\`): ${sumFields}` : ''}${toolbarText ? `\n  - 툴바 버튼: ${toolbarText}` : ''}
- **호출 메서드**: \`SET_TABLE_FOR_FIRST_DISPLAY\` / \`REFRESH_TABLE_DISPLAY\`
- **후속 흐름**: ${nextText}`;
  }

  if (upperLabel.includes('PAI') || upperLabel.includes('명령') || upperLabel.includes('드릴다운') || upperLabel.includes('이벤트') || upperLabel.includes('BAPI')) {
    return `### [${nId}] ${nLabel}
- **선행 단계**: ${prevText}
- **이벤트 및 사용자 명령 처리**:${hotspotFields ? `\n  - 핫스팟/더블클릭 드릴다운: ${hotspotFields}` : '\n  - 행 선택/더블클릭 이벤트 핸들러(`HANDLE_DOUBLE_CLICK`, `HANDLE_HOTSPOT_CLICK`) 처리'}${toolbarText ? `\n  - 커스텀 툴바(\`USER_COMMAND\`): ${toolbarText}` : ''}
  - 처리 완료 후 \`REFRESH_TABLE_DISPLAY\`로 화면 최신 상태 반영
- **후속 흐름**: ${nextText}`;
  }

  return `### [${nId}] ${nLabel}
- **선행 단계**: ${prevText}
- **처리 사양 (${spec.program_id} / ${sampleTypeLabel})**:
  - ${refTables.length > 0 ? `참조 테이블(${refTables.map((t) => `\`${t}\``).join(', ')}) 기반으로` : '내부 테이블 데이터 기준으로'} 해당 단계의 비즈니스 검증 및 가공 로직 수행
  - 주요 관리 필드: ${keyFields || `${spec.field_catalog?.length || 0}개 출력 컬럼`}
- **후속 흐름**: ${nextText}`;
}

export interface GenerateLogicRequest {
  business_purpose: string;
  module: string;
  program_id: string;
  title: string;
  existing_fields?: string[];
}

export async function requestAiLogicGeneration(req: GenerateLogicRequest): Promise<{ logic: string; source: 'ai' | 'fallback'; error?: string }> {
  try {
    const res = await authorizedFetch('/api/generate-logic', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `서버 응답 오류 (${res.status})`);
  } catch (err: any) {
    console.warn('Backend AI generation failed, using intelligent rule-based SAP architect generator:', err);
    // Intelligent fallback generator tailored to the SAP module
    const fallback = generateSmartFallbackLogic(req);
    return { logic: fallback, source: 'fallback', error: err.message };
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
  error?: string;
}

export async function requestAiFullSpecDraft(
  req: FullSpecDraftRequest
): Promise<FullSpecDraftResponse> {
  try {
    const res = await authorizedFetch('/api/generate-full-spec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...req,
        customTables: getCustomDdicTablesPayload(),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.spec && Array.isArray(data.spec.field_catalog)) {
        return {
          spec: data.spec as ProgramSpec,
          detectedTables: Array.isArray(data.detectedTables) ? data.detectedTables : [],
          source: data.source === 'fallback' ? 'fallback' : 'ai',
        };
      }
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `서버 응답 오류 (${res.status})`);
  } catch (err: any) {
    console.warn('Backend full spec draft failed, using intelligent client fallback:', err);
    return {
      ...buildClientFullSpecFallback(req),
      source: 'fallback',
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
  error?: string;
}

export async function requestAiReverseExtract(
  req: ReverseExtractRequest
): Promise<ReverseExtractResponse> {
  try {
    const res = await authorizedFetch('/api/extract-spec-elements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        return {
          detectedTables: Array.isArray(data.detectedTables) ? data.detectedTables : [],
          suggestedSelectionParams: data.suggestedSelectionParams,
          suggestedFieldCatalog: data.suggestedFieldCatalog,
          source: data.source === 'fallback' ? 'fallback' : 'ai',
        };
      }
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `서버 응답 오류 (${res.status})`);
  } catch (err: any) {
    console.warn('Backend reverse extract failed, using rule-based SAP fallback:', err);
    return {
      ...buildClientReverseExtractFallback(req),
      source: 'fallback',
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
  fullCatalog: AlvField[]
): Record<string, any>[] {
  if (addedFields.length === 0) return existingRows;
  const baseRows = existingRows.length > 0 ? existingRows : [{}, {}, {}, {}, {}];
  const partnerNames = ['(주)삼성전자 수원공장', '현대모비스 남양연구소', 'LG에너지솔루션 오창공장', 'SK하이닉스 이천캠퍼스', '포스코 포항제철소'];
  const amounts = [45000000, 38200000, 19800000, 52400000, 14500000];

  return baseRows.map((row, rIdx) => {
    const next = { ...row };
    fullCatalog.forEach((f) => {
      if (next[f.fieldname] !== undefined && next[f.fieldname] !== '') return;
      const fn = f.fieldname.toUpperCase();
      if (fn === 'ZICON' || fn === 'STATUS' || fn === 'LIGHTS') {
        next[f.fieldname] = rIdx === 2 ? '2' : rIdx === 4 ? '3' : '1';
      } else if (fn.includes('VBELN') || fn.includes('DOC')) {
        next[f.fieldname] = `00100000${45 + rIdx}`;
      } else if (fn.includes('EBELN')) {
        next[f.fieldname] = `450001928${rIdx}`;
      } else if (fn.includes('BELNR')) {
        next[f.fieldname] = `100000001${rIdx}`;
      } else if (fn.includes('KUNNR')) {
        next[f.fieldname] = `00001000${10 + rIdx}`;
      } else if (fn.includes('MATNR')) {
        next[f.fieldname] = `MAT-PART-00${rIdx + 1}`;
      } else if (fn.includes('KOSTL')) {
        next[f.fieldname] = `1000CC0${rIdx + 1}`;
      } else if (fn.includes('KSTAR')) {
        next[f.fieldname] = `51000${rIdx + 1}00`;
      } else if (f.datatype === 'DATS' || fn.includes('DAT')) {
        next[f.fieldname] = `2026.10.${String(10 + rIdx * 3).padStart(2, '0')}`;
      } else if (f.datatype === 'CURR' || fn.includes('NETWR') || fn.includes('DMBTR') || fn.includes('WKG')) {
        next[f.fieldname] = amounts[rIdx % amounts.length];
      } else if (f.datatype === 'DEC' || f.datatype === 'INT4' || fn.includes('MENGE')) {
        next[f.fieldname] = (rIdx + 1) * 25;
      } else if (fn.includes('WAER') || fn.includes('CURR')) {
        next[f.fieldname] = 'KRW';
      } else if (fn.includes('MEINS') || fn.includes('VRKME')) {
        next[f.fieldname] = 'EA';
      } else if (fn.includes('NAME') || fn.includes('MAKTX') || fn.includes('SGTXT')) {
        next[f.fieldname] = fn.includes('NAME')
          ? partnerNames[rIdx % partnerNames.length]
          : `${f.coltext} 내역 ${rIdx + 1}`;
      } else if (f.datatype === 'NUMC') {
        next[f.fieldname] = String(rIdx + 1).padStart(f.outputlen || 4, '0');
      } else {
        next[f.fieldname] = `${f.coltext || f.fieldname} ${rIdx + 1}`;
      }
    });
    return next;
  });
}

function buildClientFullSpecFallback(req: FullSpecDraftRequest): { spec: ProgramSpec; detectedTables: string[] } {
  const ts = Date.now();
  const mod: SapModule =
    req.module && req.module !== 'AUTO'
      ? req.module
      : req.requirementPrompt.includes('구매') || req.requirementPrompt.includes('발주')
      ? 'MM'
      : req.requirementPrompt.includes('회계') || req.requirementPrompt.includes('전표') || req.requirementPrompt.includes('채권')
      ? 'FI'
      : req.requirementPrompt.includes('원가') || req.requirementPrompt.includes('코스트')
      ? 'CO'
      : req.requirementPrompt.includes('공통 영역') || req.requirementPrompt.includes('공통영역') || req.requirementPrompt.includes('공통코드')
      ? 'CM'
      : 'SD';

  const programId = (req.programId || `Z${mod}_R_COPILOT`).toUpperCase();
  const tcode = (req.tcode || `Z${mod}010`).toUpperCase();
  const fields: AlvField[] = [
    { id: `f-${ts}-1`, col_pos: 1, fieldname: 'ZICON', coltext: 'Status', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', icon_type: 'LIGHTS' },
    { id: `f-${ts}-2`, col_pos: 2, fieldname: 'DOC_NO', coltext: '전표번호', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, checkbox: false, edit: false, do_sum: false, emphasize: '', drilldown_tcode: mod === 'MM' ? 'ME23N' : mod === 'FI' ? 'FB03' : 'VA03', ref_table: 'VBAK', ref_field: 'VBELN' },
    { id: `f-${ts}-3`, col_pos: 3, fieldname: 'DOC_DATE', coltext: '기준일자', datatype: 'DATS', outputlen: 10, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'VBAK', ref_field: 'ERDAT' },
    { id: `f-${ts}-4`, col_pos: 4, fieldname: 'PARTNER_NM', coltext: '거래처명', datatype: 'CHAR', outputlen: 30, just: 'L', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'KNA1', ref_field: 'NAME1' },
    { id: `f-${ts}-5`, col_pos: 5, fieldname: 'NETWR', coltext: '금액', datatype: 'CURR', outputlen: 15, just: 'R', key: false, hotspot: false, checkbox: false, edit: false, do_sum: true, emphasize: '', cfieldname: 'WAERK', ref_table: 'VBAK', ref_field: 'NETWR' },
    { id: `f-${ts}-6`, col_pos: 6, fieldname: 'WAERK', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', key: false, hotspot: false, checkbox: false, edit: false, do_sum: false, emphasize: '', ref_table: 'VBAK', ref_field: 'WAERK' },
  ];

  const selectionParams: SelectionParameter[] = [
    { id: `p-${ts}-1`, kind: 'PARAMETER', name: 'P_BUKRS', text: '회사코드 (Company Code)', ref_table: 'T001', ref_field: 'BUKRS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', low: '1000', block_id: 'b1', block_title: '기본 조회 조건' },
    { id: `p-${ts}-2`, kind: 'SELECT_OPTION', name: 'S_BUDAT', text: '기준일자 (Doc Date)', ref_table: 'VBAK', ref_field: 'ERDAT', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', low: '2026.10.01', high: '2026.10.31', sign: 'I', option: 'BT', block_id: 'b1', block_title: '기본 조회 조건' },
    { id: `p-${ts}-3`, kind: 'RADIOBUTTON', name: 'P_ALL', text: '전체 조회 (All)', datatype: 'CHAR', length: 1, obligatory: false, default_val: 'X', low: 'X', block_id: 'b2', block_title: '처리 옵션', radio_group: 'R1' },
    { id: `p-${ts}-4`, kind: 'RADIOBUTTON', name: 'P_WARN', text: '지연/예외 건만 조회', datatype: 'CHAR', length: 1, obligatory: false, default_val: '', low: '', block_id: 'b2', block_title: '처리 옵션', radio_group: 'R1' },
  ];

  const mockRows = backfillMockRowsForFields([], fields, fields);

  return {
    detectedTables: ['VBAK', 'VBAP', 'KNA1'],
    spec: {
      id: `spec-ai-${ts}`,
      sample_type: req.sampleType || '01',
      program_id: programId.startsWith('Z') || programId.startsWith('Y') ? programId : `Z${programId}`,
      tcode: tcode.startsWith('Z') || tcode.startsWith('Y') ? tcode : `Z${tcode}`,
      title: req.requirementPrompt.slice(0, 48) || `${mod} ALV Report`,
      module: mod,
      author: 'Josh Lee',
      created_date: new Date().toISOString().slice(0, 10),
      target_sap_release: req.targetSapRelease || 'SAP S/4HANA 2023 / ECC 6.0',
      program_type: 'REPORT',
      business_purpose: `### 개발 목적\n- ${req.requirementPrompt}`,
      data_extraction_logic: generateSmartFallbackLogic({
        business_purpose: req.requirementPrompt,
        module: mod,
        program_id: programId,
        title: req.requirementPrompt.slice(0, 40),
      }),
      selection_params: selectionParams,
      field_catalog: fields,
      layout: {
        grid_title: req.requirementPrompt.slice(0, 50) || `${mod} ALV Grid`,
        zebra: true,
        sel_mode: 'A',
        cwidth_opt: true,
        excp_fname: 'ZICON',
        excp_led: true,
        show_row_numbers: true,
      },
      custom_toolbar: [],
      test_cases: [
        { id: `tc-${ts}-1`, scenario: '정상 조회 및 합계 검증', condition: '회사코드 1000 입력 후 실행', expected: 'ALV 그리드 출력 및 금액 합계 표시' },
      ],
      mock_rows: mockRows,
    },
  };
}

function buildClientReverseExtractFallback(req: ReverseExtractRequest) {
  const upper = `${req.businessPurpose}\n${req.dataExtractionLogic}`.toUpperCase();
  const existingParams = new Set(req.existingSelectionParams.map((p) => p.name.toUpperCase()));
  const existingFields = new Set(req.existingFieldCatalog.map((f) => f.fieldname.toUpperCase()));
  const knownTables = ['VBAK', 'VBAP', 'KNA1', 'LIKP', 'LIPS', 'EKKO', 'EKPO', 'MARA', 'MAKT', 'BKPF', 'BSEG', 'ACDOCA', 'CSKS', 'COEP', 'T001'];
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
}

export interface MeetingMinutesResult {
  title: string;
  detectedModule: SapModule;
  minutesMarkdown: string;
  source: 'ai' | 'fallback';
}

export async function requestAiMeetingMinutes(
  req: MeetingMinutesRequest
): Promise<MeetingMinutesResult> {
  try {
    const res = await authorizedFetch('/api/summarize-meeting-minutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data.minutesMarkdown === 'string') {
        return {
          title: data.title || '신규 SAP 프로그램 설계 회의',
          detectedModule: data.detectedModule || 'SD',
          minutesMarkdown: data.minutesMarkdown,
          source: data.source === 'fallback' ? 'fallback' : 'ai',
        };
      }
    }
  } catch (err) {
    console.warn('Meeting minutes endpoint unavailable, using local fallback:', err);
  }

  const combined = `${req.rawTranscript}\n${req.supplementalNotes || ''}`;
  const mod: SapModule =
    combined.includes('구매') || combined.includes('발주')
      ? 'MM'
      : combined.includes('회계') || combined.includes('전표')
      ? 'FI'
      : combined.includes('원가') || combined.includes('코스트')
      ? 'CO'
      : combined.includes('공통 영역') || combined.includes('공통영역') || combined.includes('공통코드')
      ? 'CM'
      : 'SD';

  const base = req.existingMinutes?.trim()
    ? req.existingMinutes.trim()
    : `## 1. 회의 개요\n- **대상 프로젝트**: ${req.projectName || 'SAP 프로젝트'}\n- **추정 모듈**: \`${mod}\`\n\n## 2. 핵심 요구사항\n${req.rawTranscript
        .split('\n')
        .filter(Boolean)
        .map((l) => `- ${l.trim()}`)
        .join('\n')}`;

  const supp = req.supplementalNotes?.trim()
    ? `\n\n### 보충 논의 사항\n${req.supplementalNotes
        .split('\n')
        .filter(Boolean)
        .map((l) => `- ${l.trim()}`)
        .join('\n')}`
    : '';

  return {
    title: `${mod} 프로그램 설계 회의록`,
    detectedModule: mod,
    minutesMarkdown: `${base}${supp}`,
    source: 'fallback',
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
}

export interface SampleRecommendationResult {
  recommendedSampleType: '01' | '02' | '03' | '04';
  confidenceReason: string;
  suggestedModule: SapModule;
  suggestedProgramId: string;
  suggestedTcode: string;
  suggestedTitle: string;
  requirementPrompt: string;
  alternatives: SampleRecommendationAlternative[];
  source: 'ai' | 'fallback';
}

export async function requestAiSampleRecommendation(
  req: SampleRecommendationRequest
): Promise<SampleRecommendationResult> {
  try {
    const res = await authorizedFetch('/api/recommend-sample-from-minutes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.recommendedSampleType) {
        return {
          recommendedSampleType: data.recommendedSampleType,
          confidenceReason: data.confidenceReason || '',
          suggestedModule: data.suggestedModule || 'SD',
          suggestedProgramId: data.suggestedProgramId || 'ZR_SD_MON_10',
          suggestedTcode: data.suggestedTcode || 'ZSD010',
          suggestedTitle: data.suggestedTitle || '업무 현황 모니터링 프로그램',
          requirementPrompt: data.requirementPrompt || req.minutesMarkdown.slice(0, 1500),
          alternatives: Array.isArray(data.alternatives) ? data.alternatives : [],
          source: data.source === 'fallback' ? 'fallback' : 'ai',
        };
      }
    }
  } catch (err) {
    console.warn('Recommend sample endpoint unavailable, using local fallback:', err);
  }

  const txt = req.minutesMarkdown || '';
  const mod: SapModule =
    txt.includes('원가') || txt.includes('코스트')
      ? 'CO'
      : txt.includes('구매') || txt.includes('발주')
      ? 'MM'
      : txt.includes('회계') || txt.includes('전표')
      ? 'FI'
      : txt.includes('공통 영역') || txt.includes('공통영역') || txt.includes('공통코드')
      ? 'CM'
      : 'SD';

  const recommendedSampleType: '01' | '02' | '03' | '04' =
    txt.includes('계층') || txt.includes('트리')
      ? '03'
      : txt.includes('피벗') || txt.includes('교차')
      ? '04'
      : txt.includes('품목') || txt.includes('헤더') || txt.includes('상세')
      ? '02'
      : '01';

  return {
    recommendedSampleType,
    confidenceReason: 'Selected the best-fit COMM sample architecture based on data query structure and UI interaction requirements.',
    suggestedModule: mod,
    suggestedProgramId: `ZR_${mod}_MON_10`,
    suggestedTcode: `Z${mod}010`,
    suggestedTitle: `${mod} 업무 현황 조회 리포트`,
    requirementPrompt: txt.slice(0, 1800),
    alternatives: [
      { sampleType: '01', sampleProgramId: 'ZRALV0010', label: 'Single ALV Grid', fitSummary: '단일 목록 조회 및 일괄 처리' },
      { sampleType: '02', sampleProgramId: 'ZRALV0020', label: 'Master-Detail 2-Grid ALV', fitSummary: '헤더-품목 상하 분할 연동' },
      { sampleType: '03', sampleProgramId: 'ZRALV0030', label: 'Tree ALV Grid', fitSummary: '상하위 계층 트리 및 노드 집계' },
      { sampleType: '04', sampleProgramId: 'ZRALV0040', label: 'Multi-Dimensional Pivot Browser', fitSummary: '다차원 피벗 및 교차 집계 분석' },
    ],
    source: 'fallback',
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
    toolbar_buttons:
      opts.generatedSpec.toolbar_buttons && opts.generatedSpec.toolbar_buttons.length > 0
        ? opts.generatedSpec.toolbar_buttons
        : clonedBaseline.toolbar_buttons,
    item_grid:
      opts.sampleType === '02'
        ? opts.generatedSpec.item_grid || clonedBaseline.item_grid
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
  currentSpec: ProgramSpec
): Promise<{ patch: AiSpecPatchResult; source: 'ai' | 'fallback'; error?: string }> {
  try {
    const res = await authorizedFetch('/api/patch-spec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
        return {
          patch: data.patch as AiSpecPatchResult,
          source: data.source === 'fallback' ? 'fallback' : 'ai',
        };
      }
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `서버 응답 오류 (${res.status})`);
  } catch (err: any) {
    return {
      patch: {
        summary: `요청 사항("${instruction.trim().slice(0, 32)}")을 로직 메모에 추가했습니다.`,
        data_extraction_logic_append: `\n- **AI 부분 패치 요청**: ${instruction.trim()}`,
      },
      source: 'fallback',
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
  targetSapRelease: string = 'SAP S/4HANA 2023 / ECC 6.0'
): Promise<{ spec: ProgramSpec; detectedTables: string[]; source: 'ai' | 'fallback'; error?: string }> {
  try {
    const res = await authorizedFetch('/api/reverse-import-abap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

        return {
          spec: {
            ...rawSpec,
            authority_checks: authChecks,
          },
          detectedTables: Array.isArray(data.detectedTables) ? data.detectedTables : [],
          source: data.source === 'fallback' ? 'fallback' : 'ai',
        };
      }
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `서버 응답 오류 (${res.status})`);
  } catch (err: any) {
    const fallbackSpec = parseLegacyAbapClientFallback(abapSource, targetSapRelease);
    return {
      spec: fallbackSpec.spec,
      detectedTables: fallbackSpec.detectedTables,
      source: 'fallback',
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



