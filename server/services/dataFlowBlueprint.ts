import type { SapModuleCode } from './sapStandardCatalog.ts';
import { getSapModuleBlueprint } from './sapStandardCatalog.ts';

export interface DataFlowBuildOptions {
  module: string;
  sampleType?: string;
  programId?: string;
  tcode?: string;
  title?: string;
  detectedTables?: string[];
  selectionParams?: Array<{ name?: string; text?: string; ref_table?: string; ref_field?: string; obligatory?: boolean }>;
  headerFields?: Array<{ fieldname?: string; coltext?: string; ref_table?: string; ref_field?: string; hotspot?: boolean; drilldown_tcode?: string; do_sum?: boolean }>;
  itemFields?: Array<{ fieldname?: string; coltext?: string; ref_table?: string; ref_field?: string; hotspot?: boolean; drilldown_tcode?: string }>;
  foreignKey?: string;
  authorityChecks?: Array<{ object?: string; fields?: string; trigger_point?: string; description?: string }>;
  sapMessages?: Array<{ msg_class?: string; msg_no?: string; msg_type?: string; text?: string; trigger_condition?: string }>;
  customToolbar?: Array<{ function?: string; text?: string; quickinfo?: string }>;
}

export function buildModuleDataFlowBlueprint(opts: DataFlowBuildOptions): {
  title: string;
  mermaid_code: string;
  node_details: Record<string, { label: string; markdown: string }>;
  active_node_id: string;
} {
  const bp = getSapModuleBlueprint(opts.module);
  const mod = bp.module as SapModuleCode;
  const sampleType = ['01', '02', '03', '04'].includes(String(opts.sampleType)) ? String(opts.sampleType) : '01';
  const programId = (opts.programId || bp.defaultProgramId).toUpperCase();
  const tcode = (opts.tcode || bp.defaultTcode).toUpperCase();
  const title = opts.title || bp.defaultTitleKo;
  const fk = (opts.foreignKey || bp.foreignKey || 'BELNR').toUpperCase();

  const selList = (opts.selectionParams && opts.selectionParams.length > 0 ? opts.selectionParams : bp.selectionParams).slice(0, 6);
  const selSummary = selList
    .map((p) => `\`${p.name}\`(${p.text || p.ref_field || ''}${p.obligatory ? ', 필수' : ''})`)
    .join(', ');
  const obligatoryNames = selList.filter((p) => p.obligatory).map((p) => `\`${p.name}\``).join(', ') || `\`${selList[0]?.name || 'P_BUKRS'}\``;

  const hdrFields = (opts.headerFields && opts.headerFields.length > 0 ? opts.headerFields : bp.headerFields).slice(0, 8);
  const itmFields = (opts.itemFields && opts.itemFields.length > 0 ? opts.itemFields : bp.itemFields).slice(0, 8);

  const headerTbls = Array.from(
    new Set([
      ...bp.headerTables,
      ...(opts.detectedTables || []).filter((t) => bp.headerTables.includes(t)),
    ])
  );
  const itemTbls = Array.from(
    new Set([
      ...bp.itemTables,
      ...(opts.detectedTables || []).filter((t) => bp.itemTables.includes(t)),
    ])
  );
  const allTables = Array.from(new Set([...(opts.detectedTables || []), ...headerTbls, ...(sampleType === '02' ? itemTbls : []), ...bp.masterTables])).slice(0, 8);

  const authList = (opts.authorityChecks && opts.authorityChecks.length > 0 ? opts.authorityChecks : bp.authorityChecks);
  const authStr = authList.map((a) => `\`${a.object}\` (${a.fields || "ACTVT = '03'"})`).join(', ');

  const msgList = (opts.sapMessages && opts.sapMessages.length > 0 ? opts.sapMessages : bp.sapMessages) as Array<{ msg_class?: string; msg_no?: string; msg_type?: string; text?: string; trigger_condition?: string }>;
  const errMsg = msgList.find((m) => m.msg_type === 'E') || msgList[0];
  const errMsgRef = errMsg ? `${errMsg.msg_class || 'Z01'}-${errMsg.msg_no || '001'} ("${errMsg.text || ''}")` : 'Z01-001';

  const hotspotFields = [...hdrFields, ...(sampleType === '02' ? itmFields : [])]
    .filter((f) => f.hotspot)
    .map((f) => `\`${f.fieldname}\` → \`${f.drilldown_tcode || '표준T-Code'}\``);
  const sumFields = hdrFields.filter((f) => f.do_sum).map((f) => `\`${f.fieldname}\`(${f.coltext || ''})`);
  const toolbarList = (opts.customToolbar && opts.customToolbar.length > 0 ? opts.customToolbar : bp.customToolbar);
  const toolbarStr = toolbarList.map((b) => `\`${b.function}\`(${b.text})`).join(', ') || '`REFRESH`(재조회)';

  if (sampleType === '02') {
    const hdrMain = headerTbls.slice(0, 2).join('/');
    const itmMain = itemTbls.slice(0, 2).join('/');
    const mermaid_code = `graph TD;
  A([1. 시작 / INITIALIZATION]) --> B[/2. 선택화면 / SELECTION-SCREEN/];
  B --> C{3. 입력값 · 권한 검증};
  C -->|오류| B;
  C -->|정상| D[4. START-OF-SELECTION];
  D --> E[(5. 상단 헤더 추출 / ${hdrMain})];
  E --> F[6. 상단 ALV 출력 / 0100 PBO];
  F --> G{7. 상단 행 선택 / ${fk}};
  G -->|행 클릭·더블클릭| H[(8. 하단 상세 추출 / ${itmMain})];
  H --> I[9. 하단 ALV 동기화 / REFRESH];
  I --> J{10. 사용자 명령 / PAI};
  J -->|핫스팟 · 툴바| K[11. 드릴다운 · 후속 처리];
  J -->|종료 F3| L([12. 종료 / LEAVE TO SCREEN 0]);
  K --> F;`;

    const node_details: Record<string, { label: string; markdown: string }> = {
      A: {
        label: '1. 시작 / INITIALIZATION',
        markdown: `### [1번] 시작 및 초기 환경 세팅 (INITIALIZATION)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 사용자가 T-Code(\`${tcode}\`)로 \`${programId}\`(${title})를 처음 실행할 때, 선택화면을 띄우기 전에 기본 날짜·조직코드와 화면 컨테이너 변수를 준비하는 시작 단계입니다.
- 현업 담당자가 매번 기본값을 수동 입력하는 번거로움을 줄이고 초기 실행 안정성을 확보합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **선행 조건**: 사용자 T-Code 실행 (\`${tcode}\`) 또는 SE38 실행
- **대상 프로그램**: \`${programId}\` (${bp.moduleLabelKo} · Master-Detail 2단 연동형)

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`INITIALIZATION\` 이벤트에서 기본 선택조건(${selList.slice(0, 3).map((p) => `\`${p.name}\``).join(', ')})에 회사/조직코드 및 당월 기간(1일~오늘) 자동 할당
2. 상·하단 그리드 분리용 \`CL_GUI_SPLITTER_CONTAINER\` 및 \`GT_HEADER\`, \`GT_ITEM\` 내부 테이블 메모리 초기화
3. 현재 사용자(\`SY-UNAME\`) 기준 기본 레이아웃 Variant 존재 여부 확인

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **표준 테이블**: ${headerTbls.map((t) => `\`${t}\``).join(', ')}
- **주요 변수**: ${selSummary}

