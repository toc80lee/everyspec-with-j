import { describe, expect, it } from 'vitest';
import {
  buildSapPromptReferenceBlock,
  detectSapModuleWithScores,
  getSapModuleBlueprint,
} from '../sapStandardCatalog.ts';
import {
  buildFullSpecFallback,
  buildMeetingMinutesFallback,
  buildSampleRecommendationFallback,
  normalizeGeneratedFullSpec,
} from '../sapFallbackService.ts';

describe('sapStandardCatalog & sapFallbackService module accuracy and upper/lower DDIC structure', () => {
  it('accurately classifies all major SAP modules from Korean/English requirements', () => {
    expect(
      detectSapModuleWithScores(
        'FI 전표 상세 조회하는 프로그램을 만들려고 합니다. 상단에는 전표 리스트가 보여지고 하단에는 상단의 전표를 클릭했을 때 그 전표에 해당하는 상세 조회 내역을 볼 수 있는 그런 프로그램으로 구성해 주세요'
      ).module
    ).toBe('FI');

    expect(detectSapModuleWithScores('CO 코스트센터 계획 대비 실적').module).toBe('CO');
    expect(detectSapModuleWithScores('MM 구매오더 입고 지연').module).toBe('MM');
    expect(detectSapModuleWithScores('SD 판매오더 납품 현황').module).toBe('SD');
    expect(detectSapModuleWithScores('PP 생산오더 자재 투입').module).toBe('PP');
  });

  it('builds rich 7-section 5W1H FI meeting minutes with evidence log, upper/lower standard table mapping, and aiSuggestions', () => {
    const minutes = buildMeetingMinutesFallback({
      rawTranscript:
        '[10:15:00] 김재무 팀장: FI 전표 상세 조회 프로그램을 만들려고 합니다.\n[10:16:20] 이설계 컨설턴트: 상단에는 전표 리스트, 하단에는 선택 전표의 분개 상세 내역을 보여주세요.',
      projectName: '2601 Next ERP',
      targetRelease: 'SAP S/4HANA 2023',
      segments: [
        { timestamp: '10:15:00', speaker: '김재무 팀장', text: 'FI 전표 상세 조회 프로그램을 만들려고 합니다.', kind: 'voice' },
        { timestamp: '10:16:20', speaker: '이설계 컨설턴트', text: '상단에는 전표 리스트, 하단에는 선택 전표의 분개 상세 내역을 보여주세요.', kind: 'memo' },
      ],
    });

    expect(minutes.detectedModule).toBe('FI');
    expect(minutes.minutesMarkdown).toContain('## 1. 회의 개요 및 육하원칙 (5W1H Summary)');
    expect(minutes.minutesMarkdown).toContain('## 2. 논의 근거 및 결정 로그 (Decision & Evidence Log)');
    expect(minutes.minutesMarkdown).toContain('## 3. 참조 SAP 표준 테이블 (상단/하단 매핑표)');
    expect(minutes.minutesMarkdown).toContain('## 4. 선택화면(Selection Screen) 확정 조건');
    expect(minutes.minutesMarkdown).toContain('## 5. 출력 레이아웃(ALV) 상단/하단 및 인터랙션 요구사항');
    expect(minutes.minutesMarkdown).toContain('## 6. 권한 점검 · 메시지 및 성능/예외 기준');
    expect(minutes.minutesMarkdown).toContain('## 7. AI 리뷰 코멘트 및 추가 도출 제안 (Enrichment Comments)');
    expect(minutes.minutesMarkdown).toContain('김재무 팀장');
    expect(minutes.minutesMarkdown).toContain('10:15:00');
    expect(minutes.minutesMarkdown).toContain('BKPF');
    expect(minutes.minutesMarkdown).toContain('BSEG');
    expect(minutes.minutesMarkdown).toContain('ACDOCA');
    expect(minutes.minutesMarkdown).toContain('BELNR');
    expect(Array.isArray(minutes.aiSuggestions)).toBe(true);
    expect(minutes.aiSuggestions.length).toBeGreaterThanOrEqual(2);
  });

  it('preserves fixed 7-section form and appends supplemental evidence in enrich mode', () => {
    const initial = buildMeetingMinutesFallback({
      rawTranscript: '[09:00:00] 현업 담당자: FI 전표 상세 조회 프로그램 요청합니다.',
      projectName: '2601 Next ERP',
    });

    const enriched = buildMeetingMinutesFallback({
      rawTranscript: '[09:00:00] 현업 담당자: FI 전표 상세 조회 프로그램 요청합니다.',
      existingMinutes: initial.minutesMarkdown,
      supplementalNotes: '[보완 반영] 역분개 전표(STBLG) 기본 제외 및 F_BKPF_BUK 권한 체크 확정',
      mode: 'enrich',
      projectName: '2601 Next ERP',
    });

    expect(enriched.minutesMarkdown).toContain('## 1. 회의 개요 및 육하원칙 (5W1H Summary)');
    expect(enriched.minutesMarkdown).toContain('## 2. 논의 근거 및 결정 로그 (Decision & Evidence Log)');
    expect(enriched.minutesMarkdown).toContain('## 3. 참조 SAP 표준 테이블 (상단/하단 매핑표)');
    expect(enriched.minutesMarkdown).toContain('## 7. AI 리뷰 코멘트 및 추가 도출 제안 (Enrichment Comments)');
    expect(enriched.minutesMarkdown).toContain('역분개 전표(STBLG) 기본 제외 및 F_BKPF_BUK 권한 체크 확정');
    expect(enriched.minutesMarkdown).toContain('[보완 반영 완료]');
  });

  it('recommends sampleType 02 and FI standard tables for FI header/detail minutes', () => {
    const minutes = buildMeetingMinutesFallback({
      rawTranscript:
        'FI 전표 상세 조회 프로그램: 상단 전표 헤더 리스트 클릭 시 하단 분개 상세 조회',
      projectName: '2601 Next ERP',
    });

    const rec = buildSampleRecommendationFallback({
      minutesMarkdown: minutes.minutesMarkdown,
      existingProgramIds: [],
    });

    expect(rec.recommendedSampleType).toBe('02');
    expect(rec.suggestedModule).toBe('FI');
    expect(rec.detectedTables).toEqual(expect.arrayContaining(['BKPF', 'BSEG']));
    expect(rec.requirementPrompt).toContain('BKPF');
    expect(rec.requirementPrompt).toContain('BSEG');
    expect(rec.requirementPrompt).toContain('BELNR');
  });

  it('generates full FI 02 Master-Detail spec with BKPF header, BSEG/SKAT item_grid, authority_checks, sap_messages, and FI-accurate 12-node data_flow', () => {
    const fallbackRaw = buildFullSpecFallback({
      requirementPrompt: 'FI 전표 상세 조회: 상단 전표 리스트, 하단 분개 상세',
      module: 'FI',
      sampleType: '02',
      targetSapRelease: 'SAP S/4HANA 2023',
      programId: 'ZFI_R_DOC_DETAIL',
      tcode: 'ZFI010',
    });

    const normalized = normalizeGeneratedFullSpec(fallbackRaw, {
      requirementPrompt: 'FI 전표 상세 조회: 상단 전표 리스트, 하단 분개 상세',
      module: 'FI',
      sampleType: '02',
      targetSapRelease: 'SAP S/4HANA 2023',
      programId: 'ZFI_R_DOC_DETAIL',
      tcode: 'ZFI010',
    });

    const { spec, detectedTables } = normalized;
    expect(spec.module).toBe('FI');
    expect(detectedTables).toEqual(expect.arrayContaining(['BKPF', 'BSEG', 'SKAT']));

    const headerBelnr = spec.field_catalog.find((f: any) => f.fieldname === 'BELNR');
    expect(headerBelnr).toBeDefined();
    expect(headerBelnr?.ref_table).toBe('BKPF');
    expect(headerBelnr?.drilldown_tcode).toBe('FB03');

    expect(spec.item_grid).toBeDefined();
    expect(spec.item_grid?.foreign_key).toBe('BELNR');
    expect(spec.item_grid?.field_catalog.some((f: any) => f.fieldname === 'MATNR')).toBe(false);

    const itemHkont = spec.item_grid?.field_catalog.find((f: any) => f.fieldname === 'HKONT');
    expect(itemHkont).toBeDefined();
    expect(itemHkont?.ref_table).toBe('BSEG');
    expect(itemHkont?.drilldown_tcode).toBe('FS03');

    const itemDmbtr = spec.item_grid?.field_catalog.find((f: any) => f.fieldname === 'DMBTR');
    expect(itemDmbtr).toBeDefined();
    expect(itemDmbtr?.do_sum).toBe(true);

    expect(spec.item_grid?.mock_rows.length).toBeGreaterThanOrEqual(5);
    const firstHeaderKey = spec.mock_rows[0]?.BELNR;
    expect(spec.item_grid?.mock_rows.some((r: any) => r.BELNR === firstHeaderKey)).toBe(true);

    expect(spec.authority_checks?.some((a: any) => a.object === 'F_BKPF_BUK')).toBe(true);
    expect((spec.sap_messages?.length ?? 0) > 0).toBe(true);

    // Rich 12-node FI Master-Detail data_flow & 5-part developer node_details without SD VBAK/VBAP leakage
    expect(spec.data_flow?.mermaid_code).toContain('BKPF');
    expect(spec.data_flow?.mermaid_code).not.toContain('VBAK');
    const detailKeys = Object.keys(spec.data_flow?.node_details || {});
    expect(detailKeys.length).toBe(12);
    for (const nodeId of detailKeys) {
      const md = spec.data_flow!.node_details[nodeId].markdown;
      expect(md).toContain('1. 이 단계는 무엇을 하나요?');
      expect(md).toContain('2. 입력 및 선행 조건');
      expect(md).toContain('3. 상세 처리 로직');
      expect(md).toContain('4. 관련 SAP 테이블 · 필드 · T-Code');
      expect(md).toContain('5. 예외 처리 및 QA 체크포인트');
      expect(md).not.toContain('VBAK');
      expect(md).not.toContain('VBAP');
    }
  });

  it('produces module-accurate Master-Detail item_grid, prompt reference blocks, and 5-part node_details for MM, CO, and PP', () => {
    const modules = [
      { code: 'MM', fk: 'EBELN', headerTable: 'EKKO', itemTable: 'EKPO' },
      { code: 'CO', fk: 'KOSTL', headerTable: 'CSKS', itemTable: 'COEP' },
      { code: 'PP', fk: 'AUFNR', headerTable: 'AFKO', itemTable: 'RESB' },
    ] as const;

    for (const m of modules) {
      const bp = getSapModuleBlueprint(m.code);
      expect(bp.foreignKey).toBe(m.fk);

      const refBlock = buildSapPromptReferenceBlock(m.code, '02');
      expect(refBlock).toContain(m.headerTable);
      expect(refBlock).toContain(m.itemTable);
      expect(refBlock).toContain(m.fk);

      const raw = buildFullSpecFallback({
        requirementPrompt: `${m.code} 상단/하단 상세 조회`,
        module: m.code,
        sampleType: '02',
        targetSapRelease: 'SAP S/4HANA 2023',
        programId: `Z${m.code}_R_TEST`,
        tcode: `Z${m.code}01`,
      });
      const { spec } = normalizeGeneratedFullSpec(raw, {
        requirementPrompt: `${m.code} 상단/하단 상세 조회`,
        module: m.code,
        sampleType: '02',
        targetSapRelease: 'SAP S/4HANA 2023',
        programId: `Z${m.code}_R_TEST`,
        tcode: `Z${m.code}01`,
      });

      expect(spec.module).toBe(m.code);
      expect(spec.item_grid?.foreign_key).toBe(m.fk);
      expect(spec.item_grid?.field_catalog.some((f: any) => f.fieldname === m.fk)).toBe(true);
      expect(Object.keys(spec.data_flow?.node_details || {}).length).toBe(12);
      expect(spec.data_flow?.node_details?.E?.markdown).toContain(m.headerTable);
      expect(spec.data_flow?.node_details?.A?.markdown).toContain('1. 이 단계는 무엇을 하나요?');
    }
  });
});
