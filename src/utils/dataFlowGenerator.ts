import {
  DataFlowDiagramConfig,
  ProgramSpec,
  CanvasNode,
  CanvasEdge,
  PortPosition,
} from '../types/sap';

/**
 * Standard SAP Data Flow Template matching RFQ v.1.18 Page 1 reference diagram
 * Represented as customizable interactive Canvas nodes and connected edges
 */
export const DEFAULT_CANVAS_NODES: CanvasNode[] = [
  { id: 'node-start', type: 'start', label: '시작', x: 270, y: 30, width: 130, height: 38 },
  { id: 'node-1', type: 'process', label: '1) 초기화', x: 270, y: 100, width: 130, height: 38, description: 'INITIALIZATION' },
  { id: 'node-2', type: 'process', label: '2) 선택화면', x: 270, y: 175, width: 130, height: 38, description: 'AT SELECTION-SCREEN OUTPUT' },
  { id: 'node-3', type: 'process', label: '3) 입력값 점검', x: 270, y: 250, width: 130, height: 38, description: 'AT SELECTION-SCREEN' },
  { id: 'node-db1', type: 'database', label: 'T001', x: 45, y: 195, width: 130, height: 50, description: '회사코드 마스터 (Company Code Master)' },
  { id: 'node-4', type: 'process', label: '4) 조회', x: 270, y: 325, width: 130, height: 38, description: 'START-OF-SELECTION' },
  { id: 'node-db2', type: 'database', label: 'ZCOBT1001\nZCOBT1002', x: 45, y: 315, width: 130, height: 55, description: 'CO 내부 데이터 테이블' },
  { id: 'node-5', type: 'process', label: '5) 데이터 가공', x: 270, y: 400, width: 130, height: 38, description: 'END-OF-SELECTION' },
  { id: 'node-6', type: 'process', label: '6) 100번 화면 호출', x: 270, y: 475, width: 130, height: 38, description: 'CALL SCREEN 100' },
  { id: 'node-cmd', type: 'decision', label: '사용자 명령', x: 280, y: 550, width: 110, height: 46, description: 'PAI Event (USER_COMMAND)' },
  { id: 'node-6-1', type: 'process', label: '6-1) 종료', x: 270, y: 630, width: 130, height: 38, description: 'LEAVE TO SCREEN 0' },
  { id: 'node-end', type: 'end', label: '종료', x: 270, y: 705, width: 130, height: 38 },
];

export const DEFAULT_CANVAS_EDGES: CanvasEdge[] = [
  { id: 'e1', from: 'node-start', to: 'node-1', fromPort: 'bottom', toPort: 'top' },
  { id: 'e2', from: 'node-1', to: 'node-2', fromPort: 'bottom', toPort: 'top' },
  { id: 'e3', from: 'node-2', to: 'node-3', fromPort: 'bottom', toPort: 'top' },
  { id: 'e4', from: 'node-3', to: 'node-4', fromPort: 'bottom', toPort: 'top' },
  { id: 'e-db1-2', from: 'node-db1', to: 'node-2', fromPort: 'right', toPort: 'left' },
  { id: 'e-db1-3', from: 'node-db1', to: 'node-3', fromPort: 'right', toPort: 'left' },
  { id: 'e-db2-4', from: 'node-db2', to: 'node-4', fromPort: 'right', toPort: 'left' },
  { id: 'e5', from: 'node-4', to: 'node-5', fromPort: 'bottom', toPort: 'top' },
  { id: 'e6', from: 'node-5', to: 'node-6', fromPort: 'bottom', toPort: 'top' },
  { id: 'e7', from: 'node-6', to: 'node-cmd', fromPort: 'bottom', toPort: 'top' },
  { id: 'e8', from: 'node-cmd', to: 'node-6-1', fromPort: 'bottom', toPort: 'top' },
  { id: 'e9', from: 'node-6-1', to: 'node-end', fromPort: 'bottom', toPort: 'top' },
];

export const DEFAULT_MERMAID_CODE = `graph TD;
  A([1. 시작 / INITIALIZATION]) --> B[/2. 선택화면 / SELECTION-SCREEN/];
  B --> C{3. 입력값 · 권한 검증};
  C -->|오류| B;
  C -->|정상| D[4. 데이터 추출 / SELECT];
  D --> E[5. ALV 그리드 출력 / 0100 PBO];
  E --> F{6. 사용자 명령 / PAI};
  F -->|드릴다운·툴바| G[7. 상세 조회 · 후속 처리];
  F -->|종료| H([8. 종료 / LEAVE TO SCREEN 0]);
  G --> E;`;