#### 5. 예외 처리 및 QA 체크포인트
- 초기 기간 세팅 시 월초(1일) 계산이 연도 경계(1월)에서도 정상 동작하는지 확인
- \`SY-BATCH\`(백그라운드) 실행 시에도 초기화 오류가 나지 않는지 점검`,
      },
      B: {
        label: '2. 선택화면 / SELECTION-SCREEN',
        markdown: `### [2번] 선택화면 표시 및 PBO 제어 (AT SELECTION-SCREEN OUTPUT)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 화면 상단에 조회 조건 입력창(회사코드, 기간, 전표/오더 번호, 라디오버튼 등)을 사용자에게 보여주고, 선택한 옵션에 따라 입력창을 켜고 끄는 단계입니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **선행 단계**: \`1번 INITIALIZATION\` 완료 후 자동 진입
- **화면 파라미터**: ${selSummary}

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`SELECTION-SCREEN BEGIN OF BLOCK\` 단위로 조회 조건 그룹화 출력
2. \`LOOP AT SCREEN\` 구문으로 라디오버튼/체크박스 선택 상태에 따라 연관 필드의 \`SCREEN-INPUT\`, \`SCREEN-ACTIVE\` 동적 제어
3. F4 탐색도움말(\`AT SELECTION-SCREEN ON VALUE-REQUEST\`) 연결

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **참조 DDIC**: ${selList.filter((p) => p.ref_table).map((p) => `\`${p.ref_table}-${p.ref_field}\``).join(', ') || bp.headerTables.join(', ')}

