import {
  detectSapModuleWithScores,
  getSapModuleBlueprint,
  type SapModuleCode,
} from './sapStandardCatalog.ts';
import { buildModuleDataFlowBlueprint } from './dataFlowBlueprint.ts';

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
      t.startsWith('VB') || t.startsWith('KN') || t.startsWith('LI')
        ? 'SD'
        : t.startsWith('EK') || t.startsWith('MA') || t.startsWith('LF') || t.startsWith('MK') || t.startsWith('MS')
        ? 'MM'
        : t.startsWith('BK') || t.startsWith('BS') || t.startsWith('AC') || t.startsWith('SK') || t.startsWith('T0')
        ? 'FI'
        : t.startsWith('CS') || t.startsWith('CO') || t.startsWith('SET')
        ? 'CO'
        : t.startsWith('AF') || t.startsWith('RES')
        ? 'PP'
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
  const glAccounts = ['11110100', '11310100', '21110100', '41110100', '51210300'];
  const glNames = ['보통예금-국민은행', '외상매출금(국내)', '외상매입금(원재료)', '제품매출(국내)', '복리후생비(판관)'];
  const fiDocTypes = ['SA', 'KR', 'DR', 'AB', 'KZ'];
  const fiHeaderTexts = ['10월 원재료 매입 전표', '국내 제품 매출 청구', '지급수수료 결산 대체', '월간 급여 및 상여 분개', '선급금 반제 정산'];
  const fiItemTexts = ['원재료 입고 대금 정산', '부가세 대급금 10%', '매출채권 수금 반제', '외주 가공비 비용 인식', '미지급금 대체 처리'];
  const matDescs = ['산업용 제어 보드 ASSY', '고압 인버터 모듈 V3', 'AL-6061 압출 프레임', '리튬셀 보호회로 PCB', '정밀 서보모터 400W'];
  const costCenters = ['1000CC01', '1000CC02', '1000CC03', '1000CC04', '1000CC05'];
  const costCenterNames = ['생산1팀(수원)', '품질보증팀', '구매자재팀', '경영지원팀', 'R&D선행연구팀'];
  const costElems = ['51100100', '51200200', '52100100', '53100400', '54100100'];
  const costElemNames = ['원재료비(소모)', '복리후생비', '외주가공비', '지급임차료', '수선유지비'];
  const users = ['FIN_KIM01', 'FI_PARK02', 'SD_LEE03', 'MM_CHOI04', 'CO_JUNG05'];
  const amounts = [45000000, 38200000, 19800000, 52400000, 14500000];
  const itemAmounts = [25000000, 20000000, 18200000, 19800000, 32400000, 14500000];

  for (let r = 0; r < rowCount; r++) {
    const row: Record<string, any> = {};
    fields.forEach((f: any) => {
      const fn = String(f.fieldname || '').toUpperCase();
      if (fn === 'ZICON' || fn === 'LIGHTS') {
        row[f.fieldname] = r === 2 ? '2' : r === 4 ? '3' : '1';
      } else if (fn === 'STATUS') {
        row[f.fieldname] = r === 4 ? '51' : r === 2 ? '64' : '53';
      } else if (fn === 'BUKRS') {
        row[f.fieldname] = '1000';
      } else if (fn === 'GJAHR') {
        row[f.fieldname] = '2026';
      } else if (fn === 'WERKS') {
        row[f.fieldname] = r % 2 === 0 ? '1000' : '1100';
      } else if (fn === 'LGORT') {
        row[f.fieldname] = r % 2 === 0 ? '1001' : '2001';
      } else if (fn === 'EKORG' || fn === 'VKORG') {
        row[f.fieldname] = '1000';
      } else if (fn === 'BLART') {
        row[f.fieldname] = fiDocTypes[r % fiDocTypes.length];
      } else if (fn === 'AUART') {
        row[f.fieldname] = r % 2 === 0 ? 'ZOR' : 'ZRE';
      } else if (fn === 'BSART') {
        row[f.fieldname] = r % 2 === 0 ? 'NB' : 'ZNB';
      } else if (fn === 'BSCHL') {
        row[f.fieldname] = r % 2 === 0 ? '40' : '50';
      } else if (fn === 'SHKZG') {
        row[f.fieldname] = r % 2 === 0 ? 'S' : 'H';
      } else if (fn === 'MWSKZ') {
        row[f.fieldname] = r % 2 === 0 ? 'V1' : 'A1';
      } else if (fn === 'LIFSK') {
        row[f.fieldname] = r === 4 ? '01' : '';
      } else if (fn === 'BUZEI' || fn === 'EBELP' || fn === 'POSNR' || fn === 'RSPOS' || fn === 'COUNTR' || fn === 'VORNR') {
        row[f.fieldname] = String((r + 1) * 10).padStart(f.outputlen || 4, '0');
      } else if (fn === 'PERIO') {
        row[f.fieldname] = String((r % 12) + 1).padStart(3, '0');
      } else if (fn === 'HKONT' || fn === 'SAKNR') {
        row[f.fieldname] = glAccounts[r % glAccounts.length];
      } else if (fn === 'TXT50') {
        row[f.fieldname] = glNames[r % glNames.length];
      } else if (fn === 'BKTXT') {
        row[f.fieldname] = fiHeaderTexts[r % fiHeaderTexts.length];
      } else if (fn === 'SGTXT') {
        row[f.fieldname] = fiItemTexts[r % fiItemTexts.length];
      } else if (fn === 'USNAM' || fn === 'ERNAM') {
        row[f.fieldname] = users[r % users.length];
      } else if (fn === 'KOSTL') {
        row[f.fieldname] = costCenters[r % costCenters.length];
      } else if (fn === 'KTEXT') {
        row[f.fieldname] = costCenterNames[r % costCenterNames.length];
      } else if (fn === 'ABTEI') {
        row[f.fieldname] = ['생산부', '품질부', '구매부', '재경부', '연구소'][r % 5];
      } else if (fn === 'KSTAR') {
        row[f.fieldname] = costElems[r % costElems.length];
      } else if (fn === 'LTEXT') {
        row[f.fieldname] = costElemNames[r % costElemNames.length];
      } else if (fn === 'AUFNR') {
        row[f.fieldname] = `000100023${r}`;
      } else if (fn === 'PRUEFLOS') {
        row[f.fieldname] = `0300000012${r}`;
      } else if (fn === 'PERNR') {
        row[f.fieldname] = `2026010${r}`;
      } else if (fn === 'DOCNUM') {
        row[f.fieldname] = `00000000900012${r}`;
      } else if (fn === 'EQUNR') {
        row[f.fieldname] = `EQ-LINE-00${r + 1}`;
      } else if (fn === 'EQKTX') {
        row[f.fieldname] = `SMT 자동실장기 #${r + 1}`;
      } else if (fn === 'CODE_GRP') {
        row[f.fieldname] = `CM_GRP_0${r + 1}`;
      } else if (fn === 'GRP_NAME') {
        row[f.fieldname] = ['결재유형코드', '전표상태코드', '인터페이스구분', '사업장코드', '통화단위매핑'][r % 5];
      } else if (fn === 'CODE_VAL') {
        row[f.fieldname] = `CD0${r + 1}`;
      } else if (fn === 'CODE_TXT') {
        row[f.fieldname] = `상세 기준코드 항목 ${r + 1}`;
      } else if (fn === 'USE_YN') {
        row[f.fieldname] = r === 4 ? 'N' : 'Y';
      } else if (fn.includes('VBELN') || fn.includes('DOC_NO') || fn.includes('DOCNO')) {
        row[f.fieldname] = `00100000${45 + r}`;
      } else if (fn.includes('EBELN')) {
        row[f.fieldname] = `450001928${r}`;
      } else if (fn.includes('BELNR')) {
        row[f.fieldname] = `100000001${r}`;
      } else if (fn === 'KUNNR' || fn === 'LIFNR') {
        row[f.fieldname] = `00001000${10 + r}`;
      } else if (f.datatype === 'DATS' || fn.includes('DATE') || fn.includes('ERDAT') || fn.includes('BUDAT') || fn.includes('BLDAT') || fn.includes('BEDAT') || fn.includes('VDATU') || fn.includes('GSTRP') || fn.includes('GLTRP') || fn.includes('CREDAT') || fn.includes('BEGDA') || fn.includes('ENDDA')) {
        row[f.fieldname] = `2026.10.${String(10 + r * 3).padStart(2, '0')}`;
      } else if (fn === 'PLAN_AMT') {
        row[f.fieldname] = 50000000 + r * 5000000;
      } else if (fn === 'ACT_AMT' || fn === 'WKGBTR') {
        row[f.fieldname] = amounts[r % amounts.length];
      } else if (fn === 'VAR_AMT') {
        row[f.fieldname] = 50000000 + r * 5000000 - amounts[r % amounts.length];
      } else if (fn === 'NETPR') {
        row[f.fieldname] = 120000 + r * 25000;
      } else if (
        f.datatype === 'CURR' ||
        fn.includes('AMOUNT') ||
        fn.includes('NETWR') ||
        fn.includes('DMBTR') ||
        fn.includes('WRBTR')
      ) {
        row[f.fieldname] = (rowCount > 5 ? itemAmounts : amounts)[r % amounts.length];
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
        fn === 'LIFNR_NM' ||
        fn === 'ENAME'
      ) {
        row[f.fieldname] = partnerNames[r % partnerNames.length];
      } else if (fn.includes('MATNR')) {
        row[f.fieldname] = `MAT-PART-00${r + 1}`;
      } else if (fn === 'MAKTX' || fn === 'TXZ01' || fn === 'ARKTX' || fn === 'KTEXTMAT') {
        row[f.fieldname] = matDescs[r % matDescs.length];
      } else if (fn === 'KWMENG' || fn === 'MENGE' || fn === 'GAMNG' || fn === 'BDMNG' || fn === 'LOSMENGE') {
        row[f.fieldname] = (r + 1) * 25;
      } else if (fn === 'LFIMG' || fn === 'WEMNG' || fn === 'ENMNG') {
        row[f.fieldname] = r === 4 ? 0 : (r + 1) * 15;
      } else if (fn === 'OPEN_QTY') {
        row[f.fieldname] = r === 4 ? (r + 1) * 25 : (r + 1) * 10;
      } else if (fn === 'ABWTG') {
        row[f.fieldname] = (r % 3) + 1;
      } else if (fn === 'MESTYP') {
        row[f.fieldname] = ['ORDERS', 'DESADV', 'INVOIC', 'FIDCCP02', 'MATMAS'][r % 5];
      } else if (fn === 'STATXT') {
        row[f.fieldname] = r === 4 ? '필수 필드 누락으로 전기 실패' : '대상 시스템 정상 전송 및 전표 생성 완료';
      } else if (fn === 'MEINS' || fn === 'VRKME' || fn === 'GMEIN' || fn === 'MENGENEINH') {
        row[f.fieldname] = 'EA';
      } else if (f.datatype === 'NUMC') {
        row[f.fieldname] = String(r + 1).padStart(f.outputlen || 4, '0');
      } else if (f.datatype === 'INT4' || f.datatype === 'DEC') {
        row[f.fieldname] = (r + 1) * 10;
      } else {
        row[f.fieldname] = `${f.coltext || f.fieldname} ${r + 1}`;
      }
    });
    result.push(row);
  }
  return result;
}