export const DEFAULT_MERMAID_NODE_DETAILS: Record<string, { label: string; markdown: string }> = {
  A: {
    label: '1. 시작 / INITIALIZATION',
    markdown: `### [A] 시작 및 초기 변수 세팅 (INITIALIZATION)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 프로그램 실행 직후 선택화면이 열리기 전에 기본 조회 조건(회사코드, 당월 기간)과 전역 변수를 초기화합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **선행 조건**: 사용자가 T-Code 실행 또는 SE38 실행

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. 기본 파라미터 및 당월 조회 기간(1일 ~ 오늘) 자동 세팅
2. 내부 테이블 및 ALV 제어 변수 초기화

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **표준 기준 정보**: \`T001\` 등 모듈 기본 마스터

#### 5. 예외 처리 및 QA 체크포인트
- 배치 실행(\`SY-BATCH = 'X'\`) 환경에서도 오류 없이 초기화되는지 확인`,
  },
  B: {
    label: '2. 선택화면 / SELECTION-SCREEN',
    markdown: `### [B] 선택화면 표시 및 동적 제어 (AT SELECTION-SCREEN OUTPUT)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 사용자에게 조회 조건 입력 화면을 보여주고 라디오버튼/체크박스 상태에 따라 입력 필드를 활성화하거나 비활성화합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **선행 단계**: \`INITIALIZATION\` 완료 후 진입

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`BLOCK\` 단위로 조회 조건 배치 출력
2. \`LOOP AT SCREEN\`으로 조건별 \`SCREEN-INPUT\` / \`SCREEN-ACTIVE\` 제어

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **F4 탐색 도움말**: DDIC Search Help 및 커스텀 \`VALUE-REQUEST\`

#### 5. 예외 처리 및 QA 체크포인트
- 필수(\`OBLIGATORY\`) 입력 표시와 라디오버튼 그룹 전환 확인`,
  },
  C: {
    label: '3. 입력값 · 권한 검증',
    markdown: `### [C] 입력값 유효성 및 권한 점검 (AT SELECTION-SCREEN)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- F8(실행) 클릭 시 필수 조건 누락 여부와 사용자 실행 권한(\`AUTHORITY-CHECK\`)을 먼저 확인하여 부적합한 DB 조회를 차단합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **트리거**: 사용자 \`F8 (Execute)\` 입력

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. 필수 파라미터 공백 및 기간(\`LOW <= HIGH\`) 역전 여부 검증
2. \`AUTHORITY-CHECK OBJECT\` 수행 (\`SY-SUBRC <> 0\` 시 에러 반환)

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **권한 제어**: 모듈별 \`AUTHORITY-CHECK\` 오브젝트

#### 5. 예외 처리 및 QA 체크포인트
- 검증 실패 시 \`MESSAGE ... TYPE 'E'\` 출력 후 해당 필드로 커서 복귀`,
  },
  D: {
    label: '4. 데이터 추출 / SELECT',
    markdown: `### [D] DB 원천 데이터 추출 및 가공 (START-OF-SELECTION)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 검증된 조건으로 SAP DB 테이블을 조회해 내부 테이블(\`GT_DATA\`)에 적재하고 상태 신호등·집계 금액을 계산합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **선행 단계**: \`입력값 · 권한 검증\` 통과

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. 주 테이블 조회 후 마스터 텍스트 테이블은 \`FOR ALL ENTRIES\` 전 \`IS NOT INITIAL\` 점검 및 \`BINARY SEARCH\` 조인
2. 상태 신호등(\`ZICON\`: 1 Green / 2 Yellow / 3 Red) 및 금액/수량 계산

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **대상 테이블**: 모듈별 Header/Item 및 Master Text 테이블

#### 5. 예외 처리 및 QA 체크포인트
- 0건 조회 시 안내 메시지 출력 후 불필요한 화면 전환 방지`,
  },
  E: {
    label: '5. ALV 그리드 출력 / 0100 PBO',
    markdown: `### [E] ALV 그리드 바인딩 및 화면 출력 (Screen 0100 PBO)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 가공 완료된 데이터를 ALV 그리드에 연결하여 정렬, 필터, 합계 및 드릴다운이 가능한 표 화면을 출력합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **입력 데이터**: \`GT_DATA\` 적재 완료

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`CL_GUI_CUSTOM_CONTAINER\` 및 \`CL_GUI_ALV_GRID\` 생성 (최초 1회)
2. 필드카탈로그(\`LVC_T_FCAT\`), 레이아웃(\`LVC_S_LAYO\`) 바인딩 및 \`SET_TABLE_FOR_FIRST_DISPLAY\` 호출

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **화면 객체**: \`Screen 0100\`, \`CL_GUI_ALV_GRID\`

#### 5. 예외 처리 및 QA 체크포인트
- PBO 재진입 시 컨테이너 중복 생성 방지 및 합계(\`DO_SUM\`)·통화 참조 확인`,
  },
  F: {
    label: '6. 사용자 명령 / PAI',
    markdown: `### [F] 사용자 이벤트 및 명령 분기 (Screen 0100 PAI)

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 핫스팟 클릭, 툴바 버튼 실행, 뒤로가기 등 사용자의 화면 입력 이벤트를 감지해 알맞은 기능으로 연결합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **이벤트**: \`HOTSPOT_CLICK\`, \`DOUBLE_CLICK\`, \`USER_COMMAND\`

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`GV_OK_CODE\` 또는 ALV 이벤트 파라미터로 요청 구분 판별
2. 드릴다운 / 후속 처리 / 화면 종료로 분기

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **이벤트 핸들러**: \`LCL_EVENT_HANDLER\`

#### 5. 예외 처리 및 QA 체크포인트
- 빈 행·소계 행 클릭 시 안전하게 무시 처리되는지 확인`,
  },
  G: {
    label: '7. 상세 조회 · 후속 처리',
    markdown: `### [G] 표준 화면 드릴다운 및 툴바 후속 처리

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 클릭한 전표/마스터의 SAP 표준 상세 화면으로 바로 이동하거나, 선택 행에 대한 일괄 처리·엑셀 다운로드를 실행합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **입력 키**: 선택된 행의 Key 필드 값

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`SET PARAMETER ID\` 후 \`CALL TRANSACTION ... AND SKIP FIRST SCREEN\` 호출
2. 툴바 후속 처리 실행 후 \`REFRESH_TABLE_DISPLAY\`로 화면 갱신

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **연계 T-Code**: 각 필드카탈로그에 지정된 \`DRILLDOWN_TCODE\`

#### 5. 예외 처리 및 QA 체크포인트
- 표준 화면에서 F3 복귀 시 ALV 스크롤과 선택 상태가 유지되는지 확인`,
  },
  H: {
    label: '8. 종료 / LEAVE TO SCREEN 0',
    markdown: `### [H] 리소스 해제 및 프로그램 종료

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 뒤로가기(F3)나 종료 시 사용하던 컨테이너와 그리드 객체를 해제하고 프로그램을 종료합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **종료 명령**: \`BACK\`, \`EXIT\`, \`CANC\`

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`FREE\` 메서드 호출로 GUI 컨테이너 및 그리드 메모리 반환
2. \`LEAVE TO SCREEN 0\` 실행

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **제어 객체**: \`GO_GRID\`, \`GO_CONTAINER\`

#### 5. 예외 처리 및 QA 체크포인트
- 반복 실행/종료 시 GUI 컨트롤 오류 없이 정상 복귀하는지 확인`,
  },
};