#### 5. 예외 처리 및 QA 체크포인트
- 필수 입력(\`OBLIGATORY\`) 필드에 빨간/체크 아이콘이 정상 표시되는지 확인
- 라디오버튼 전환 시 화면 깜빡임 없이 옵션 입력 제어가 동작하는지 확인`,
      },
      C: {
        label: '3. 입력값 · 권한 검증',
        markdown: `### [3번] 입력값 유효성 및 권한 검증 (AT SELECTION-SCREEN)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 사용자가 **실행(F8)** 버튼을 눌렀을 때, 필수 조건을 빠뜨리지 않았는지, 조회할 수 있는 권한이 있는 사용자인지를 DB 조회 전에 먼저 검사하는 관문입니다.
- 문제가 있으면 데이터를 읽지 않고 화면 상에서 바로 안내 메시지를 띄워 불필요한 DB 부하를 막습니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **선행 단계**: \`2번 선택화면\`에서 사용자 \`F8 (Execute)\` 입력
- **필수 검증 항목**: ${obligatoryNames}

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. 필수 입력값(${obligatoryNames}) 공백 여부 및 기간(\`LOW <= HIGH\`) 역전 여부 점검
2. ${authStr} 권한 오브젝트에 대한 \`AUTHORITY-CHECK\` 수행 (\`SY-SUBRC <> 0\` 시 차단)
3. 조직/마스터 코드 존재 여부 사전 점검 후 오류 시 선택화면으로 복귀(\`MESSAGE ... TYPE 'E'\`)

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **권한 오브젝트**: ${authStr}
- **마스터 검증 테이블**: ${bp.masterTables.map((t) => `\`${t}\``).join(', ')}

#### 5. 예외 처리 및 QA 체크포인트
- 권한 부족 시 메시지 \`${errMsgRef}\` 출력 및 실행 중단 확인
- 오류 메시지 발생 시 커서가 해당 입력 필드로 정확히 이동(\`SET CURSOR FIELD\`)하는지 확인`,
      },
      D: {
        label: '4. START-OF-SELECTION',
        markdown: `### [4번] 메인 처리 진입 및 조회 준비 (START-OF-SELECTION)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 모든 입력 검증과 권한 점검을 통과한 뒤 본격적으로 데이터를 읽어오기 시작하는 진입점입니다.
- 처리 시간이 긴 경우 사용자에게 진행 상태 표시줄("데이터 조회 중...")을 보여줍니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **선행 단계**: \`3번 입력값 · 권한 검증\` 통과

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. 내부 테이블(\`GT_HEADER\`, \`GT_ITEM\`, \`GT_ITEM_ALL\`) 및 카운터 변수 \`CLEAR\` / \`REFRESH\`
2. \`SAPGUI_PROGRESS_INDICATOR\` 호출로 조회 진행률 안내
3. 상단 헤더 추출 서브루틴(\`PERFORM GET_HEADER_DATA\`) 호출

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **모듈 범위**: ${bp.moduleLabelKo} (\`${programId}\`)

#### 5. 예외 처리 및 QA 체크포인트
- 재조회 시 이전 실행 결과(\`GT_HEADER\`, \`GT_ITEM\`)가 잔류하지 않도록 초기화 여부 확인`,
      },
      E: {
        label: `5. 상단 헤더 추출 / ${hdrMain}`,
        markdown: `### [5번] 상단 마스터/헤더 데이터 추출 (${hdrMain})

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 상단 그리드에 보여줄 **핵심 목록(${bp.headerGridTitleKo})**을 SAP DB에서 조회하고, 각 행의 상태 신호등(초록/노랑/빨강)과 요약 금액을 계산하는 핵심 단계입니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **조회 조건**: 선택화면 파라미터(${selList.slice(0, 4).map((p) => `\`${p.name}\``).join(', ')})

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. ${headerTbls.map((t) => `\`${t}\``).join(', ')} 테이블에서 선택 조건에 일치하는 헤더 데이터를 \`GT_HEADER\`로 \`SELECT\`
2. 마스터 텍스트(${bp.masterTables.slice(0, 2).map((t) => `\`${t}\``).join(', ')})를 \`FOR ALL ENTRIES IN GT_HEADER\` (사전 \`IS NOT INITIAL\` 체크 필수) + \`BINARY SEARCH\`로 매핑
3. 업무 규칙에 따라 상태 신호등 \`ZICON\`('1' 정상 / '2' 주의 / '3' 지연·오류) 판정 및 상단 금액 집계
4. 조회 결과 0건(\`GT_HEADER IS INITIAL\`)일 경우 안내 메시지 출력 후 종료

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **상단 원천 테이블**: ${headerTbls.map((t) => `\`${t}\``).join(', ')}
- **주요 출력 필드**: ${hdrFields.slice(0, 6).map((f) => `\`${f.fieldname}\`(${f.coltext})`).join(', ')}