export function detectSapModuleFromText(text: string): SapModuleCode {
  return detectSapModuleWithScores(text).module;
}

function detectMasterDetailIntent(text: string): boolean {
  const upper = (text || '').toUpperCase();
  return (
    text.includes('상단') ||
    text.includes('하단') ||
    text.includes('헤더') ||
    text.includes('품목') ||
    text.includes('상세 조회') ||
    text.includes('상세 내역') ||
    text.includes('상세내역') ||
    text.includes('분개') ||
    text.includes('아이템') ||
    upper.includes('MASTER') ||
    upper.includes('DETAIL') ||
    upper.includes('HEADER') ||
    upper.includes('ITEM')
  );
}

export interface MeetingAiSuggestionServerItem {
  id: string;
  category: 'missing_fact' | 'enhancement' | 'question';
  title: string;
  detail: string;
  suggestedAction: string;
  resolved?: boolean;
}

function parseTranscriptEvidenceRows(opts: {
  rawTranscript: string;
  supplementalNotes?: string;
  segments?: Array<{ timestamp?: string; speaker?: string; text?: string; kind?: string }>;
  bp: ReturnType<typeof getSapModuleBlueprint>;
  isMasterDetail: boolean;
}): {
  speakers: string[];
  timestamps: string[];
  evidenceRows: Array<{ timeSpeaker: string; topic: string; rationale: string; conclusion: string }>;
  rawSummaryText: string;
} {
  const cleanPipe = (val: string) => val.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const rows: Array<{ timeSpeaker: string; topic: string; rationale: string; conclusion: string }> = [];
  const speakerSet = new Set<string>();
  const timeSet = new Set<string>();

  const inferRationaleAndConclusion = (text: string) => {
    const t = text;
    let rationale = `${opts.bp.moduleLabelKo} 표준 업무 정합성 및 실무 조회 편의성 확보`;
    if (t.includes('상단') || t.includes('하단') || t.includes('상세')) {
      rationale = `상단(${opts.bp.headerTables[0]}) 요약 목록과 하단(${opts.bp.itemTables[0]}) 세부 내역 간 즉각적 드릴다운 분석 필요`;
    } else if (t.includes('신호등') || t.includes('지연') || t.includes('미결') || t.includes('초과')) {
      rationale = '예외/지연 건을 색상(신호등)으로 조기 식별해 현업 후속 조치 리드타임 단축';
    } else if (t.includes('권한') || t.includes('AUTHORITY')) {
      rationale = '회사코드·조직별 비인가 데이터 열람 통제 및 내부통제 요건 준수';
    } else if (t.includes('엑셀') || t.includes('다운로드') || t.includes('버튼')) {
      rationale = '현업 결산/검토 업무에서 즉시 후속 처리 및 대량 명세 추출 필요';
    }

    let conclusion = `${opts.bp.defaultProgramId} 사양 반영 (${opts.isMasterDetail ? '2단 Master-Detail 구조' : '표준 ALV 구조'})`;
    if (t.includes('상단') && t.includes('하단')) {
      conclusion = `Type 02(ZRALV0020) 기반 상단(${opts.bp.headerTables.join('/')}) ↔ 하단(${opts.bp.itemTables.join('/')}) 키(\`${opts.bp.foreignKey}\`) 연동 확정`;
    } else if (t.includes('보완') || t.includes('추가') || t.includes('AI 제안')) {
      conclusion = '보완 논의 사항 사양서 선택조건/컬럼/로직에 즉시 추가 반영 확정';
    }
    return { rationale, conclusion };
  };

  if (Array.isArray(opts.segments) && opts.segments.length > 0) {
    opts.segments.forEach((seg) => {
      const text = cleanPipe(String(seg?.text || ''));
      if (!text) return;
      const spk = cleanPipe(String(seg?.speaker || '현업 담당자'));
      const ts = cleanPipe(String(seg?.timestamp || '')) || '회의 중';
      speakerSet.add(spk);
      if (ts !== '회의 중') timeSet.add(ts);
      const { rationale, conclusion } = inferRationaleAndConclusion(text);
      rows.push({
        timeSpeaker: `\`${ts}\` · ${spk}`,
        topic: text.slice(0, 120),
        rationale,
        conclusion,
      });
    });
  } else {
    const lines = String(opts.rawTranscript || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    lines.forEach((line) => {
      const m = line.match(/^\[([^\]]+)\]\s*([^:]+):\s*(.+)$/);
      if (m) {
        const ts = cleanPipe(m[1]);
        const spk = cleanPipe(m[2]);
        const txt = cleanPipe(m[3]);
        speakerSet.add(spk);
        timeSet.add(ts);
        const { rationale, conclusion } = inferRationaleAndConclusion(txt);
        rows.push({
          timeSpeaker: `\`${ts}\` · ${spk}`,
          topic: txt.slice(0, 120),
          rationale,
          conclusion,
        });
      } else {
        const stripped = cleanPipe(line.replace(/^\[[^\]]+\]\s*/, ''));
        if (!stripped) return;
        speakerSet.add('회의 참여자');
        const { rationale, conclusion } = inferRationaleAndConclusion(stripped);
        rows.push({
          timeSpeaker: '메모 · 참여자',
          topic: stripped.slice(0, 120),
          rationale,
          conclusion,
        });
      }
    });
  }

  if (opts.supplementalNotes?.trim()) {
    opts.supplementalNotes
      .split('\n')
      .map((l) => cleanPipe(l))
      .filter(Boolean)
      .forEach((note) => {
        speakerSet.add('추가 보완자');
        const nowStr = new Date().toTimeString().slice(0, 8);
        const { rationale, conclusion } = inferRationaleAndConclusion(note);
        rows.push({
          timeSpeaker: `\`${nowStr}\` · 추가 보완`,
          topic: note.slice(0, 120),
          rationale,
          conclusion,
        });
      });
  }

  const speakers = Array.from(speakerSet);
  const timestamps = Array.from(timeSet);
  const rawSummaryText = rows.map((r) => r.topic).join(' / ') || opts.bp.summaryPurposeKo;
  return {
    speakers: speakers.length > 0 ? speakers : ['현업 담당자', 'SAP 설계자'],
    timestamps,
    evidenceRows: rows.slice(0, 12),
    rawSummaryText,
  };
}

