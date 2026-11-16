export type GuideCategory = 'all' | 'creation' | 'design' | 'code' | 'governance';

export type GuideActionId =
  | 'open_meeting_wizard'
  | 'open_meetings'
  | 'open_program_list'
  | 'open_templates'
  | 'open_sample_01'
  | 'open_sample_02'
  | 'open_sample_03'
  | 'open_sample_04'
  | 'open_editor'
  | 'open_split'
  | 'open_mockup'
  | 'open_abap_code'
  | 'open_document';

export interface BilingualText {
  en: string;
  ko: string;
}

export interface GuideStep {
  title: BilingualText;
  detail: BilingualText;
  location?: BilingualText;
}

export interface GuideSampleFlow {
  inputLabel: BilingualText;
  inputSnippet: string;
  outputLabel: BilingualText;
  outputBullets: BilingualText[];
}

export interface UserGuideCase {
  id: string;
  caseNumber: string;
  category: Exclude<GuideCategory, 'all'>;
  badge: BilingualText;
  title: BilingualText;
  summary: BilingualText;
  audience: BilingualText;
  estimatedTime: BilingualText;
  whenToUse: BilingualText;
  steps: GuideStep[];
  sampleFlow: GuideSampleFlow;
  tips: BilingualText[];
  primaryAction: {
    id: GuideActionId;
    label: BilingualText;
  };
  secondaryAction?: {
    id: GuideActionId;
    label: BilingualText;
  };
  keywords: string[];
}

export interface StandardSampleTypeGuide {
  typeCode: '01' | '02' | '03' | '04';
  programId: string;
  name: BilingualText;
  layoutPattern: BilingualText;
  useCase: BilingualText;
  actionId: GuideActionId;
}

export const GUIDE_CATEGORIES: {
  id: GuideCategory;
  label: BilingualText;
}[] = [
  { id: 'all', label: { en: 'All Cases', ko: '전체 유형' } },
  { id: 'creation', label: { en: 'Spec Creation', ko: '사양서 생성 유형' } },
  { id: 'design', label: { en: 'UI & Simulation', ko: '화면 설계·시뮬레이션' } },
  { id: 'code', label: { en: 'ABAP & Export', ko: 'ABAP 코드·문서화' } },
  { id: 'governance', label: { en: 'Review & Governance', ko: '검토·거버넌스' } },
];

export const STANDARD_SAMPLE_TYPES: StandardSampleTypeGuide[] = [
  {
    typeCode: '01',
    programId: 'ZRALV0010',
    name: { en: 'Single ALV Grid', ko: '단일 ALV 그리드' },
    layoutPattern: {
      en: 'Selection Screen → Single Main ALV Table',
      ko: '조회조건(Selection Screen) → 단일 메인 ALV 그리드',
    },
    useCase: {
      en: 'Standard reports, reconciliation lists, batch logs, status monitors',
      ko: '일반 조회 리포트, 계정 대사, 배치 처리 로그, 전표 현황 모니터링',
    },
    actionId: 'open_sample_01',
  },
  {
    typeCode: '02',
    programId: 'ZRALV0020',
    name: { en: 'Header-Item Dual ALV', ko: '헤더-품목 2단 ALV' },
    layoutPattern: {
      en: 'Top Header ALV Grid ↔ Synchronized Bottom Item ALV Grid',
      ko: '상단 헤더 ALV 클릭/더블클릭 ↔ 하단 품목 ALV 연동',
    },
    useCase: {
      en: 'Sales Orders (VBAK/VBAP), Purchase Orders (EKKO/EKPO), Billing Docs',
      ko: '판매오더(VBAK/VBAP), 구매발주(EKKO/EKPO), 전표 헤더-품목 상세 분석',
    },
    actionId: 'open_sample_02',
  },
  {
    typeCode: '03',
    programId: 'ZRALV0030',
    name: { en: 'ALV Tree + Detail Grid', ko: '트리 + 상세 ALV' },
    layoutPattern: {
      en: 'Left Hierarchical Tree Explorer ↔ Right Detail Grid',
      ko: '좌측 계층형 트리 탐색기 ↔ 우측 상세 그리드 연동',
    },
    useCase: {
      en: 'BOM explosion, Cost Center / Org hierarchies, Carrier-Flight schedules',
      ko: 'BOM 전개, 코스트센터·조직 계층 구조, 다단계 분류별 상세 조회',
    },
    actionId: 'open_sample_03',
  },
  {
    typeCode: '04',
    programId: 'ZRALV0040',
    name: { en: 'Pivot Browser / OData', ko: '피벗 브라우저 / OData' },
    layoutPattern: {
      en: 'Multi-dimensional Aggregation & Pivot / Gateway Entity View',
      ko: '다차원 집계 피벗 뷰 및 SAP Gateway OData 엔티티 설계',
    },
    useCase: {
      en: 'G/L period summaries, KPI drill-across, Fiori / OData backend specs',
      ko: '계정·기간별 다차원 집계 분석, Fiori OData 서비스 백엔드 설계',
    },
    actionId: 'open_sample_04',
  },
];