#### 5. 예외 처리 및 QA 체크포인트
- \`FOR ALL ENTRIES\` 수행 전 반드시 \`IF gt_header IS NOT INITIAL\` 체크 (미체크 시 전체 DB 풀스캔 위험)
- 신호등(\`ZICON\`) 1/2/3 분류 기준이 현업 합의와 일치하는지 케이스별 검증`,
      },
      F: {
        label: '6. 상단 ALV 출력 / 0100 PBO',
        markdown: `### [6번] 화면 분할 및 상단 Header ALV 출력 (Screen 0100 PBO)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 화면(\`Screen 0100\`)을 위·아래 2개 영역으로 나누어 위쪽에는 **목록(${bp.headerGridTitleKo})**을, 아래쪽에는 **상세 내역(${bp.itemGridTitleKo})**을 띄울 준비를 하고 첫 번째 행의 상세 내역을 즉시 함께 보여줍니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **입력 데이터**: \`GT_HEADER\` (1건 이상 조회 완료)

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`CL_GUI_CUSTOM_CONTAINER\` 생성 및 \`CL_GUI_SPLITTER_CONTAINER\`로 상·하 2단 분할 (권장 비율 45% : 55%)
2. 상단 컨테이너에 \`GO_GRID_HDR\`(\`CL_GUI_ALV_GRID\`), 하단에 \`GO_GRID_ITM\` 생성 및 이벤트 핸들러(\`DOUBLE_CLICK\`, \`HOTSPOT_CLICK\`, \`TOOLBAR\`, \`USER_COMMAND\`) 등록
3. 상단 필드카탈로그(\`GT_FCAT_HDR\`) 및 레이아웃(\`GS_LAYO_HDR-ZEBRA = 'X'\`, \`CWIDTH_OPT = 'X'\`, \`EXCP_FNAME = 'ZICON'\`) 바인딩
4. 첫 번째 행(\`READ TABLE GT_HEADER INDEX 1\`)의 \`${fk}\` 값으로 하단 상세 그리드 초기 동기화 후 \`SET_TABLE_FOR_FIRST_DISPLAY\` 실행

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **연결 키(Foreign Key)**: \`${fk}\`
- **합계(DO_SUM) 컬럼**: ${sumFields.join(', ') || '금액/수량 필드'}

#### 5. 예외 처리 및 QA 체크포인트
- PBO 재진입 시 \`IF go_container IS INITIAL\` 체크하여 컨테이너가 중복 생성되지 않도록 방어
- 통화(\`WAERS\`/\`WAERK\`) 및 단위(\`MEINS\`) 참조가 필드카탈로그에 연결되어 소수점·합계가 정확한지 확인`,
      },
      G: {
        label: `7. 상단 행 선택 / ${fk}`,
        markdown: `### [7번] 상단 행 선택 감지 및 키 추출 (${fk})

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 사용자가 위쪽 목록에서 특정 행을 **클릭하거나 더블클릭**하면 "지금 사용자가 몇 번 문서를 골랐구나"를 프로그램이 즉시 알아채고 연결 키(\`${fk}\`)를 뽑아내는 이벤트 단계입니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **선행 단계**: \`6번 상단 ALV 출력\` 화면에서 사용자가 특정 행 선택/클릭

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`LCL_EVENT_HANDLER->HANDLE_DOUBLE_CLICK\` (또는 \`CURRENT_CELL_ROW\` 감지)에서 클릭된 행 인덱스 \`E_ROW-INDEX\` 수신
2. \`READ TABLE GT_HEADER INTO GS_HEADER INDEX E_ROW-INDEX\` 수행
3. 선택된 행의 핵심 연결 키 \`GV_SELECTED_KEY = GS_HEADER-${fk}\` 추출 및 하단 상세 추출 단계로 전달

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **연결 키**: \`${fk}\`

#### 5. 예외 처리 및 QA 체크포인트
- 소계 행이나 합계 행을 더블클릭했을 때(\`E_ROW-ROWTYPE IS NOT INITIAL\`) 오류 없이 무시(Return) 처리되는지 확인`,
      },
      H: {
        label: `8. 하단 상세 추출 / ${itmMain}`,
        markdown: `### [8번] 선택 건 기준 하단 상세 데이터 조회 (${itmMain})

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 위에서 고른 \`${fk}\` 번호에 딱 해당하는 **하단 세부 내역(${bp.itemGridTitleKo})**만 조회하거나 메모리에 캐싱해 둔 전체 내역에서 필터링해 \`GT_ITEM\` 테이블에 담는 단계입니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **입력 키**: \`GS_HEADER-${fk}\` (필요 시 회사코드 \`BUKRS\`, 연도 \`GJAHR\` 복합키 포함)

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`GT_ITEM\` 초기화 후 선택된 \`${fk}\` 조건으로 ${itemTbls.map((t) => `\`${t}\``).join(', ')} 조회 (또는 기조회된 \`GT_ITEM_ALL\`에서 \`WHERE ${fk} = gs_header-${fk}\` 필터)
2. 품목/분개 텍스트(${bp.masterTables.slice(0, 2).map((t) => `\`${t}\``).join(', ')}) 및 잔여수량·차대변 금액 계산
3. 순번(항번/품목번호) 기준으로 정렬(\`SORT GT_ITEM\`)

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **하단 원천 테이블**: ${itemTbls.map((t) => `\`${t}\``).join(', ')}
- **하단 주요 컬럼**: ${itmFields.slice(0, 6).map((f) => `\`${f.fieldname}\`(${f.coltext})`).join(', ')}

