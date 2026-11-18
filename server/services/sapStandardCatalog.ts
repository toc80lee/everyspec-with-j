export type SapModuleCode = 'SD' | 'MM' | 'FI' | 'CO' | 'PP' | 'HR' | 'QM' | 'PM' | 'BC' | 'CM';

export interface SapModuleBlueprint {
  module: SapModuleCode;
  moduleLabelKo: string;
  headerTables: string[];
  itemTables: string[];
  masterTables: string[];
  foreignKey: string;
  defaultProgramId: string;
  defaultTcode: string;
  defaultTitleKo: string;
  headerGridTitleKo: string;
  itemGridTitleKo: string;
  cdsViewTable: string;
  summaryPurposeKo: string;
  extractionLogicKo: string;
  selectionParams: Array<{
    kind: 'PARAMETER' | 'SELECT_OPTION' | 'RADIOBUTTON' | 'CHECKBOX';
    name: string;
    text: string;
    ref_table?: string;
    ref_field?: string;
    datatype: string;
    length: number;
    obligatory?: boolean;
    default_val?: string;
    block_title: string;
    radio_group?: string;
  }>;
  headerFields: Array<{
    fieldname: string;
    coltext: string;
    datatype: string;
    outputlen: number;
    just: 'L' | 'C' | 'R';
    key?: boolean;
    hotspot?: boolean;
    drilldown_tcode?: string;
    do_sum?: boolean;
    cfieldname?: string;
    qfieldname?: string;
    ref_table: string;
    ref_field: string;
    icon_type?: 'LIGHTS';
  }>;
  itemFields: Array<{
    fieldname: string;
    coltext: string;
    datatype: string;
    outputlen: number;
    just: 'L' | 'C' | 'R';
    key?: boolean;
    hotspot?: boolean;
    drilldown_tcode?: string;
    do_sum?: boolean;
    cfieldname?: string;
    qfieldname?: string;
    ref_table: string;
    ref_field: string;
  }>;
  authorityChecks: Array<{
    object: string;
    fields: string;
    trigger_point: string;
    description: string;
  }>;
  sapMessages: Array<{
    msg_no: string;
    msg_type: 'E' | 'W' | 'I' | 'S';
    text: string;
    trigger_condition: string;
  }>;
  customToolbar: Array<{
    function: string;
    text: string;
    quickinfo: string;
    icon: string;
  }>;
}

const MODULE_SCORING_RULES: Record<
  SapModuleCode,
  { tables: string[]; tcodes: string[]; keywords: string[] }
> = {
  FI: {
    tables: ['BKPF', 'BSEG', 'ACDOCA', 'BSID', 'BSAD', 'BSIK', 'BSAK', 'BSIS', 'BSAS', 'SKA1', 'SKAT', 'FAGLFLEXA', 'KNB1', 'LFB1'],
    tcodes: ['FB03', 'FB01', 'FB50', 'FB60', 'FB70', 'FBL1N', 'FBL3N', 'FBL5N', 'FS03', 'FAGLL03', 'F110'],
    keywords: [
      '회계', '전표', '재무', '총계정원장', '계정과목', '차변', '대변', '차대변', '미결', '반제',
      '채권', '채무', '외상매출', '외상매입', '지급', '수금', '부가세', '세금계산서', '결산', '전기일자',
      '증빙일자', '전표유형', '분개', 'G/L', 'GL계정', 'AR ', 'AP ', 'FI ', 'FI/', 'FICO',
    ],
  },
  CO: {
    tables: ['CSKS', 'CSKT', 'COEP', 'COSP', 'COSS', 'CSKA', 'CSKB', 'CEPC', 'CEPCT', 'SETNODE', 'SETLEAF', 'COBK'],
    tcodes: ['KS03', 'KSB1', 'KA03', 'KE53', 'KE5Z', 'KO03', 'KOB1', 'CK13N', 'CKM3'],
    keywords: [
      '원가', '코스트', '코스트센터', '원가요소', '손익센터', '내부오더', '관리회계', '예산', '실적',
      '계획대비', '배부', '정산', '제조원가', '표준원가', '실제원가', '계층구조', 'CO ', 'CO/',
    ],
  },
  SD: {
    tables: ['VBAK', 'VBAP', 'VBEP', 'VBKD', 'LIKP', 'LIPS', 'VBRK', 'VBRP', 'VBUK', 'VBUP', 'KNA1', 'KNVV', 'KONV'],
    tcodes: ['VA01', 'VA02', 'VA03', 'VA05', 'VL01N', 'VL02N', 'VL03N', 'VF01', 'VF03', 'XD03', 'VK13'],
    keywords: [
      '영업', '판매', '판매오더', '수주', '견적', '납품', '출하', '출고', '대금청구', '빌링', '매출',
      '여신', '영업조직', '유통채널', '수금처', '납품처', '단가조건', 'SD ', 'SD/',
    ],
  },
  MM: {
    tables: ['EKKO', 'EKPO', 'EKET', 'EKBE', 'EBAN', 'MKPF', 'MSEG', 'MATDOC', 'MARA', 'MAKT', 'MARC', 'MARD', 'MBEW', 'LFA1', 'LFM1', 'RBKP', 'RSEG'],
    tcodes: ['ME21N', 'ME22N', 'ME23N', 'ME2M', 'ME2N', 'ME51N', 'ME53N', 'MIGO', 'MIRO', 'MB51', 'MB52', 'MM03', 'XK03'],
    keywords: [
      '구매', '발주', '구매오더', '구매요청', '입고', '자재', '재고', '저장위치', '공급업체', '벤더',
      '송장검수', '단가', '납기지연', '미입고', '단가계약', '플랜트', 'MM ', 'MM/',
    ],
  },
  PP: {
    tables: ['AFKO', 'AFPO', 'AUFK', 'RESB', 'AFVC', 'AFVV', 'CRHD', 'MAST', 'STKO', 'STPO', 'PLKO', 'MDTB'],
    tcodes: ['CO01', 'CO02', 'CO03', 'COOIS', 'MD04', 'CS03', 'CA03', 'CR03', 'CO11N'],
    keywords: [
      '생산', '생산오더', '작업지시', '공정', '작업장', '소요량', '자재소요', '투입', '실적입력', '양품',
      '스크랩', 'MRP', 'BOM', '라우팅', '생산계획', 'PP ', 'PP/',
    ],
  },
  QM: {
    tables: ['QALS', 'QAMV', 'QAMR', 'QAVE', 'QMAT', 'QMSM', 'QMFE'],
    tcodes: ['QA01', 'QA02', 'QA03', 'QA11', 'QA32', 'QS23', 'QM03'],
    keywords: ['품질', '검사', '검사로트', '사용결정', '불량', '합격', '샘플링', '검사항목', '성적서', 'QM ', 'QM/'],
  },
  PM: {
    tables: ['AFIH', 'EQUI', 'EQKT', 'IFLOT', 'IFLO', 'QMEL', 'VIQMEL', 'ILOA'],
    tcodes: ['IW21', 'IW23', 'IW31', 'IW32', 'IW33', 'IW38', 'IE03', 'IL03', 'IP10'],
    keywords: ['설비', '보전', '설비보전', '예방정비', '고장', '통지', '점검', '정비오더', '기능위치', 'PM ', 'PM/'],
  },
  HR: {
    tables: ['PA0001', 'PA0002', 'PA0006', 'PA0007', 'PA0008', 'PA2001', 'PA2002', 'HRP1000', 'HRP1001'],
    tcodes: ['PA20', 'PA30', 'PT61', 'PC00', 'PPOME'],
    keywords: ['인사', '급여', '근태', '사원', '사번', '조직도', '직급', '휴가', '연차', '발령', 'HR ', 'HR/', 'HCM'],
  },
  BC: {
    tables: ['TBTCO', 'TBTCP', 'BALHDR', 'EDIDC', 'EDIDS', 'USR02', 'AGR_USERS', 'CDHDR', 'CDPOS'],
    tcodes: ['SM37', 'SLG1', 'WE02', 'WE05', 'SU01', 'ST22', 'SM59', 'SE38'],
    keywords: ['배치잡', '인터페이스', 'RFC', 'IDOC', '시스템로그', '권한감사', '백그라운드', '모니터링로그', 'BC ', 'BASIS'],
  },
  CM: {
    tables: ['T001', 'TCURR', 'T005', 'ZTCM_CODE_H', 'ZTCM_CODE_D'],
    tcodes: ['SM30', 'OB08', 'OY01'],
    keywords: ['공통영역', '공통 영역', '공통코드', '기준정보', '환율관리', '결재선', '공통모듈', 'CM '],
  },
};