export const DEFAULT_CO_DATA_FLOW: DataFlowDiagramConfig = {
  title: 'Data Flow Diagram',
  nodes: DEFAULT_CANVAS_NODES,
  edges: DEFAULT_CANVAS_EDGES,
  mermaid_code: DEFAULT_MERMAID_CODE,
  node_details: DEFAULT_MERMAID_NODE_DETAILS,
  active_node_id: 'A',
};

export const SAMPLE_01_DATA_FLOW: DataFlowDiagramConfig = {
  title: 'Sample Type 01 Data Flow Diagram',
  nodes: DEFAULT_CANVAS_NODES,
  edges: DEFAULT_CANVAS_EDGES,
  mermaid_code: `graph TD;
  A([1. 시작 / INITIALIZATION]) --> B[/2. 선택화면 / SELECTION-SCREEN/];
  B --> C{3. 입력값 · 권한 검증};
  C -->|오류| B;
  C -->|정상| D[4. START-OF-SELECTION];
  D --> E[(5. 데이터 추출 / SELECT)];
  E --> F[6. 비즈니스 가공 · 신호등];
  F --> G[7. ALV 그리드 출력 / 0100 PBO];
  G --> H{8. 사용자 명령 / PAI};
  H -->|더블클릭 · 핫스팟| I[9. 표준 T-Code 드릴다운];
  H -->|엑셀 · 툴바| J[9-1. 내보내기 · 후속 처리];
  H -->|종료 F3| K([10. 종료 / LEAVE TO SCREEN 0]);
  I --> G;
  J --> G;`,
  node_details: {
    ...DEFAULT_MERMAID_NODE_DETAILS,
    I: {
      label: '9. 표준 T-Code 드릴다운',
      markdown: DEFAULT_MERMAID_NODE_DETAILS.G.markdown.replace('### [G]', '### [I]'),
    },
    J: {
      label: '9-1. 내보내기 · 후속 처리',
      markdown: `### [J] 툴바 후속 처리 및 엑셀 내보내기

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- 사용자가 ALV 상단 커스텀 버튼을 누르거나 엑셀 내보내기(\`&XXL\`) 기능을 실행했을 때 선택된 행 기준으로 후속 업무를 처리합니다.

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **선행 단계**: \`8번 사용자 명령(PAI)\`에서 툴바 이벤트 수신

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
1. \`GET_SELECTED_ROWS\`로 선택된 행 인덱스 추출
2. 커스텀 버튼별 처리 수행 후 \`REFRESH_TABLE_DISPLAY\` 갱신

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- **표준 기능**: \`&XXL\`(엑셀), 커스텀 \`FCODE\`

#### 5. 예외 처리 및 QA 체크포인트
- 선택 행 없이 일괄 처리 버튼 클릭 시 안내 메시지 출력 확인`,
    },
    K: {
      label: '10. 종료 / LEAVE TO SCREEN 0',
      markdown: DEFAULT_MERMAID_NODE_DETAILS.H.markdown.replace('### [H]', '### [K]'),
    },
  },
  active_node_id: 'A',
};

function collectTablesFromSpec(spec: ProgramSpec): {
  headerTables: string[];
  itemTables: string[];
  allTables: string[];
} {
  const headerSet = new Set<string>();
  const itemSet = new Set<string>();
  spec.selection_params?.forEach((p) => {
    if (p.ref_table?.trim()) headerSet.add(p.ref_table.trim().toUpperCase());
  });
  spec.field_catalog?.forEach((f) => {
    if (f.ref_table?.trim()) headerSet.add(f.ref_table.trim().toUpperCase());
  });
  spec.item_grid?.field_catalog?.forEach((f) => {
    if (f.ref_table?.trim()) itemSet.add(f.ref_table.trim().toUpperCase());
  });
  if (spec.cds_view_table?.trim()) headerSet.add(spec.cds_view_table.trim().toUpperCase());

  const moduleDefaults: Record<string, { hdr: string[]; itm: string[] }> = {
    FI: { hdr: ['BKPF', 'T001'], itm: ['BSEG', 'ACDOCA', 'SKAT'] },
    MM: { hdr: ['EKKO', 'LFA1'], itm: ['EKPO', 'EKBE', 'MAKT'] },
    CO: { hdr: ['CSKS', 'CSKT'], itm: ['COEP', 'COSP', 'CSKU'] },
    SD: { hdr: ['VBAK', 'KNA1'], itm: ['VBAP', 'LIPS', 'VBRP'] },
    PP: { hdr: ['AFKO', 'AUFK'], itm: ['RESB', 'AFVC', 'MAKT'] },
    QM: { hdr: ['QALS', 'MAKT'], itm: ['QAMV', 'QAVE'] },
    PM: { hdr: ['AFIH', 'AUFK'], itm: ['AFVC', 'RESB'] },
    HR: { hdr: ['PA0001', 'PA0002'], itm: ['PA2001'] },
    BC: { hdr: ['EDIDC', 'TBTCO'], itm: ['EDIDS', 'TBTCP'] },
    CM: { hdr: ['ZTCM_CODE_H', 'T001'], itm: ['ZTCM_CODE_D'] },
  };
  const fallback = moduleDefaults[spec.module || 'SD'] || moduleDefaults.SD;
  const headerTables = headerSet.size > 0 ? Array.from(headerSet) : fallback.hdr;
  const itemTables = itemSet.size > 0 ? Array.from(itemSet) : fallback.itm;
  const allTables = Array.from(new Set([...headerTables, ...(spec.sample_type === '02' ? itemTables : [])]));
  return { headerTables, itemTables, allTables };
}