#### 5. 예외 처리 및 QA 체크포인트
- 상단 행 전환 속도를 높이기 위해 대용량 환경에서는 \`${fk}\` 인덱스 조건으로 온디맨드(On-Demand) SELECT 또는 메모리 캐시 전략 선택 확인`,
      },
      I: {
        label: '9. 하단 ALV 동기화 / REFRESH',
        markdown: `### [9번] 하단 상세 ALV 그리드 화면 갱신 (REFRESH_TABLE_DISPLAY)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 새로 추출한 \`GT_ITEM\` 상세 데이터를 아래쪽 ALV 그리드에 반영해 사용자가 선택한 전표/오더의 세부 내역이 화면에 즉시 바뀌어 보이도록 새로고침하는 단계입니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **입력 데이터**: \`GT_ITEM\` 필터 완료

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. 하단 그리드 타이틀 동적 갱신(선택된 \`${fk}\` 번호 표시)
2. \`GO_GRID_ITM->REFRESH_TABLE_DISPLAY( IS_STABLE = LS_STABLE )\` 호출로 스크롤·정렬 상태 유지하며 화면 갱신
3. \`CL_GUI_CFW=>FLUSH( )\` 호출로 프론트엔드 컨트롤 동기화 완료

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **컨트롤 객체**: \`GO_GRID_ITM\` (\`CL_GUI_ALV_GRID\`)

#### 5. 예외 처리 및 QA 체크포인트
- 상단 행 선택을 빠르게 바꿔도 하단 합계(\`DO_SUM\`) 라인이 이전 행 값과 섞이지 않고 재계산되는지 확인`,
      },
      J: {
        label: '10. 사용자 명령 / PAI',
        markdown: `### [10번] 사용자 명령 및 이벤트 분기 (Screen 0100 PAI)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 사용자가 전표번호 같은 파란색 링크(핫스팟)를 클릭하거나, 상단 툴바의 커스텀 버튼(${toolbarStr})·뒤로가기 버튼을 눌렀을 때 알맞은 동작으로 연결해 주는 분기 단계입니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **이벤트 발생**: 핫스팟 클릭(\`HOTSPOT_CLICK\`), 툴바 버튼 클릭(\`USER_COMMAND\`), GUI 상태 버튼(\`GV_OK_CODE\`)

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. **핫스팟 드릴다운**: ${hotspotFields.join(', ') || `\`${fk}\` 클릭 시 표준 상세 조회 화면 이동`}
2. **커스텀 툴바 처리**: ${toolbarStr} 실행 전 선택 행 유무(\`GET_SELECTED_ROWS\`) 확인 및 처리 후 알림 메시지 출력
3. **종료 명령(\`BACK\`, \`EXIT\`, \`CANC\`)**: 종료 단계(\`12번\`)로 분기

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **드릴다운 T-Code**: ${hotspotFields.join(', ') || '모듈 표준 조회 T-Code'}
- **커스텀 툴바**: ${toolbarStr}

#### 5. 예외 처리 및 QA 체크포인트
- 행을 선택하지 않고 툴바 실행 버튼 클릭 시 안내 경고(\`TYPE 'I'\` 또는 \`'S' DISPLAY LIKE 'E'\`) 출력 확인`,
      },
      K: {
        label: '11. 드릴다운 · 후속 처리',
        markdown: `### [11번] SAP 표준 화면 드릴다운 및 후속 트랜잭션 실행

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 개발된 조회 화면에서 바로 SAP 표준 전표/마스터 조회 화면으로 점프하거나, 승인·재처리·전표전기 같은 후속 업무를 처리한 뒤 다시 목록을 최신화하는 단계입니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **선행 단계**: \`10번 PAI\`에서 유효한 행 및 기능 코드 수신

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`SET PARAMETER ID\`에 클릭한 키 값(\`${fk}\` 등) 세팅
2. \`CALL TRANSACTION '<TCODE>' AND SKIP FIRST SCREEN\`으로 표준 상세 화면 호출
3. 툴바 후속 작업(BAPI/상태 변경) 수행 시 성공/실패 결과를 메시지(\`SE91\`)로 반환하고 \`GO_GRID_HDR\`, \`GO_GRID_ITM\` 재조회 갱신

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **연계 T-Code**: ${hotspotFields.join(', ') || '표준 상세 화면'}

#### 5. 예외 처리 및 QA 체크포인트
- 표준 T-Code 화면에서 F3으로 복귀 시 프로그램이 강제 종료되지 않고 원래 선택한 행 위치로 복귀하는지 확인`,
      },
      L: {
        label: '12. 종료 / LEAVE TO SCREEN 0',
        markdown: `### [12번] 리소스 해제 및 프로그램 종료 (LEAVE TO SCREEN 0)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 사용자가 뒤로가기(F3)나 종료(Shift+F3)를 눌렀을 때 화면 메모리와 ALV 컨테이너를 깨끗이 정리하고 안전하게 프로그램을 끝내는 마무리 단계입니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **실행 조건**: \`GV_OK_CODE = 'BACK' OR 'EXIT' OR 'CANC'\`

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`GO_GRID_HDR->FREE( )\`, \`GO_GRID_ITM->FREE( )\`, \`GO_SPLITTER->FREE( )\`, \`GO_CONTAINER->FREE( )\` 순차 해제
2. 전역 객체 참조 \`CLEAR\` 후 \`LEAVE TO SCREEN 0\` (또는 \`LEAVE PROGRAM\`)

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **시스템 제어**: \`CL_GUI_ALV_GRID\`, \`CL_GUI_SPLITTER_CONTAINER\`

#### 5. 예외 처리 및 QA 체크포인트
- 종료 후 다시 T-Code 재실행 시 메모리 누수나 Control Error가 발생하지 않는지 확인`,
      },
    };

    return {
      title: `${programId} Master-Detail Data Flow Diagram`,
      mermaid_code,
      node_details,
      active_node_id: 'A',
    };
  }

  // Single / Tree / Pivot Flow (01, 03, 04)
  const mainTblStr = allTables.slice(0, 3).join(', ') || mod;
  const isPivot = sampleType === '04';
  const isTree = sampleType === '03';
  const modeLabel = isPivot ? '다차원 피벗(CDS) 집계' : isTree ? '계층 트리(Tree) 구조 구성' : '비즈니스 계산 및 신호등 판정';

  const mermaid_code = `graph TD;
  A([1. 시작 / INITIALIZATION]) --> B[/2. 선택화면 / SELECTION-SCREEN/];
  B --> C{3. 입력값 · 권한 검증};
  C -->|오류| B;
  C -->|정상| D[4. START-OF-SELECTION];
  D --> E[(5. 데이터 추출 / ${mainTblStr})];
  E --> F[6. ${modeLabel}];
  F --> G[7. ALV 그리드 출력 / 0100 PBO];
  G --> H{8. 사용자 명령 / PAI};
  H -->|핫스팟 드릴다운| I[9. 표준 T-Code 연계 조회];
  H -->|툴바 · 엑셀| J[9-1. 후속 처리 · 내보내기];
  H -->|종료 F3| K([10. 종료 / LEAVE TO SCREEN 0]);
  I --> G;
  J --> G;`;

  const node_details: Record<string, { label: string; markdown: string }> = {
    A: {
      label: '1. 시작 / INITIALIZATION',
      markdown: `### [1번] 시작 및 초기 변수 세팅 (INITIALIZATION)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- \`${programId}\`(${title}) 실행 직후 선택화면 기본 조회 조건(회사/조직, 당월 기간 등)과 전역 변수를 자동으로 세팅하는 시작 단계입니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **실행 T-Code**: \`${tcode}\` (${bp.moduleLabelKo})

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`INITIALIZATION\` 블록에서 기본 파라미터(${selList.slice(0, 3).map((p) => `\`${p.name}\``).join(', ')}) 기본값 할당
2. \`GT_DATA\`, \`GT_FCAT\`, \`GS_LAYO\` 전역 변수 초기화

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **주요 변수**: ${selSummary}

#### 5. 예외 처리 및 QA 체크포인트
- 초기 실행 시 사용자별 SPA/GPA Parameter(\`MEMORY ID\`)와 충돌하지 않는지 확인`,
    },
    B: {
      label: '2. 선택화면 / SELECTION-SCREEN',
      markdown: `### [2번] 선택화면 표시 및 동적 제어 (AT SELECTION-SCREEN OUTPUT)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 사용자가 조회할 조건을 입력할 수 있는 선택화면을 구성하고, 라디오버튼·체크박스 선택에 따라 입력 가능 항목을 제어합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **선행 단계**: \`1번 INITIALIZATION\` 완료 후 화면 PBO 진입

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`BLOCK\` 단위로 조회 조건 레이아웃 구성 (${selSummary})
2. \`LOOP AT SCREEN\`으로 조건별 입력 활성화(\`SCREEN-INPUT\`) 제어

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **참조 필드**: ${selList.filter((p) => p.ref_table).map((p) => `\`${p.ref_table}-${p.ref_field}\``).join(', ') || mainTblStr}