function buildDomainAiSuggestions(opts: {
  bp: ReturnType<typeof getSapModuleBlueprint>;
  isMasterDetail: boolean;
  combinedText: string;
}): MeetingAiSuggestionServerItem[] {
  const mod = opts.bp.module;
  const txt = opts.combinedText || '';
  const items: MeetingAiSuggestionServerItem[] = [];

  if (mod === 'FI') {
    if (!txt.includes('역분개') && !txt.includes('STBLG')) {
      items.push({
        id: `sug-${mod}-1`,
        category: 'missing_fact',
        title: '역분개 전표(STBLG) 제외/표시 기준 확정 필요',
        detail: 'BKPF 조회 시 역분개된 전표(STBLG IS NOT INITIAL)를 기본 제외할지, 적색 신호등으로 구분 표시할지 결정이 필요합니다.',
        suggestedAction: '선택화면에 [역분개 전표 제외(P_REV)] 체크박스를 기본 적용하고, 포함 조회 시 적색 신호등으로 표기',
      });
    }
    items.push({
      id: `sug-${mod}-2`,
      category: 'enhancement',
      title: '미결(Open Item) / 반제 상태 구분 및 통화 환산 강화',
      detail: 'BSEG/ACDOCA 분개 조회 시 미결 항목(AUGBL 공란)을 황색 신호등으로 구분하고, 전표통화(WRBTR)와 현지통화(DMBTR)를 병행 표시하면 결산 검토 효율이 높아집니다.',
      suggestedAction: '차대변(SHKZG) 금액 분리 집계 및 전표통화·현지금액 동시 출력, FB03/FS03 핫스팟 드릴다운 반영',
    });
  } else if (mod === 'MM') {
    items.push({
      id: `sug-${mod}-1`,
      category: 'missing_fact',
      title: '입고/송장 이력(EKBE) 및 납기지연 임계 기준 확인',
      detail: 'EKPO 발주수량 대비 입고(VGABE=1) 및 송장(VGABE=2) 잔량 계산 시 삭제지시자(LOEKZ) 제외 여부 확인이 필요합니다.',
      suggestedAction: '삭제 품목(LOEKZ = space) 제외 필터와 납기예정일(EINDT) 경과 기준 적색 신호등 적용',
    });
  } else if (mod === 'SD') {
    items.push({
      id: `sug-${mod}-1`,
      category: 'missing_fact',
      title: '출하 보류(LIFSK) 및 여신 블록(CMGST) 표기 기준 확인',
      detail: '미납수량 계산 시 반품 오더(AUART) 및 취소 품목(ABGRU) 제외 조건을 명확히 정의하는 것이 좋습니다.',
      suggestedAction: '거부사유(ABGRU = space) 제외 및 여신/납품보류 건 적색 신호등(3) 표기 추가',
    });
  } else if (mod === 'CO') {
    items.push({
      id: `sug-${mod}-1`,
      category: 'missing_fact',
      title: '원가 계획 버전(VERSN) 및 예산 초과 경고율(%) 확정',
      detail: 'COSP 계획금액 비교 시 기본 버전(VERSN = 000) 고정 여부와 황색 경고 구간(예: 집행률 85% 이상) 기준을 확정해야 합니다.',
      suggestedAction: '선택화면에 계획버전(P_VERSN = 000) 기본값 추가 및 85% 이상 황색 / 100% 초과 적색 기준 적용',
    });
  } else {
    items.push({
      id: `sug-${mod}-1`,
      category: 'missing_fact',
      title: `${mod} 원천 테이블 삭제/취소 건 제외 조건 확정`,
      detail: `${opts.bp.headerTables[0]} 추출 시 취소·삭제 플래그가 설정된 레코드를 기본 제외할지 현업 기준 확인이 필요합니다.`,
      suggestedAction: `선택화면 조회 옵션에 취소/삭제 건 제외 체크박스 추가`,
    });
  }

  if (opts.isMasterDetail) {
    items.push({
      id: `sug-${mod}-md`,
      category: 'question',
      title: `상·하단 그리드 초기 조회 및 분할 비율 확인 (${opts.bp.foreignKey} 연동)`,
      detail: `프로그램 실행(F8) 직후 상단 1행(${opts.bp.foreignKey})을 선택해 하단(${opts.bp.itemTables[0]})을 자동 조회할지, 초기에는 비워둘지 확인이 필요합니다.`,
      suggestedAction: '초기 실행 시 상단 첫 번째 행 자동 선택으로 하단 즉시 연동 (화면 분할 45:55)',
    });
  }

  items.push({
    id: `sug-${mod}-auth`,
    category: 'enhancement',
    title: '대용량 조회 성능 제어 및 권한(AUTHORITY-CHECK) 검증',
    detail: `필수 조건 누락·기간 과다 조회 시 성능 저하를 막기 위해 조회 최대 기간/건수 제한과 ${opts.bp.authorityChecks[0]?.object || 'AUTHORITY-CHECK'} 사전 검증이 권장됩니다.`,
    suggestedAction: `START-OF-SELECTION 진입 전 ${opts.bp.authorityChecks[0]?.object || '표준 권한'} 검증 및 0건 시 SE91 안내 메시지 처리`,
  });

  return items.slice(0, 4);
}