/**
 * Generates a rich, 5-part Korean developer-friendly specification Markdown for any Mermaid node
 * grounded dynamically in the active ProgramSpec (no hardcoded VBAK/VBAP for FI/MM/CO!).
 */
export function buildRichNodeDetailMarkdown(
  spec: ProgramSpec,
  node: {
    id: string;
    label: string;
    shape?: string;
    prevNodes?: string[];
    nextNodes?: string[];
  }
): string {
  const { headerTables, itemTables, allTables } = collectTablesFromSpec(spec);
  const mod = spec.module || 'SD';
  const pid = spec.program_id || 'ZR_PROGRAM';
  const tcode = spec.tcode || `Z${mod}010`;
  const fk =
    spec.item_grid?.foreign_key ||
    spec.field_catalog?.find((f) => f.key && f.fieldname !== 'ZICON')?.fieldname ||
    'KEY_FIELD';

  const paramList = (spec.selection_params || [])
    .slice(0, 6)
    .map((p) => `\`${p.name}\`(${p.text || p.datatype}${p.obligatory ? ', 필수' : ''})`)
    .join(', ');
  const obligatoryParams = (spec.selection_params || [])
    .filter((p) => p.obligatory)
    .map((p) => `\`${p.name}\``)
    .join(', ');

  const hdrCols = (spec.field_catalog || [])
    .slice(0, 6)
    .map((f) => `\`${f.fieldname}\`(${f.coltext})`)
    .join(', ');
  const itemCols = (spec.item_grid?.field_catalog || [])
    .slice(0, 6)
    .map((f) => `\`${f.fieldname}\`(${f.coltext})`)
    .join(', ');

  const sumCols = (spec.field_catalog || [])
    .filter((f) => f.do_sum)
    .map((f) => `\`${f.fieldname}\`(${f.coltext})`)
    .join(', ');
  const hotspotList = [
    ...(spec.field_catalog || []),
    ...(spec.item_grid?.field_catalog || []),
  ]
    .filter((f) => f.hotspot)
    .map((f) => `\`${f.fieldname}\` → \`${f.drilldown_tcode || '표준화면'}\``)
    .join(', ');
  const authList = (spec.authority_checks || [])
    .map((a) => `\`${a.object}\` (${a.fields || "ACTVT = '03'"})`)
    .join(', ');
  const msgSample = spec.sap_messages?.[0]
    ? `\`${spec.sap_messages[0].msg_class || 'Z01'}-${spec.sap_messages[0].msg_no}\` ("${spec.sap_messages[0].text}")`
    : '`Z01-001`';
  const toolbarStr = (spec.custom_toolbar || [])
    .filter((b) => b.visible !== false)
    .map((b) => `\`${b.function}\`(${b.text})`)
    .join(', ');

  const prevText = node.prevNodes?.length ? node.prevNodes.join(', ') : '프로그램 실행 시작';
  const nextText = node.nextNodes?.length ? node.nextNodes.join(', ') : '다음 화면 또는 종료';
  const upper = `${node.id} ${node.label}`.toUpperCase();

  let purpose = `\`${pid}\`(${spec.title}) 실행 흐름 중 **${node.label}** 단계의 핵심 업무 처리를 수행합니다.`;
  let logicSteps = `1. 선행 단계(${prevText})로부터 전달된 키 값 및 내부 테이블 상태 확인\n2. ${allTables.map((t) => `\`${t}\``).join(', ')} 기준 업무 규칙 검증 및 데이터 가공\n3. 처리 결과를 후속 단계(${nextText})로 전달`;
  let tablesSection = `- **관련 테이블**: ${allTables.map((t) => `\`${t}\``).join(', ')}\n- **주요 필드**: ${hdrCols || '주요 출력 컬럼'}`;
  let qaCheck = `- 정상 데이터와 0건/예외 데이터 모두에서 오류 없이 동작하는지 확인\n- 메시지 정의(${msgSample}) 출력 조건 점검`;

  if (upper.includes('INITIAL') || upper.includes('시작')) {
    purpose = `사용자가 T-Code(\`${tcode}\`)를 실행했을 때 선택화면이 뜨기 전 기본 조회 조건과 전역 변수를 자동으로 세팅하는 시작 단계입니다.`;
    logicSteps = `1. \`INITIALIZATION\` 이벤트에서 ${paramList || '기본 조회 조건'} 초기값(당월 1일 ~ 오늘, 기본 회사/조직코드) 할당\n2. 전역 내부 테이블 및 ALV 컨테이너 객체 참조 초기화\n3. 사용자별 기본 레이아웃 Variant 확인`;
    tablesSection = `- **초기화 변수**: ${paramList || '선택화면 파라미터'}\n- **관련 마스터**: ${headerTables.map((t) => `\`${t}\``).join(', ')}`;
    qaCheck = `- 월초/연초 날짜 경계에서도 기본 기간이 정상 계산되는지 확인\n- 재실행 시 이전 실행 메모리 잔류 여부 확인`;
  } else if (upper.includes('SELECTION') && !upper.includes('START-OF')) {
    purpose = `사용자가 조회 조건을 입력하는 선택화면을 표시하고, 선택한 라디오버튼/체크박스에 따라 입력창 활성 상태를 동적으로 제어합니다.`;
    logicSteps = `1. \`SELECTION-SCREEN BEGIN OF BLOCK\` 단위로 파라미터(${paramList || '조회 조건'}) 출력\n2. \`AT SELECTION-SCREEN OUTPUT\`의 \`LOOP AT SCREEN\`으로 조건별 \`SCREEN-INPUT\` / \`SCREEN-ACTIVE\` 제어\n3. F4 탐색도움말(\`VALUE-REQUEST\`) 지원`;
    tablesSection = `- **선택 조건 변수**: ${paramList || '표준 조회 파라미터'}\n- **참조 테이블**: ${headerTables.map((t) => `\`${t}\``).join(', ')}`;
    qaCheck = `- 필수(\`OBLIGATORY\`) 입력 표시와 F4 검색 도움말이 정상 동작하는지 확인`;
  } else if (upper.includes('검증') || upper.includes('VALID') || upper.includes('점검') || upper.includes('권한')) {
    purpose = `F8(실행) 시 DB 조회에 앞서 필수 입력값 누락과 사용자 권한(${authList || 'AUTHORITY-CHECK'})을 먼저 검증하는 안전 관문입니다.`;
    logicSteps = `1. 필수 입력 항목(${obligatoryParams || '주요 파라미터'}) 공백 및 기간(\`LOW <= HIGH\`) 역전 여부 점검\n2. ${authList || `${mod} 조회 권한 오브젝트`}에 대한 \`AUTHORITY-CHECK\` 수행\n3. 실패 시 \`MESSAGE ... TYPE 'E'\` 출력 후 해당 입력 필드로 커서 이동`;
    tablesSection = `- **권한 오브젝트**: ${authList || `${mod} 모듈 표준 권한`}\n- **오류 메시지**: ${msgSample}`;
    qaCheck = `- 권한 미보유 계정이 실행 시 ${msgSample} 메시지와 함께 즉시 차단되는지 확인`;
  } else if (upper.includes('START-OF-SELECTION') || upper.includes('진입')) {
    purpose = `입력 검증과 권한 점검 통과 후 실제 DB 데이터 추출과 가공을 시작하는 메인 실행 진입점입니다.`;
    logicSteps = `1. 결과 내부 테이블 및 오류 로그 테이블 \`CLEAR\` / \`REFRESH\`\n2. \`SAPGUI_PROGRESS_INDICATOR\`로 사용자에게 조회 진행률 안내\n3. 데이터 추출 서브루틴(\`PERFORM GET_DATA\`) 호출`;
  } else if (
    upper.includes('하단') ||
    upper.includes('ITEM') ||
    upper.includes('0110') ||
    upper.includes('동기화') ||
    upper.includes('REFRESH')
  ) {
    purpose = `상단 그리드에서 선택된 \`${fk}\` 키를 기준으로 하단 상세 영역(${itemTables.join(', ')})을 추출하거나 즉시 새로고침해 마스터-디테일 화면을 동기화합니다.`;
    logicSteps = `1. 선택된 상단 행의 키(\`${fk}\`) 기준으로 ${itemTables.map((t) => `\`${t}\``).join(', ')} 상세 데이터 조회/필터링\n2. 하단 컬럼(${itemCols || '상세 품목/분개 컬럼'}) 값 및 소계 계산\n3. \`GO_GRID_ITM->REFRESH_TABLE_DISPLAY( IS_STABLE = LS_STABLE )\` 호출 및 \`CL_GUI_CFW=>FLUSH\``;
    tablesSection = `- **하단 대상 테이블**: ${itemTables.map((t) => `\`${t}\``).join(', ')} (연결 키: \`${fk}\`)\n- **하단 주요 컬럼**: ${itemCols || '품목/분개 상세 컬럼'}`;
    qaCheck = `- 상단에서 다른 행으로 이동할 때 하단 데이터와 합계가 선택된 \`${fk}\` 값과 정확히 일치하는지 확인`;
  } else if (upper.includes('행 선택') || upper.includes('ROW CLICK') || upper.includes(fk)) {
    purpose = `사용자가 상단 목록에서 특정 행을 클릭 또는 더블클릭할 때 선택된 \`${fk}\` 키를 추출해 하단 그리드 갱신으로 연결합니다.`;
    logicSteps = `1. \`HANDLE_DOUBLE_CLICK\` / \`HOTSPOT_CLICK\` 이벤트에서 \`E_ROW-INDEX\` 수신\n2. \`READ TABLE GT_HEADER INDEX E_ROW-INDEX\`로 선택 행의 \`${fk}\` 값 추출\n3. 추출된 키를 하단 상세 데이터 조회 단계로 전달`;
    qaCheck = `- 소계/합계 행 더블클릭(\`E_ROW-ROWTYPE IS NOT INITIAL\`) 시 오류가 발생하지 않고 무시되는지 확인`;
  } else if (upper.includes('추출') || upper.includes('SELECT') || upper.includes('QUERY') || node.shape === 'cylinder') {
    purpose = `SAP DB 테이블(${headerTables.map((t) => `\`${t}\``).join(', ')})에서 조회 조건에 맞는 원천 데이터를 읽어 내부 테이블에 적재합니다.`;
    logicSteps = `1. 선택 조건(${paramList || '화면 조건'})을 \`WHERE\` 절에 바인딩하여 ${headerTables.map((t) => `\`${t}\``).join(', ')} 조회\n2. 텍스트/마스터 테이블은 \`FOR ALL ENTRIES\` 수행 전 \`IS NOT INITIAL\` 체크 후 \`BINARY SEARCH\` 매핑\n3. 조회 건수가 0건이면 ${msgSample} 안내 후 화면 종료 방지 처리`;
    tablesSection = `- **원천 테이블**: ${headerTables.map((t) => `\`${t}\``).join(', ')}\n- **주요 추출 컬럼**: ${hdrCols || '핵심 컬럼'}`;
    qaCheck = `- \`FOR ALL ENTRIES\` 대상 테이블이 비어 있을 때 Full Scan이 발생하지 않는지 코드 점검`;
  } else if (upper.includes('가공') || upper.includes('계산') || upper.includes('신호등') || upper.includes('집계') || upper.includes('피벗') || upper.includes('트리')) {
    purpose = `조회된 원천 데이터를 업무 규칙에 맞게 계산·집계하고 상태 신호등(\`ZICON\`: 1 Green / 2 Yellow / 3 Red)을 판정합니다.`;
    logicSteps = `1. \`LOOP AT GT_DATA\` 순회하며 수량·금액 차이 및 상태 조건 평가\n2. \`ZICON\` 신호등 코드('1' 정상, '2' 주의, '3' 오류/지연) 부여\n3. ${sumCols ? `합계 대상 필드(${sumCols}) 통화/단위 정합성 검증 및 ` : ''}정렬 기준 적용`;
    qaCheck = `- 신호등 1/2/3 판정 경계 조건 및 ${sumCols || '금액 합계'} 소수점 오차가 없는지 검증`;
  } else if (upper.includes('ALV') || upper.includes('PBO') || upper.includes('출력') || upper.includes('바인딩')) {
    purpose = `가공된 데이터를 \`CL_GUI_ALV_GRID\`에 바인딩해 ${spec.sample_type === '02' ? '상·하단 분할 화면(Screen 0100)' : 'ALV 화면(Screen 0100)'}으로 출력합니다.`;
    logicSteps = `1. \`IF GO_CONTAINER IS INITIAL\` 체크 후 컨테이너 및 ${spec.sample_type === '02' ? '2단 스플리터(\`CL_GUI_SPLITTER_CONTAINER\`) ' : ''}ALV 그리드 생성\n2. 필드카탈로그(${spec.field_catalog?.length || 0}개 컬럼) 및 레이아웃(\`ZEBRA = 'X'\`, \`EXCP_FNAME = 'ZICON'\`) 바인딩\n3. 이벤트 핸들러 등록 후 \`SET_TABLE_FOR_FIRST_DISPLAY\` 실행`;
    tablesSection = `- **출력 컬럼**: ${hdrCols || 'ALV 컬럼'}\n- **합계(DO_SUM)**: ${sumCols || '해당 없음'}`;
    qaCheck = `- 화면 리사이징 및 재진입 시 컨테이너 중복 생성(\`CNTL_ERROR\`)이 없는지 확인`;
  } else if (upper.includes('PAI') || upper.includes('명령') || upper.includes('INTERACTION')) {
    purpose = `화면에서 사용자가 실행한 핫스팟 클릭, 툴바 버튼(${toolbarStr || '표준 버튼'}), 종료 명령을 판별해 해당 기능으로 분기합니다.`;
    logicSteps = `1. \`GV_OK_CODE\` 또는 ALV 이벤트(\`HOTSPOT_CLICK\`, \`USER_COMMAND\`) 분기\n2. 핫스팟(${hotspotList || '표준 T-Code'}) → 드릴다운 단계 실행\n3. 커스텀 툴바(${toolbarStr || '엑셀/재조회'}) → 후속 처리 단계 실행`;
  } else if (upper.includes('드릴다운') || upper.includes('T-CODE') || upper.includes('BAPI') || upper.includes('후속') || upper.includes('내보내기')) {
    purpose = `선택된 행의 키 값으로 SAP 표준 상세 화면(${hotspotList || 'T-Code'})에 바로 진입하거나 커스텀 툴바(${toolbarStr || '일괄 처리'}) 기능을 실행합니다.`;
    logicSteps = `1. \`SET PARAMETER ID\` 후 \`CALL TRANSACTION ... AND SKIP FIRST SCREEN\` 호출 (${hotspotList || '주요 키 필드 기준'})\n2. 툴바 액션 실행 시 \`GET_SELECTED_ROWS\`로 대상 행 검증 후 처리\n3. 완료 시 \`REFRESH_TABLE_DISPLAY\`로 최신 상태 반영`;
    qaCheck = `- 표준 T-Code 화면에서 F3으로 돌아왔을 때 원래 조회 목록과 스크롤이 유지되는지 확인`;
  } else if (upper.includes('종료') || upper.includes('EXIT') || upper.includes('LEAVE')) {
    purpose = `뒤로가기(F3) 또는 종료 명령 시 할당했던 ALV 컨테이너와 메모리를 정리하고 프로그램을 안전하게 종료합니다.`;
    logicSteps = `1. \`GO_GRID->FREE( )\`, \`GO_CONTAINER->FREE( )\` 순차 호출 및 객체 변수 \`CLEAR\`\n2. \`LEAVE TO SCREEN 0\` 실행`;
    qaCheck = `- 반복 실행·종료 시 메모리 누수나 덤프 없이 이전 메뉴로 복귀하는지 확인`;
  }

  return `### [${node.id}] ${node.label}

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- ${purpose}

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- **선행 흐름**: ${prevText}
- **프로그램**: \`${pid}\` (\`${tcode}\` · ${mod} 모듈 · 유형 ${spec.sample_type || '01'})

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
${logicSteps}

#### 4. 관련 SAP 테이블 · 필드 · T-Code
${tablesSection}

#### 5. 예외 처리 및 QA 체크포인트
${qaCheck}
- **후속 흐름**: ${nextText}`;
}

