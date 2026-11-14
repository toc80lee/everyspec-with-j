export function normalizeSapDataTypeServer(
  dt: any
): 'CHAR' | 'NUMC' | 'DATS' | 'TIMS' | 'CURR' | 'DEC' | 'UNIT' | 'INT4' | 'STRING' {
  const upper = String(dt || 'CHAR').trim().toUpperCase();
  if (['CHAR', 'NUMC', 'DATS', 'TIMS', 'CURR', 'DEC', 'UNIT', 'INT4', 'STRING'].includes(upper)) {
    return upper as any;
  }
  if (upper === 'QUAN' || upper === 'FLTP') return 'DEC';
  if (upper === 'CUKY') return 'CHAR';
  return 'CHAR';
}

export function getFallbackTableSchema(table: string) {
  const t = table.toUpperCase();
  const isCustom = t.startsWith('Z') || t.startsWith('Y');

  return {
    table: t,
    name: isCustom ? `${t}: Custom SAP Table (고객 커스텀 테이블)` : `${t}: SAP ERP Table`,
    module:
      t.startsWith('VB') || t.startsWith('KN')
        ? 'SD'
        : t.startsWith('EK') || t.startsWith('MA') || t.startsWith('LF')
        ? 'MM'
        : t.startsWith('BK') || t.startsWith('BS') || t.startsWith('T0')
        ? 'FI'
        : t.startsWith('CS') || t.startsWith('AU') || t.startsWith('CO')
        ? 'CO'
        : 'COMMON',
    description: `SAP Data Dictionary table definition for ${t}`,
    fields: [
      { field: 'MANDT', label: 'Client (클라이언트)', datatype: 'CHAR', length: 3, isKey: true, description: 'Client number' },
      { field: isCustom ? `${t}_KEY` : `${t}_ID`, label: 'Primary ID (식별 키)', datatype: 'CHAR', length: 10, isKey: true, description: 'Primary Record Key' },
      { field: 'ERDAT', label: 'Created On (생성일자)', datatype: 'DATS', length: 8, isKey: false, description: 'Creation date' },
      { field: 'ERZET', label: 'Entry Time (생성시간)', datatype: 'TIMS', length: 6, isKey: false, description: 'Time of creation' },
      { field: 'ERNAM', label: 'Created By (생성자)', datatype: 'CHAR', length: 12, isKey: false, description: 'User who created the record' },
      { field: 'BUKRS', label: 'Company Code (회사코드)', datatype: 'CHAR', length: 4, isKey: false, description: 'Company code' },
      { field: 'STATUS', label: 'Processing Status (처리상태)', datatype: 'CHAR', length: 2, isKey: false, description: 'Status code' },
      { field: 'TEXT1', label: 'Description (내역 텍스트)', datatype: 'CHAR', length: 40, isKey: false, description: 'Item description text' },
      { field: 'MENGE', label: 'Quantity (수량)', datatype: 'DEC', length: 13, isKey: false, description: 'Quantity in base unit' },
      { field: 'MEINS', label: 'Base Unit (기본단위)', datatype: 'UNIT', length: 3, isKey: false, description: 'Unit of measure' },
      { field: 'NETWR', label: 'Net Amount (순금액)', datatype: 'CURR', length: 15, isKey: false, description: 'Net amount in document currency' },
      { field: 'WAERS', label: 'Currency (통화키)', datatype: 'CHAR', length: 5, isKey: false, description: 'Currency key' },
    ],
  };
}

export function generateFallbackSapRows(fields: any[], rowCount = 5): Record<string, any>[] {
  const result: Record<string, any>[] = [];
  const partnerNames = [
    '(주)삼성전자 수원공장',
    '현대모비스 남양연구소',
    'LG에너지솔루션 오창공장',
    'SK하이닉스 이천캠퍼스',
    '포스코 포항제철소',
  ];
  const amounts = [45000000, 38200000, 19800000, 52400000, 14500000];

  for (let r = 0; r < rowCount; r++) {
    const row: Record<string, any> = {};
    fields.forEach((f: any) => {
      const fn = String(f.fieldname || '').toUpperCase();
      if (fn === 'ZICON' || fn === 'STATUS' || fn === 'LIGHTS') {
        row[f.fieldname] = r === 2 ? '2' : r === 4 ? '3' : '1';
      } else if (fn.includes('VBELN') || fn.includes('DOC_NO') || fn.includes('DOCNO')) {
        row[f.fieldname] = `00100000${45 + r}`;
      } else if (fn.includes('EBELN')) {
        row[f.fieldname] = `450001928${r}`;
      } else if (fn.includes('BELNR')) {
        row[f.fieldname] = `100000001${r}`;
      } else if (f.datatype === 'DATS' || fn.includes('DATE') || fn.includes('ERDAT') || fn.includes('BUDAT')) {
        row[f.fieldname] = `2026.10.${String(10 + r * 3).padStart(2, '0')}`;
      } else if (
        f.datatype === 'CURR' ||
        f.datatype === 'DEC' ||
        fn.includes('AMOUNT') ||
        fn.includes('NETWR') ||
        fn.includes('DMBTR') ||
        fn.includes('NETPR')
      ) {
        row[f.fieldname] = amounts[r % amounts.length];
      } else if (
        fn.includes('WAERK') ||
        fn.includes('WAERS') ||
        fn.includes('CURRENCY') ||
        fn.includes('HWAER')
      ) {
        row[f.fieldname] = 'KRW';
      } else if (
        fn.includes('NAME') ||
        fn.includes('PARTNER') ||
        fn.includes('KUNNR') ||
        fn.includes('LIFNR')
      ) {
        row[f.fieldname] = partnerNames[r % partnerNames.length];
      } else if (fn.includes('MATNR')) {
        row[f.fieldname] = `MAT-PART-00${r + 1}`;
      } else if (fn.includes('MENGE') || fn.includes('KWMENG')) {
        row[f.fieldname] = (r + 1) * 25;
      } else if (fn.includes('MEINS') || fn.includes('VRKME')) {
        row[f.fieldname] = 'EA';
      } else if (f.datatype === 'NUMC') {
        row[f.fieldname] = String(r + 1).padStart(f.outputlen || 4, '0');
      } else {
        row[f.fieldname] = `${f.coltext || f.fieldname} ${r + 1}`;
      }
    });
    result.push(row);
  }
  return result;
}

export function detectSapModuleFromText(
  text: string
): 'SD' | 'MM' | 'FI' | 'CO' | 'PP' | 'HR' | 'QM' | 'PM' | 'BC' | 'CM' {
  const upper = (text || '').toUpperCase();
  if (
    upper.includes('원가') ||
    upper.includes('코스트') ||
    upper.includes('예산') ||
    upper.includes('KOSTL') ||
    upper.includes('CSKS') ||
    upper.includes('COEP') ||
    upper.includes('손익') ||
    upper.includes('CO ')
  ) {
    return 'CO';
  }
  if (
    upper.includes('구매') ||
    upper.includes('발주') ||
    upper.includes('입고') ||
    upper.includes('자재') ||
    upper.includes('EKKO') ||
    upper.includes('EKPO') ||
    upper.includes('MIGO') ||
    upper.includes('MM ')
  ) {
    return 'MM';
  }
  if (
    upper.includes('회계') ||
    upper.includes('전표') ||
    upper.includes('미결') ||
    upper.includes('채권') ||
    upper.includes('채무') ||
    upper.includes('결산') ||
    upper.includes('BKPF') ||
    upper.includes('BSEG') ||
    upper.includes('ACDOCA') ||
    upper.includes('FI ')
  ) {
    return 'FI';
  }
  if (
    upper.includes('생산') ||
    upper.includes('작업지시') ||
    upper.includes('공정') ||
    upper.includes('BOM') ||
    upper.includes('AFKO') ||
    upper.includes('PP ')
  ) {
    return 'PP';
  }
  if (upper.includes('품질') || upper.includes('검사') || upper.includes('QALS') || upper.includes('QM ')) {
    return 'QM';
  }
  if (upper.includes('설비') || upper.includes('보전') || upper.includes('PM ')) {
    return 'PM';
  }
  if (upper.includes('인사') || upper.includes('급여') || upper.includes('근태') || upper.includes('HR ')) {
    return 'HR';
  }
  if (upper.includes('공통 영역') || upper.includes('공통영역') || upper.includes('공통코드') || upper.includes('CM ')) {
    return 'CM';
  }
  return 'SD';
}