#### 5. 예외 처리 및 QA 체크포인트
- F4 Search Help 동작 및 필수 입력 표시 정상 여부 점검`,
    },
    C: {
      label: '3. 입력값 · 권한 검증',
      markdown: `### [3번] 입력값 유효성 및 권한 검증 (AT SELECTION-SCREEN)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 실행(F8) 전 필수 조건 누락 여부와 실행 권한(\`AUTHORITY-CHECK\`)을 먼저 확인하여 권한 없는 접근이나 잘못된 조건 조회를 사전에 차단합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **필수 입력 항목**: ${obligatoryNames}

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. 필수 조건 공백 및 기간(\`LOW <= HIGH\`) 유효성 점검
2. ${authStr} 권한 체크 실행 (실패 시 \`${errMsgRef}\` 에러 출력 후 선택화면 유지)

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **권한 오브젝트**: ${authStr}

#### 5. 예외 처리 및 QA 체크포인트
- 오류 발생 시 정확한 필드에 커서가 위치(\`SET CURSOR FIELD\`)하는지 확인`,
    },
    D: {
      label: '4. START-OF-SELECTION',
      markdown: `### [4번] 메인 추출 로직 진입 (START-OF-SELECTION)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 검증을 마친 조회 조건을 바탕으로 DB 조회와 데이터 가공 흐름을 시작하는 본 처리 진입점입니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **선행 단계**: \`3번 입력값 · 권한 검증\` 성공

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. 작업용 내부 테이블 전체 초기화(\`CLEAR\` / \`REFRESH\`)
2. \`SAPGUI_PROGRESS_INDICATOR\`로 진행 상태 표시

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **대상 테이블**: ${allTables.map((t) => `\`${t}\``).join(', ')}