/**
 * Generates a full module-aware Data Flow (Mermaid + 5-part Korean node_details for every node) from a ProgramSpec.
 */
export function generateRichDataFlowFromSpec(spec: ProgramSpec): DataFlowDiagramConfig {
  const { headerTables, itemTables } = collectTablesFromSpec(spec);
  const mod = spec.module || 'SD';
  const isDetail = spec.sample_type === '02';
  const fk =
    spec.item_grid?.foreign_key ||
    spec.field_catalog?.find((f) => f.key && f.fieldname !== 'ZICON')?.fieldname ||
    'BELNR';

  let mermaid_code = '';
  let nodeSpecs: Array<{ id: string; label: string; shape?: string; prevNodes?: string[]; nextNodes?: string[] }> = [];

  if (isDetail) {
    const hdrMain = headerTables.slice(0, 2).join('/');
    const itmMain = itemTables.slice(0, 2).join('/');
    mermaid_code = `graph TD;
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
    nodeSpecs = [
      { id: 'A', label: '1. 시작 / INITIALIZATION', nextNodes: ['B: 선택화면'] },
      { id: 'B', label: '2. 선택화면 / SELECTION-SCREEN', prevNodes: ['A: 시작'], nextNodes: ['C: 입력값·권한 검증'] },
      { id: 'C', label: '3. 입력값 · 권한 검증', prevNodes: ['B: 선택화면'], nextNodes: ['B: 오류 시 복귀', 'D: START-OF-SELECTION'] },
      { id: 'D', label: '4. START-OF-SELECTION', prevNodes: ['C: 검증 통과'], nextNodes: ['E: 상단 헤더 추출'] },
      { id: 'E', label: `5. 상단 헤더 추출 / ${hdrMain}`, shape: 'cylinder', prevNodes: ['D: START-OF-SELECTION'], nextNodes: ['F: 상단 ALV 출력'] },
      { id: 'F', label: '6. 상단 ALV 출력 / 0100 PBO', prevNodes: ['E: 상단 헤더 추출'], nextNodes: ['G: 상단 행 선택'] },
      { id: 'G', label: `7. 상단 행 선택 / ${fk}`, prevNodes: ['F: 상단 ALV'], nextNodes: ['H: 하단 상세 추출'] },
      { id: 'H', label: `8. 하단 상세 추출 / ${itmMain}`, shape: 'cylinder', prevNodes: ['G: 행 선택'], nextNodes: ['I: 하단 ALV 동기화'] },
      { id: 'I', label: '9. 하단 ALV 동기화 / REFRESH', prevNodes: ['H: 하단 상세 추출'], nextNodes: ['J: 사용자 명령'] },
      { id: 'J', label: '10. 사용자 명령 / PAI', prevNodes: ['I: 하단 ALV 동기화'], nextNodes: ['K: 드릴다운·후속 처리', 'L: 종료'] },
      { id: 'K', label: '11. 드릴다운 · 후속 처리', prevNodes: ['J: 사용자 명령'], nextNodes: ['F: 화면 복귀/갱신'] },
      { id: 'L', label: '12. 종료 / LEAVE TO SCREEN 0', prevNodes: ['J: 종료 명령'] },
    ];
  } else {
    const mainTblStr = headerTables.slice(0, 3).join(', ') || mod;
    const modeLabel =
      spec.sample_type === '04'
        ? '다차원 피벗(CDS) 집계'
        : spec.sample_type === '03'
        ? '계층 트리(Tree) 구조 구성'
        : '비즈니스 계산 · 신호등';
    mermaid_code = `graph TD;
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
    nodeSpecs = [
      { id: 'A', label: '1. 시작 / INITIALIZATION', nextNodes: ['B: 선택화면'] },
      { id: 'B', label: '2. 선택화면 / SELECTION-SCREEN', prevNodes: ['A: 시작'], nextNodes: ['C: 입력값·권한 검증'] },
      { id: 'C', label: '3. 입력값 · 권한 검증', prevNodes: ['B: 선택화면'], nextNodes: ['B: 오류 시 복귀', 'D: START-OF-SELECTION'] },
      { id: 'D', label: '4. START-OF-SELECTION', prevNodes: ['C: 검증 통과'], nextNodes: ['E: 데이터 추출'] },
      { id: 'E', label: `5. 데이터 추출 / ${mainTblStr}`, shape: 'cylinder', prevNodes: ['D: START-OF-SELECTION'], nextNodes: [`F: ${modeLabel}`] },
      { id: 'F', label: `6. ${modeLabel}`, prevNodes: ['E: 데이터 추출'], nextNodes: ['G: ALV 그리드 출력'] },
      { id: 'G', label: '7. ALV 그리드 출력 / 0100 PBO', prevNodes: ['F: 데이터 가공'], nextNodes: ['H: 사용자 명령'] },
      { id: 'H', label: '8. 사용자 명령 / PAI', prevNodes: ['G: ALV 출력'], nextNodes: ['I: 드릴다운', 'J: 후속 처리', 'K: 종료'] },
      { id: 'I', label: '9. 표준 T-Code 연계 조회', prevNodes: ['H: 핫스팟'], nextNodes: ['G: 화면 복귀'] },
      { id: 'J', label: '9-1. 후속 처리 · 내보내기', prevNodes: ['H: 툴바'], nextNodes: ['G: 화면 갱신'] },
      { id: 'K', label: '10. 종료 / LEAVE TO SCREEN 0', prevNodes: ['H: 종료 명령'] },
    ];
  }

  const node_details: Record<string, { label: string; markdown: string }> = {};
  nodeSpecs.forEach((n) => {
    node_details[n.id] = {
      label: n.label,
      markdown: buildRichNodeDetailMarkdown(spec, n),
    };
  });

  return {
    title: `${spec.program_id || 'ALV'} Data Flow Diagram`,
    mermaid_code,
    node_details,
    active_node_id: 'A',
  };
}