export function detectSapModuleWithScores(text: string): {
  module: SapModuleCode;
  scores: Record<SapModuleCode, number>;
  matchedTables: string[];
} {
  const upper = String(text || '').toUpperCase();
  const scores: Record<SapModuleCode, number> = {
    FI: 0, CO: 0, SD: 0, MM: 0, PP: 0, QM: 0, PM: 0, HR: 0, BC: 0, CM: 0,
  };
  const matchedTables: string[] = [];

  (Object.keys(MODULE_SCORING_RULES) as SapModuleCode[]).forEach((mod) => {
    const rule = MODULE_SCORING_RULES[mod];
    for (const tbl of rule.tables) {
      if (new RegExp(`\\b${tbl}\\b`).test(upper)) {
        scores[mod] += 10;
        if (!matchedTables.includes(tbl)) matchedTables.push(tbl);
      }
    }
    for (const tc of rule.tcodes) {
      if (new RegExp(`\\b${tc}\\b`).test(upper)) {
        scores[mod] += 6;
      }
    }
    for (const kw of rule.keywords) {
      if (upper.includes(kw.toUpperCase())) {
        scores[mod] += kw.trim().length <= 3 ? 5 : 3;
      }
    }
  });

  // Explicit Korean phrasing disambiguation (e.g., "FI 전표" vs "판매오더")
  if (/\bFI\b/.test(upper)) scores.FI += 8;
  if (/\bCO\b/.test(upper)) scores.CO += 8;
  if (/\bSD\b/.test(upper)) scores.SD += 8;
  if (/\bMM\b/.test(upper)) scores.MM += 8;
  if (/\bPP\b/.test(upper)) scores.PP += 8;
  if (/\bQM\b/.test(upper)) scores.QM += 8;
  if (/\bPM\b/.test(upper)) scores.PM += 8;
  if (/\bHR\b/.test(upper)) scores.HR += 8;
  if (/\bBC\b/.test(upper)) scores.BC += 8;
  if (/\bCM\b/.test(upper)) scores.CM += 8;

  let bestMod: SapModuleCode = 'SD';
  let bestScore = -1;
  // Tie-break order prioritizes FI/MM/CO/SD before general fallback
  const order: SapModuleCode[] = ['FI', 'CO', 'MM', 'SD', 'PP', 'QM', 'PM', 'HR', 'BC', 'CM'];
  for (const mod of order) {
    if (scores[mod] > bestScore) {
      bestScore = scores[mod];
      bestMod = mod;
    }
  }

  if (bestScore <= 0) {
    bestMod = 'SD';
  }

  return { module: bestMod, scores, matchedTables };
}