export function buildMeetingMinutesFallback(opts: {
  rawTranscript: string;
  supplementalNotes?: string;
  existingMinutes?: string;
  projectName?: string;
  targetRelease?: string;
  mode?: string;
  segments?: Array<{ timestamp?: string; speaker?: string; text?: string; kind?: string }>;
}) {
  const combined = `${opts.rawTranscript || ''}\n${opts.supplementalNotes || ''}\n${opts.existingMinutes || ''}`.trim();
  const { module: mod, matchedTables } = detectSapModuleWithScores(combined);
  const bp = getSapModuleBlueprint(mod);
  const isMasterDetail = detectMasterDetailIntent(combined);
  const todayStr = new Date().toISOString().slice(0, 10);

  const parsedEvidence = parseTranscriptEvidenceRows({
    rawTranscript: opts.rawTranscript,
    supplementalNotes: opts.supplementalNotes,
    segments: opts.segments,
    bp,
    isMasterDetail,
  });

  const rawLines = (opts.rawTranscript || opts.supplementalNotes || '')
    .split('\n')
    .map((l) => l.replace(/^\[[^\]]+\]\s*(?:[^:]+:\s*)?/, '').trim())
    .filter(Boolean);
  const firstLine = rawLines[0]?.slice(0, 44) || `${bp.module} ${bp.defaultTitleKo}`;

  const headerTblList = Array.from(new Set([...bp.headerTables, ...matchedTables.filter((t) => bp.headerTables.includes(t))])).join(', ');
  const itemTblList = Array.from(new Set([...bp.itemTables, ...matchedTables.filter((t) => bp.itemTables.includes(t))])).join(', ');

  const selParamBullets = bp.selectionParams
    .map(
      (p) =>
        `- \`${p.name}\` (\`${p.kind}\`, ${p.ref_table ? `\`${p.ref_table}-${p.ref_field}\`` : `\`${p.datatype}(${p.length})\``}${p.obligatory ? ', **필수**' : ''}): ${p.text}`
    )
    .join('\n');

  const headerColStr = bp.headerFields
    .map((f) => `\`${f.fieldname}\`(${f.coltext}${f.ref_table ? `:${f.ref_table}-${f.ref_field}` : ''}${f.drilldown_tcode ? `→${f.drilldown_tcode}` : ''})`)
    .join(', ');

  const itemColStr = bp.itemFields
    .map((f) => `\`${f.fieldname}\`(${f.coltext}${f.ref_table ? `:${f.ref_table}-${f.ref_field}` : ''}${f.drilldown_tcode ? `→${f.drilldown_tcode}` : ''})`)
    .join(', ');

  const authSummary = bp.authorityChecks.map((a) => `\`${a.object}\` (${a.fields} — ${a.description})`).join(', ');
  const msgSummary = bp.sapMessages.map((m) => `\`Z01-${m.msg_no}\` [${m.msg_type}] ${m.text}`).join(' / ');

  const evidenceRowsMd =
    parsedEvidence.evidenceRows.length > 0
      ? parsedEvidence.evidenceRows
          .map((r) => `| ${r.timeSpeaker} | ${r.topic} | ${r.rationale} | ${r.conclusion} |`)
          .join('\n')
      : `| \`${todayStr}\` · 현업/설계 | ${bp.defaultTitleKo} 요구사항 수립 | ${bp.summaryPurposeKo} | ${bp.moduleLabelKo} 표준 구조 확정 |`;

  const aiSuggestions = buildDomainAiSuggestions({
    bp,
    isMasterDetail,
    combinedText: combined,
  });

  const aiCommentsMd = aiSuggestions
    .map((s) => {
      const catLabel =
        s.category === 'missing_fact'
          ? '누락 확인'
          : s.category === 'question'
          ? '현업 확인 질문'
          : '보완 제안';
      return `- **[${catLabel}] ${s.title}**: ${s.detail} → *권장 반영안*: ${s.suggestedAction}`;
    })
    .join('\n');

  const whenLabel =
    parsedEvidence.timestamps.length > 0
      ? `${todayStr} (${parsedEvidence.timestamps[0]} ~ ${parsedEvidence.timestamps[parsedEvidence.timestamps.length - 1]})`
      : todayStr;

  // Preserve & enrich existing fixed form if mode === 'enrich'
  let minutesMarkdown = '';
  if (opts.mode === 'enrich' && opts.existingMinutes?.trim() && opts.existingMinutes.includes('## 2.')) {
    let baseDoc = opts.existingMinutes.trim();
    // Append new supplemental evidence rows right before Section 3
    if (opts.supplementalNotes?.trim()) {
      const newSuppRows = opts.supplementalNotes
        .split('\n')
        .map((l) => l.replace(/\|/g, '/').trim())
        .filter(Boolean)
        .map((line) => {
          const ts = new Date().toTimeString().slice(0, 8);
          return `| \`${ts}\` · 추가 보완 | ${line.slice(0, 120)} | 회의 검토 중 추가 확인·합의된 업무 규칙 반영 | 사양서 조건/로직/권한 항목 즉시 반영 확정 |`;
        })
        .join('\n');

      const sec3Idx = baseDoc.indexOf('\n## 3.');
      if (sec3Idx !== -1 && newSuppRows) {
        baseDoc = `${baseDoc.slice(0, sec3Idx)}\n${newSuppRows}${baseDoc.slice(sec3Idx)}`;
      }
      const sec7Idx = baseDoc.indexOf('\n## 7.');
      const resolvedNote = `\n- **[보완 반영 완료]** ${opts.supplementalNotes.trim().replace(/\n+/g, ' / ')}`;
      if (sec7Idx !== -1) {
        baseDoc = `${baseDoc.slice(0, sec7Idx)}${resolvedNote}${baseDoc.slice(sec7Idx)}`;
      } else {
        baseDoc = `${baseDoc}\n\n### 추가 보완 반영 내역\n${resolvedNote}`;
      }
    }
    minutesMarkdown = baseDoc;
  } else {
    minutesMarkdown = `## 1. 회의 개요 및 육하원칙 (5W1H Summary)
| 구분 (육하원칙) | 확정 · 논의 내용 (팩트 및 근거 기준) |
| :--- | :--- |
| **Who (참여자 / 발화자)** | ${parsedEvidence.speakers.join(', ')} |
| **When (일시 / 회의 시점)** | ${whenLabel} |
| **Where (대상 시스템 · 모듈)** | ${opts.projectName || 'SAP 프로젝트'} · ${opts.targetRelease || 'SAP S/4HANA 2023'} · \`${bp.moduleLabelKo}\` |
| **Why (개발 목적 · 배경)** | ${bp.summaryPurposeKo} |
| **What (개발 범위 · 화면 유형)** | ${
      isMasterDetail
        ? `상단(Header) - 하단(Detail) 2단 연동형 (\`ZRALV0020\` Master-Detail, 연결 키: \`${bp.foreignKey}\`)`
        : `표준 ALV 리포트 (\`${bp.defaultProgramId}\`)`
    } |
| **How & Result (구현 방향 · 합의 결론)** | **표준 테이블**: 상단 \`${headerTblList}\` / 하단 \`${itemTblList}\` · **핵심 요구**: ${parsedEvidence.rawSummaryText.slice(0, 180)} |

## 2. 논의 근거 및 결정 로그 (Decision & Evidence Log)
| 시각 · 발화자 | 논의 · 요구 내용 | 배경 및 근거 (Why) | 확정 결론 / 사양 반영 (Result) |
| :--- | :--- | :--- | :--- |
${evidenceRowsMd}

## 3. 참조 SAP 표준 테이블 (상단/하단 매핑표)
| 구분 (영역) | SAP 표준 테이블 | 연결 키 / 조인 기준 | 주요 역할 |
| :--- | :--- | :--- | :--- |
| **상단 (Header 영역)** | \`${headerTblList}\` | Primary Key (\`${bp.foreignKey}\`) | 마스터 목록 요약 및 상태 신호등 표시 |
| **하단 (Item/상세 영역)** | \`${itemTblList}\` | \`${bp.foreignKey}\` 기준 동적 필터링 | 선택 건의 품목·분개·이력 상세 내역 조회 |
| **마스터 참조 (Text)** | \`${bp.masterTables.join(', ')}\` | 코드-명칭 텍스트 매핑 (\`SPRAS = SY-LANGU\`) | 계정/거래처/자재/코스트센터 명칭 보강 |

## 4. 선택화면(Selection Screen) 확정 조건
${selParamBullets}

## 5. 출력 레이아웃(ALV) 상단/하단 및 인터랙션 요구사항
- **상단(Header Grid) 주요 컬럼**: ${headerColStr}
- **하단(Item/Detail Grid) 주요 컬럼**: ${itemColStr}
- **상태 신호등(\`ZICON\`) 및 상호작용**:
  - \`'1' (Green)\`: 정상 처리/완료 · \`'2' (Yellow)\`: 진행/주의(미결 등) · \`'3' (Red)\`: 오류/지연/보류
  - 상단 행 클릭/더블클릭 시 선택된 \`${bp.foreignKey}\` 값으로 하단 상세 ALV 즉시 동기화
  - 주요 키/코드 컬럼 핫스팟 클릭 시 SAP 표준 T-Code 드릴다운 지원
  - 커스텀 툴바: ${bp.customToolbar.map((b) => `\`${b.function}\`(${b.text})`).join(', ')}