#### 5. 예외 처리 및 QA 체크포인트
- 백그라운드 잡(\`SY-BATCH = 'X'\`) 실행 시 스풀 출력 분기 확인`,
    },
    E: {
      label: `5. 데이터 추출 / ${mainTblStr}`,
      markdown: `### [5번] 원천 데이터 추출 및 조인 (DB SELECT)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- SAP DB 테이블(${allTables.map((t) => `\`${t}\``).join(', ')})에서 조건에 맞는 데이터를 효율적으로 읽어와 \`GT_DATA\`에 적재합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **선행 단계**: \`4번 START-OF-SELECTION\`

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. 주요 원천 테이블(${headerTbls.map((t) => `\`${t}\``).join(', ')}) 인덱스 키 조건으로 1차 데이터 \`SELECT\`
2. 마스터/텍스트 테이블(${bp.masterTables.map((t) => `\`${t}\``).join(', ')})은 \`FOR ALL ENTRIES\` 전 \`IS NOT INITIAL\` 체크 후 \`READ TABLE ... BINARY SEARCH\` 매핑
3. 데이터 0건일 경우 안내 메시지 출력 후 종료

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **원천 테이블**: ${allTables.map((t) => `\`${t}\``).join(', ')}
- **주요 컬럼**: ${hdrFields.slice(0, 6).map((f) => `\`${f.fieldname}\`(${f.coltext})`).join(', ')}

#### 5. 예외 처리 및 QA 체크포인트
- 대량 조회 시 Full Table Scan이 발생하지 않도록 인덱스 순서 일치 여부 점검`,
    },
    F: {
      label: `6. ${modeLabel}`,
      markdown: `### [6번] ${modeLabel} 및 상태 신호등 부여

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 추출된 원천 데이터를 현업이 바로 의사결정에 활용할 수 있도록 계산·집계하고, 각 건의 정상/주의/지연 상태를 신호등(\`ZICON\`)으로 표시합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **입력 데이터**: \`GT_DATA\` 추출 완료

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`LOOP AT GT_DATA\` 순회하며 수량/금액 차이 및 집행률 계산
2. 상태 신호등 \`ZICON\` 부여 (\`'1'\` Green 정상, \`'2'\` Yellow 주의, \`'3'\` Red 오류·지연)
3. ${isPivot ? '기간별·차원별 크로스탭 피벗 소계 구조 생성' : isTree ? '상하위 부모-자식 노드 키 연결 및 계층별 소계 집계' : '정렬 기준에 따라 `SORT GT_DATA` 수행'}

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **집계 필드**: ${sumFields.join(', ') || '금액/수량 컬럼'}

#### 5. 예외 처리 및 QA 체크포인트
- 통화(\`WAERS\`) 환산 및 소수점 반올림 정합성 검증`,
    },
    G: {
      label: '7. ALV 그리드 출력 / 0100 PBO',
      markdown: `### [7번] ALV 그리드 바인딩 및 화면 출력 (Screen 0100 PBO)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 가공 완료된 데이터를 SAP 표준 ALV 그리드(\`CL_GUI_ALV_GRID\`)에 연결해 사용자가 정렬, 필터, 합계, 엑셀 저장을 쓸 수 있는 화면을 띄웁니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **입력 데이터**: 가공 완료된 \`GT_DATA\` (${hdrFields.length}개 컬럼)

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`CL_GUI_CUSTOM_CONTAINER\` 및 \`CL_GUI_ALV_GRID\` 최초 1회 생성 (\`IF GO_CONTAINER IS INITIAL\`)
2. 필드카탈로그(\`LVC_T_FCAT\`) 및 레이아웃(\`ZEBRA = 'X'\`, \`CWIDTH_OPT = 'X'\`, \`EXCP_FNAME = 'ZICON'\`) 구성
3. 이벤트 핸들러(\`HOTSPOT_CLICK\`, \`DOUBLE_CLICK\`, \`TOOLBAR\`, \`USER_COMMAND\`) 등록 후 \`SET_TABLE_FOR_FIRST_DISPLAY\` 호출

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **주요 출력 컬럼**: ${hdrFields.slice(0, 6).map((f) => `\`${f.fieldname}\``).join(', ')}