export const SAP_MODULE_BLUEPRINTS: Record<SapModuleCode, SapModuleBlueprint> = {
  FI: {
    module: 'FI',
    moduleLabelKo: 'FI (재무회계)',
    headerTables: ['BKPF', 'T001', 'KNA1', 'LFA1'],
    itemTables: ['BSEG', 'ACDOCA', 'SKAT', 'CSKS'],
    masterTables: ['SKA1', 'SKAT', 'KNA1', 'LFA1', 'T001'],
    foreignKey: 'BELNR',
    defaultProgramId: 'ZFI_R_DOC_DETAIL',
    defaultTcode: 'ZFI010',
    defaultTitleKo: '회계전표 헤더 및 분개 상세 조회',
    headerGridTitleKo: '회계전표 헤더 목록 (BKPF)',
    itemGridTitleKo: '선택 전표 분개 상세 내역 (BSEG / ACDOCA)',
    cdsViewTable: 'ACDOCA',
    summaryPurposeKo:
      '회사코드, 회계연도, 전기일자, 전표유형, G/L 계정 및 거래처 조건으로 회계전표 헤더(`BKPF`)를 조회하고, 상단 전표 선택 시 하단 개별항목(`BSEG`/`ACDOCA`)의 차대변 분개, 계정과목명(`SKAT`), 코스트센터, 적요 및 통화별 금액 상세를 즉시 확인합니다.',
    extractionLogicKo: `1. **주요 표준 테이블 및 조인 관계 (상단/하단 분리 구조)**
   - **상단 헤더 (\`BKPF\`, \`T001\`)**: \`BKPF~BUKRS = P_BUKRS\`, \`BKPF~GJAHR = P_GJAHR\`, \`BKPF~BUDAT IN S_BUDAT\`, \`BKPF~BLART IN S_BLART\`, \`BKPF~BELNR IN S_BELNR\` 조건으로 전표 헤더 추출
   - **하단 분개 상세 (\`BSEG\` / \`ACDOCA\`, \`SKAT\`, \`KNA1\`, \`LFA1\`)**: 상단에서 선택한 전표의 복합 키(\`BUKRS\`, \`BELNR\`, \`GJAHR\`) 기준으로 개별항목(\`BUZEI\`) 조회 후 \`SKAT\`(계정명, \`SPRAS = SY-LANGU\`) 및 거래처명(\`KNA1\`/\`LFA1\`) 매핑
2. **차대변 집계 및 잔액 검증 로직**
   - 차변(\`SHKZG = 'S'\`)과 대변(\`SHKZG = 'H'\`) 금액을 분리 산출하여 전표별 차대변 합계 일치 여부 검증
   - 환율(\`KURSF\`) 및 전표통화(\`WAERS\`) 기준 현지통화금액(\`DMBTR\`)과 거래통화금액(\`WRBTR\`) 병행 표기
3. **상태 신호등 판정 기준 (\`ZICON\`)**
   - \`'3' (Red)\`: 역분개 전표(\`STBLG IS NOT INITIAL\`) 또는 차대 불일치·증빙 오류 건
   - \`'2' (Yellow)\`: 미결(Open Item) 관리 대상 미반제 항목(\`AUGBL IS INITIAL\`) 또는 임시전표
   - \`'1' (Green)\`: 정상 전기 및 반제/검증 완료 전표
4. **ALV 출력 및 상호작용 규칙**
   - 상단 \`BKPF-BELNR\` 및 하단 \`BSEG-HKONT\`, \`BSEG-KOSTL\` 핫스팟 클릭 시 \`FB03\` / \`FS03\` / \`KS03\` 표준 화면 연계
   - 상단 행 더블클릭 또는 클릭 시 하단 Item ALV \`REFRESH_TABLE_DISPLAY\` 즉시 동기화`,
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_BUKRS', text: '회사코드 (Company Code)', ref_table: 'BKPF', ref_field: 'BUKRS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', block_title: '기본 조회 조건' },
      { kind: 'PARAMETER', name: 'P_GJAHR', text: '회계연도 (Fiscal Year)', ref_table: 'BKPF', ref_field: 'GJAHR', datatype: 'NUMC', length: 4, obligatory: true, default_val: '2026', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_BUDAT', text: '전기일자 (Posting Date)', ref_table: 'BKPF', ref_field: 'BUDAT', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_BELNR', text: '회계전표번호 (Doc No.)', ref_table: 'BKPF', ref_field: 'BELNR', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_title: '전표 및 계정 필터' },
      { kind: 'SELECT_OPTION', name: 'S_BLART', text: '전표유형 (Doc Type)', ref_table: 'BKPF', ref_field: 'BLART', datatype: 'CHAR', length: 2, obligatory: false, default_val: '', block_title: '전표 및 계정 필터' },
      { kind: 'SELECT_OPTION', name: 'S_HKONT', text: 'G/L 계정 (G/L Account)', ref_table: 'BSEG', ref_field: 'HKONT', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_title: '전표 및 계정 필터' },
      { kind: 'RADIOBUTTON', name: 'P_ALL', text: '전체 전표 조회', datatype: 'CHAR', length: 1, default_val: 'X', block_title: '조회 옵션', radio_group: 'R1' },
      { kind: 'RADIOBUTTON', name: 'P_OPEN', text: '미결(Open Item) 포함 전표만', datatype: 'CHAR', length: 1, default_val: '', block_title: '조회 옵션', radio_group: 'R1' },
      { kind: 'CHECKBOX', name: 'P_REV', text: '역분개(Reversed) 전표 제외', datatype: 'CHAR', length: 1, default_val: 'X', block_title: '조회 옵션' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, icon_type: 'LIGHTS', ref_table: '', ref_field: '' },
      { fieldname: 'BUKRS', coltext: '회사코드', datatype: 'CHAR', outputlen: 6, just: 'C', key: true, ref_table: 'BKPF', ref_field: 'BUKRS' },
      { fieldname: 'BELNR', coltext: '회계전표', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, hotspot: true, drilldown_tcode: 'FB03', ref_table: 'BKPF', ref_field: 'BELNR' },
      { fieldname: 'GJAHR', coltext: '회계연도', datatype: 'NUMC', outputlen: 6, just: 'C', key: true, ref_table: 'BKPF', ref_field: 'GJAHR' },
      { fieldname: 'BLART', coltext: '유형', datatype: 'CHAR', outputlen: 4, just: 'C', ref_table: 'BKPF', ref_field: 'BLART' },
      { fieldname: 'BLDAT', coltext: '증빙일자', datatype: 'DATS', outputlen: 10, just: 'C', ref_table: 'BKPF', ref_field: 'BLDAT' },
      { fieldname: 'BUDAT', coltext: '전기일자', datatype: 'DATS', outputlen: 10, just: 'C', ref_table: 'BKPF', ref_field: 'BUDAT' },
      { fieldname: 'BKTXT', coltext: '전표헤더텍스트', datatype: 'CHAR', outputlen: 28, just: 'L', ref_table: 'BKPF', ref_field: 'BKTXT' },
      { fieldname: 'DMBTR', coltext: '총전표금액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERS', ref_table: 'BSEG', ref_field: 'DMBTR' },
      { fieldname: 'WAERS', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', ref_table: 'BKPF', ref_field: 'WAERS' },
      { fieldname: 'USNAM', coltext: '입력자', datatype: 'CHAR', outputlen: 12, just: 'L', ref_table: 'BKPF', ref_field: 'USNAM' },
    ],
    itemFields: [
      { fieldname: 'BELNR', coltext: '회계전표', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, ref_table: 'BSEG', ref_field: 'BELNR' },
      { fieldname: 'BUZEI', coltext: '항번', datatype: 'NUMC', outputlen: 4, just: 'C', key: true, ref_table: 'BSEG', ref_field: 'BUZEI' },
      { fieldname: 'BSCHL', coltext: '전기키', datatype: 'CHAR', outputlen: 4, just: 'C', ref_table: 'BSEG', ref_field: 'BSCHL' },
      { fieldname: 'SHKZG', coltext: '차/대', datatype: 'CHAR', outputlen: 4, just: 'C', ref_table: 'BSEG', ref_field: 'SHKZG' },
      { fieldname: 'HKONT', coltext: 'G/L계정', datatype: 'CHAR', outputlen: 10, just: 'C', hotspot: true, drilldown_tcode: 'FS03', ref_table: 'BSEG', ref_field: 'HKONT' },
      { fieldname: 'TXT50', coltext: '계정과목명', datatype: 'CHAR', outputlen: 32, just: 'L', ref_table: 'SKAT', ref_field: 'TXT50' },
      { fieldname: 'KOSTL', coltext: '코스트센터', datatype: 'CHAR', outputlen: 10, just: 'C', hotspot: true, drilldown_tcode: 'KS03', ref_table: 'BSEG', ref_field: 'KOSTL' },
      { fieldname: 'MWSKZ', coltext: '세금코드', datatype: 'CHAR', outputlen: 4, just: 'C', ref_table: 'BSEG', ref_field: 'MWSKZ' },
      { fieldname: 'DMBTR', coltext: '현지금액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERS', ref_table: 'BSEG', ref_field: 'DMBTR' },
      { fieldname: 'WAERS', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', ref_table: 'BKPF', ref_field: 'WAERS' },
      { fieldname: 'SGTXT', coltext: '항목적요', datatype: 'CHAR', outputlen: 36, just: 'L', ref_table: 'BSEG', ref_field: 'SGTXT' },
    ],
    authorityChecks: [
      { object: 'F_BKPF_BUK', fields: "BUKRS = P_BUKRS, ACTVT = '03'", trigger_point: 'AT SELECTION-SCREEN / START-OF-SELECTION', description: '회사코드별 회계전표 조회 권한 점검' },
      { object: 'F_BKPF_BLA', fields: "BLART = '*', ACTVT = '03'", trigger_point: 'START-OF-SELECTION', description: '전표유형별 조회 권한 검증' },
    ],
    sapMessages: [
      { msg_no: '001', msg_type: 'E', text: '회사코드 &1의 회계전표 조회 권한이 없습니다.', trigger_condition: 'F_BKPF_BUK 권한 점검 실패 시' },
      { msg_no: '002', msg_type: 'S', text: '조건에 해당하는 회계전표 &1건이 조회되었습니다.', trigger_condition: '상단 헤더 조회 완료 시' },
      { msg_no: '003', msg_type: 'I', text: '선택한 전표의 차대변 합계가 일치하지 않거나 역분개 전표입니다.', trigger_condition: '하단 분개 검증 경고 시' },
    ],
    customToolbar: [
      { function: 'FB03_VIEW', text: '전표원본조회', quickinfo: '선택 전표 FB03 상세 화면 이동', icon: 'ICON_DISPLAY' },
      { function: 'EXPORT_XLS', text: '분개명세다운', quickinfo: '선택 전표 헤더+분개 상세 내역 내려받기', icon: 'ICON_XLS' },
    ],
  },

  SD: {
    module: 'SD',
    moduleLabelKo: 'SD (영업/판매)',
    headerTables: ['VBAK', 'KNA1', 'VBUK'],
    itemTables: ['VBAP', 'LIPS', 'VBRP', 'MAKT'],
    masterTables: ['KNA1', 'KNVV', 'MARA', 'MAKT'],
    foreignKey: 'VBELN',
    defaultProgramId: 'ZSD_R_ORDER_DELIV',
    defaultTcode: 'ZSD010',
    defaultTitleKo: '판매오더 헤더 및 납품 품목 상세 현황',
    headerGridTitleKo: '판매오더 헤더 목록 (VBAK)',
    itemGridTitleKo: '선택 오더 품목 및 납품 상세 (VBAP / LIPS)',
    cdsViewTable: 'I_SalesDocumentItem',
    summaryPurposeKo:
      '영업조직, 오더일자, 판매오더, 고객코드 기준으로 판매오더 헤더(`VBAK`/`KNA1`)를 조회하고, 상단 오더 선택 시 하단 품목(`VBAP`/`LIPS`)의 주문수량, 출하수량, 미납잔량, 공급가액 및 납기 상태 상세를 실시간으로 확인합니다.',
    extractionLogicKo: `1. **주요 표준 테이블 및 조인 관계 (상단/하단 분리 구조)**
   - **상단 헤더 (\`VBAK\`, \`KNA1\`)**: \`VKORG = P_VKORG\`, \`ERDAT IN S_ERDAT\`, \`VBELN IN S_VBELN\`, \`KUNNR IN S_KUNNR\` 조건으로 오더 헤더 및 고객명 추출
   - **하단 품목 (\`VBAP\`, \`LIPS\`, \`VBRP\`, \`MAKT\`)**: 선택 오더(\`VBELN\`) 기준 품목(\`POSNR\`)과 납품실적(\`LIPS-LFIMG\`)·청구금액(\`VBRP\`) 집계
2. **미납수량 및 진행률 계산 로직**
   - 미납잔량 = \`VBAP-KWMENG\` - \`SUM(LIPS-LFIMG)\`
   - 여신상태(\`CMGST\`) 및 납품보류(\`LIFSK\`) 코드 점검
3. **상태 신호등 판정 기준 (\`ZICON\`)**
   - \`'3' (Red)\`: 여신 보류(\`CMGST = 'B'\`) 또는 납기일 경과 미출하
   - \`'2' (Yellow)\`: 부분 납품 진행 중(\`OPEN_QTY > 0\`)
   - \`'1' (Green)\`: 전량 출하 및 대금청구 완료
4. **ALV 출력 및 드릴다운**
   - \`VBELN\` 클릭 시 \`VA03\`, \`KUNNR\` 클릭 시 \`XD03\`, 하단 \`MATNR\` 클릭 시 \`MM03\` 연계`,
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_VKORG', text: '영업조직 (Sales Org)', ref_table: 'VBAK', ref_field: 'VKORG', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_ERDAT', text: '오더일자 (Order Date)', ref_table: 'VBAK', ref_field: 'ERDAT', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_VBELN', text: '판매오더 (Sales Order)', ref_table: 'VBAK', ref_field: 'VBELN', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_title: '오더 및 고객 필터' },
      { kind: 'SELECT_OPTION', name: 'S_KUNNR', text: '고객코드 (Customer)', ref_table: 'VBAK', ref_field: 'KUNNR', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_title: '오더 및 고객 필터' },
      { kind: 'SELECT_OPTION', name: 'S_AUART', text: '오더유형 (Order Type)', ref_table: 'VBAK', ref_field: 'AUART', datatype: 'CHAR', length: 4, obligatory: false, default_val: '', block_title: '오더 및 고객 필터' },
      { kind: 'RADIOBUTTON', name: 'P_ALL', text: '전체 판매오더', datatype: 'CHAR', length: 1, default_val: 'X', block_title: '조회 옵션', radio_group: 'R1' },
      { kind: 'RADIOBUTTON', name: 'P_OPEN', text: '미납/출하대기 오더만', datatype: 'CHAR', length: 1, default_val: '', block_title: '조회 옵션', radio_group: 'R1' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, icon_type: 'LIGHTS', ref_table: '', ref_field: '' },
      { fieldname: 'VBELN', coltext: '판매오더', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, drilldown_tcode: 'VA03', ref_table: 'VBAK', ref_field: 'VBELN' },
      { fieldname: 'AUART', coltext: '오더유형', datatype: 'CHAR', outputlen: 6, just: 'C', ref_table: 'VBAK', ref_field: 'AUART' },
      { fieldname: 'ERDAT', coltext: '오더일자', datatype: 'DATS', outputlen: 10, just: 'C', ref_table: 'VBAK', ref_field: 'ERDAT' },
      { fieldname: 'VDATU', coltext: '납기요청일', datatype: 'DATS', outputlen: 10, just: 'C', ref_table: 'VBAK', ref_field: 'VDATU' },
      { fieldname: 'KUNNR', coltext: '고객코드', datatype: 'CHAR', outputlen: 10, just: 'C', hotspot: true, drilldown_tcode: 'XD03', ref_table: 'VBAK', ref_field: 'KUNNR' },
      { fieldname: 'NAME1', coltext: '고객명', datatype: 'CHAR', outputlen: 30, just: 'L', ref_table: 'KNA1', ref_field: 'NAME1' },
      { fieldname: 'NETWR', coltext: '총공급가액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERK', ref_table: 'VBAK', ref_field: 'NETWR' },
      { fieldname: 'WAERK', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', ref_table: 'VBAK', ref_field: 'WAERK' },
      { fieldname: 'LIFSK', coltext: '납품보류', datatype: 'CHAR', outputlen: 6, just: 'C', ref_table: 'VBAK', ref_field: 'LIFSK' },
    ],
    itemFields: [
      { fieldname: 'VBELN', coltext: '판매오더', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, ref_table: 'VBAP', ref_field: 'VBELN' },
      { fieldname: 'POSNR', coltext: '품목', datatype: 'NUMC', outputlen: 6, just: 'C', key: true, ref_table: 'VBAP', ref_field: 'POSNR' },
      { fieldname: 'MATNR', coltext: '자재코드', datatype: 'CHAR', outputlen: 16, just: 'L', hotspot: true, drilldown_tcode: 'MM03', ref_table: 'VBAP', ref_field: 'MATNR' },
      { fieldname: 'ARKTX', coltext: '자재내역', datatype: 'CHAR', outputlen: 32, just: 'L', ref_table: 'VBAP', ref_field: 'ARKTX' },
      { fieldname: 'WERKS', coltext: '출하플랜트', datatype: 'CHAR', outputlen: 6, just: 'C', ref_table: 'VBAP', ref_field: 'WERKS' },
      { fieldname: 'KWMENG', coltext: '주문수량', datatype: 'DEC', outputlen: 12, just: 'R', do_sum: true, qfieldname: 'VRKME', ref_table: 'VBAP', ref_field: 'KWMENG' },
      { fieldname: 'LFIMG', coltext: '납품수량', datatype: 'DEC', outputlen: 12, just: 'R', do_sum: true, qfieldname: 'VRKME', ref_table: 'LIPS', ref_field: 'LFIMG' },
      { fieldname: 'OPEN_QTY', coltext: '미납잔량', datatype: 'DEC', outputlen: 12, just: 'R', do_sum: true, qfieldname: 'VRKME', ref_table: 'VBAP', ref_field: 'KWMENG' },
      { fieldname: 'VRKME', coltext: '단위', datatype: 'UNIT', outputlen: 4, just: 'C', ref_table: 'VBAP', ref_field: 'VRKME' },
      { fieldname: 'NETWR', coltext: '품목금액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERK', ref_table: 'VBAP', ref_field: 'NETWR' },
      { fieldname: 'WAERK', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', ref_table: 'VBAP', ref_field: 'WAERK' },
    ],
    authorityChecks: [
      { object: 'V_VBAK_VKO', fields: "VKORG = P_VKORG, ACTVT = '03'", trigger_point: 'AT SELECTION-SCREEN / START-OF-SELECTION', description: '영업조직별 판매오더 조회 권한 점검' },
    ],
    sapMessages: [
      { msg_no: '001', msg_type: 'E', text: '영업조직 &1에 대한 조회 권한이 없습니다.', trigger_condition: 'V_VBAK_VKO 권한 점검 실패 시' },
      { msg_no: '002', msg_type: 'S', text: '판매오더 &1건이 정상 조회되었습니다.', trigger_condition: '조회 완료 시' },
    ],
    customToolbar: [
      { function: 'POST_GI', text: '출고전기', quickinfo: '선택 오더 납품/출고전기 처리 (VL02N)', icon: 'ICON_GOODS_RECEIPT' },
      { function: 'REL_BLOCK', text: '보류해제', quickinfo: '납품보류 코드 해제', icon: 'ICON_OKAY' },
    ],
  },

  MM: {
    module: 'MM',
    moduleLabelKo: 'MM (자재/구매)',
    headerTables: ['EKKO', 'LFA1'],
    itemTables: ['EKPO', 'EKBE', 'MARA', 'MAKT'],
    masterTables: ['LFA1', 'MARA', 'MAKT'],
    foreignKey: 'EBELN',
    defaultProgramId: 'ZMM_R_PO_RECEIPT',
    defaultTcode: 'ZMM010',
    defaultTitleKo: '구매오더 헤더 및 입고 진행 상세 모니터링',
    headerGridTitleKo: '구매오더 헤더 목록 (EKKO)',
    itemGridTitleKo: '구매오더 품목 및 입고 이력 상세 (EKPO / EKBE)',
    cdsViewTable: 'I_PurchaseOrderItem',
    summaryPurposeKo:
      '회사코드, 구매조직, 플랜트, 발주일자 및 공급업체 기준으로 구매오더 헤더(`EKKO`/`LFA1`)를 조회하고, 상단 구매오더 선택 시 하단 품목(`EKPO`/`EKBE`)의 발주수량, 입고수량, 미입고 잔량, 납기예정일 및 단가/금액 상세를 확인합니다.',
    extractionLogicKo: `1. **주요 표준 테이블 및 조인 관계 (상단/하단 분리 구조)**
   - **상단 헤더 (\`EKKO\`, \`LFA1\`)**: \`BUKRS = P_BUKRS\`, \`EKORG IN S_EKORG\`, \`BEDAT IN S_BEDAT\`, \`EBELN IN S_EBELN\` 조건으로 구매오더 헤더 및 공급업체명 추출
   - **하단 품목 (\`EKPO\`, \`EKET\`, \`EKBE\`, \`MAKT\`)**: 선택 구매오더(\`EBELN\`)의 품목(\`EBELP\`)별 납기예정일(\`EKET-EINDT\`)과 입고이력(\`EKBE\` where \`VGABE = '1'\`)·송장(\`VGABE = '2'\`) 집계
2. **미입고 잔량 및 납기 지연 산출**
   - 미입고수량 = \`EKPO-MENGE\` - \`SUM(EKBE-MENGE for GR)\`
   - 납기지연일수 = \`SY-DATUM\` - \`EKET-EINDT\` (미입고 > 0 인 경우)
3. **상태 신호등 판정 기준 (\`ZICON\`)**
   - \`'3' (Red)\`: 납기예정일(\`EINDT\`) 경과 & 미입고 잔량 > 0
   - \`'2' (Yellow)\`: 일부 입고 또는 송장 미검수 상태
   - \`'1' (Green)\`: 전량 입고 및 송장 검수 완료
4. **ALV 출력 및 툴바 처리**
   - \`EBELN\` 클릭 시 \`ME23N\`, \`LIFNR\` 클릭 시 \`XK03\`, \`MATNR\` 클릭 시 \`MM03\` 연계`,
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_BUKRS', text: '회사코드 (Company Code)', ref_table: 'EKKO', ref_field: 'BUKRS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_WERKS', text: '플랜트 (Plant)', ref_table: 'EKPO', ref_field: 'WERKS', datatype: 'CHAR', length: 4, obligatory: false, default_val: '1000', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_BEDAT', text: '발주일자 (PO Date)', ref_table: 'EKKO', ref_field: 'BEDAT', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_EBELN', text: '구매오더 (PO No.)', ref_table: 'EKKO', ref_field: 'EBELN', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_title: '오더 및 자재 필터' },
      { kind: 'SELECT_OPTION', name: 'S_LIFNR', text: '공급업체 (Vendor)', ref_table: 'EKKO', ref_field: 'LIFNR', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_title: '오더 및 자재 필터' },
      { kind: 'SELECT_OPTION', name: 'S_MATNR', text: '자재코드 (Material)', ref_table: 'EKPO', ref_field: 'MATNR', datatype: 'CHAR', length: 18, obligatory: false, default_val: '', block_title: '오더 및 자재 필터' },
      { kind: 'RADIOBUTTON', name: 'P_ALL', text: '전체 구매오더', datatype: 'CHAR', length: 1, default_val: 'X', block_title: '조회 옵션', radio_group: 'R1' },
      { kind: 'RADIOBUTTON', name: 'P_OPEN', text: '미입고/납기지연 건만', datatype: 'CHAR', length: 1, default_val: '', block_title: '조회 옵션', radio_group: 'R1' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, icon_type: 'LIGHTS', ref_table: '', ref_field: '' },
      { fieldname: 'EBELN', coltext: '구매오더', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, drilldown_tcode: 'ME23N', ref_table: 'EKKO', ref_field: 'EBELN' },
      { fieldname: 'BSART', coltext: '오더유형', datatype: 'CHAR', outputlen: 6, just: 'C', ref_table: 'EKKO', ref_field: 'BSART' },
      { fieldname: 'BEDAT', coltext: '발주일자', datatype: 'DATS', outputlen: 10, just: 'C', ref_table: 'EKKO', ref_field: 'BEDAT' },
      { fieldname: 'LIFNR', coltext: '공급업체', datatype: 'CHAR', outputlen: 10, just: 'C', hotspot: true, drilldown_tcode: 'XK03', ref_table: 'EKKO', ref_field: 'LIFNR' },
      { fieldname: 'NAME1', coltext: '공급업체명', datatype: 'CHAR', outputlen: 28, just: 'L', ref_table: 'LFA1', ref_field: 'NAME1' },
      { fieldname: 'EKORG', coltext: '구매조직', datatype: 'CHAR', outputlen: 6, just: 'C', ref_table: 'EKKO', ref_field: 'EKORG' },
      { fieldname: 'NETWR', coltext: '총발주금액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERS', ref_table: 'EKPO', ref_field: 'NETWR' },
      { fieldname: 'WAERS', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', ref_table: 'EKKO', ref_field: 'WAERS' },
    ],
    itemFields: [
      { fieldname: 'EBELN', coltext: '구매오더', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, ref_table: 'EKPO', ref_field: 'EBELN' },
      { fieldname: 'EBELP', coltext: '품목', datatype: 'NUMC', outputlen: 5, just: 'C', key: true, ref_table: 'EKPO', ref_field: 'EBELP' },
      { fieldname: 'MATNR', coltext: '자재코드', datatype: 'CHAR', outputlen: 16, just: 'L', hotspot: true, drilldown_tcode: 'MM03', ref_table: 'EKPO', ref_field: 'MATNR' },
      { fieldname: 'TXZ01', coltext: '자재내역', datatype: 'CHAR', outputlen: 30, just: 'L', ref_table: 'EKPO', ref_field: 'TXZ01' },
      { fieldname: 'WERKS', coltext: '플랜트', datatype: 'CHAR', outputlen: 6, just: 'C', ref_table: 'EKPO', ref_field: 'WERKS' },
      { fieldname: 'MENGE', coltext: '발주수량', datatype: 'DEC', outputlen: 12, just: 'R', do_sum: true, qfieldname: 'MEINS', ref_table: 'EKPO', ref_field: 'MENGE' },
      { fieldname: 'WEMNG', coltext: '입고수량', datatype: 'DEC', outputlen: 12, just: 'R', do_sum: true, qfieldname: 'MEINS', ref_table: 'EKET', ref_field: 'WEMNG' },
      { fieldname: 'OPEN_QTY', coltext: '미입고수량', datatype: 'DEC', outputlen: 12, just: 'R', do_sum: true, qfieldname: 'MEINS', ref_table: 'EKPO', ref_field: 'MENGE' },
      { fieldname: 'MEINS', coltext: '단위', datatype: 'UNIT', outputlen: 4, just: 'C', ref_table: 'EKPO', ref_field: 'MEINS' },
      { fieldname: 'NETPR', coltext: '단가', datatype: 'CURR', outputlen: 12, just: 'R', cfieldname: 'WAERS', ref_table: 'EKPO', ref_field: 'NETPR' },
      { fieldname: 'NETWR', coltext: '발주금액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERS', ref_table: 'EKPO', ref_field: 'NETWR' },
    ],
    authorityChecks: [
      { object: 'M_BEST_WRK', fields: "WERKS IN S_WERKS, ACTVT = '03'", trigger_point: 'AT SELECTION-SCREEN / START-OF-SELECTION', description: '플랜트별 구매오더 조회 권한 점검' },
    ],
    sapMessages: [
      { msg_no: '001', msg_type: 'E', text: '플랜트 권한 점검(M_BEST_WRK)에 실패했습니다.', trigger_condition: '권한 부족 시' },
      { msg_no: '002', msg_type: 'S', text: '구매오더 &1건의 입고 진행 현황을 조회했습니다.', trigger_condition: '조회 완료 시' },
    ],
    customToolbar: [
      { function: 'MIGO_GR', text: '입고처리(MIGO)', quickinfo: '선택 구매오더 입고 화면 호출', icon: 'ICON_GOODS_RECEIPT' },
      { function: 'REFRESH', text: '재조회', quickinfo: '최신 입고 수량 재집계', icon: 'ICON_REFRESH' },
    ],
  },

  CO: {
    module: 'CO',
    moduleLabelKo: 'CO (관리회계)',
    headerTables: ['CSKS', 'CSKT', 'SETNODE'],
    itemTables: ['COEP', 'COSP', 'CSKA', 'CSKU'],
    masterTables: ['CSKS', 'CSKT', 'CSKA', 'CSKU', 'SETNODE', 'SETLEAF'],
    foreignKey: 'KOSTL',
    defaultProgramId: 'ZCO_R_CC_VARIANCE',
    defaultTcode: 'ZCO010',
    defaultTitleKo: '코스트센터별 계획 대비 실적 원가 차이 분석',
    headerGridTitleKo: '코스트센터 마스터 및 원가 요약 (CSKS / COSP)',
    itemGridTitleKo: '원가요소별 실제/계획 라인 상세 (COEP / COSP)',
    cdsViewTable: 'C_CostCenterPlanActual',
    summaryPurposeKo:
      '관리회계영역, 회계연도, 기간 및 코스트센터 그룹 조건으로 코스트센터별(`CSKS`/`CSKT`) 계획·실적·차이 원가를 조회하고, 하위 원가요소별(`COEP`/`COSP`) 상세 실적 및 차이율을 분석합니다.',
    extractionLogicKo: `1. **주요 표준 테이블 및 조인 관계**
   - **상단 코스트센터 요약 (\`CSKS\`, \`CSKT\`, \`SETNODE\`/\`SETLEAF\`)**: \`KOKRS = P_KOKRS\`, \`DATBI >= SY-DATUM\` 조건과 그룹 계층구조 전개
   - **하단 원가요소 상세 (\`COSP\`, \`COEP\`, \`CSKU\`)**: 선택 코스트센터(\`KOSTL\`)의 회계연도(\`GJAHR\`)·원가요소(\`KSTAR\`)별 계획(\`WRTTP = '01'\`) 및 실적(\`WRTTP = '04'\`) 집계
2. **예산 차이 및 집행률 산출**
   - 차이금액 = 계획금액 - 실적금액, 집행률(%) = 실적 / 계획 * 100
3. **상태 신호등 판정 기준 (\`ZICON\`)**
   - \`'3' (Red)\`: 실적 금액이 계획(예산)을 초과한 항목
   - \`'2' (Yellow)\`: 예산 집행률 85% 이상 경고 구간
   - \`'1' (Green)\`: 정상 예산 범위 내 집행
4. **ALV 출력 및 드릴다운**
   - \`KOSTL\` 클릭 시 \`KS03\`, \`KSTAR\` 클릭 시 \`KA03\` 표준 화면 연계`,
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_KOKRS', text: '관리회계영역 (Controlling Area)', ref_table: 'CSKS', ref_field: 'KOKRS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', block_title: '기본 조회 조건' },
      { kind: 'PARAMETER', name: 'P_GJAHR', text: '회계연도 (Fiscal Year)', ref_table: 'COEP', ref_field: 'GJAHR', datatype: 'NUMC', length: 4, obligatory: true, default_val: '2026', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_PERIO', text: '회계기간 (Period)', ref_table: 'COEP', ref_field: 'PERIO', datatype: 'NUMC', length: 3, obligatory: false, default_val: '001', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_KOSTL', text: '코스트센터 (Cost Center)', ref_table: 'CSKS', ref_field: 'KOSTL', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_title: '대상 범위 필터' },
      { kind: 'SELECT_OPTION', name: 'S_KSTAR', text: '원가요소 (Cost Element)', ref_table: 'COEP', ref_field: 'KSTAR', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_title: '대상 범위 필터' },
      { kind: 'CHECKBOX', name: 'P_OVER', text: '예산 초과 항목만 표시', datatype: 'CHAR', length: 1, default_val: '', block_title: '조회 옵션' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, icon_type: 'LIGHTS', ref_table: '', ref_field: '' },
      { fieldname: 'KOSTL', coltext: '코스트센터', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, drilldown_tcode: 'KS03', ref_table: 'CSKS', ref_field: 'KOSTL' },
      { fieldname: 'KTEXT', coltext: '코스트센터명', datatype: 'CHAR', outputlen: 28, just: 'L', ref_table: 'CSKT', ref_field: 'KTEXT' },
      { fieldname: 'ABTEI', coltext: '부서', datatype: 'CHAR', outputlen: 12, just: 'L', ref_table: 'CSKS', ref_field: 'ABTEI' },
      { fieldname: 'PLAN_AMT', coltext: '계획금액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERS', ref_table: 'COSP', ref_field: 'WKG001' },
      { fieldname: 'ACT_AMT', coltext: '실적금액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERS', ref_table: 'COEP', ref_field: 'WKGBTR' },
      { fieldname: 'VAR_AMT', coltext: '차이금액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERS', ref_table: 'COEP', ref_field: 'WKGBTR' },
      { fieldname: 'WAERS', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', ref_table: 'COEP', ref_field: 'OWAER' },
    ],
    itemFields: [
      { fieldname: 'KOSTL', coltext: '코스트센터', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, ref_table: 'COEP', ref_field: 'OBJNR' },
      { fieldname: 'KSTAR', coltext: '원가요소', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, drilldown_tcode: 'KA03', ref_table: 'COEP', ref_field: 'KSTAR' },
      { fieldname: 'LTEXT', coltext: '원가요소명', datatype: 'CHAR', outputlen: 30, just: 'L', ref_table: 'CSKU', ref_field: 'LTEXT' },
      { fieldname: 'PERIO', coltext: '기간', datatype: 'NUMC', outputlen: 4, just: 'C', ref_table: 'COEP', ref_field: 'PERIO' },
      { fieldname: 'BELNR', coltext: 'CO전표', datatype: 'CHAR', outputlen: 10, just: 'C', hotspot: true, drilldown_tcode: 'KSB1', ref_table: 'COEP', ref_field: 'BELNR' },
      { fieldname: 'WKGBTR', coltext: '실적금액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERS', ref_table: 'COEP', ref_field: 'WKGBTR' },
      { fieldname: 'WAERS', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', ref_table: 'COEP', ref_field: 'OWAER' },
      { fieldname: 'SGTXT', coltext: '적요', datatype: 'CHAR', outputlen: 32, just: 'L', ref_table: 'COEP', ref_field: 'SGTXT' },
    ],
    authorityChecks: [
      { object: 'K_CCA', fields: "KOKRS = P_KOKRS, KOSTL IN S_KOSTL, ACTVT = '03'", trigger_point: 'START-OF-SELECTION', description: '코스트센터 계획/실적 조회 권한 점검' },
    ],
    sapMessages: [
      { msg_no: '001', msg_type: 'E', text: '관리회계영역 &1의 코스트센터 조회 권한이 없습니다.', trigger_condition: 'K_CCA 권한 점검 실패 시' },
      { msg_no: '002', msg_type: 'S', text: '코스트센터 원가 집계가 완료되었습니다.', trigger_condition: '집계 완료 시' },
    ],
    customToolbar: [
      { function: 'KSB1_CALL', text: '라인아이템(KSB1)', quickinfo: '원가 개별항목 KSB1 호출', icon: 'ICON_LIST' },
    ],
  },

  PP: {
    module: 'PP',
    moduleLabelKo: 'PP (생산계획)',
    headerTables: ['AFKO', 'AUFK', 'MAKT'],
    itemTables: ['AFPO', 'RESB', 'AFVC', 'MAKT'],
    masterTables: ['MARA', 'MAKT', 'CRHD', 'STKO'],
    foreignKey: 'AUFNR',
    defaultProgramId: 'ZPP_R_PROD_ORDER',
    defaultTcode: 'ZPP010',
    defaultTitleKo: '생산오더 진행 및 자재 투입 상세 현황',
    headerGridTitleKo: '생산오더 헤더 목록 (AFKO / AUFK)',
    itemGridTitleKo: '구성품 소요 및 공정 상세 (RESB / AFVC)',
    cdsViewTable: 'I_ProductionOrder',
    summaryPurposeKo:
      '플랜트, 생산오더, 작업지시일 기준으로 생산오더 헤더(`AFKO`/`AUFK`) 진행 상태를 모니터링하고, 선택 오더의 자재 소요/출고 내역(`RESB`) 및 공정 실적(`AFVC`) 상세를 확인합니다.',
    extractionLogicKo: `1. **주요 표준 테이블 및 조인 관계**
   - **상단 헤더 (\`AFKO\`, \`AUFK\`, \`AFPO\`, \`MAKT\`)**: \`AUFK~WERKS = P_WERKS\`, \`AFKO~GSTRP IN S_GSTRP\`, \`AFKO~AUFNR IN S_AUFNR\`
   - **하단 자재/공정 상세 (\`RESB\`, \`AFVC\`, \`MAKT\`)**: 선택 오더(\`AUFNR\`) 기준 예약(\`RSNUM\`) 소요량(\`BDMNG\`) vs 불출량(\`ENMNG\`) 비교
2. **상태 신호등 판정 기준 (\`ZICON\`)**
   - \`'3' (Red)\`: 기본종료일(\`GLTRP\`) 경과 & 미완료 오더
   - \`'2' (Yellow)\`: 자재 부족 또는 일부 공정 진행 중
   - \`'1' (Green)\`: 계획 수량 전량 입고 완료`,
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_WERKS', text: '플랜트 (Plant)', ref_table: 'AUFK', ref_field: 'WERKS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_GSTRP', text: '시작예정일 (Basic Start)', ref_table: 'AFKO', ref_field: 'GSTRP', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_AUFNR', text: '생산오더 (Prod. Order)', ref_table: 'AFKO', ref_field: 'AUFNR', datatype: 'CHAR', length: 12, obligatory: false, default_val: '', block_title: '오더 필터' },
      { kind: 'SELECT_OPTION', name: 'S_MATNR', text: '생산품목 (Material)', ref_table: 'AFPO', ref_field: 'MATNR', datatype: 'CHAR', length: 18, obligatory: false, default_val: '', block_title: '오더 필터' },
      { kind: 'CHECKBOX', name: 'P_OPEN', text: '미완료(REL/CRTD) 오더만', datatype: 'CHAR', length: 1, default_val: 'X', block_title: '조회 옵션' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, icon_type: 'LIGHTS', ref_table: '', ref_field: '' },
      { fieldname: 'AUFNR', coltext: '생산오더', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, hotspot: true, drilldown_tcode: 'CO03', ref_table: 'AFKO', ref_field: 'AUFNR' },
      { fieldname: 'MATNR', coltext: '생산자재', datatype: 'CHAR', outputlen: 16, just: 'L', hotspot: true, drilldown_tcode: 'MM03', ref_table: 'AFPO', ref_field: 'MATNR' },
      { fieldname: 'MAKTX', coltext: '자재내역', datatype: 'CHAR', outputlen: 30, just: 'L', ref_table: 'MAKT', ref_field: 'MAKTX' },
      { fieldname: 'GSTRP', coltext: '시작예정일', datatype: 'DATS', outputlen: 10, just: 'C', ref_table: 'AFKO', ref_field: 'GSTRP' },
      { fieldname: 'GLTRP', coltext: '종료예정일', datatype: 'DATS', outputlen: 10, just: 'C', ref_table: 'AFKO', ref_field: 'GLTRP' },
      { fieldname: 'GAMNG', coltext: '계획수량', datatype: 'DEC', outputlen: 12, just: 'R', do_sum: true, qfieldname: 'GMEIN', ref_table: 'AFKO', ref_field: 'GAMNG' },
      { fieldname: 'WEMNG', coltext: '생산입고량', datatype: 'DEC', outputlen: 12, just: 'R', do_sum: true, qfieldname: 'GMEIN', ref_table: 'AFPO', ref_field: 'WEMNG' },
      { fieldname: 'GMEIN', coltext: '단위', datatype: 'UNIT', outputlen: 4, just: 'C', ref_table: 'AFKO', ref_field: 'GMEIN' },
    ],
    itemFields: [
      { fieldname: 'AUFNR', coltext: '생산오더', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, ref_table: 'RESB', ref_field: 'AUFNR' },
      { fieldname: 'RSPOS', coltext: '항목', datatype: 'NUMC', outputlen: 4, just: 'C', key: true, ref_table: 'RESB', ref_field: 'RSPOS' },
      { fieldname: 'MATNR', coltext: '투입자재', datatype: 'CHAR', outputlen: 16, just: 'L', hotspot: true, drilldown_tcode: 'MM03', ref_table: 'RESB', ref_field: 'MATNR' },
      { fieldname: 'MAKTX', coltext: '자재내역', datatype: 'CHAR', outputlen: 30, just: 'L', ref_table: 'MAKT', ref_field: 'MAKTX' },
      { fieldname: 'LGORT', coltext: '저장위치', datatype: 'CHAR', outputlen: 6, just: 'C', ref_table: 'RESB', ref_field: 'LGORT' },
      { fieldname: 'BDMNG', coltext: '소요수량', datatype: 'DEC', outputlen: 12, just: 'R', do_sum: true, qfieldname: 'MEINS', ref_table: 'RESB', ref_field: 'BDMNG' },
      { fieldname: 'ENMNG', coltext: '출고수량', datatype: 'DEC', outputlen: 12, just: 'R', do_sum: true, qfieldname: 'MEINS', ref_table: 'RESB', ref_field: 'ENMNG' },
      { fieldname: 'MEINS', coltext: '단위', datatype: 'UNIT', outputlen: 4, just: 'C', ref_table: 'RESB', ref_field: 'MEINS' },
    ],
    authorityChecks: [
      { object: 'C_AFKO_AWK', fields: "WERKS = P_WERKS, ACTVT = '03'", trigger_point: 'START-OF-SELECTION', description: '플랜트별 생산오더 조회 권한 점검' },
    ],
    sapMessages: [
      { msg_no: '001', msg_type: 'S', text: '생산오더 &1건이 조회되었습니다.', trigger_condition: '조회 완료 시' },
    ],
    customToolbar: [
      { function: 'CO11N_CONF', text: '실적등록(CO11N)', quickinfo: '선택 오더 공정 실적 등록 이동', icon: 'ICON_EXECUTE_OBJECT' },
    ],
  },

  QM: {
    module: 'QM',
    moduleLabelKo: 'QM (품질관리)',
    headerTables: ['QALS', 'MAKT'],
    itemTables: ['QAMV', 'QAVE', 'QAMR'],
    masterTables: ['MARA', 'MAKT', 'QALS'],
    foreignKey: 'PRUEFLOS',
    defaultProgramId: 'ZQM_R_LOT_MONITOR',
    defaultTcode: 'ZQM010',
    defaultTitleKo: '품질 검사로트 및 특성 결과 상세 조회',
    headerGridTitleKo: '검사로트 목록 (QALS)',
    itemGridTitleKo: '검사항목 특성 및 판정 상세 (QAMV / QAVE)',
    cdsViewTable: 'I_InspectionLot',
    summaryPurposeKo:
      '플랜트, 검사유형, 로트 생성일자 기준으로 검사로트(`QALS`) 현황을 조회하고, 선택 로트의 검사항목(`QAMV`) 및 사용결정(`QAVE`) 상세 결과를 확인합니다.',
    extractionLogicKo: `1. **주요 표준 테이블**: \`QALS\`(검사로트 헤더), \`QAMV\`(검사항목 특성), \`QAVE\`(사용결정), \`MAKT\`(자재내역)\n2. **상태 판정**: 사용결정 미완료/불합격(\`VCODE = 'R'\`) 시 적색, 검사 진행 중 황색, 합격 완료 녹색`,
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_WERKS', text: '플랜트 (Plant)', ref_table: 'QALS', ref_field: 'WERKS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_ERDAT', text: '로트생성일 (Created On)', ref_table: 'QALS', ref_field: 'ERSTELDAT', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_MATNR', text: '자재코드 (Material)', ref_table: 'QALS', ref_field: 'MATNR', datatype: 'CHAR', length: 18, obligatory: false, default_val: '', block_title: '검사 필터' },
      { kind: 'CHECKBOX', name: 'P_OPEN', text: '미판정(UD 미완료) 로트만', datatype: 'CHAR', length: 1, default_val: 'X', block_title: '조회 옵션' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, icon_type: 'LIGHTS', ref_table: '', ref_field: '' },
      { fieldname: 'PRUEFLOS', coltext: '검사로트', datatype: 'NUMC', outputlen: 12, just: 'C', key: true, hotspot: true, drilldown_tcode: 'QA03', ref_table: 'QALS', ref_field: 'PRUEFLOS' },
      { fieldname: 'ART', coltext: '검사유형', datatype: 'CHAR', outputlen: 6, just: 'C', ref_table: 'QALS', ref_field: 'ART' },
      { fieldname: 'MATNR', coltext: '자재코드', datatype: 'CHAR', outputlen: 16, just: 'L', hotspot: true, drilldown_tcode: 'MM03', ref_table: 'QALS', ref_field: 'MATNR' },
      { fieldname: 'KTEXTMAT', coltext: '자재내역', datatype: 'CHAR', outputlen: 30, just: 'L', ref_table: 'QALS', ref_field: 'KTEXTMAT' },
      { fieldname: 'LOSMENGE', coltext: '로트수량', datatype: 'DEC', outputlen: 12, just: 'R', do_sum: true, qfieldname: 'MENGENEINH', ref_table: 'QALS', ref_field: 'LOSMENGE' },
      { fieldname: 'MENGENEINH', coltext: '단위', datatype: 'UNIT', outputlen: 4, just: 'C', ref_table: 'QALS', ref_field: 'MENGENEINH' },
    ],
    itemFields: [
      { fieldname: 'PRUEFLOS', coltext: '검사로트', datatype: 'NUMC', outputlen: 12, just: 'C', key: true, ref_table: 'QAMV', ref_field: 'PRUEFLOS' },
      { fieldname: 'MERKNR', coltext: '특성번호', datatype: 'NUMC', outputlen: 6, just: 'C', key: true, ref_table: 'QAMV', ref_field: 'MERKNR' },
      { fieldname: 'KURZTEXT', coltext: '검사항목명', datatype: 'CHAR', outputlen: 30, just: 'L', ref_table: 'QAMV', ref_field: 'KURZTEXT' },
      { fieldname: 'SOLLWERT', coltext: '목표치', datatype: 'DEC', outputlen: 10, just: 'R', ref_table: 'QAMV', ref_field: 'SOLLWERT' },
      { fieldname: 'MITTELWERT', coltext: '측정평균', datatype: 'DEC', outputlen: 10, just: 'R', ref_table: 'QAMR', ref_field: 'MITTELWERT' },
      { fieldname: 'MBWERTG', coltext: '판정', datatype: 'CHAR', outputlen: 4, just: 'C', ref_table: 'QAMR', ref_field: 'MBWERTG' },
    ],
    authorityChecks: [
      { object: 'Q_INSPLOT', fields: "WERKS = P_WERKS, ACTVT = '03'", trigger_point: 'START-OF-SELECTION', description: '검사로트 조회 권한 점검' },
    ],
    sapMessages: [{ msg_no: '001', msg_type: 'S', text: '검사로트 조회가 완료되었습니다.', trigger_condition: '조회 완료 시' }],
    customToolbar: [{ function: 'QA32_UD', text: '사용결정(QA11)', quickinfo: '사용결정 처리 이동', icon: 'ICON_OKAY' }],
  },

  PM: {
    module: 'PM',
    moduleLabelKo: 'PM (설비보전)',
    headerTables: ['AFIH', 'AUFK', 'EQUI'],
    itemTables: ['AFVC', 'RESB', 'QMEL'],
    masterTables: ['EQUI', 'EQKT', 'IFLOT'],
    foreignKey: 'AUFNR',
    defaultProgramId: 'ZPM_R_MAINT_ORDER',
    defaultTcode: 'ZPM010',
    defaultTitleKo: '설비 정비오더 및 작업 상세 모니터링',
    headerGridTitleKo: '설비 정비오더 목록 (AFIH / AUFK)',
    itemGridTitleKo: '정비 작업 및 예비품 소요 상세 (AFVC / RESB)',
    cdsViewTable: 'I_MaintenanceOrder',
    summaryPurposeKo:
      '보전플랜트, 설비번호, 정비오더 유형별 보전오더(`AFIH`/`AUFK`)를 조회하고 선택 오더의 공정 작업(`AFVC`) 및 자재 소요(`RESB`) 상세를 확인합니다.',
    extractionLogicKo: `1. **주요 표준 테이블**: \`AFIH\`(보전오더 헤더), \`AUFK\`(오더 마스터), \`EQUI\`/\`EQKT\`(설비 마스터), \`AFVC\`/\`RESB\`(공정/자재)\n2. **상태 판정**: 긴급 고장 미조치 적색, 진행 중 황색, 완료 녹색`,
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_IWERK', text: '보전플랜트 (Maint. Plant)', ref_table: 'AFIH', ref_field: 'IWERK', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_EQUNR', text: '설비번호 (Equipment)', ref_table: 'AFIH', ref_field: 'EQUNR', datatype: 'CHAR', length: 18, obligatory: false, default_val: '', block_title: '설비 필터' },
      { kind: 'SELECT_OPTION', name: 'S_AUFNR', text: '정비오더 (Order)', ref_table: 'AFIH', ref_field: 'AUFNR', datatype: 'CHAR', length: 12, obligatory: false, default_val: '', block_title: '설비 필터' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, icon_type: 'LIGHTS', ref_table: '', ref_field: '' },
      { fieldname: 'AUFNR', coltext: '정비오더', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, hotspot: true, drilldown_tcode: 'IW33', ref_table: 'AFIH', ref_field: 'AUFNR' },
      { fieldname: 'EQUNR', coltext: '설비번호', datatype: 'CHAR', outputlen: 16, just: 'C', hotspot: true, drilldown_tcode: 'IE03', ref_table: 'AFIH', ref_field: 'EQUNR' },
      { fieldname: 'EQKTX', coltext: '설비명', datatype: 'CHAR', outputlen: 30, just: 'L', ref_table: 'EQKT', ref_field: 'EQKTX' },
      { fieldname: 'KTEXT', coltext: '정비내역', datatype: 'CHAR', outputlen: 35, just: 'L', ref_table: 'AUFK', ref_field: 'KTEXT' },
    ],
    itemFields: [
      { fieldname: 'AUFNR', coltext: '정비오더', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, ref_table: 'AFVC', ref_field: 'AUFNR' },
      { fieldname: 'VORNR', coltext: '작업번호', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, ref_table: 'AFVC', ref_field: 'VORNR' },
      { fieldname: 'LTXA1', coltext: '작업내역', datatype: 'CHAR', outputlen: 36, just: 'L', ref_table: 'AFVC', ref_field: 'LTXA1' },
      { fieldname: 'ARBPL', coltext: '작업장', datatype: 'CHAR', outputlen: 10, just: 'C', ref_table: 'CRHD', ref_field: 'ARBPL' },
    ],
    authorityChecks: [{ object: 'I_AUART', fields: "AUART = '*', ACTVT = '03'", trigger_point: 'START-OF-SELECTION', description: '설비 정비오더 조회 권한 점검' }],
    sapMessages: [{ msg_no: '001', msg_type: 'S', text: '정비오더 조회가 완료되었습니다.', trigger_condition: '조회 완료 시' }],
    customToolbar: [{ function: 'IW32_UPD', text: '오더변경(IW32)', quickinfo: '선택 정비오더 수정', icon: 'ICON_CHANGE' }],
  },

  HR: {
    module: 'HR',
    moduleLabelKo: 'HR (인사/근태)',
    headerTables: ['PA0001', 'PA0002', 'HRP1000'],
    itemTables: ['PA2001', 'PA0008'],
    masterTables: ['PA0001', 'PA0002', 'HRP1000'],
    foreignKey: 'PERNR',
    defaultProgramId: 'ZHR_R_EMP_STATUS',
    defaultTcode: 'ZHR010',
    defaultTitleKo: '인사 마스터 및 근태 이력 상세 조회',
    headerGridTitleKo: '사원 조직 인사 목록 (PA0001 / PA0002)',
    itemGridTitleKo: '사원별 근태/휴가 상세 내역 (PA2001)',
    cdsViewTable: 'PA0001',
    summaryPurposeKo:
      '인사영역, 조직단위, 사번 조건으로 사원 기본 정보(`PA0001`/`PA0002`)를 조회하고 선택 사원의 근태/휴가 이력(`PA2001`) 상세를 확인합니다.',
    extractionLogicKo: `1. **주요 표준 테이블**: \`PA0001\`(조직배정), \`PA0002\`(개인정보), \`HRP1000\`(조직명), \`PA2001\`(근태)\n2. **권한 통제**: \`P_ORGIN\` 인사 권한 오브젝트 필수 점검`,
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_BUKRS', text: '회사코드 (Company Code)', ref_table: 'PA0001', ref_field: 'BUKRS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_PERNR', text: '사번 (Personnel No.)', ref_table: 'PA0001', ref_field: 'PERNR', datatype: 'NUMC', length: 8, obligatory: false, default_val: '', block_title: '사원 필터' },
      { kind: 'SELECT_OPTION', name: 'S_ORGEH', text: '조직단위 (Org. Unit)', ref_table: 'PA0001', ref_field: 'ORGEH', datatype: 'NUMC', length: 8, obligatory: false, default_val: '', block_title: '사원 필터' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, icon_type: 'LIGHTS', ref_table: '', ref_field: '' },
      { fieldname: 'PERNR', coltext: '사번', datatype: 'NUMC', outputlen: 8, just: 'C', key: true, hotspot: true, drilldown_tcode: 'PA20', ref_table: 'PA0001', ref_field: 'PERNR' },
      { fieldname: 'ENAME', coltext: '성명', datatype: 'CHAR', outputlen: 24, just: 'L', ref_table: 'PA0001', ref_field: 'ENAME' },
      { fieldname: 'ORGEH', coltext: '부서코드', datatype: 'NUMC', outputlen: 8, just: 'C', ref_table: 'PA0001', ref_field: 'ORGEH' },
      { fieldname: 'STEXT', coltext: '부서명', datatype: 'CHAR', outputlen: 28, just: 'L', ref_table: 'HRP1000', ref_field: 'STEXT' },
      { fieldname: 'BEGDA', coltext: '발령일자', datatype: 'DATS', outputlen: 10, just: 'C', ref_table: 'PA0001', ref_field: 'BEGDA' },
    ],
    itemFields: [
      { fieldname: 'PERNR', coltext: '사번', datatype: 'NUMC', outputlen: 8, just: 'C', key: true, ref_table: 'PA2001', ref_field: 'PERNR' },
      { fieldname: 'AWART', coltext: '근태유형', datatype: 'CHAR', outputlen: 6, just: 'C', ref_table: 'PA2001', ref_field: 'AWART' },
      { fieldname: 'BEGDA', coltext: '시작일', datatype: 'DATS', outputlen: 10, just: 'C', ref_table: 'PA2001', ref_field: 'BEGDA' },
      { fieldname: 'ENDDA', coltext: '종료일', datatype: 'DATS', outputlen: 10, just: 'C', ref_table: 'PA2001', ref_field: 'ENDDA' },
      { fieldname: 'ABWTG', coltext: '근태일수', datatype: 'DEC', outputlen: 8, just: 'R', do_sum: true, ref_table: 'PA2001', ref_field: 'ABWTG' },
    ],
    authorityChecks: [{ object: 'P_ORGIN', fields: "INFTY = '0001', AUTHC = 'R'", trigger_point: 'START-OF-SELECTION', description: '사원 인사마스터 조회 권한 점검' }],
    sapMessages: [{ msg_no: '001', msg_type: 'S', text: '인사 현황 조회가 완료되었습니다.', trigger_condition: '조회 완료 시' }],
    customToolbar: [{ function: 'PA20_DISP', text: '인사기록(PA20)', quickinfo: '선택 사원 PA20 조회', icon: 'ICON_DISPLAY' }],
  },

  BC: {
    module: 'BC',
    moduleLabelKo: 'BC (시스템/인터페이스)',
    headerTables: ['EDIDC', 'TBTCO', 'BALHDR'],
    itemTables: ['EDIDS', 'TBTCP'],
    masterTables: ['USR02', 'TBTCO'],
    foreignKey: 'DOCNUM',
    defaultProgramId: 'ZBC_R_IF_MONITOR',
    defaultTcode: 'ZBC010',
    defaultTitleKo: '인터페이스 / 배치 작업 모니터링 및 로그 상세',
    headerGridTitleKo: '인터페이스 전표 / 잡 헤더 (EDIDC / TBTCO)',
    itemGridTitleKo: '실행 상태 이력 및 오류 로그 상세 (EDIDS / BALHDR)',
    cdsViewTable: 'EDIDC',
    summaryPurposeKo:
      '실행일자, 상태코드, 인터페이스 유형별로 처리 헤더(`EDIDC`/`TBTCO`)를 모니터링하고, 오류 건 클릭 시 하단 상세 상태/로그(`EDIDS`)를 확인해 재처리합니다.',
    extractionLogicKo: `1. **주요 표준 테이블**: \`EDIDC\`(IDoc 헤더), \`EDIDS\`(IDoc 상태 이력), \`BALHDR\`(애플리케이션 로그)\n2. **상태 판정**: 오류(\`STATUS = '51'\`) 적색, 대기 황색, 완료(\`'53'\`) 녹색`,
    selectionParams: [
      { kind: 'SELECT_OPTION', name: 'S_CREDAT', text: '생성일자 (Created Date)', ref_table: 'EDIDC', ref_field: 'CREDAT', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_MESTYP', text: '메시지유형 (Message Type)', ref_table: 'EDIDC', ref_field: 'MESTYP', datatype: 'CHAR', length: 16, obligatory: false, default_val: '', block_title: '인터페이스 필터' },
      { kind: 'CHECKBOX', name: 'P_ERR', text: '오류 건만 조회', datatype: 'CHAR', length: 1, default_val: 'X', block_title: '조회 옵션' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, icon_type: 'LIGHTS', ref_table: '', ref_field: '' },
      { fieldname: 'DOCNUM', coltext: 'IDoc번호', datatype: 'NUMC', outputlen: 16, just: 'C', key: true, hotspot: true, drilldown_tcode: 'WE02', ref_table: 'EDIDC', ref_field: 'DOCNUM' },
      { fieldname: 'MESTYP', coltext: '메시지유형', datatype: 'CHAR', outputlen: 14, just: 'L', ref_table: 'EDIDC', ref_field: 'MESTYP' },
      { fieldname: 'CREDAT', coltext: '생성일자', datatype: 'DATS', outputlen: 10, just: 'C', ref_table: 'EDIDC', ref_field: 'CREDAT' },
      { fieldname: 'STATUS', coltext: '상태코드', datatype: 'CHAR', outputlen: 6, just: 'C', ref_table: 'EDIDC', ref_field: 'STATUS' },
    ],
    itemFields: [
      { fieldname: 'DOCNUM', coltext: 'IDoc번호', datatype: 'NUMC', outputlen: 16, just: 'C', key: true, ref_table: 'EDIDS', ref_field: 'DOCNUM' },
      { fieldname: 'COUNTR', coltext: '순번', datatype: 'NUMC', outputlen: 4, just: 'C', key: true, ref_table: 'EDIDS', ref_field: 'COUNTR' },
      { fieldname: 'STATUS', coltext: '상태', datatype: 'CHAR', outputlen: 6, just: 'C', ref_table: 'EDIDS', ref_field: 'STATUS' },
      { fieldname: 'STATXT', coltext: '상세메시지', datatype: 'CHAR', outputlen: 50, just: 'L', ref_table: 'EDIDS', ref_field: 'STATXT' },
    ],
    authorityChecks: [{ object: 'S_IDOCMONI', fields: "ACTVT = '03'", trigger_point: 'START-OF-SELECTION', description: '인터페이스 모니터링 권한 점검' }],
    sapMessages: [{ msg_no: '001', msg_type: 'S', text: '인터페이스 로그 조회가 완료되었습니다.', trigger_condition: '조회 완료 시' }],
    customToolbar: [{ function: 'REPROC', text: '오류재처리', quickinfo: '선택 오류 건 재전송', icon: 'ICON_REFRESH' }],
  },

  CM: {
    module: 'CM',
    moduleLabelKo: 'CM (공통 영역)',
    headerTables: ['ZTCM_CODE_H', 'T001'],
    itemTables: ['ZTCM_CODE_D'],
    masterTables: ['T001', 'TCURR'],
    foreignKey: 'CODE_GRP',
    defaultProgramId: 'ZCM_R_CODE_MGT',
    defaultTcode: 'ZCM010',
    defaultTitleKo: '전사 공통코드 그룹 및 상세 코드 관리',
    headerGridTitleKo: '공통코드 그룹 헤더 (ZTCM_CODE_H)',
    itemGridTitleKo: '그룹별 상세 코드 목록 (ZTCM_CODE_D)',
    cdsViewTable: 'ZTCM_CODE_H',
    summaryPurposeKo:
      '회사코드 및 코드 그룹 기준으로 전사 공통 기준정보 헤더를 조회하고, 선택 그룹의 세부 코드 매핑 및 유효기간 상세를 관리합니다.',
    extractionLogicKo: `1. **주요 테이블**: \`T001\`(회사코드), \`ZTCM_CODE_H\`(공통코드 헤더), \`ZTCM_CODE_D\`(공통코드 상세)\n2. **상태 판정**: 사용중지/만료 적색, 검증대기 황색, 활성 녹색`,
    selectionParams: [
      { kind: 'PARAMETER', name: 'P_BUKRS', text: '회사코드 (Company Code)', ref_table: 'T001', ref_field: 'BUKRS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_GRP', text: '코드그룹 (Code Group)', ref_table: 'ZTCM_CODE_H', ref_field: 'CODE_GRP', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_title: '코드 필터' },
      { kind: 'CHECKBOX', name: 'P_USE', text: '사용 중인 코드만 조회', datatype: 'CHAR', length: 1, default_val: 'X', block_title: '조회 옵션' },
    ],
    headerFields: [
      { fieldname: 'ZICON', coltext: '상태', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, icon_type: 'LIGHTS', ref_table: '', ref_field: '' },
      { fieldname: 'CODE_GRP', coltext: '코드그룹', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, hotspot: true, drilldown_tcode: 'SM30', ref_table: 'ZTCM_CODE_H', ref_field: 'CODE_GRP' },
      { fieldname: 'GRP_NAME', coltext: '그룹명칭', datatype: 'CHAR', outputlen: 30, just: 'L', ref_table: 'ZTCM_CODE_H', ref_field: 'GRP_NAME' },
      { fieldname: 'USE_YN', coltext: '사용여부', datatype: 'CHAR', outputlen: 6, just: 'C', ref_table: 'ZTCM_CODE_H', ref_field: 'USE_YN' },
    ],
    itemFields: [
      { fieldname: 'CODE_GRP', coltext: '코드그룹', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, ref_table: 'ZTCM_CODE_D', ref_field: 'CODE_GRP' },
      { fieldname: 'CODE_VAL', coltext: '상세코드', datatype: 'CHAR', outputlen: 12, just: 'C', key: true, ref_table: 'ZTCM_CODE_D', ref_field: 'CODE_VAL' },
      { fieldname: 'CODE_TXT', coltext: '코드명칭', datatype: 'CHAR', outputlen: 32, just: 'L', ref_table: 'ZTCM_CODE_D', ref_field: 'CODE_TXT' },
      { fieldname: 'SORT_NO', coltext: '정렬순서', datatype: 'INT4', outputlen: 6, just: 'R', ref_table: 'ZTCM_CODE_D', ref_field: 'SORT_NO' },
    ],
    authorityChecks: [{ object: 'S_TABU_NAM', fields: "TABLE = 'ZTCM_CODE_H', ACTVT = '03'", trigger_point: 'START-OF-SELECTION', description: '공통코드 조회/관리 권한 점검' }],
    sapMessages: [{ msg_no: '001', msg_type: 'S', text: '공통코드 조회가 완료되었습니다.', trigger_condition: '조회 완료 시' }],
    customToolbar: [{ function: 'ADD_CODE', text: '코드추가', quickinfo: '신규 상세 코드 등록', icon: 'ICON_CREATE' }],
  },
};