## 6. 권한 점검 · 메시지 및 성능/예외 기준
- **권한 오브젝트(\`AUTHORITY-CHECK\`)**: ${authSummary}
- **표준 메시지(SE91) 정의**: ${msgSummary}
- **성능 · 예외 처리 기준**: \`FOR ALL ENTRIES\` 실행 전 \`IS NOT INITIAL\` 검증 및 대량 기간 조회 경고, 0건 조회 시 안내 메시지 출력

## 7. AI 리뷰 코멘트 및 추가 도출 제안 (Enrichment Comments)
${aiCommentsMd}`;
  }

  return {
    title: firstLine,
    detectedModule: mod,
    minutesMarkdown,
    aiSuggestions,
  };
}

export function buildSampleRecommendationFallback(opts: {
  minutesMarkdown: string;
  existingProgramIds?: string[];
}) {
  const txt = opts.minutesMarkdown || '';
  const upper = txt.toUpperCase();
  const { module: mod, matchedTables } = detectSapModuleWithScores(txt);
  const bp = getSapModuleBlueprint(mod);

  let recommendedSampleType: '01' | '02' | '03' | '04' = '01';
  let confidenceReason =
    '단일 기준의 조회·모니터링 및 선택 행 일괄 처리(툴바) 중심 요구사항에 가장 적합한 Single ALV Grid(01) 구조를 추천합니다.';

  if (
    detectMasterDetailIntent(txt) ||
    upper.includes('ZRALV0020') ||
    (txt.includes('전표') && txt.includes('상세'))
  ) {
    recommendedSampleType = '02';
    confidenceReason = `상단 ${bp.headerTables[0]} 목록에서 행을 선택하면 하단 ${bp.itemTables[0]} 상세 내역이 연결 키(${bp.foreignKey}) 기준으로 동적 연동되는 Master-Detail 2-Grid ALV(02 · ZRALV0020) 구조가 가장 적합합니다.`;
  } else if (
    txt.includes('계층') ||
    txt.includes('트리') ||
    txt.includes('조직도') ||
    upper.includes('TREE') ||
    upper.includes('WBS') ||
    upper.includes('BOM') ||
    upper.includes('ZRALV0030')
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
    upper.includes('ZRALV0040')
  ) {
    recommendedSampleType = '04';
    confidenceReason =
      '다차원 축(기간별·조직별·계정별) 교차 집계 및 동적 피벗 분석 요구사항이 포함되어 Pivot Browser(04 · ZRALV0040)가 가장 적합합니다.';
  }

  const existingSet = new Set(
    (opts.existingProgramIds || []).map((id) => String(id || '').trim().toUpperCase())
  );
  let seq = 10;
  let suggestedProgramId = `ZR_${mod}_${recommendedSampleType === '02' ? 'DTL' : 'MON'}_${String(seq).padStart(2, '0')}`;
  while (existingSet.has(suggestedProgramId)) {
    seq += 10;
    suggestedProgramId = `ZR_${mod}_${recommendedSampleType === '02' ? 'DTL' : 'MON'}_${String(seq).padStart(2, '0')}`;
  }
  const suggestedTcode = `Z${mod}${String(seq).padStart(3, '0')}`.slice(0, 10);

  const detectedTables = Array.from(
    new Set([
      ...matchedTables,
      ...bp.headerTables,
      ...(recommendedSampleType === '02' ? bp.itemTables : []),
    ])
  );

  const synthesizedPrompt = `[SAP 모듈]: ${bp.moduleLabelKo}
[추천 화면 구조]: 유형 ${recommendedSampleType} (${recommendedSampleType === '02' ? '상단 Header + 하단 Item Master-Detail 2-Grid' : '표준 ALV'})
[표준 테이블 구성]:
- 상단 Header 테이블: ${bp.headerTables.join(', ')}
- 하단 Item/Detail 테이블: ${bp.itemTables.join(', ')} (연결 키: ${bp.foreignKey})
- 마스터/텍스트 테이블: ${bp.masterTables.join(', ')}
[필수 선택화면 조건(<=8자)]: ${bp.selectionParams.map((p) => `${p.name}(${p.ref_table ? `${p.ref_table}-${p.ref_field}` : p.datatype}:${p.text})`).join(', ')}
[상단 ALV 출력 컬럼]: ${bp.headerFields.map((f) => `${f.fieldname}(${f.ref_table ? `${f.ref_table}-${f.ref_field}` : 'LIGHTS'}:${f.coltext})`).join(', ')}
${recommendedSampleType === '02' ? `[하단 Item ALV 출력 컬럼]: ${bp.itemFields.map((f) => `${f.fieldname}(${f.ref_table}-${f.ref_field}:${f.coltext})`).join(', ')}\n` : ''}[회의록 원문 요약]:
${txt.slice(0, 2200)}`;

  return {
    recommendedSampleType,
    confidenceReason,
    suggestedModule: mod,
    suggestedProgramId,
    suggestedTcode,
    suggestedTitle: bp.defaultTitleKo,
    detectedTables,
    requirementPrompt: synthesizedPrompt,
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
        fitSummary: '상단 헤더(전표) 클릭 시 하단 Item(품목/분개) 그리드가 실시간 연동되는 상하 분할 구조',
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
    : opts.module && validModules.includes(opts.module.toUpperCase())
    ? opts.module.toUpperCase()
    : detectSapModuleFromText(opts.requirementPrompt);

  const bp = getSapModuleBlueprint(resolvedModule);

  const ensureCustomerNs = (val: string, prefix: string, fallbackVal: string) => {
    const clean = String(val || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '');
    if (!clean) return fallbackVal;
    if (clean.startsWith('Z') || clean.startsWith('Y')) return clean.slice(0, 30);
    return `${prefix}${clean}`.slice(0, 30);
  };

  const finalProgramId = ensureCustomerNs(
    opts.programId || raw.program_id,
    `Z${resolvedModule}_R_`,
    bp.defaultProgramId
  );
  const finalTcode = ensureCustomerNs(
    opts.tcode || raw.tcode,
    `Z${resolvedModule}`,
    bp.defaultTcode
  ).slice(0, 20);

  const nowTs = Date.now();
  const blockMap = new Map<string, string>();

  const rawSelectionList =
    Array.isArray(raw.selection_params) && raw.selection_params.length > 0
      ? raw.selection_params
      : bp.selectionParams;

  const selection_params = rawSelectionList.map((p: any, idx: number) => {
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
  });

  const rawFields =
    Array.isArray(raw.field_catalog) && raw.field_catalog.length > 0
      ? raw.field_catalog
      : bp.headerFields;
  const hasZicon = rawFields.some((f: any) => String(f?.fieldname || '').toUpperCase() === 'ZICON');
  const combinedRawFields = hasZicon
    ? rawFields
    : [
        {
          fieldname: 'ZICON',
          coltext: '상태',
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
    grid_title: String(raw?.layout?.grid_title || raw.title || bp.headerGridTitleKo).slice(0, 70),
    zebra: raw?.layout?.zebra !== undefined ? Boolean(raw.layout.zebra) : true,
    sel_mode: ['A', 'B', 'C', 'D', 'SPACE'].includes(raw?.layout?.sel_mode) ? raw.layout.sel_mode : 'A',
    cwidth_opt: raw?.layout?.cwidth_opt !== undefined ? Boolean(raw.layout.cwidth_opt) : true,
    totals_only: Boolean(raw?.layout?.totals_only),
    excp_fname: 'ZICON',
    excp_led: true,
    show_row_numbers: raw?.layout?.show_row_numbers !== undefined ? Boolean(raw.layout.show_row_numbers) : true,
  };

  const rawToolbar =
    Array.isArray(raw.custom_toolbar) && raw.custom_toolbar.length > 0
      ? raw.custom_toolbar
      : bp.customToolbar;
  const custom_toolbar = rawToolbar.map((b: any, idx: number) => ({
    id: `ai-tb-${nowTs}-${idx}`,
    function: String(b?.function || `FC0${idx + 1}`).trim().toUpperCase(),
    text: String(b?.text || '실행').trim(),
    quickinfo: String(b?.quickinfo || b?.text || '사용자 정의 기능').trim(),
    icon: String(b?.icon || 'ICON_EXECUTE_OBJECT').trim(),
    disabled: false,
    visible: true,
    is_standard: false,
  }));

  const test_cases = (
    Array.isArray(raw.test_cases) && raw.test_cases.length > 0
      ? raw.test_cases
      : [
          {
            scenario: '정상 조회 및 합계 검증',
            condition: '기본 조회 조건 입력 후 실행 (F8)',
            expected: '조건에 일치하는 데이터가 ALV 그리드에 출력되고 금액 합계가 정확히 계산됨',
          },
          ...(opts.sampleType === '02'
            ? [
                {
                  scenario: '상단-하단 마스터-디테일 연동 검증',
                  condition: `상단 ALV에서 특정 ${bp.foreignKey} 행 선택/더블클릭`,
                  expected: `하단 상세 ALV(${bp.itemTables[0]})가 선택된 ${bp.foreignKey} 기준으로 즉시 필터 갱신됨`,
                },
              ]
            : []),
          {
            scenario: '핫스팟 드릴다운 확인',
            condition: 'ALV 내 주요 전표/마스터 코드 핫스팟 클릭',
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
      field_catalog.find((f: any) => f.key && f.fieldname !== 'ZICON')?.fieldname || bp.foreignKey;
    const rawItemFields =
      Array.isArray(rawItem.field_catalog) && rawItem.field_catalog.length > 0
        ? rawItem.field_catalog
        : bp.itemFields;

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
        just: ['L', 'C', 'R'].includes(f?.just) ? f.just : isNumeric ? 'R' : dt === 'DATS' ? 'C' : 'L',
        key: Boolean(f?.key),
        hotspot: Boolean(f?.hotspot),
        checkbox: false,
        edit: Boolean(f?.edit),
        do_sum: isNumeric ? Boolean(f?.do_sum) : false,
        emphasize: String(f?.emphasize || '').trim().toUpperCase(),
        cfieldname: dt === 'CURR' ? String(f?.cfieldname || 'WAERS').trim().toUpperCase() : undefined,
        qfieldname: f?.qfieldname ? String(f.qfieldname).trim().toUpperCase() : undefined,
        ref_table: String(f?.ref_table || '').trim().toUpperCase(),
        ref_field: String(f?.ref_field || '').trim().toUpperCase(),
        drilldown_tcode:
          f?.hotspot && f?.drilldown_tcode ? String(f.drilldown_tcode).trim().toUpperCase() : undefined,
      };
    });

    const fk = String(rawItem.foreign_key || bp.foreignKey || firstKeyField).trim().toUpperCase();
    const fallbackItemRows = generateFallbackSapRows(itemCatalog, 8);
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
      grid_title: String(rawItem.grid_title || bp.itemGridTitleKo),
      foreign_key: fk,
      layout: {
        grid_title: String(rawItem?.layout?.grid_title || rawItem.grid_title || bp.itemGridTitleKo),
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
      ...(item_grid?.field_catalog.map((f: any) => f.ref_table).filter(Boolean) || []),
      ...selection_params.map((p: any) => p.ref_table).filter(Boolean),
    ])
  )
    .map((t) => String(t).trim().toUpperCase())
    .filter(Boolean);

  const richFlowBlueprint = buildModuleDataFlowBlueprint({
    module: resolvedModule,
    sampleType: opts.sampleType,
    programId: finalProgramId,
    tcode: finalTcode,
    title: String(raw.title || bp.defaultTitleKo).trim(),
    detectedTables,
    selectionParams: selection_params,
    headerFields: field_catalog,
    itemFields: item_grid?.field_catalog || bp.itemFields,
    foreignKey: item_grid?.foreign_key || bp.foreignKey,
    authorityChecks:
      Array.isArray(raw.authority_checks) && raw.authority_checks.length > 0
        ? raw.authority_checks
        : bp.authorityChecks,
    sapMessages:
      Array.isArray(raw.sap_messages) && raw.sap_messages.length > 0
        ? raw.sap_messages
        : bp.sapMessages,
    customToolbar: custom_toolbar,
  });

  const hasAiMermaid =
    typeof raw?.data_flow?.mermaid_code === 'string' &&
    raw.data_flow.mermaid_code.includes('graph');

  const mermaidCode = hasAiMermaid
    ? raw.data_flow.mermaid_code
    : richFlowBlueprint.mermaid_code;

  // Guarantee every node has rich 5-part Korean details (upgrading shallow/partial AI outputs)
  const mergedNodeDetails: Record<string, { label?: string; markdown: string }> = {
    ...richFlowBlueprint.node_details,
  };
  if (raw?.data_flow?.node_details && typeof raw.data_flow.node_details === 'object') {
    Object.entries(raw.data_flow.node_details).forEach(([nodeId, val]: [string, any]) => {
      const md = typeof val?.markdown === 'string' ? val.markdown.trim() : '';
      const fallbackEntry = mergedNodeDetails[nodeId];
      // Accept AI detail only if it's genuinely rich (>= 120 chars); otherwise use rich 5-part blueprint
      if (md.length >= 120) {
        mergedNodeDetails[nodeId] = {
          label: String(val?.label || fallbackEntry?.label || nodeId).trim(),
          markdown: md,
        };
      } else if (fallbackEntry) {
        mergedNodeDetails[nodeId] = {
          label: String(val?.label || fallbackEntry.label || nodeId).trim(),
          markdown: fallbackEntry.markdown,
        };
      } else if (md) {
        mergedNodeDetails[nodeId] = {
          label: String(val?.label || nodeId).trim(),
          markdown: md,
        };
      }
    });
  }
  const nodeDetails = mergedNodeDetails;

  const rawAuthList =
    Array.isArray(raw.authority_checks) && raw.authority_checks.length > 0
      ? raw.authority_checks
      : bp.authorityChecks;
  const normalizedAuthorityChecks = rawAuthList
    .map((a: any, idx: number) => ({
      id: String(a?.id || `auth-ai-${nowTs}-${idx}`),
      object: String(a?.object || '').trim().toUpperCase(),
      fields: String(a?.fields || a?.field_values || "ACTVT = '03'").trim(),
      trigger_point: String(a?.trigger_point || 'START-OF-SELECTION').trim(),
      description: String(a?.description || a?.message_on_fail || '실행 권한 점검').trim(),
    }))
    .filter((a: any) => Boolean(a.object));

  const rawMsgList =
    Array.isArray(raw.sap_messages) && raw.sap_messages.length > 0
      ? raw.sap_messages
      : bp.sapMessages;
  const normalizedSapMessages = rawMsgList.map((m: any, idx: number) => ({
    id: String(m?.id || `msg-ai-${nowTs}-${idx}`),
    msg_class: String(m?.msg_class || 'Z01').trim().toUpperCase().slice(0, 20),
    msg_no: String(m?.msg_no || String(idx + 1).padStart(3, '0')).trim().slice(0, 3),
    msg_type: (['E', 'W', 'I', 'S'].includes(String(m?.msg_type || '').toUpperCase())
      ? String(m.msg_type).toUpperCase()
      : 'S') as 'E' | 'W' | 'I' | 'S',
    text: String(m?.text || '처리가 완료되었습니다.').trim(),
    trigger_condition: String(m?.trigger_condition || '실행 조건 충족 시').trim(),
  }));

  const resolvedBusinessPurpose =
    typeof raw.business_purpose === 'string' && raw.business_purpose.trim().length > 15
      ? raw.business_purpose.trim()
      : `### 개발 목적 및 업무 배경\n- ${bp.summaryPurposeKo}\n- **요청 요약**: ${opts.requirementPrompt.slice(0, 400)}`;

  const resolvedExtractionLogic =
    typeof raw.data_extraction_logic === 'string' && raw.data_extraction_logic.trim().length > 25
      ? raw.data_extraction_logic.trim()
      : bp.extractionLogicKo;

  return {
    detectedTables,
    spec: {
      id: `spec-ai-${nowTs}`,
      sample_type: opts.sampleType,
      program_id: finalProgramId,
      tcode: finalTcode,
      title: String(raw.title || bp.defaultTitleKo).trim(),
      module: resolvedModule as any,
      author: 'Josh Lee',
      cds_view_table:
        opts.sampleType === '04'
          ? String(raw.cds_view_table || bp.cdsViewTable || detectedTables[0] || 'ACDOCA').trim().toUpperCase()
          : undefined,
      created_date: new Date().toISOString().slice(0, 10),
      target_sap_release: opts.targetSapRelease,
      program_type: 'REPORT' as const,
      business_purpose: resolvedBusinessPurpose,
      data_extraction_logic: resolvedExtractionLogic,
      authority_checks: normalizedAuthorityChecks,
      sap_messages: normalizedSapMessages,
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
  const { module: detectedByPrompt, matchedTables } = detectSapModuleWithScores(opts.requirementPrompt);
  const validMods = ['SD', 'MM', 'FI', 'CO', 'PP', 'HR', 'QM', 'PM', 'BC', 'CM'];
  const detectedMod =
    opts.module && validMods.includes(opts.module.toUpperCase())
      ? opts.module.toUpperCase()
      : detectedByPrompt;

  const bp = getSapModuleBlueprint(detectedMod);
  const isDetailType = opts.sampleType === '02';

  const detectedTables = Array.from(
    new Set([
      ...matchedTables,
      ...bp.headerTables,
      ...(isDetailType ? bp.itemTables : []),
    ])
  );

  return {
    program_id: opts.programId || bp.defaultProgramId,
    tcode: opts.tcode || bp.defaultTcode,
    title: bp.defaultTitleKo,
    module: detectedMod,
    detectedTables,
    cds_view_table: opts.sampleType === '04' ? bp.cdsViewTable : undefined,
    business_purpose: `### 개발 목적 및 업무 배경 (${bp.moduleLabelKo})\n- ${bp.summaryPurposeKo}\n- **설계 요구사항 요약**: ${opts.requirementPrompt.slice(0, 500)}`,
    data_extraction_logic: bp.extractionLogicKo,
    layout: {
      grid_title: bp.headerGridTitleKo,
      zebra: true,
      sel_mode: 'A',
      cwidth_opt: true,
      show_row_numbers: true,
    },
    selection_params: bp.selectionParams,
    field_catalog: bp.headerFields,
    ...(isDetailType
      ? {
          item_grid: {
            grid_name: 'Item ALV Grid',
            grid_title: bp.itemGridTitleKo,
            foreign_key: bp.foreignKey,
            layout: {
              grid_title: bp.itemGridTitleKo,
              zebra: true,
              sel_mode: 'A',
              cwidth_opt: true,
              show_row_numbers: true,
            },
            field_catalog: bp.itemFields,
          },
        }
      : {}),
    authority_checks: bp.authorityChecks,
    sap_messages: bp.sapMessages,
    custom_toolbar: bp.customToolbar,
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