/**
 * Automatically builds or personalizes a Data Flow diagram from a ProgramSpec
 */
export function generateDataFlowFromSpec(spec: ProgramSpec): DataFlowDiagramConfig {
  const rich = generateRichDataFlowFromSpec(spec);
  return {
    ...rich,
    nodes: JSON.parse(JSON.stringify(DEFAULT_CANVAS_NODES)) as CanvasNode[],
    edges: JSON.parse(JSON.stringify(DEFAULT_CANVAS_EDGES)) as CanvasEdge[],
  };
}

/**
 * Automatically calculates neat vertical/horizontal hierarchical layout for canvas nodes and routes orthogonal edges
 */
export function autoLayoutFlowchart(
  nodes: CanvasNode[],
  edges: CanvasEdge[]
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  if (nodes.length === 0) return { nodes, edges };

  const dbNodes = nodes.filter((n) => n.type === 'database');
  const flowNodes = nodes.filter((n) => n.type !== 'database');

  const incomingCount: Record<string, number> = {};
  flowNodes.forEach((n) => {
    incomingCount[n.id] = 0;
  });
  edges.forEach((e) => {
    if (incomingCount[e.to] !== undefined && e.from !== e.to) {
      incomingCount[e.to] = (incomingCount[e.to] || 0) + 1;
    }
  });

  const startNode = flowNodes.find((n) => n.type === 'start');
  const roots = startNode
    ? [startNode, ...flowNodes.filter((n) => n.id !== startNode.id && incomingCount[n.id] === 0)]
    : flowNodes.filter((n) => incomingCount[n.id] === 0);

  const levels: CanvasNode[][] = [];
  const visited = new Set<string>();

  const initialLevel = roots.length > 0 ? roots : [flowNodes[0]];
  initialLevel.forEach((n) => visited.add(n.id));
  levels.push(initialLevel);

  let currentLevel = initialLevel;
  while (currentLevel.length > 0 && visited.size < flowNodes.length) {
    const nextLevel: CanvasNode[] = [];
    currentLevel.forEach((parent) => {
      const childEdges = edges.filter((e) => e.from === parent.id);
      childEdges.forEach((e) => {
        const child = flowNodes.find((n) => n.id === e.to);
        if (child && !visited.has(child.id)) {
          visited.add(child.id);
          nextLevel.push(child);
        }
      });
    });

    if (nextLevel.length === 0) {
      const unvisited = flowNodes.filter((n) => !visited.has(n.id));
      if (unvisited.length > 0) {
        visited.add(unvisited[0].id);
        nextLevel.push(unvisited[0]);
      }
    }

    if (nextLevel.length > 0) {
      levels.push(nextLevel);
      currentLevel = nextLevel;
    } else {
      break;
    }
  }

  const layoutedNodes: CanvasNode[] = [];
  const mainCenterX = 300;
  let currentY = 35;

  levels.forEach((levelNodes) => {
    const count = levelNodes.length;
    let maxH = 38;

    if (count === 1) {
      const node = levelNodes[0];
      const w = node.width || 120;
      const h = node.height || 38;
      maxH = Math.max(maxH, h);
      layoutedNodes.push({
        ...node,
        x: Math.round(mainCenterX - w / 2),
        y: currentY,
      });
    } else if (count === 2) {
      const [leftNode, rightNode] = levelNodes;
      const w1 = leftNode.width || 110;
      const h1 = leftNode.height || 38;
      const w2 = rightNode.width || 110;
      const h2 = rightNode.height || 38;
      maxH = Math.max(maxH, h1, h2);

      layoutedNodes.push({
        ...leftNode,
        x: Math.round(mainCenterX - w1 - 25),
        y: currentY,
      });
      layoutedNodes.push({
        ...rightNode,
        x: Math.round(mainCenterX + 25),
        y: currentY,
      });
    } else {
      const spacing = 135;
      const totalWidth = count * spacing;
      const startX = mainCenterX - totalWidth / 2 + spacing / 2;

      levelNodes.forEach((node, idx) => {
        const w = node.width || 110;
        const h = node.height || 38;
        maxH = Math.max(maxH, h);
        layoutedNodes.push({
          ...node,
          x: Math.round(startX + idx * spacing - w / 2),
          y: currentY,
        });
      });
    }

    currentY += maxH + 40;
  });

  let dbY = 160;
  dbNodes.forEach((dbNode) => {
    const connectedEdges = edges.filter((e) => e.from === dbNode.id || e.to === dbNode.id);
    const targetFlowId =
      connectedEdges.find((e) => e.from === dbNode.id)?.to ||
      connectedEdges.find((e) => e.to === dbNode.id)?.from;
    const targetNode = targetFlowId ? layoutedNodes.find((n) => n.id === targetFlowId) : null;

    const finalY = targetNode ? Math.max(30, targetNode.y - 10) : dbY;

    layoutedNodes.push({
      ...dbNode,
      x: 45,
      y: finalY,
    });
    dbY = finalY + (dbNode.height || 60) + 40;
  });

  const updatedEdges = edges.map((e) => {
    const fromN = layoutedNodes.find((n) => n.id === e.from);
    const toN = layoutedNodes.find((n) => n.id === e.to);
    if (!fromN || !toN) return e;

    if (fromN.type === 'database') {
      return { ...e, fromPort: 'right' as PortPosition, toPort: 'left' as PortPosition };
    }
    if (toN.type === 'database') {
      return { ...e, fromPort: 'left' as PortPosition, toPort: 'right' as PortPosition };
    }
    if (toN.y < fromN.y) {
      return { ...e, fromPort: 'right' as PortPosition, toPort: 'right' as PortPosition };
    }
    if (fromN.x < toN.x - 30) {
      return { ...e, fromPort: 'right' as PortPosition, toPort: 'top' as PortPosition };
    }
    if (fromN.x > toN.x + 30) {
      return { ...e, fromPort: 'left' as PortPosition, toPort: 'top' as PortPosition };
    }
    return { ...e, fromPort: 'bottom' as PortPosition, toPort: 'top' as PortPosition };
  });

  return { nodes: layoutedNodes, edges: updatedEdges };
}