export function getSapModuleBlueprint(moduleCode?: string): SapModuleBlueprint {
  const upper = String(moduleCode || 'SD').trim().toUpperCase() as SapModuleCode;
  return SAP_MODULE_BLUEPRINTS[upper] || SAP_MODULE_BLUEPRINTS.SD;
}

export function buildSapPromptReferenceBlock(moduleHint?: string, sampleType?: string): string {
  const bp = getSapModuleBlueprint(moduleHint);
  const allModuleCatalog = (Object.values(SAP_MODULE_BLUEPRINTS) as SapModuleBlueprint[])
    .map(
      (b) =>
        `- ${b.module} (${b.moduleLabelKo}): Header=[${b.headerTables.join(', ')}], Item=[${b.itemTables.join(', ')}], FK=${b.foreignKey}, T-Codes=${b.headerFields
          .map((f) => f.drilldown_tcode)
          .filter(Boolean)
          .join('/')}`
    )
    .join('\n');

  return `[SAP Standard Module & DDIC Reference Catalog]
${allModuleCatalog}

[Primary Candidate Blueprint: ${bp.moduleLabelKo}]
- Standard Header Tables: ${bp.headerTables.join(', ')}
- Standard Item/Detail Tables: ${bp.itemTables.join(', ')} (Link Key: ${bp.foreignKey})
- Master Reference Tables: ${bp.masterTables.join(', ')}
- Sample Header Fields Example: ${bp.headerFields.map((f) => `${f.fieldname}(${f.ref_table ? `${f.ref_table}-${f.ref_field}` : f.datatype}:${f.coltext})`).join(', ')}
- Sample Item Fields Example: ${bp.itemFields.map((f) => `${f.fieldname}(${f.ref_table ? `${f.ref_table}-${f.ref_field}` : f.datatype}:${f.coltext})`).join(', ')}
${sampleType === '02' ? '- IMPORTANT (Type 02 Master-Detail): You MUST populate BOTH header field_catalog AND item_grid (with foreign_key, grid_title, 7~11 item_grid.field_catalog columns, and 6+ linked item_grid.mock_rows)!' : ''}`;
}