export const USER_GUIDE_CASES: UserGuideCase[] = [
  {
    id: 'ai-meeting-spec',
    caseNumber: '01',
    category: 'creation',
    badge: { en: 'AI Meeting Workflow', ko: 'AI 미팅 기반' },
    title: {
      en: 'Create Spec from AI Meeting Minutes',
      ko: 'AI 미팅(회의록)을 통한 사양서 자동 생성',
    },
    summary: {
      en: 'Turn requirement kickoff discussions, voice recordings, or raw meeting notes directly into a structured SAP Functional/Technical Spec.',
      ko: '현업 요구사항 미팅 녹음, 텍스트 메모 또는 회의록을 AI가 요약하고 알맞은 SAP 유형과 사양서 초안까지 한 번에 생성합니다.',
    },
    audience: {
      en: 'Functional Consultants · PM · Business Analysts',
      ko: '모듈 컨설턴트 · PM · 현업 담당자',
    },
    estimatedTime: { en: '3–5 min', ko: '3~5분 소요' },
    whenToUse: {
      en: 'Best at project kickoff or change-request workshops when requirements only exist as meeting conversations or rough notes.',
      ko: '요구사항이 아직 정형 문서가 아닌 구두 회의나 메모 형태로만 존재할 때 가장 빠르고 정확하게 초안을 잡을 수 있습니다.',
    },
    steps: [
      {
        title: {
          en: 'Open Meetings & Start AI Spec Wizard',
          ko: '회의록 메뉴에서 AI 사양서 마법사 실행',
        },
        detail: {
          en: 'Go to Meetings in the left sidebar and click "+ New Recording" or "Start AI Spec Wizard" to choose the target project.',
          ko: '왼쪽 사이드바의 [회의록(Meetings)]으로 이동해 [+ 새 회의 녹음] 또는 [AI 사양서 생성] 버튼을 눌러 대상 프로젝트를 선택합니다.',
        },
        location: { en: 'Sidebar → Meetings → New Meeting', ko: '사이드바 → 회의록 → 새 회의록' },
      },
      {
        title: {
          en: 'Capture Audio or Paste Discussion Notes',
          ko: '음성 녹음 또는 회의 논의 내용 입력',
        },
        detail: {
          en: 'Record a live meeting or paste meeting transcripts/notes covering SAP tables, filters, KPIs, and approval rules.',
          ko: '실시간 회의를 녹음하거나 SAP 테이블, 조회조건, 출력 컬럼, 업무 로직이 담긴 회의 메모를 입력합니다.',
        },
        location: { en: 'AI Wizard Step 1 · Capture & Minutes', ko: 'AI 마법사 1단계 · 회의 내용 입력' },
      },
      {
        title: {
          en: 'AI Summarize & Recommend Sample Type (01–04)',
          ko: 'AI 회의록 구조화 및 SAP 샘플 유형(01~04) 추천',
        },
        detail: {
          en: 'Run AI summarization to extract Action Items, Business Purpose, and receive a recommended ALV Sample Type (01 Single, 02 Header-Item, 03 Tree, 04 Pivot).',
          ko: 'AI 요약을 실행하면 핵심 결정사항, 후속 작업과 함께 요구사항에 가장 적합한 ALV 유형(01~04)을 자동으로 추천합니다.',
        },
        location: { en: 'AI Wizard Step 2 · Type Suggestion', ko: 'AI 마법사 2단계 · 유형 추천' },
      },
      {
        title: {
          en: 'Generate & Open in Split Workspace',
          ko: '사양서 생성 및 분할 작업실 즉시 열기',
        },
        detail: {
          en: 'Confirm the Program ID, T-Code, and module. EverySpec creates the complete spec (Selection Screen, Field Catalog, Data Flow) and links it back to the meeting record.',
          ko: 'Program ID, T-Code, 모듈을 확인하고 생성하면 조회조건·필드 카탈로그·데이터 흐름도가 완성된 사양서가 열리며 회의록과 자동 연결됩니다.',
        },
        location: { en: 'AI Wizard Step 3 → Split Workspace', ko: 'AI 마법사 3단계 → 분할 작업실' },
      },
    ],
    sampleFlow: {
      inputLabel: { en: 'Sample Meeting Note Input', ko: '입력 예시 (미팅 메모)' },
      inputSnippet: `Attendees: SD Lead, CO Analyst
- Need an order backlog report by Sales Org (VKORG) and Creation Date (ERDAT).
- Show header list first; clicking a Sales Order should show line items below.
- Include Traffic Light status (Red if > 7 days delayed) and Net Value subtotal by Currency.`,
      outputLabel: { en: 'Generated Spec Output', ko: '자동 생성 결과' },
      outputBullets: [
        {
          en: 'Recommends Type 02 (Header-Item Dual ALV Grid) linked to VBAK & VBAP',
          ko: 'VBAK·VBAP 기반 Type 02(헤더-품목 2단 ALV) 자동 추천 및 구조화',
        },
        {
          en: 'Populates S_VKORG / S_ERDAT selection parameters + Header/Item Field Catalogs',
          ko: 'S_VKORG·S_ERDAT 조회조건 및 헤더/품목 필드 카탈로그 자동 구성',
        },
        {
          en: 'Adds Traffic Light exception rule & WAERK currency subtotal definition',
          ko: '상태 신호등 예외 규칙 및 통화(WAERK) 기준 소계 설정 반영',
        },
      ],
    },
    tips: [
      {
        en: 'You can re-open the linked meeting minute anytime directly from the Spec Editor header.',
        ko: '생성된 사양서 상단에서 원본 회의록으로 언제든 다시 이동해 맥락을 확인할 수 있습니다.',
      },
      {
        en: 'Mention SAP table names (e.g., VBAK, BKPF, EKKO) in notes for sharper DDIC field mapping.',
        ko: '회의 메모에 SAP 표준 테이블명(VBAK, BKPF, EKKO 등)을 함께 적으면 필드 매핑 정확도가 높아집니다.',
      },
    ],
    primaryAction: {
      id: 'open_meeting_wizard',
      label: { en: 'Launch AI Spec Wizard', ko: 'AI 사양서 마법사 실행' },
    },
    secondaryAction: {
      id: 'open_meetings',
      label: { en: 'Open Meetings Hub', ko: '회의록 목록 보기' },
    },
    keywords: ['ai', 'meeting', 'minutes', 'wizard', 'voice', 'audio', '미팅', '회의록', '마법사', '녹음'],
  },
  {
    id: 'sample-type-creation',
    caseNumber: '02',
    category: 'creation',
    badge: { en: 'Sample & Templates', ko: '샘플·템플릿 기반' },
    title: {
      en: 'Build Directly from Sample Types (01–04) & Templates',
      ko: '샘플 타입(01~04) 및 템플릿으로 바로 사양서 만들기',
    },
    summary: {
      en: 'Clone one of the 4 COMM Standard ALV Samples or predefined domain templates (Sales, Purchase, G/L Recon, OData) into your active project.',
      ko: '표준화된 4가지 COMM 샘플 유형(01~04)이나 도메인별 템플릿을 선택해 내 프로젝트로 복사한 뒤 즉시 커스터마이징합니다.',
    },
    audience: {
      en: 'All Consultants · ABAP Developers',
      ko: '전체 컨설턴트 · ABAP 개발자',
    },
    estimatedTime: { en: '1–2 min', ko: '1~2분 소요' },
    whenToUse: {
      en: 'Ideal when you already know the target SAP UI pattern (Single Grid, Master-Detail, Tree, or Pivot) and want a verified starting structure.',
      ko: '구현할 화면 레이아웃(단일/헤더-품목/트리/피벗)이 이미 결정되었을 때 검증된 표준 구조를 기반으로 빠르게 작성할 수 있습니다.',
    },
    steps: [
      {
        title: {
          en: 'Inspect COMM Standard Samples (ZRALV0010–0040)',
          ko: 'COMM 공통 표준 샘플(ZRALV0010~0040) 확인',
        },
        detail: {
          en: 'Open Programs in the sidebar and filter by [COMM] to preview the 4 read-only standard reference programs.',
          ko: '사이드바 [프로그램 목록]에서 [COMM] 프로젝트의 읽기 전용 표준 샘플 4종을 열어 화면과 로직 구성을 미리 확인합니다.',
        },
        location: { en: 'Sidebar → Programs → [COMM]', ko: '사이드바 → 프로그램 목록 → [COMM]' },
      },
      {
        title: {
          en: 'Copy to Project or Load Template Library',
          ko: '내 프로젝트로 복사 또는 템플릿 라이브러리 적용',
        },
        detail: {
          en: 'Click "Copy Spec" on any COMM sample (or open Template Library inside Spec Editor) to clone into your target project with a compliant Z/Y Program ID.',
          ko: '샘플에서 [복사(Copy)]를 누르거나 편집기의 [템플릿 라이브러리]를 열어 대상 프로젝트 코드와 표준 네이밍 규칙에 맞는 새 Program ID를 지정합니다.',
        },
        location: { en: 'Programs → Copy / Spec Editor → Templates', ko: '프로그램 목록 → 복사 / 편집기 → 템플릿' },
      },
      {
        title: {
          en: 'Customize Selection Screen, Columns & Toolbar',
          ko: '조회조건, ALV 필드 카탈로그 및 툴바 수정',
        },
        detail: {
          en: 'Replace sample fields with your project tables using DDIC Search Help or Excel Paste, while viewing live updates in the SAP GUI Mockup.',
          ko: 'DDIC 테이블 가져오기나 엑셀 붙여넣기로 필드를 교체하고, 우측 SAP GUI 시뮬레이터로 즉시 화면 결과를 검증합니다.',
        },
        location: { en: 'Split Workspace (Alt+1)', ko: '분할 작업실 (Alt+1)' },
      },
    ],
    sampleFlow: {
      inputLabel: { en: 'Choose Standard Sample or Template', ko: '선택 가능한 표준 유형' },
      inputSnippet: `COMM/ZRALV0010 (Type 01) → Single ALV Grid
COMM/ZRALV0020 (Type 02) → Header-Item Dual ALV Grid
COMM/ZRALV0030 (Type 03) → ALV Tree + Detail Grid
COMM/ZRALV0040 (Type 04) → Pivot Browser / OData`,
      outputLabel: { en: 'Project-Ready Spec Result', ko: '프로젝트 복사 후 제공 항목' },
      outputBullets: [
        {
          en: 'Pre-configured 10-step ABAP Flowchart & node-level logic notes',
          ko: '유형별 표준 10단계 프로세스 플로우차트 및 노드별 상세 로직 자동 포함',
        },
        {
          en: 'Working SAP GUI mockup toolbar, F4 help, and realistic sample data',
          ko: '표준 ALV 툴바, F4 탐색 도움말, 즉시 실행 가능한 샘플 데이터 포함',
        },
        {
          en: 'Complete 6-Include ABAP skeleton matching Classic or 7.40+ syntax',
          ko: 'Classic 및 ABAP 7.40+ 문법에 대응하는 6-Include 전체 코드 즉시 생성',
        },
      ],
    },
    tips: [
      {
        en: 'COMM standard samples are locked Read-Only so your organization’s baseline templates stay clean.',
        ko: 'COMM 원본 샘플은 보호를 위해 읽기 전용(편집 비활성화)이며, 반드시 프로젝트로 복사 후 수정해야 합니다.',
      },
      {
        en: 'You can save any finished spec as a reusable User Template in the Template Library.',
        ko: '잘 만든 사양서는 템플릿 라이브러리의 [현재 사양서 저장] 탭에 나만의 사내 템플릿으로 보관할 수 있습니다.',
      },
    ],
    primaryAction: {
      id: 'open_templates',
      label: { en: 'Open Template Library', ko: '템플릿 라이브러리 열기' },
    },
    secondaryAction: {
      id: 'open_program_list',
      label: { en: 'Browse COMM Samples', ko: 'COMM 샘플 목록 보기' },
    },
    keywords: ['sample', 'template', 'comm', 'zralv0010', 'zralv0020', 'zralv0030', 'zralv0040', 'copy', '샘플', '템플릿', '복사'],
  },
  {
    id: 'legacy-abap-import',
    caseNumber: '03',
    category: 'creation',
    badge: { en: 'Source Upload / Reverse', ko: '소스 업로드·역공학' },
    title: {
      en: 'Upload Existing ABAP Source or SE11 Structure',
      ko: '기존 ABAP 소스 업로드로 사양서 역공학 생성',
    },
    summary: {
      en: 'Upload a `.abap` / `.txt` file or paste legacy ECC/S4 program code to automatically reverse-engineer a structured Program Spec.',
      ko: '기존 운영 중인 ABAP 프로그램 소스(`.abap`/`.txt`)나 SE11 구조를 업로드·붙여넣기하여 사양서 문서를 자동으로 역산출합니다.',
    },
    audience: {
      en: 'ABAP Developers · S/4HANA Migration Teams',
      ko: 'ABAP 개발자 · S/4HANA 전환(Migration) 팀',
    },
    estimatedTime: { en: '2–3 min', ko: '2~3분 소요' },
    whenToUse: {
      en: 'Use when maintaining legacy Z-programs without up-to-date documentation, or when migrating ECC reports to S/4HANA.',
      ko: '설계서가 유실된 레거시 Z-프로그램을 현행화하거나 ECC 프로그램을 S/4HANA로 전환·고도화할 때 매우 유용합니다.',
    },
    steps: [
      {
        title: {
          en: 'Open Legacy ABAP Import in Spec Editor',
          ko: '사양서 편집기에서 ABAP 소스 가져오기 실행',
        },
        detail: {
          en: 'Inside Spec Editor, open the AI / Import toolbar menu and select "Import Legacy ABAP Source" (or click the Code Import icon).',
          ko: '사양서 편집기 상단 메뉴의 [레거시 ABAP 소스 가져오기(Import Legacy ABAP)] 모달을 엽니다.',
        },
        location: { en: 'Spec Editor → Import Legacy ABAP', ko: '사양서 편집기 → 레거시 ABAP 가져오기' },
      },
      {
        title: {
          en: 'Upload `.abap` File or Paste Source Code',
          ko: '`.abap` 파일 업로드 또는 코드 붙여넣기',
        },
        detail: {
          en: 'Upload a local `.abap` / `.txt` file, paste source code from SE38/ADT, or load the built-in sample ABAP report to test.',
          ko: '로컬 `.abap`/`.txt` 파일을 업로드하거나 SE38/ADT에서 복사한 소스를 붙여넣습니다. (내장 샘플 버튼으로 바로 테스트 가능)',
        },
        location: { en: 'Legacy ABAP Modal → Upload / Paste', ko: 'ABAP 가져오기 모달 → 파일 업로드 / 붙여넣기' },
      },
      {
        title: {
          en: 'Analyze Tables, Filters, Authority & Messages',
          ko: '테이블·조회조건·권한·메시지 자동 분석 및 적용',
        },
        detail: {
          en: 'Click Analyze to detect `TABLES`, `PARAMETERS`, `SELECT-OPTIONS`, `JOIN` clauses, `AUTHORITY-CHECK` objects, and `MESSAGE` classes, then preview and apply to your spec.',
          ko: '분석을 실행하면 `TABLES`, `PARAMETERS`, `SELECT-OPTIONS`, `SELECT JOIN`, `AUTHORITY-CHECK`, `MESSAGE` 구문을 자동 추출하며 미리보기 후 사양서로 즉시 반영합니다.',
        },
        location: { en: 'Analyze → Preview → Apply Spec', ko: '분석 → 결과 미리보기 → 사양서 반영' },
      },
    ],
    sampleFlow: {
      inputLabel: { en: 'Uploaded ABAP Source Snippet', ko: '업로드 ABAP 소스 예시' },
      inputSnippet: `REPORT zr_sd_backlog_rep.
TABLES: vbak, vbap, kna1.
PARAMETERS: p_vkorg TYPE vbak-vkorg OBLIGATORY.
SELECT-OPTIONS: s_erdat FOR vbak-erdat OBLIGATORY.
AUTHORITY-CHECK OBJECT 'V_VBAK_VKO' ID 'VKORG' FIELD p_vkorg.
SELECT a~vbeln a~erdat a~kunnr a~netwr b~name1
  FROM vbak AS a INNER JOIN kna1 AS b ON a~kunnr = b~kunnr.`,
      outputLabel: { en: 'Extracted Specification Items', ko: '자동 역공학 추출 항목' },
      outputBullets: [
        {
          en: 'Selection Screen: P_VKORG (Parameter, Obligatory) & S_ERDAT (Select-Option)',
          ko: '조회조건: P_VKORG(필수 Parameter), S_ERDAT(필수 Select-Option) 자동 등록',
        },
        {
          en: 'ALV Field Catalog: VBELN, ERDAT, KUNNR, NETWR, NAME1 mapped with SAP types',
          ko: 'ALV 필드 카탈로그: VBELN, ERDAT, KUNNR, NETWR, NAME1 및 DDIC 타입 매핑',
        },
        {
          en: 'Quality & Security: V_VBAK_VKO authority object & JOIN extraction logic populated',
          ko: '권한 및 로직: V_VBAK_VKO 권한 오브젝트와 JOIN 추출 로직 자동 기록',
        },
      ],
    },
    tips: [
      {
        en: 'If you are currently viewing a Read-Only COMM sample, copy it to a project first before importing ABAP source.',
        ko: '현재 보고 있는 프로그램이 COMM 읽기 전용 샘플인 경우, 먼저 프로젝트로 복사한 뒤 소스 가져오기를 실행하세요.',
      },
      {
        en: 'Follow up with the Quality & Security tab to review S/4HANA compatibility findings (e.g., KONV → PRCD_ELEMENTS, BSEG/ACDOCA).',
        ko: '소스 반영 후 [품질·보안(Quality & Security)] 탭에서 S/4HANA 호환성 진단 결과를 함께 점검할 수 있습니다.',
      },
    ],
    primaryAction: {
      id: 'open_editor',
      label: { en: 'Open Spec Editor to Import', ko: '편집기에서 소스 업로드하기' },
    },
    secondaryAction: {
      id: 'open_abap_code',
      label: { en: 'Preview Generated ABAP', ko: 'ABAP 코드 생성기 보기' },
    },
    keywords: ['abap', 'upload', 'import', 'source', 'legacy', 'reverse', 'se38', 'se11', '업로드', '소스', '역공학', '가져오기'],
  },
  {
    id: 'text-ai-reverse-ddic',
    caseNumber: '04',
    category: 'creation',
    badge: { en: 'Text & DDIC Driven', ko: '텍스트·DDIC 기반' },
    title: {
      en: 'Draft Logic in Markdown & Auto-Extract Fields (DDIC / Excel)',
      ko: '업무 로직 작성 후 AI 역추출 · DDIC · 엑셀로 필드 구성하기',
    },
    summary: {
      en: 'Write Business Purpose & Data Extraction rules first, then extract Selection Screen & Field Catalog via AI Reverse Extract, SAP DDIC Tables, or Excel paste.',
      ko: '비즈니스 목적과 추출 로직을 마크다운으로 먼저 작성한 뒤, AI 역추출·표준 DDIC 테이블 조회·엑셀 붙여넣기로 화면 필드를 빠르게 완성합니다.',
    },
    audience: {
      en: 'Functional Consultants · Data Architects',
      ko: '모듈 컨설턴트 · 데이터 설계자',
    },
    estimatedTime: { en: '3–4 min', ko: '3~4분 소요' },
    whenToUse: {
      en: 'Great when drafting a brand-new spec from a functional requirement document or Excel column list.',
      ko: '기능 설계 문장이나 엑셀 컬럼 정의표가 준비되어 있을 때 조회조건과 ALV 컬럼을 일일이 타이핑하지 않고 구성할 수 있습니다.',
    },
    steps: [
      {
        title: {
          en: 'Describe Business Purpose, Logic & Flowchart',
          ko: '업무 목적, 추출 로직 및 플로우차트 작성',
        },
        detail: {
          en: 'Enter Markdown descriptions in Info & Logic and design processing steps in the Flowchart tab (including node-specific notes).',
          ko: 'Info & Logic 탭에 업무 목적과 추출 조건을 적고, Flowchart 탭에서 단계별 노드와 상세 로직 메모를 구성합니다.',
        },
        location: { en: 'Spec Editor → Info & Logic / Flowchart', ko: '사양서 편집기 → 기본 정보 / 플로우차트' },
      },
      {
        title: {
          en: 'Run AI Reverse Extract or AI Spec Copilot',
          ko: 'AI 역추출(Reverse Extract) 또는 AI 코파일럿 실행',
        },
        detail: {
          en: 'Click "Extract Parameters & Fields" to let AI infer Selection Screen filters and ALV output columns directly from your logic text.',
          ko: '편집기의 [AI 역추출] 버튼을 누르면 작성한 추출 로직 문장을 분석해 조회조건과 출력 컬럼 후보를 제안합니다.',
        },
        location: { en: 'Spec Editor → AI Reverse Extract', ko: '사양서 편집기 → AI 역추출' },
      },
      {
        title: {
          en: 'Add Verified Columns via DDIC Table Import or Excel Paste',
          ko: 'SAP DDIC 테이블 가져오기 또는 엑셀 붙여넣기',
        },
        detail: {
          en: 'Open "Import SAP Table" in Main Screen to pick columns from MARA, VBAK, BKPF, ACDOCA, etc., or paste directly from Excel/CSV.',
          ko: 'Main Screen 탭에서 [SAP 테이블 가져오기]로 표준 테이블 컬럼을 체크해 추가하거나, [엑셀 붙여넣기]로 다수 컬럼을 일괄 등록합니다.',
        },
        location: { en: 'Spec Editor → Main Screen → DDIC / Excel', ko: '사양서 편집기 → 메인 화면 → DDIC / 엑셀' },
      },
    ],
    sampleFlow: {
      inputLabel: { en: 'Data Extraction Logic Text', ko: '작성된 추출 로직 예시' },
      inputSnippet: `1. Tables: BKPF (Accounting Header), BSEG (Line Item), SKAT (G/L Name)
2. Filters: Company Code (BUKRS), Fiscal Year (GJAHR), Posting Date (BUDAT)
3. Output: Document No, Posting Date, G/L Account, Debit/Credit Amount (DMBTR) in KRW`,
      outputLabel: { en: 'Auto-Populated Controls', ko: '자동 생성 구성 요소' },
      outputBullets: [
        {
          en: 'Parameters: P_BUKRS, P_GJAHR, S_BUDAT with SAP Search Help links',
          ko: '조회조건: P_BUKRS, P_GJAHR, S_BUDAT 및 Search Help 연결',
        },
        {
          en: 'DDIC Columns: BELNR, BUDAT, HKONT, TXT50, DMBTR, WAERS with proper lengths',
          ko: 'DDIC 컬럼: BELNR, BUDAT, HKONT, TXT50, DMBTR, WAERS 타입·길이 자동 세팅',
        },
        {
          en: 'Spreadsheet Editor: Reorder columns, set totals, hotspots & editable flags',
          ko: '스프레드시트 편집기에서 열 순서, 합계, 핫스팟(Drill-down), 편집 여부 일괄 설정',
        },
      ],
    },
    tips: [
      {
        en: 'Use the Field Catalog Spreadsheet view for rapid bulk editing of column widths, alignment, totals, and traffic lights.',
        ko: '다수의 컬럼 속성을 한 번에 수정할 때는 Field Catalog 상단의 스프레드시트 모드를 활용하면 빠릅니다.',
      },
    ],
    primaryAction: {
      id: 'open_editor',
      label: { en: 'Go to Spec Editor', ko: '사양서 편집기로 이동' },
    },
    secondaryAction: {
      id: 'open_split',
      label: { en: 'Open Split View', ko: '분할 작업실 열기' },
    },
    keywords: ['ddic', 'excel', 'markdown', 'reverse extract', 'copilot', 'mara', 'vbak', 'bkpf', '역추출', '엑셀', '테이블'],
  },
  {
    id: 'sap-gui-prototyping',
    caseNumber: '05',
    category: 'design',
    badge: { en: 'Live Simulation', ko: '실시간 화면 시뮬레이션' },
    title: {
      en: 'Prototype & Verify Screens in SAP GUI Simulator',
      ko: '실시간 SAP GUI 시뮬레이터로 화면 동작 및 테마 검증하기',
    },
    summary: {
      en: 'Preview Selection Screens, ALV Grids, F4 Search Helps, Multiple Selection dialogs, Drilldowns, and Charts side-by-side in real time.',
      ko: '사양서를 편집하는 즉시 우측 SAP GUI 시뮬레이터에서 조회화면, ALV 그리드, F4 도움말, 다중 선택, 드릴다운, 차트를 직접 클릭하며 검증합니다.',
    },
    audience: {
      en: 'Functional Consultants · Stakeholders · UX Reviewers',
      ko: '컨설턴트 · 현업 리뷰어 · UI 검토자',
    },
    estimatedTime: { en: '2–5 min', ko: '2~5분 소요' },
    whenToUse: {
      en: 'Use during client review sessions or screen design to confirm user experience before writing a single line of ABAP.',
      ko: '실제 ABAP 개발에 착수하기 전, 현업 담당자와 화면 레이아웃·필드명·드릴다운 동작을 사전에 합의할 때 최적입니다.',
    },
    steps: [
      {
        title: {
          en: 'Switch to Split Workspace (Alt+1) or Cycle Layout (Alt+L)',
          ko: '분할 작업실(Alt+1) 전환 및 분할 방향(Alt+L) 조정',
        },
        detail: {
          en: 'Keep Spec Editor on one pane and SAP GUI Mockup on the other; drag the center divider or press Alt+L to swap left/right or top/bottom.',
          ko: '좌/우 또는 상/하 분할 화면에서 한쪽은 사양서를 수정하고 다른 쪽은 SAP GUI 화면이 즉시 갱신되는 것을 확인합니다.',
        },
        location: { en: 'Top Bar → Split View (Alt+1)', ko: '상단 바 → 분할 보기 (Alt+1)' },
      },
      {
        title: {
          en: 'Test Selection Screen, F4 Help & Execute (F8)',
          ko: '조회조건, F4 탐색 도움말 및 실행(F8) 테스트',
        },
        detail: {
          en: 'Click F4 icons or Multiple Selection arrows on parameters, then press Execute (F8) inside the simulator to switch between Selection Screen and Main ALV Screen.',
          ko: '시뮬레이터 내부의 F4 도움말 버튼과 다중 선택(노란 화살표)을 테스트하고, 실행(F8) 버튼으로 결과 ALV 화면을 전환해 봅니다.',
        },
        location: { en: 'SAP GUI Mockup → Selection Screen / F8', ko: 'SAP GUI 시뮬레이터 → 조회화면 / 실행(F8)' },
      },
      {
        title: {
          en: 'Switch SAP GUI Theme (Blue Crystal · Belize · Quartz)',
          ko: 'SAP GUI 테마 전환 (Blue Crystal · Belize · Quartz)',
        },
        detail: {
          en: 'Open the Account & Settings menu in the top bar (or Simulator theme icon) to preview ECC 6.0 Blue Crystal vs. S/4HANA Belize & Quartz.',
          ko: '상단 계정/설정 메뉴 또는 시뮬레이터 테마 버튼에서 ECC(Blue Crystal)와 S/4HANA(Belize, Quartz) 스타일을 즉시 비교할 수 있습니다.',
        },
        location: { en: 'Top Bar → Settings / Simulator Theme', ko: '상단 바 → 설정 / 시뮬레이터 테마' },
      },
    ],
    sampleFlow: {
      inputLabel: { en: 'Interactive Mockup Capabilities', ko: '시뮬레이터 지원 기능' },
      inputSnippet: `• F4 Search Help & Multiple Selection (Single / Range / Exclude)
• ALV Sort, Filter, Total/Subtotal, Layout Variant Save
• Hotspot Drilldown Modal & Business Graphic Chart
• Fresh AI Mock Data Generation per Field Catalog`,
      outputLabel: { en: 'Design Sign-Off Benefits', ko: '기대 효과' },
      outputBullets: [
        {
          en: 'Eliminates late-stage rework by validating ALV columns & headers with users upfront',
          ko: '개발 전 현업과 컬럼 구성·헤더명·집계 방식을 눈으로 보고 확정해 재작업 최소화',
        },
        {
          en: 'Test Header → Item click synchronization (Type 02) & Tree node expansion (Type 03)',
          ko: '헤더 행 선택에 따른 품목 연동(Type 02) 및 트리 노드 확장(Type 03)까지 실제처럼 시연',
        },
      ],
    },
    tips: [
      {
        en: 'Use "Generate Mock Data" from the simulator toolbar whenever you add new columns so sample rows populate automatically.',
        ko: '새 컬럼을 추가한 뒤 시뮬레이터의 [테스트 데이터 생성]을 누르면 새 컬럼 형식에 맞는 가상 데이터가 채워집니다.',
      },
    ],
    primaryAction: {
      id: 'open_split',
      label: { en: 'Open Split Workspace', ko: '분할 작업실 열기' },
    },
    secondaryAction: {
      id: 'open_mockup',
      label: { en: 'Open Full GUI Simulator', ko: '전체 GUI 시뮬레이터 보기' },
    },
    keywords: ['mockup', 'simulator', 'sap gui', 'f4', 'theme', 'blue crystal', 'belize', 'quartz', '시뮬레이터', '화면', '테마'],
  },
  {
    id: 'abap-code-generation',
    caseNumber: '06',
    category: 'code',
    badge: { en: 'SE38 / ADT Code', ko: 'ABAP 코드 생성' },
    title: {
      en: 'Generate Modular ABAP Code & Customize Syntax Themes',
      ko: '모듈화된 ABAP 소스 생성 · USER LOGIC 보존 · 다중 테마 적용',
    },
    summary: {
      en: 'Produce complete 6-Include ABAP source (Program, TOP, S01, C01, MOD, F01) in Classic or 7.40+ syntax with Search, Edit, and matched IDE themes.',
      ko: '사양서를 기반으로 6개 Include(Program·TOP·S01·C01·MOD·F01) 전체 ABAP 코드를 Classic 또는 7.40+ 문법으로 생성하고 다중 테마로 편집·내보내기 합니다.',
    },
    audience: {
      en: 'ABAP Developers · Technical Leads',
      ko: 'ABAP 개발자 · 테크니컬 리드',
    },
    estimatedTime: { en: '1–3 min', ko: '1~3분 소요' },
    whenToUse: {
      en: 'Once the spec is finalized, generate ready-to-paste SE38/ADT includes plus Text Symbols and PF-STATUS reference tables.',
      ko: '사양서 확정이 끝난 뒤 SE38이나 Eclipse ADT에 바로 적용할 ABAP 골격 코드와 텍스트 심볼·PF-STATUS 정의가 필요할 때 사용합니다.',
    },
    steps: [
      {
        title: {
          en: 'Open ABAP Code View (Alt+4) & Select Syntax Mode',
          ko: 'ABAP 코드 화면(Alt+4) 열기 및 문법 버전 선택',
        },
        detail: {
          en: 'Toggle between Classic (ECC 6.0 compatible) and 7.40+ (inline @DATA, VALUE #, NEW, string templates) in the code toolbar.',
          ko: '상단 툴바에서 Classic(ECC 6.0 호환)과 7.40+(인라인 @DATA, VALUE #, 문자열 템플릿) 문법 모드를 선택합니다.',
        },
        location: { en: 'Workspace → ABAP Code (Alt+4)', ko: '작업실 → ABAP 코드 (Alt+4)' },
      },
      {
        title: {
          en: 'Edit Includes Safely with USER LOGIC Preservation',
          ko: 'USER LOGIC 구간 보존을 통한 안전한 Include 직접 편집',
        },
        detail: {
          en: 'Switch to Edit mode on TOP, S01, C01, MOD, or F01. Custom code written inside `* &--- BEGIN USER LOGIC` blocks is preserved when you click Sync or Sync All.',
          ko: '개별 Include 탭에서 [편집] 모드로 커스텀 로직을 추가할 수 있으며, `* &--- BEGIN USER LOGIC` 블록 내부 코드는 사양서 재동기화(Sync) 시에도 보존됩니다.',
        },
        location: { en: 'ABAP Toolbar → Edit / Sync / Sync All', ko: 'ABAP 툴바 → 편집 / 동기화' },
      },
      {
        title: {
          en: 'Pick Syntax Highlighting Theme or Match SAP GUI',
          ko: '구문 강조 테마 선택 또는 SAP GUI 테마 자동 연동',
        },
        detail: {
          en: 'Click the Palette dropdown to auto-match your active SAP GUI theme (Blue Crystal → SE38 Light, Belize → Solarized Light, Quartz → VS Code Dark+) or pick Monokai / Solarized Dark.',
          ko: '팔레트 메뉴에서 현재 SAP GUI 테마에 맞춘 자동 연동을 사용하거나 VS Code Dark+, Monokai, Solarized 등 원하는 에디터 테마를 선택합니다.',
        },
        location: { en: 'ABAP Toolbar → Theme Palette · Ctrl+F', ko: 'ABAP 툴바 → 테마 팔레트 · Ctrl+F' },
      },
    ],
    sampleFlow: {
      inputLabel: { en: 'Protected Custom Region Example', ko: '보존되는 사용자 로직 구간 예시' },
      inputSnippet: `*&--- BEGIN USER LOGIC (DATA_EXTRACTION)
  SELECT a~vbeln, a~erdat, b~posnr, b~matnr
    FROM vbak AS a
    INNER JOIN vbap AS b ON b~vbeln = a~vbeln
    WHERE a~erdat IN @s_erdat
    INTO TABLE @gt_out.
*&--- END USER LOGIC`,
      outputLabel: { en: 'Export & Reference Deliverables', ko: '제공되는 산출물' },
      outputBullets: [
        {
          en: 'Copy active Full Program or download individual `.abap` Include files',
          ko: '전체 프로그램 복사 또는 개별 Include `.abap` 파일 즉시 다운로드',
        },
        {
          en: 'SE38 Text Elements (TEXT-001~) & SE41 PF-STATUS function code reference table',
          ko: 'SE38 텍스트 심볼(TEXT-001~) 및 SE41 PF-STATUS 기능 코드 일람표 자동 추출',
        },
      ],
    },
    tips: [
      {
        en: 'Press Ctrl+F inside the ABAP Code viewer to jump quickly to any FORM, METHOD, or field name.',
        ko: '코드 뷰어 안에서 Ctrl+F를 누르면 FORM, METHOD, 필드명 위치로 빠르게 이동할 수 있습니다.',
      },
    ],
    primaryAction: {
      id: 'open_abap_code',
      label: { en: 'Open ABAP Code Generator', ko: 'ABAP 코드 생성기 열기' },
    },
    secondaryAction: {
      id: 'open_editor',
      label: { en: 'Check Governance & Standards', ko: '문법·표준 설정 확인' },
    },
    keywords: ['abap', 'code', 'include', 'top', 's01', 'c01', 'f01', 'monokai', 'solarized', 'theme', 'user logic', '코드', '문법', '하이라이팅'],
  },
  {
    id: 'governance-export',
    caseNumber: '07',
    category: 'governance',
    badge: { en: 'Lifecycle & Export', ko: '승인·산출물 내보내기' },
    title: {
      en: 'Quality Audit, Review Workflow & Office / PDF Export',
      ko: '정합성 진단, 결재 수명주기 관리 및 Word · Excel · PDF 내보내기',
    },
    summary: {
      en: 'Run SAP governance & S/4HANA checks, collaborate with section review comments, track snapshots, and export formal Word/Excel/PDF deliverables.',
      ko: 'AUTHORITY-CHECK·S/4HANA 호환성 진단과 섹션별 리뷰 코멘트, 스냅샷 이력 비교를 거쳐 Word(.docx)·Excel(.xlsx)·PDF 공식 문서를 출력합니다.',
    },
    audience: {
      en: 'PM · QA Lead · Functional & ABAP Leads',
      ko: 'PM · QA 리드 · 모듈/개발 리더',
    },
    estimatedTime: { en: '2–3 min', ko: '2~3분 소요' },
    whenToUse: {
      en: 'Use before client sign-off, development handoff, or QA release to verify completeness and archive formal project documentation.',
      ko: '고객 승인 전, 개발 인계 시점, 또는 QA 테스트 완료 후 공식 프로젝트 산출물을 패키징할 때 활용합니다.',
    },
    steps: [
      {
        title: {
          en: 'Verify Quality & Security Diagnostics',
          ko: '품질·보안(Quality & Security) 정합성 진단',
        },
        detail: {
          en: 'Check the Quality & Security sub-tab in Spec Editor for missing AUTHORITY-CHECK objects, SE91 message classes, SY-BATCH handling, and S/4HANA table advisories.',
          ko: '편집기의 [Quality & Security] 탭에서 권한 오브젝트 누락, SE91 메시지 클래스, 배치(SY-BATCH) 분기, S/4HANA 호환성 경고를 점검합니다.',
        },
        location: { en: 'Spec Editor → Quality & Security', ko: '사양서 편집기 → 품질·보안' },
      },
      {
        title: {
          en: 'Collaborate via Review Comments & Lifecycle Status',
          ko: '리뷰 코멘트 협업 및 결재 수명주기 상태 전환',
        },
        detail: {
          en: 'Post section-specific review comments and advance status (Draft → In Review → Approved → Developed → QA Passed). Approved specs lock editing for non-PM/ADMIN roles.',
          ko: '섹션별 리뷰 코멘트로 의견을 주고받고 상태를 단계별로 전환합니다. 승인됨(Approved) 상태에서는 PM/ADMIN 외 임의 수정이 잠금 처리됩니다.',
        },
        location: { en: 'Spec Editor → Review · Lifecycle Bar', ko: '사양서 편집기 → 리뷰 · 상태 바' },
      },
      {
        title: {
          en: 'Save Revision Snapshots & Export Deliverables',
          ko: '스냅샷 이력 저장 및 Word · Excel · PDF 내보내기',
        },
        detail: {
          en: 'Press Ctrl+S to save version snapshots and compare diffs anytime. Export individual specs as Word (.docx), Excel (.xlsx), or PDF, or export a Batch WRICEF Index from Dashboard.',
          ko: 'Ctrl+S로 개정 스냅샷을 저장해 변경 내역을 비교(Diff)하고, Word(.docx)·Excel(.xlsx)·PDF 또는 대시보드의 일괄 WRICEF 인덱스 엑셀로 내보냅니다.',
        },
        location: { en: 'Print View (Alt+5) / Spec Editor → Export', ko: '인쇄 미리보기 (Alt+5) / 내보내기' },
      },
    ],
    sampleFlow: {
      inputLabel: { en: 'Lifecycle & Deliverable Formats', ko: '지원 상태 흐름 및 산출물 형식' },
      inputSnippet: `Status: Draft → In Review → Approved (Locked) → Developed → QA Passed
Exports:
  • Program Spec Word (.docx) & Excel (.xlsx)
  • Interactive Print View (Alt+5) & Formatted PDF
  • Project Batch WRICEF Index (.xlsx) & Batch Word Pack`,
      outputLabel: { en: 'Governance Guarantees', ko: '거버넌스 보장 항목' },
      outputBullets: [
        {
          en: 'Revision Diff viewer highlights changes across Field Catalog, Parameters & Logic',
          ko: '스냅샷 Diff 비교를 통해 필드, 조회조건, 로직 변경 이력을 투명하게 추적',
        },
        {
          en: 'Project-scoped visibility keeps COMM templates, TEMP drafts, and project specs cleanly separated',
          ko: '프로젝트별 격리 정책으로 COMM 샘플·개인 임시(TEMP)·공식 프로젝트 문서 혼선 방지',
        },
      ],
    },
    tips: [
      {
        en: 'Use Ctrl+K anywhere in the app to jump instantly to any Program ID, Meeting Minute, or Quick Action.',
        ko: '어디서든 Ctrl+K를 누르면 전체 프로그램, 회의록, 빠른 메뉴로 즉시 이동할 수 있습니다.',
      },
    ],
    primaryAction: {
      id: 'open_document',
      label: { en: 'Open Print / Document View', ko: '인쇄·문서 미리보기 열기' },
    },
    secondaryAction: {
      id: 'open_program_list',
      label: { en: 'Go to Batch Export in Programs', ko: '프로그램 목록 일괄 내보내기' },
    },
    keywords: ['governance', 'review', 'approval', 'export', 'word', 'excel', 'pdf', 'wricef', 'diff', 'snapshot', '검토', '승인', '내보내기', '스냅샷'],
  },
];