#### 5. 예외 처리 및 QA 체크포인트
- \`DO_SUM\` 합계 라인과 통화 키 참조(\`CFIELDNAME\`)가 일치하는지 확인`,
    },
    H: {
      label: '8. 사용자 명령 / PAI',
      markdown: `### [8번] 사용자 인터랙션 및 명령 분기 (Screen 0100 PAI)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 화면에서 사용자가 핫스팟 링크를 누르거나 툴바 버튼, 뒤로가기 버튼을 눌렀을 때 해당 동작으로 분기해 처리하는 제어 단계입니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **이벤트 소스**: \`GV_OK_CODE\`, \`HANDLE_HOTSPOT_CLICK\`, \`HANDLE_USER_COMMAND\`

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. 핫스팟 클릭 시 → \`9번 표준 T-Code 연계 조회\`로 분기
2. 커스텀 툴바(${toolbarStr}) 또는 엑셀/출력 실행 시 → \`9-1번 후속 처리\`로 분기
3. \`BACK\` / \`EXIT\` / \`CANC\` 입력 시 → \`10번 종료\`로 분기

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **커스텀 툴바**: ${toolbarStr}

#### 5. 예외 처리 및 QA 체크포인트
- 다중 행 선택 시 \`GET_SELECTED_ROWS\` 누락 여부 확인`,
    },
    I: {
      label: '9. 표준 T-Code 연계 조회',
      markdown: `### [9번] 전표 · 마스터 표준 화면 드릴다운

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 목록에서 파란색 핫스팟 컬럼을 클릭하면 해당 전표나 마스터 데이터의 SAP 표준 상세 화면으로 바로 이동해 상세 원문을 확인합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **대상 핫스팟**: ${hotspotFields.join(', ') || `\`${fk}\` 컬럼`}

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. 클릭된 셀의 행 데이터 \`READ TABLE GT_DATA INDEX E_ROW_ID-INDEX\`
2. \`SET PARAMETER ID\`에 키 값 세팅 후 \`CALL TRANSACTION ... AND SKIP FIRST SCREEN\` 실행
3. 복귀 시 \`REFRESH_TABLE_DISPLAY\`로 최신 상태 유지

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **드릴다운 대상**: ${hotspotFields.join(', ') || '표준 조회 T-Code'}

#### 5. 예외 처리 및 QA 체크포인트
- 빈 값 셀 클릭 시 불필요한 트랜잭션 호출을 방지하는 방어 로직 확인`,
    },
    J: {
      label: '9-1. 후속 처리 · 내보내기',
      markdown: `### [9-1번] 커스텀 툴바 후속 처리 및 엑셀 내보내기

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 선택된 행에 대해 재조회·일괄처리 같은 업무 버튼을 실행하거나 ALV 표를 엑셀/인쇄물로 내려받습니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **트리거 버튼**: ${toolbarStr}, 표준 엑셀 버튼(\`&XXL\`)

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`GO_GRID->GET_SELECTED_ROWS\`로 체크/선택된 행 목록 확보
2. 비즈니스 처리(또는 재집계) 수행 후 결과 메시지 출력 및 \`REFRESH_TABLE_DISPLAY\` 갱신

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **커스텀 기능 코드**: ${toolbarStr}

#### 5. 예외 처리 및 QA 체크포인트
- 선택 행이 0건일 때 안내 메시지 출력 후 안전 복귀 확인`,
    },
    K: {
      label: '10. 종료 / LEAVE TO SCREEN 0',
      markdown: `### [10번] 화면 자원 해제 및 프로그램 종료

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- F3(뒤로가기) 또는 종료 명령 시 할당했던 ALV 컨트롤 메모리를 반환하고 프로그램을 안전하게 종료합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **종료 OK-CODE**: \`BACK\`, \`EXIT\`, \`CANC\`

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`GO_GRID->FREE( )\`, \`GO_CONTAINER->FREE( )\` 호출 및 변수 \`CLEAR\`
2. \`LEAVE TO SCREEN 0\` 실행

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **해제 객체**: \`GO_GRID\`, \`GO_CONTAINER\`

#### 5. 예외 처리 및 QA 체크포인트
- 반복 실행/종료 시 GUI 메모리 누수 없이 정상 복귀 확인`,
    },
  };

  return {
    title: `${programId} Data Flow Diagram`,
    mermaid_code,
    node_details,
    active_node_id: 'A',
  };
}