export function buildMeetingMinutesFallback(opts: {
  rawTranscript: string;
  supplementalNotes?: string;
  existingMinutes?: string;
  projectName?: string;
  mode?: string;
}) {
  const combined = `${opts.rawTranscript || ''}\n${opts.supplementalNotes || ''}`.trim();
  const mod = detectSapModuleFromText(combined);
  const snippet = (opts.rawTranscript || opts.supplementalNotes || '').split('\n').filter(Boolean);
  const firstLine = snippet[0]?.replace(/^\[[^\]]+\]\s*/, '').slice(0, 42) || `${mod} 신규 SAP 프로그램 설계 회의`;

  const bulletLines = snippet
    .slice(0, 8)
    .map((line) => `- ${line.trim()}`)
    .join('\n');

  const supplementSection = opts.supplementalNotes?.trim()
    ? `\n\n### 보충 논의 및 추가 반영 사항\n${opts.supplementalNotes
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => `- ${l.trim()}`)
        .join('\n')}`
    : '';

  const minutesMarkdown =
    opts.mode === 'enrich' && opts.existingMinutes?.trim()
      ? `${opts.existingMinutes.trim()}${supplementSection}`
      : `## 1. 회의 개요
- **대상 프로젝트**: ${opts.projectName || 'SAP 프로젝트'}
- **추정 SAP 모듈**: \`${mod}\`
- **회의 목적**: 현업 요구사항을 기반으로 프로그램 유형(COMMON 샘플 기준) 및 ALV 사양서 핵심 구조 합의

## 2. 주요 논의 및 요구사항 요약
${bulletLines || '- 회의 중 입력된 요구사항을 기반으로 화면 및 데이터 추출 기준 정의'}

## 3. 선택화면(Selection Screen) 및 출력(ALV) 초안
- **주요 조회 조건**: 회사코드/조직코드(필수), 기준일자 범위, 상태/유형별 필터 옵션
- **ALV 출력 및 상호작용**: 상태 신호등(\`ZICON\`), 주요 전표번호 핫스팟 드릴다운, 금액/수량 합계(\`DO_SUM\`) 및 업무 처리용 커스텀 툴바 버튼 구성

## 4. 결정 사항 및 후속 확인 과제 (Open Items)
- 회의록 검토·보충 완료 후 적합한 **COMMON 표준 샘플 유형(01~04)**을 선택하여 기능사양서 초안을 자동 구성함.${supplementSection}`;

  return {
    title: firstLine,
    detectedModule: mod,
    minutesMarkdown,
  };
}

export function buildSampleRecommendationFallback(opts: {
  minutesMarkdown: string;
  existingProgramIds?: string[];
}) {
  const txt = opts.minutesMarkdown || '';
  const upper = txt.toUpperCase();
  const mod = detectSapModuleFromText(txt);

  let recommendedSampleType: '01' | '02' | '03' | '04' = '01';
  let confidenceReason =
    '단일 기준의 조회·모니터링 및 선택 행 일괄 처리(툴바) 중심 요구사항에 가장 적합한 Single ALV Grid(01) 구조를 추천합니다.';

  if (
    txt.includes('계층') ||
    txt.includes('트리') ||
    txt.includes('상위') ||
    txt.includes('하위') ||
    txt.includes('조직도') ||
    upper.includes('TREE') ||
    upper.includes('WBS') ||
    upper.includes('BOM')
  ) {
    recommendedSampleType = '03';
    confidenceReason =
      '조직·계층·상하위 구조(Tree/WBS/BOM 등) 전개 및 노드별 소계 집계가 논의되어 Tree ALV Grid(03 · ZRALV0030)가 가장 적합합니다.';
  } else if (
    txt.includes('피벗') ||
    txt.includes('교차') ||
    txt.includes('월별') ||
    txt.includes('다차원') ||
    txt.includes('매트릭스') ||
    upper.includes('PIVOT') ||
    upper.includes('CDS') ||
    upper.includes('ACDOCA')
  ) {
    recommendedSampleType = '04';
    confidenceReason =
      '다차원 축(기간별·조직별·계정별) 교차 집계 및 동적 피벗 분석 요구사항이 포함되어 Pivot Browser(04 · ZRALV0040)가 가장 적합합니다.';
  } else if (
    txt.includes('헤더') ||
    txt.includes('품목') ||
    txt.includes('상세') ||
    txt.includes('아이템') ||
    txt.includes('상단') ||
    txt.includes('하단') ||
    upper.includes('MASTER') ||
    upper.includes('DETAIL') ||
    upper.includes('ITEM')
  ) {
    recommendedSampleType = '02';
    confidenceReason =
      '상단 헤더 목록 선택 시 하단에 연계 품목/상세 내역을 동시 조회하는 Master-Detail 2-Grid ALV(02 · ZRALV0020) 구조가 적합합니다.';
  }

  const existingSet = new Set(
    (opts.existingProgramIds || []).map((id) => String(id || '').trim().toUpperCase())
  );
  let seq = 10;
  let suggestedProgramId = `ZR_${mod}_MON_${String(seq).padStart(2, '0')}`;
  while (existingSet.has(suggestedProgramId)) {
    seq += 10;
    suggestedProgramId = `ZR_${mod}_MON_${String(seq).padStart(2, '0')}`;
  }
  const suggestedTcode = `Z${mod}${String(seq).padStart(3, '0')}`.slice(0, 10);

  const firstHeadingLine =
    txt
      .split('\n')
      .map((l) => l.replace(/^#+\s*/, '').trim())
      .find((l) => l && !l.includes('회의 개요') && !l.startsWith('**')) || '';

  return {
    recommendedSampleType,
    confidenceReason,
    suggestedModule: mod,
    suggestedProgramId,
    suggestedTcode,
    suggestedTitle: firstHeadingLine.slice(0, 44) || `${mod} 업무 현황 조회 및 처리 프로그램`,
    requirementPrompt: txt.slice(0, 2200),
    alternatives: [
      {
        sampleType: '01' as const,
        sampleProgramId: 'ZRALV0010',
        label: 'Single ALV Grid',
        fitSummary: '단일 목록 조회, 상태 신호등, 핫스팟 드릴다운, 커스텀 툴바 일괄 처리에 적합',
      },
      {
        sampleType: '02' as const,
        sampleProgramId: 'ZRALV0020',
        label: 'Master-Detail 2-Grid ALV',
        fitSummary: '헤더(전표) 클릭 시 하단 Item(품목) 그리드가 실시간 연동되는 상하 분할 구조',
      },
      {
        sampleType: '03' as const,
        sampleProgramId: 'ZRALV0030',
        label: 'Tree ALV Grid',
        fitSummary: '조직·원가·BOM·WBS 등 상하위 계층 트리 펼침/접기 및 노드 집계 구조',
      },
      {
        sampleType: '04' as const,
        sampleProgramId: 'ZRALV0040',
        label: 'Multi-Dimensional Pivot Browser',
        fitSummary: 'CDS View / ACDOCA 기반 행·열 다차원 피벗 및 기간별 교차 집계 분석',
      },
    ],
  };
}

export function normalizeGeneratedFullSpec(
  raw: any,
  opts: {
    requirementPrompt: string;
    module: string;
    sampleType: string;
    targetSapRelease: string;
    programId: string;
    tcode: string;
  }
) {
  const validModules = ['SD', 'MM', 'FI', 'CO', 'PP', 'HR', 'QM', 'PM', 'BC', 'CM'];
  const resolvedModule = validModules.includes(String(raw.module || '').toUpperCase())
    ? String(raw.module).toUpperCase()
    : opts.module || 'SD';

  const ensureCustomerNs = (val: string, prefix: string, fallbackVal: string) => {
    const clean = String(val || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!clean) return fallbackVal;
    if (clean.startsWith('Z') || clean.startsWith('Y')) return clean.slice(0, 30);
    return `${prefix}${clean}`.slice(0, 30);
  };

  const finalProgramId = ensureCustomerNs(
    opts.programId || raw.program_id,
    `Z${resolvedModule}_R_`,
    `Z${resolvedModule}R0010`
  );
  const finalTcode = ensureCustomerNs(
    opts.tcode || raw.tcode,
    `Z${resolvedModule}`,
    `Z${resolvedModule}010`
  ).slice(0, 20);

  const nowTs = Date.now();
  const blockMap = new Map<string, string>();

  const selection_params = (Array.isArray(raw.selection_params) ? raw.selection_params : []).map(
    (p: any, idx: number) => {
      const kind = ['PARAMETER', 'SELECT_OPTION', 'RADIOBUTTON', 'CHECKBOX'].includes(p?.kind)
        ? p.kind
        : String(p?.name || '').toUpperCase().startsWith('S_')
        ? 'SELECT_OPTION'
        : 'PARAMETER';
      const isToggle = kind === 'RADIOBUTTON' || kind === 'CHECKBOX';
      const dt = isToggle ? 'CHAR' : normalizeSapDataTypeServer(p?.datatype);
      const blockTitle = String(p?.block_title || '기본 조회 조건').trim();
      let blockId = String(p?.block_id || '').trim().toLowerCase();
      if (blockTitle) {
        if (!blockId) {
          if (!blockMap.has(blockTitle)) {
            blockMap.set(blockTitle, `b${blockMap.size + 1}`);
          }
          blockId = blockMap.get(blockTitle)!;
        } else {
          blockMap.set(blockTitle, blockId);
        }
      }
      const rawName = String(
        p?.name || (kind === 'SELECT_OPTION' ? `S_FLD${idx + 1}` : `P_FLD${idx + 1}`)
      )
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '');
      return {
        id: `ai-p-${nowTs}-${idx}`,
        kind,
        name: rawName.slice(0, 8),
        text: String(p?.text || `항목 ${idx + 1}`).trim(),
        ref_table: String(p?.ref_table || '').trim().toUpperCase(),
        ref_field: String(p?.ref_field || '').trim().toUpperCase(),
        datatype: dt,
        length: isToggle
          ? 1
          : Math.max(1, Number(p?.length) || (dt === 'DATS' ? 8 : dt === 'CURR' ? 15 : 10)),
        obligatory: isToggle ? false : Boolean(p?.obligatory),
        default_val: String(p?.default_val ?? '').trim(),
        block_title: blockTitle || undefined,
        block_id: blockId || undefined,
        radio_group:
          kind === 'RADIOBUTTON' ? String(p?.radio_group || 'R1').toUpperCase().slice(0, 4) : undefined,
        matchcode_object: p?.matchcode_object ? String(p.matchcode_object).trim().toUpperCase() : undefined,
        low: String(p?.low ?? p?.default_val ?? '').trim(),
        high: String(p?.high ?? '').trim(),
        sign: 'I' as const,
        option: kind === 'SELECT_OPTION' && p?.high ? ('BT' as const) : ('EQ' as const),
      };
    }
  );

  const rawFields = Array.isArray(raw.field_catalog) ? raw.field_catalog : [];
  const hasZicon = rawFields.some((f: any) => String(f?.fieldname || '').toUpperCase() === 'ZICON');
  const combinedRawFields = hasZicon
    ? rawFields
    : [
        {
          fieldname: 'ZICON',
          coltext: 'Status',
          datatype: 'CHAR',
          outputlen: 4,
          just: 'C',
          key: true,
          icon_type: 'LIGHTS',
        },
        ...rawFields,
      ];

  const field_catalog = combinedRawFields.map((f: any, idx: number) => {
    const fn = String(f?.fieldname || `FLD_${idx + 1}`).trim().toUpperCase();
    const isZicon = fn === 'ZICON';
    const dt = isZicon ? 'CHAR' : normalizeSapDataTypeServer(f?.datatype);
    const isNumeric = dt === 'CURR' || dt === 'DEC' || dt === 'INT4';
    return {
      id: `ai-f-${nowTs}-${idx}`,
      col_pos: idx + 1,
      fieldname: fn,
      coltext: String(f?.coltext || fn).trim(),
      datatype: dt,
      outputlen: isZicon
        ? 4
        : Math.max(1, Number(f?.outputlen) || (dt === 'CURR' ? 15 : dt === 'DATS' ? 10 : 12)),
      just: isZicon
        ? 'C'
        : ['L', 'C', 'R'].includes(f?.just)
        ? f.just
        : isNumeric
        ? 'R'
        : dt === 'DATS'
        ? 'C'
        : 'L',
      key: isZicon ? true : Boolean(f?.key),
      hotspot: isZicon ? false : Boolean(f?.hotspot),
      checkbox: !isZicon && dt === 'CHAR' && Number(f?.outputlen) === 1 ? Boolean(f?.checkbox) : false,
      edit: isZicon ? false : Boolean(f?.edit),
      do_sum: !isZicon && isNumeric ? Boolean(f?.do_sum) : false,
      emphasize: isZicon ? '' : String(f?.emphasize || '').trim().toUpperCase(),
      icon_type: isZicon ? 'LIGHTS' : undefined,
      cfieldname: dt === 'CURR' ? String(f?.cfieldname || 'WAERK').trim().toUpperCase() : undefined,
      qfieldname: f?.qfieldname ? String(f.qfieldname).trim().toUpperCase() : undefined,
      ref_table: String(f?.ref_table || '').trim().toUpperCase(),
      ref_field: String(f?.ref_field || '').trim().toUpperCase(),
      drilldown_tcode:
        f?.hotspot && f?.drilldown_tcode ? String(f.drilldown_tcode).trim().toUpperCase() : undefined,
    };
  });

  const fallbackRows = generateFallbackSapRows(field_catalog, 5);
  const aiRows = Array.isArray(raw.mock_rows) && raw.mock_rows.length > 0 ? raw.mock_rows : [];
  const mock_rows = (aiRows.length > 0 ? aiRows : fallbackRows).map((row: any, rIdx: number) => {
    const out: Record<string, any> = {};
    field_catalog.forEach((f: any) => {
      const val = row?.[f.fieldname];
      out[f.fieldname] =
        val !== undefined && val !== null && val !== ''
          ? val
          : fallbackRows[rIdx % fallbackRows.length]?.[f.fieldname] ?? '';
    });
    return out;
  });

  const layout = {
    grid_title: String(raw?.layout?.grid_title || raw.title || 'ALV Grid Report').slice(0, 70),
    zebra: raw?.layout?.zebra !== undefined ? Boolean(raw.layout.zebra) : true,
    sel_mode: ['A', 'B', 'C', 'D', 'SPACE'].includes(raw?.layout?.sel_mode) ? raw.layout.sel_mode : 'A',
    cwidth_opt: raw?.layout?.cwidth_opt !== undefined ? Boolean(raw.layout.cwidth_opt) : true,
    totals_only: Boolean(raw?.layout?.totals_only),
    excp_fname: 'ZICON',
    excp_led: true,
    show_row_numbers: raw?.layout?.show_row_numbers !== undefined ? Boolean(raw.layout.show_row_numbers) : true,
  };

  const custom_toolbar = (Array.isArray(raw.custom_toolbar) ? raw.custom_toolbar : []).map(
    (b: any, idx: number) => ({
      id: `ai-tb-${nowTs}-${idx}`,
      function: String(b?.function || `FC0${idx + 1}`).trim().toUpperCase(),
      text: String(b?.text || '실행').trim(),
      quickinfo: String(b?.quickinfo || b?.text || '사용자 정의 기능').trim(),
      icon: String(b?.icon || 'ICON_EXECUTE_OBJECT').trim(),
      disabled: false,
      visible: true,
      is_standard: false,
    })
  );

  const test_cases = (
    Array.isArray(raw.test_cases) && raw.test_cases.length > 0
      ? raw.test_cases
      : [
          {
            scenario: '정상 조회 및 합계 검증',
            condition: '기본 조회 조건 입력 후 실행 (F8)',
            expected: '조건에 일치하는 데이터가 ALV 그리드에 출력되고 금액 합계가 정확히 계산됨',
          },
          {
            scenario: '핫스팟 드릴다운 확인',
            condition: 'ALV 내 주요 전표번호 핫스팟 클릭',
            expected: '연계된 SAP 표준 트랜잭션(T-Code) 상세 조회 동작 확인',
          },
        ]
  ).map((tc: any, idx: number) => ({
    id: `ai-tc-${nowTs}-${idx}`,
    scenario: String(tc?.scenario || `시나리오 ${idx + 1}`),
    condition: String(tc?.condition || '조회 조건 입력 후 실행'),
    expected: String(tc?.expected || '정상 결과 출력'),
  }));

  let item_grid = undefined;
  if (opts.sampleType === '02') {
    const rawItem = raw.item_grid || {};
    const firstKeyField =
      field_catalog.find((f: any) => f.key && f.fieldname !== 'ZICON')?.fieldname || 'DOC_NO';
    const rawItemFields =
      Array.isArray(rawItem.field_catalog) && rawItem.field_catalog.length > 0
        ? rawItem.field_catalog
        : [
            { fieldname: firstKeyField, coltext: '전표번호', datatype: 'CHAR', outputlen: 10, just: 'C', key: true },
            { fieldname: 'POSNR', coltext: '품목번호', datatype: 'NUMC', outputlen: 6, just: 'C', key: true },
            { fieldname: 'MATNR', coltext: '자재코드', datatype: 'CHAR', outputlen: 18, just: 'L', hotspot: true, drilldown_tcode: 'MM03' },
            { fieldname: 'MAKTX', coltext: '자재내역', datatype: 'CHAR', outputlen: 40, just: 'L' },
            { fieldname: 'MENGE', coltext: '수량', datatype: 'DEC', outputlen: 13, just: 'R', do_sum: true, qfieldname: 'MEINS' },
            { fieldname: 'MEINS', coltext: '단위', datatype: 'UNIT', outputlen: 3, just: 'C' },
            { fieldname: 'NETWR', coltext: '품목금액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERK' },
            { fieldname: 'WAERK', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C' },
          ];

    const itemCatalog = rawItemFields.map((f: any, idx: number) => {
      const fn = String(f?.fieldname || `IFLD_${idx + 1}`).trim().toUpperCase();
      const dt = normalizeSapDataTypeServer(f?.datatype);
      const isNumeric = dt === 'CURR' || dt === 'DEC' || dt === 'INT4';
      return {
        id: `ai-if-${nowTs}-${idx}`,
        col_pos: idx + 1,
        fieldname: fn,
        coltext: String(f?.coltext || fn).trim(),
        datatype: dt,
        outputlen: Math.max(1, Number(f?.outputlen) || 12),
        just: ['L', 'C', 'R'].includes(f?.just) ? f.just : isNumeric ? 'R' : 'L',
        key: Boolean(f?.key),
        hotspot: Boolean(f?.hotspot),
        checkbox: false,
        edit: Boolean(f?.edit),
        do_sum: isNumeric ? Boolean(f?.do_sum) : false,
        emphasize: String(f?.emphasize || '').trim().toUpperCase(),
        cfieldname: dt === 'CURR' ? String(f?.cfieldname || 'WAERK').trim().toUpperCase() : undefined,
        qfieldname: f?.qfieldname ? String(f.qfieldname).trim().toUpperCase() : undefined,
        ref_table: String(f?.ref_table || '').trim().toUpperCase(),
        ref_field: String(f?.ref_field || '').trim().toUpperCase(),
        drilldown_tcode:
          f?.hotspot && f?.drilldown_tcode ? String(f.drilldown_tcode).trim().toUpperCase() : undefined,
      };
    });

    const fk = String(rawItem.foreign_key || firstKeyField).trim().toUpperCase();
    const fallbackItemRows = generateFallbackSapRows(itemCatalog, 6);
    const aiItemRows =
      Array.isArray(rawItem.mock_rows) && rawItem.mock_rows.length > 0 ? rawItem.mock_rows : fallbackItemRows;
    const headerKeys = mock_rows.map((r: any) => r[fk]).filter(Boolean);
    const itemMockRows = aiItemRows.map((row: any, rIdx: number) => {
      const out: Record<string, any> = {};
      itemCatalog.forEach((f: any) => {
        out[f.fieldname] =
          row?.[f.fieldname] ?? fallbackItemRows[rIdx % fallbackItemRows.length]?.[f.fieldname] ?? '';
      });
      if (headerKeys.length > 0 && itemCatalog.some((f: any) => f.fieldname === fk)) {
        out[fk] = headerKeys[rIdx % headerKeys.length];
      }
      return out;
    });

    item_grid = {
      grid_name: String(rawItem.grid_name || 'Item ALV Grid'),
      grid_title: String(rawItem.grid_title || '상세 품목 ALV Grid'),
      foreign_key: fk,
      layout: {
        grid_title: String(rawItem?.layout?.grid_title || '상세 품목 내역 (Item Details)'),
        zebra: true,
        sel_mode: 'A',
        cwidth_opt: true,
        show_row_numbers: true,
      },
      field_catalog: itemCatalog,
      mock_rows: itemMockRows,
    };
  }

  const detectedTables: string[] = Array.from(
    new Set([
      ...(Array.isArray(raw.detectedTables) ? raw.detectedTables : []),
      ...field_catalog.map((f: any) => f.ref_table).filter(Boolean),
      ...selection_params.map((p: any) => p.ref_table).filter(Boolean),
    ])
  )
    .map((t) => String(t).trim().toUpperCase())
    .filter(Boolean);

  const mermaidCode =
    typeof raw?.data_flow?.mermaid_code === 'string' && raw.data_flow.mermaid_code.includes('graph')
      ? raw.data_flow.mermaid_code
      : `graph TD;
  A[시작 및 권한 점검] --> B{선택화면 검증};
  B -->|정상| C[${detectedTables.slice(0, 3).join(', ') || resolvedModule} 데이터 추출];
  B -->|오류| E[오류 메시지 출력];
  C --> D[신호등 및 ALV 가공];
  D --> F[ALV Grid 출력 및 이벤트];`;

  const nodeDetails =
    raw?.data_flow?.node_details && typeof raw.data_flow.node_details === 'object'
      ? raw.data_flow.node_details
      : {
          A: { label: '시작 및 권한 점검', markdown: `### 시작\n- \`${finalProgramId}\` 실행 권한 및 선택화면 기본값 초기화` },
          B: { label: '선택화면 검증', markdown: `### 입력 검증\n- 필수 파라미터 및 기간 범위 유효성 점검` },
          C: { label: '데이터 추출', markdown: `### DB 조회\n- 대상 테이블: ${detectedTables.map((t) => `\`${t}\``).join(', ') || resolvedModule}` },
          D: { label: '신호등 및 ALV 가공', markdown: `### 데이터 가공\n- 상태별 신호등(\`ZICON\`) 부여 및 금액/수량 집계` },
          F: { label: 'ALV Grid 출력', markdown: `### 화면 출력\n- \`CL_GUI_ALV_GRID\` 바인딩 및 드릴다운/커스텀 툴바 처리` },
        };

  const normalizedAuthorityChecks = Array.isArray(raw.authority_checks)
    ? raw.authority_checks.map((a: any, idx: number) => ({
        id: String(a?.id || `auth-ai-${nowTs}-${idx}`),
        object: String(a?.object || '').trim().toUpperCase(),
        fields: String(a?.fields || a?.field_values || "ACTVT = '03'").trim(),
        trigger_point: String(a?.trigger_point || 'START-OF-SELECTION').trim(),
        description: String(a?.description || a?.message_on_fail || '실행 권한 점검').trim(),
      })).filter((a: any) => Boolean(a.object))
    : undefined;

  return {
    detectedTables,
    spec: {
      id: `spec-ai-${nowTs}`,
      sample_type: opts.sampleType,
      program_id: finalProgramId,
      tcode: finalTcode,
      title: String(raw.title || opts.requirementPrompt.slice(0, 48)).trim(),
      module: resolvedModule as any,
      author: 'Josh Lee',
      cds_view_table:
        opts.sampleType === '04'
          ? String(raw.cds_view_table || detectedTables[0] || 'ACDOCA').trim().toUpperCase()
          : undefined,
      created_date: new Date().toISOString().slice(0, 10),
      target_sap_release: opts.targetSapRelease,
      program_type: 'REPORT' as const,
      business_purpose: String(raw.business_purpose || opts.requirementPrompt).trim(),
      data_extraction_logic: String(raw.data_extraction_logic || '').trim(),
      authority_checks: normalizedAuthorityChecks,
      data_flow: {
        title: `${finalProgramId} Data Flow Diagram`,
        mermaid_code: mermaidCode,
        node_details: nodeDetails,
        active_node_id: 'A',
      },
      selection_params,
      field_catalog,
      layout,
      custom_toolbar,
      test_cases,
      mock_rows,
      item_grid,
    },
  };
}

export function buildFullSpecFallback(opts: {
  requirementPrompt: string;
  module: string;
  sampleType: string;
  targetSapRelease: string;
  programId: string;
  tcode: string;
}) {
  const txt = opts.requirementPrompt.toUpperCase();
  const detectedMod = opts.module
    ? opts.module
    : txt.includes('구매') || txt.includes('발주') || txt.includes('자재') || txt.includes('입고') || txt.includes('PO') || txt.includes('EKKO')
    ? 'MM'
    : txt.includes('회계') || txt.includes('전표') || txt.includes('채권') || txt.includes('미결') || txt.includes('세금') || txt.includes('BKPF') || txt.includes('FI')
    ? 'FI'
    : txt.includes('원가') || txt.includes('코스트') || txt.includes('예산') || txt.includes('실적') || txt.includes('CO')
    ? 'CO'
    : txt.includes('생산') || txt.includes('작업지시') || txt.includes('PP')
    ? 'PP'
    : 'SD';

  if (detectedMod === 'MM') {
    return {
      program_id: opts.programId || 'ZMM_R_PO_MONITOR',
      tcode: opts.tcode || 'ZMM010',
      title: opts.requirementPrompt.slice(0, 42) || '구매오더 입고 및 납기 지연 모니터링',
      module: 'MM',
      detectedTables: ['EKKO', 'EKPO', 'LFA1', 'MARA', 'EKBE'],
      business_purpose: `### 개발 목적 및 업무 배경\n- **요구사항 요약**: ${opts.requirementPrompt}\n- 구매오더(\`EKKO\`/\`EKPO\`)와 입고이력(\`EKBE\`)을 실시간으로 비교하여 납기 지연 및 미입고 품목을 즉시 식별합니다.`,
      data_extraction_logic: `1. **주요 테이블**: \`EKKO\`(구매오더 헤더), \`EKPO\`(품목), \`LFA1\`(공급업체), \`MARA\`(자재), \`EKBE\`(입고이력)\n2. **조회 조건**: \`EKKO~BUKRS = P_BUKRS\`, \`EKKO~EBELN IN S_EBELN\`, \`EKKO~BEDAT IN S_BEDAT\`, \`EKPO~WERKS IN S_WERKS\`\n3. **상태 판정**:\n   - \`ZICON = '3'\`: 납기예정일 경과 및 미입고 잔량 > 0\n   - \`ZICON = '2'\`: 일부 입고 완료\n   - \`ZICON = '1'\`: 전량 입고 완료`,
      selection_params: [
        { kind: 'PARAMETER', name: 'P_BUKRS', text: '회사코드 (Company Code)', ref_table: 'EKKO', ref_field: 'BUKRS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', block_title: '기본 조회 조건' },
        { kind: 'SELECT_OPTION', name: 'S_WERKS', text: '플랜트 (Plant)', ref_table: 'EKPO', ref_field: 'WERKS', datatype: 'CHAR', length: 4, obligatory: false, default_val: '1000', block_title: '기본 조회 조건' },
        { kind: 'SELECT_OPTION', name: 'S_BEDAT', text: '발주일자 (PO Date)', ref_table: 'EKKO', ref_field: 'BEDAT', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', block_title: '기본 조회 조건' },
        { kind: 'SELECT_OPTION', name: 'S_EBELN', text: '구매오더 (PO Number)', ref_table: 'EKKO', ref_field: 'EBELN', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_title: '기본 조회 조건' },
        { kind: 'RADIOBUTTON', name: 'P_ALL', text: '전체 발주 건', datatype: 'CHAR', length: 1, default_val: 'X', block_title: '조회 옵션', radio_group: 'R1' },
        { kind: 'RADIOBUTTON', name: 'P_OPEN', text: '미입고/지연 건만', datatype: 'CHAR', length: 1, default_val: '', block_title: '조회 옵션', radio_group: 'R1' },
      ],
      field_catalog: [
        { fieldname: 'ZICON', coltext: 'Status', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, icon_type: 'LIGHTS' },
        { fieldname: 'EBELN', coltext: '구매오더', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, drilldown_tcode: 'ME23N', ref_table: 'EKKO', ref_field: 'EBELN' },
        { fieldname: 'BEDAT', coltext: '발주일자', datatype: 'DATS', outputlen: 10, just: 'C', ref_table: 'EKKO', ref_field: 'BEDAT' },
        { fieldname: 'LIFNR_NM', coltext: '공급업체명', datatype: 'CHAR', outputlen: 30, just: 'L', ref_table: 'LFA1', ref_field: 'NAME1' },
        { fieldname: 'MATNR', coltext: '자재코드', datatype: 'CHAR', outputlen: 18, just: 'L', hotspot: true, drilldown_tcode: 'MM03', ref_table: 'EKPO', ref_field: 'MATNR' },
        { fieldname: 'MENGE', coltext: '발주수량', datatype: 'DEC', outputlen: 13, just: 'R', do_sum: true, qfieldname: 'MEINS', ref_table: 'EKPO', ref_field: 'MENGE' },
        { fieldname: 'MEINS', coltext: '단위', datatype: 'UNIT', outputlen: 3, just: 'C', ref_table: 'EKPO', ref_field: 'MEINS' },
        { fieldname: 'NETWR', coltext: '발주금액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERS', ref_table: 'EKPO', ref_field: 'NETWR' },
        { fieldname: 'WAERS', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', ref_table: 'EKKO', ref_field: 'WAERS' },
      ],
      custom_toolbar: [
        { function: 'MIGO', text: '입고처리', quickinfo: '선택 구매오더 입고 화면 이동(MIGO)', icon: 'ICON_GOODS_RECEIPT' },
        { function: 'REFRESH', text: '재조회', quickinfo: '최신 발주 현황 갱신', icon: 'ICON_REFRESH' },
      ],
    };
  }

  if (detectedMod === 'FI') {
    return {
      program_id: opts.programId || 'ZFI_R_AR_AGING',
      tcode: opts.tcode || 'ZFI010',
      title: opts.requirementPrompt.slice(0, 42) || '거래처별 채권/미결 전표 현황 리포트',
      module: 'FI',
      detectedTables: ['BKPF', 'BSEG', 'BSID', 'KNA1', 'T001'],
      business_purpose: `### 개발 목적 및 업무 배경\n- **요구사항 요약**: ${opts.requirementPrompt}\n- 회계전표(\`BKPF\`/\`BSEG\`) 및 고객 미결 항목(\`BSID\`)을 집계하여 기한 경과 채권 및 위험 거래처를 모니터링합니다.`,
      data_extraction_logic: `1. **주요 테이블**: \`BKPF\`(전표 헤더), \`BSID\`(고객 미결), \`KNA1\`(고객 마스터), \`T001\`(회사코드)\n2. **조회 조건**: \`BUKRS = P_BUKRS\`, \`BUDAT IN S_BUDAT\`, \`KUNNR IN S_KUNNR\`\n3. **상태 판정**:\n   - \`ZICON = '3'\`: 만기일 30일 이상 연체\n   - \`ZICON = '2'\`: 만기 도래 예정(7일 이내)\n   - \`ZICON = '1'\`: 정상 미결/반제 완료`,
      selection_params: [
        { kind: 'PARAMETER', name: 'P_BUKRS', text: '회사코드 (Company Code)', ref_table: 'BKPF', ref_field: 'BUKRS', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', block_title: '기본 조회 조건' },
        { kind: 'SELECT_OPTION', name: 'S_BUDAT', text: '전기일자 (Posting Date)', ref_table: 'BKPF', ref_field: 'BUDAT', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', block_title: '기본 조회 조건' },
        { kind: 'SELECT_OPTION', name: 'S_KUNNR', text: '고객코드 (Customer)', ref_table: 'BSID', ref_field: 'KUNNR', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_title: '기본 조회 조건' },
        { kind: 'CHECKBOX', name: 'P_OPEN', text: '미결 항목(Open Item)만 조회', datatype: 'CHAR', length: 1, default_val: 'X', block_title: '조회 옵션' },
      ],
      field_catalog: [
        { fieldname: 'ZICON', coltext: 'Status', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, icon_type: 'LIGHTS' },
        { fieldname: 'BELNR', coltext: '회계전표', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, drilldown_tcode: 'FB03', ref_table: 'BKPF', ref_field: 'BELNR' },
        { fieldname: 'BUDAT', coltext: '전기일자', datatype: 'DATS', outputlen: 10, just: 'C', ref_table: 'BKPF', ref_field: 'BUDAT' },
        { fieldname: 'NAME1', coltext: '거래처명', datatype: 'CHAR', outputlen: 35, just: 'L', ref_table: 'KNA1', ref_field: 'NAME1' },
        { fieldname: 'DMBTR', coltext: '원화금액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERS', ref_table: 'BSEG', ref_field: 'DMBTR' },
        { fieldname: 'WAERS', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', ref_table: 'BKPF', ref_field: 'WAERS' },
        { fieldname: 'SGTXT', coltext: '전표적요', datatype: 'CHAR', outputlen: 40, just: 'L', ref_table: 'BSEG', ref_field: 'SGTXT' },
      ],
      custom_toolbar: [
        { function: 'CLEAR', text: '일괄반제', quickinfo: '선택 미결 항목 반제 시뮬레이션', icon: 'ICON_OKAY' },
      ],
    };
  }

  return {
    program_id: opts.programId || `Z${detectedMod}_R_MONITOR`,
    tcode: opts.tcode || `Z${detectedMod}010`,
    title: opts.requirementPrompt.slice(0, 42) || '영업 오더 진행 및 출하 현황 모니터링',
    module: detectedMod,
    detectedTables: ['VBAK', 'VBAP', 'KNA1', 'LIKP'],
    business_purpose: `### 개발 목적 및 업무 배경\n- **요구사항 요약**: ${opts.requirementPrompt}\n- 영업 전표 헤더(\`VBAK\`)와 품목(\`VBAP\`), 고객(\`KNA1\`) 데이터를 실시간 연계하여 출하 및 매출 현황을 조회합니다.`,
    data_extraction_logic: `1. **주요 테이블**: \`VBAK\`(판매오더 헤더), \`VBAP\`(품목), \`KNA1\`(고객 마스터), \`LIKP\`(납품 헤더)\n2. **조회 조건**: \`VBAK~VKORG = P_VKORG\`, \`VBAK~ERDAT IN S_ERDAT\`, \`VBAK~VBELN IN S_VBELN\`\n3. **상태 판정**:\n   - \`ZICON = '3'\`: 납품 보류 또는 여신 블록\n   - \`ZICON = '2'\`: 일부 출하 진행 중\n   - \`ZICON = '1'\`: 출하 및 청구 완료`,
    selection_params: [
      { kind: 'PARAMETER', name: 'P_VKORG', text: '영업조직 (Sales Org)', ref_table: 'VBAK', ref_field: 'VKORG', datatype: 'CHAR', length: 4, obligatory: true, default_val: '1000', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_ERDAT', text: '전표일자 (Doc Date)', ref_table: 'VBAK', ref_field: 'ERDAT', datatype: 'DATS', length: 8, obligatory: false, default_val: '2026.10.01', block_title: '기본 조회 조건' },
      { kind: 'SELECT_OPTION', name: 'S_VBELN', text: '판매오더 (Sales Order)', ref_table: 'VBAK', ref_field: 'VBELN', datatype: 'CHAR', length: 10, obligatory: false, default_val: '', block_title: '기본 조회 조건' },
      { kind: 'RADIOBUTTON', name: 'P_ALL', text: '전체 오더', datatype: 'CHAR', length: 1, default_val: 'X', block_title: '조회 옵션', radio_group: 'R1' },
      { kind: 'RADIOBUTTON', name: 'P_DELAY', text: '지연/보류 오더만', datatype: 'CHAR', length: 1, default_val: '', block_title: '조회 옵션', radio_group: 'R1' },
    ],
    field_catalog: [
      { fieldname: 'ZICON', coltext: 'Status', datatype: 'CHAR', outputlen: 4, just: 'C', key: true, icon_type: 'LIGHTS' },
      { fieldname: 'VBELN', coltext: '판매오더', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, drilldown_tcode: 'VA03', ref_table: 'VBAK', ref_field: 'VBELN' },
      { fieldname: 'ERDAT', coltext: '전표일자', datatype: 'DATS', outputlen: 10, just: 'C', ref_table: 'VBAK', ref_field: 'ERDAT' },
      { fieldname: 'NAME1', coltext: '고객명', datatype: 'CHAR', outputlen: 35, just: 'L', ref_table: 'KNA1', ref_field: 'NAME1' },
      { fieldname: 'NETWR', coltext: '공급가액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERK', ref_table: 'VBAK', ref_field: 'NETWR' },
      { fieldname: 'WAERK', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', ref_table: 'VBAK', ref_field: 'WAERK' },
    ],
    custom_toolbar: [
      { function: 'POST', text: '출하전기', quickinfo: '선택 오더 출고 처리', icon: 'ICON_OKAY' },
    ],
  };
}

export function extractSpecElementsFallback(opts: {
  combinedText: string;
  module: string;
  existingParamNames: Set<string>;
  existingFieldNames: Set<string>;
}) {
  const upper = opts.combinedText.toUpperCase();
  const knownTables = [
    'VBAK', 'VBAP', 'KNA1', 'LIKP', 'LIPS', 'VBRK', 'VBRP', 'VBUK', 'VBUP',
    'EKKO', 'EKPO', 'EKBE', 'MARA', 'MAKT', 'MARC', 'MARD', 'LFA1',
    'BKPF', 'BSEG', 'BSID', 'BSIK', 'ACDOCA', 'SKA1', 'SKAT', 'T001',
    'CSKS', 'CSKT', 'COEP', 'COSP', 'SETNODE', 'SETLEAF',
    'AFKO', 'AFPO', 'AUFK', 'QALS', 'PA0001',
  ];

  const detectedTables = knownTables.filter((t) => new RegExp(`\\b${t}\\b`).test(upper));
  const customMatches = upper.match(/\b[ZY][A-Z0-9_]{3,15}\b/g) || [];
  customMatches.forEach((m) => {
    if (!m.startsWith('ZICON') && !m.startsWith('Z_R') && !detectedTables.includes(m)) {
      if (m.includes('T') || upper.includes(`TABLE ${m}`) || upper.includes('테이블')) {
        detectedTables.push(m);
      }
    }
  });

  const suggestedSelectionParams: any[] = [];
  const suggestedFieldCatalog: any[] = [];

  const maybeAddParam = (item: any) => {
    const safeName = String(item.name || '').slice(0, 8);
    if (!opts.existingParamNames.has(safeName) && !suggestedSelectionParams.some((x) => x.name === safeName)) {
      suggestedSelectionParams.push({ ...item, name: safeName });
    }
  };
  const maybeAddField = (item: any) => {
    if (!opts.existingFieldNames.has(item.fieldname) && !suggestedFieldCatalog.some((x) => x.fieldname === item.fieldname)) {
      suggestedFieldCatalog.push(item);
    }
  };

  const pMatches = upper.match(/\bP_[A-Z0-9_]{2,15}\b/g) || [];
  pMatches.forEach((name) => {
    maybeAddParam({
      kind: 'PARAMETER',
      name,
      text: `${name.replace(/^P_/, '')} (추출 파라미터)`,
      datatype: name.includes('DAT') ? 'DATS' : 'CHAR',
      length: name.includes('BUKRS') || name.includes('VKORG') || name.includes('WERKS') || name.includes('KOKRS') ? 4 : 10,
      ref_table: detectedTables[0] || '',
      ref_field: name.replace(/^P_/, ''),
      obligatory: true,
      default_val: name.includes('BUKRS') || name.includes('VKORG') ? '1000' : '',
      block_title: '기본 조회 조건',
      reason: `로직 텍스트 내 '${name}' 파라미터 참조 감지`,
    });
  });

  const sMatches = upper.match(/\bS_[A-Z0-9_]{2,15}\b/g) || [];
  sMatches.forEach((name) => {
    const core = name.replace(/^S_/, '');
    maybeAddParam({
      kind: 'SELECT_OPTION',
      name,
      text: `${core} (추출 범위 조건)`,
      datatype: core.includes('DAT') ? 'DATS' : 'CHAR',
      length: core.includes('DAT') ? 8 : core.includes('MATNR') ? 18 : 10,
      ref_table: detectedTables[0] || '',
      ref_field: core,
      obligatory: false,
      default_val: '',
      block_title: '기본 조회 조건',
      reason: `로직 텍스트 내 '${name}' SELECT-OPTIONS 참조 감지`,
    });
  });

  if (detectedTables.includes('VBAK') || detectedTables.includes('VBAP') || opts.module === 'SD') {
    maybeAddParam({ kind: 'PARAMETER', name: 'P_VKORG', text: '영업조직 (Sales Org)', datatype: 'CHAR', length: 4, ref_table: 'VBAK', ref_field: 'VKORG', obligatory: true, default_val: '1000', block_title: '기본 조회 조건', reason: 'SD 판매오더 테이블(VBAK) 기준 조직 조회 조건' });
    maybeAddParam({ kind: 'SELECT_OPTION', name: 'S_ERDAT', text: '전표생성일 (Created On)', datatype: 'DATS', length: 8, ref_table: 'VBAK', ref_field: 'ERDAT', obligatory: false, default_val: '', block_title: '기본 조회 조건', reason: 'VBAK 일자 범위 조건 추천' });
    maybeAddField({ fieldname: 'VBELN', coltext: '판매오더', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, drilldown_tcode: 'VA03', ref_table: 'VBAK', ref_field: 'VBELN', reason: 'VBAK 기본 키 및 VA03 핫스팟 연계' });
    maybeAddField({ fieldname: 'NETWR', coltext: '공급가액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERK', ref_table: 'VBAK', ref_field: 'NETWR', reason: '판매금액 집계 및 통화 참조' });
    maybeAddField({ fieldname: 'WAERK', coltext: '통화키', datatype: 'CHAR', outputlen: 5, just: 'C', ref_table: 'VBAK', ref_field: 'WAERK', reason: 'NETWR 통화 참조 필드' });
  }
  if (detectedTables.includes('KNA1')) {
    maybeAddParam({ kind: 'SELECT_OPTION', name: 'S_KUNNR', text: '고객코드 (Customer)', datatype: 'CHAR', length: 10, ref_table: 'KNA1', ref_field: 'KUNNR', obligatory: false, default_val: '', block_title: '기본 조회 조건', reason: 'KNA1 고객 마스터 조회 조건' });
    maybeAddField({ fieldname: 'KUNNR', coltext: '고객코드', datatype: 'CHAR', outputlen: 10, just: 'C', hotspot: true, drilldown_tcode: 'XD03', ref_table: 'KNA1', ref_field: 'KUNNR', reason: 'KNA1 고객 번호' });
    maybeAddField({ fieldname: 'NAME1', coltext: '고객명', datatype: 'CHAR', outputlen: 35, just: 'L', ref_table: 'KNA1', ref_field: 'NAME1', reason: 'KNA1 고객명 매핑' });
  }
  if (detectedTables.includes('EKKO') || detectedTables.includes('EKPO') || opts.module === 'MM') {
    maybeAddParam({ kind: 'SELECT_OPTION', name: 'S_EBELN', text: '구매오더 (PO Number)', datatype: 'CHAR', length: 10, ref_table: 'EKKO', ref_field: 'EBELN', obligatory: false, default_val: '', block_title: '기본 조회 조건', reason: 'EKKO 구매오더 번호 범위 조건' });
    maybeAddParam({ kind: 'SELECT_OPTION', name: 'S_WERKS', text: '플랜트 (Plant)', datatype: 'CHAR', length: 4, ref_table: 'EKPO', ref_field: 'WERKS', obligatory: false, default_val: '1000', block_title: '기본 조회 조건', reason: 'EKPO 플랜트 필터링 조건' });
    maybeAddField({ fieldname: 'EBELN', coltext: '구매오더', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, drilldown_tcode: 'ME23N', ref_table: 'EKKO', ref_field: 'EBELN', reason: 'EKKO 키 필드 및 ME23N 드릴다운' });
    maybeAddField({ fieldname: 'MENGE', coltext: '발주수량', datatype: 'DEC', outputlen: 13, just: 'R', do_sum: true, qfieldname: 'MEINS', ref_table: 'EKPO', ref_field: 'MENGE', reason: 'EKPO 발주수량 합계' });
    maybeAddField({ fieldname: 'MEINS', coltext: '단위', datatype: 'UNIT', outputlen: 3, just: 'C', ref_table: 'EKPO', ref_field: 'MEINS', reason: 'MENGE 단위 참조 필드' });
  }
  if (detectedTables.includes('BKPF') || detectedTables.includes('BSEG') || detectedTables.includes('ACDOCA') || opts.module === 'FI') {
    maybeAddParam({ kind: 'PARAMETER', name: 'P_BUKRS', text: '회사코드 (Company Code)', datatype: 'CHAR', length: 4, ref_table: 'BKPF', ref_field: 'BUKRS', obligatory: true, default_val: '1000', block_title: '기본 조회 조건', reason: 'FI 전표 필수 회사코드 조건' });
    maybeAddParam({ kind: 'SELECT_OPTION', name: 'S_BUDAT', text: '전기일자 (Posting Date)', datatype: 'DATS', length: 8, ref_table: 'BKPF', ref_field: 'BUDAT', obligatory: false, default_val: '', block_title: '기본 조회 조건', reason: '회계전표 전기일자 범위 조건' });
    maybeAddField({ fieldname: 'BELNR', coltext: '회계전표', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, drilldown_tcode: 'FB03', ref_table: 'BKPF', ref_field: 'BELNR', reason: 'BKPF 전표번호 및 FB03 드릴다운' });
    maybeAddField({ fieldname: 'DMBTR', coltext: '현지금액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERS', ref_table: 'BSEG', ref_field: 'DMBTR', reason: 'BSEG 금액 집계 필드' });
    maybeAddField({ fieldname: 'WAERS', coltext: '통화', datatype: 'CHAR', outputlen: 5, just: 'C', ref_table: 'BKPF', ref_field: 'WAERS', reason: 'DMBTR 통화 참조 필드' });
  }
  if (detectedTables.includes('MARA') || detectedTables.includes('MAKT')) {
    maybeAddParam({ kind: 'SELECT_OPTION', name: 'S_MATNR', text: '자재코드 (Material)', datatype: 'CHAR', length: 18, ref_table: 'MARA', ref_field: 'MATNR', obligatory: false, default_val: '', block_title: '기본 조회 조건', reason: 'MARA 자재 코드 범위 조건' });
    maybeAddField({ fieldname: 'MATNR', coltext: '자재코드', datatype: 'CHAR', outputlen: 18, just: 'L', hotspot: true, drilldown_tcode: 'MM03', ref_table: 'MARA', ref_field: 'MATNR', reason: 'MARA 자재코드 및 MM03 드릴다운' });
    maybeAddField({ fieldname: 'MAKTX', coltext: '자재내역', datatype: 'CHAR', outputlen: 40, just: 'L', ref_table: 'MAKT', ref_field: 'MAKTX', reason: 'MAKT 자재 내역 텍스트' });
  }
  if (detectedTables.includes('CSKS') || detectedTables.includes('COEP') || opts.module === 'CO') {
    maybeAddParam({ kind: 'PARAMETER', name: 'P_KOKRS', text: '관리회계영역 (Controlling Area)', datatype: 'CHAR', length: 4, ref_table: 'CSKS', ref_field: 'KOKRS', obligatory: true, default_val: '1000', block_title: '기본 조회 조건', reason: 'CO 관리회계영역 필수 조건' });
    maybeAddParam({ kind: 'PARAMETER', name: 'P_GJAHR', text: '회계연도 (Fiscal Year)', datatype: 'NUMC', length: 4, ref_table: 'COEP', ref_field: 'GJAHR', obligatory: true, default_val: '2026', block_title: '기본 조회 조건', reason: 'COEP 회계연도 조건' });
    maybeAddField({ fieldname: 'KOSTL', coltext: '코스트센터', datatype: 'CHAR', outputlen: 10, just: 'C', key: true, hotspot: true, drilldown_tcode: 'KS03', ref_table: 'CSKS', ref_field: 'KOSTL', reason: 'CSKS 코스트센터 및 KS03 드릴다운' });
    maybeAddField({ fieldname: 'KSTAR', coltext: '원가요소', datatype: 'CHAR', outputlen: 10, just: 'C', ref_table: 'COEP', ref_field: 'KSTAR', reason: 'COEP 원가요소 계정' });
    maybeAddField({ fieldname: 'WKG001', coltext: '실적금액', datatype: 'CURR', outputlen: 15, just: 'R', do_sum: true, cfieldname: 'WAERS', ref_table: 'COSP', ref_field: 'WKG001', reason: '원가 실적 금액 합계' });
  }

  return {
    detectedTables: detectedTables.length > 0 ? detectedTables : ['VBAK', 'VBAP'],
    suggestedSelectionParams,
    suggestedFieldCatalog,
  };
}

/**
 * Deterministic regex parser for legacy ABAP / SE11 / TOP+S01 pasted source code
 */
export function parseLegacyAbapDeterministic(abapSource: string) {
  const source = abapSource || '';
  const upper = source.toUpperCase();

  const reportMatch = upper.match(/REPORT\s+([ZY][A-Z0-9_]{1,29})/);
  const program_id = reportMatch ? reportMatch[1] : 'ZR_LEGACY_IMPORT';

  const module = detectSapModuleFromText(source);
  const tcode = `Z${module}010`.slice(0, 10);

  const selection_params: any[] = [];
  const seenParams = new Set<string>();

  // Parse PARAMETERS / SELECT-OPTIONS
  const paramLines = source.split('\n');
  paramLines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('*') || trimmed.startsWith('"')) return;
    const pMatch = trimmed.match(/^(?:PARAMETERS|PARAMETER)\s*:?\s*([A-Z0-9_]{1,12})\s+(?:TYPE\s+([A-Z0-9_-]+)|LIKE\s+([A-Z0-9_-]+))?/i);
    if (pMatch) {
      const name = pMatch[1].toUpperCase().slice(0, 8);
      if (!seenParams.has(name)) {
        seenParams.add(name);
        const typeToken = (pMatch[2] || pMatch[3] || 'CHAR').toUpperCase();
        const isRadio = /RADIOBUTTON\s+GROUP\s+([A-Z0-9_]{1,4})/i.exec(trimmed);
        const isChk = /AS\s+CHECKBOX/i.test(trimmed);
        const [refTable, refField] = typeToken.includes('-') ? typeToken.split('-') : ['', ''];
        selection_params.push({
          kind: isRadio ? 'RADIOBUTTON' : isChk ? 'CHECKBOX' : 'PARAMETER',
          name,
          text: name.replace(/^P_/, ''),
          datatype: isRadio || isChk ? 'CHAR' : refField?.includes('DAT') ? 'DATS' : 'CHAR',
          length: isRadio || isChk ? 1 : 10,
          ref_table: refTable,
          ref_field: refField,
          obligatory: /OBLIGATORY/i.test(trimmed),
          default_val: isRadio || /DEFAULT\s+'X'/i.test(trimmed) ? 'X' : '',
          radio_group: isRadio ? isRadio[1].toUpperCase().slice(0, 4) : undefined,
          block_title: '조회 조건',
        });
      }
    }

    const sMatch = trimmed.match(/^(?:SELECT-OPTIONS)\s*:?\s*([A-Z0-9_]{1,12})\s+FOR\s+([A-Z0-9_-]+)/i);
    if (sMatch) {
      const name = sMatch[1].toUpperCase().slice(0, 8);
      if (!seenParams.has(name)) {
        seenParams.add(name);
        const refToken = sMatch[2].toUpperCase();
        const [refTable, refField] = refToken.includes('-') ? refToken.split('-') : ['', refToken];
        selection_params.push({
          kind: 'SELECT_OPTION',
          name,
          text: refField || name.replace(/^S_/, ''),
          datatype: refField?.includes('DAT') ? 'DATS' : 'CHAR',
          length: refField?.includes('DAT') ? 8 : 12,
          ref_table: refTable,
          ref_field: refField,
          obligatory: /OBLIGATORY/i.test(trimmed),
          default_val: '',
          block_title: '조회 조건',
        });
      }
    }
  });

  // Parse TYPES: BEGIN OF ... fields or SE11 tabular pasted lines
  const field_catalog: any[] = [
    {
      fieldname: 'ZICON',
      coltext: 'Status',
      datatype: 'CHAR',
      outputlen: 4,
      just: 'C',
      key: true,
      icon_type: 'LIGHTS',
    },
  ];
  const seenFields = new Set<string>(['ZICON']);

  const structMatch = source.match(/TYPES\s*:?\s*BEGIN\s+OF\s+[A-Z0-9_]+\s*,?([\s\S]*?)END\s+OF\s+[A-Z0-9_]+/i);
  const structBody = structMatch ? structMatch[1] : source;
  structBody.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('*') || trimmed.startsWith('"')) return;
    const fMatch = trimmed.match(/^([A-Z0-9_]{2,20})\s+(?:TYPE|LIKE)\s+([A-Z0-9_-]+)/i);
    if (fMatch) {
      const fn = fMatch[1].toUpperCase();
      if (fn === 'BEGIN' || fn === 'END' || fn === 'TYPES' || fn === 'DATA' || seenFields.has(fn)) return;
      seenFields.add(fn);
      const typeToken = fMatch[2].toUpperCase();
      const [refTable, refField] = typeToken.includes('-') ? typeToken.split('-') : ['', ''];
      const isDate = typeToken === 'D' || typeToken.includes('DAT');
      const isAmt = typeToken === 'P' || fn.includes('NETWR') || fn.includes('DMBTR') || fn.includes('AMT');
      const isQty = fn.includes('MENGE') || fn.includes('QTY');
      field_catalog.push({
        fieldname: fn,
        coltext: fn,
        datatype: isDate ? 'DATS' : isAmt ? 'CURR' : isQty ? 'DEC' : typeToken === 'I' ? 'INT4' : 'CHAR',
        outputlen: isDate ? 10 : isAmt ? 15 : 14,
        just: isAmt || isQty ? 'R' : isDate ? 'C' : 'L',
        key: field_catalog.length <= 2,
        do_sum: isAmt || isQty,
        cfieldname: isAmt ? 'WAERS' : undefined,
        ref_table: refTable,
        ref_field: refField,
      });
    }
  });

  // Parse AUTHORITY-CHECK
  const authority_checks: any[] = [];
  const authRegex = /AUTHORITY-CHECK\s+OBJECT\s+'([A-Z0-9_]+)'([\s\S]*?)\./gi;
  let authMatch: RegExpExecArray | null;
  while ((authMatch = authRegex.exec(source)) !== null) {
    authority_checks.push({
      id: `auth-imp-${Date.now()}-${authority_checks.length}`,
      object: authMatch[1].toUpperCase(),
      fields: authMatch[2]?.replace(/\s+/g, ' ').trim() || "ACTVT = '03'",
      trigger_point: 'START-OF-SELECTION',
      description: '레거시 소스 역추출 권한 점검',
    });
  }

  return normalizeGeneratedFullSpec(
    {
      program_id,
      tcode,
      title: `${program_id} 역추출 사양서`,
      module,
      business_purpose: `### Legacy ABAP 역추출 사양서\n- 원본 소스(${program_id})에서 자동 분석·역추출된 기능사양서입니다.`,
      data_extraction_logic: `1. **원본 프로그램**: \`${program_id}\`\n2. **추출된 선택화면 파라미터**: ${selection_params.length}개\n3. **추출된 출력 필드**: ${field_catalog.length}개`,
      selection_params,
      field_catalog,
      authority_checks,
    },
    {
      requirementPrompt: `Legacy ABAP Import (${program_id})`,
      module,
      sampleType: '01',
      targetSapRelease: 'SAP S/4HANA 2023 / ECC 6.0',
      programId: program_id,
      tcode,
    }
  );
}
