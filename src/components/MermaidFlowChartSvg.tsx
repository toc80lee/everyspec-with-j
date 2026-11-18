import React, { useMemo } from 'react';
import { ProgramSpec } from '../types/sap';
import { useLanguage } from '../contexts/LanguageContext';
import {
  buildRichNodeDetailMarkdown,
  generateRichDataFlowFromSpec,
} from '../utils/dataFlowGenerator';

export interface ParsedMermaidNode {
  id: string;
  label: string;
  shape: 'rect' | 'diamond' | 'stadium' | 'cylinder' | 'circle' | 'round' | 'trapezoid';
  rawText: string;
}

export interface ParsedMermaidEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
  style?: 'normal' | 'dotted' | 'thick';
}

export interface LayoutedNode extends ParsedMermaidNode {
  x: number;
  y: number;
  width: number;
  height: number;
  layer: number;
}

const makeDevNodeSpec = (
  id: string,
  label: string,
  purpose: string,
  preCondition: string,
  steps: string,
  tables: string,
  qa: string
) => ({
  label,
  markdown: `### [${id}] ${label}

#### 1. 이 단계는 무엇을 하나요? (쉬운 업무 설명)
- ${purpose}

#### 2. 입력 및 선행 조건 (Input & Pre-condition)
- ${preCondition}

#### 3. 상세 처리 로직 (Step-by-Step ABAP Logic)
${steps}

#### 4. 관련 SAP 테이블 · 필드 · T-Code
- ${tables}

#### 5. 예외 처리 및 QA 체크포인트
- ${qa}`,
});

export const MERMAID_TEMPLATES = {
  basic_condition: {
    name: 'Basic Branching',
    code: `graph TD;
  A[1. 시작 / INITIALIZATION] --> B{2. 입력 · 권한 검증};
  B -->|정상| C[3. 데이터 추출 및 가공];
  B -->|오류| D[3-1. 오류 메시지 반환];
  C --> E[4. ALV 화면 출력 및 종료];
  D --> E;`,
    node_details: {
      A: makeDevNodeSpec(
        'A',
        '1. 시작 / INITIALIZATION',
        '프로그램 진입 시 선택화면 기본값과 전역 내부 테이블을 초기화합니다.',
        '사용자가 T-Code 또는 SE38로 프로그램 실행',
        '1. 조회 기간(당월 1일~오늘) 및 기본 조직 코드 세팅\n2. 전역 인터널 테이블 및 컨테이너 참조 초기화',
        '모듈별 기준 마스터 및 `SY-DATUM`, `SY-UNAME`',
        '배치 모드(`SY-BATCH`) 실행 시에도 오류가 없는지 확인'
      ),
      B: makeDevNodeSpec(
        'B',
        '2. 입력 · 권한 검증',
        'F8 실행 전 필수 파라미터 누락 여부와 사용자 실행 권한을 점검합니다.',
        '선택화면(Selection Screen) 입력 완료 후 실행(F8)',
        '1. 필수 파라미터 공백 및 기간 역전 검증\n2. `AUTHORITY-CHECK` 수행 (`SY-SUBRC <> 0` 시 중단)',
        '모듈 표준 `AUTHORITY-CHECK` 오브젝트',
        '권한 미보유/오류 입력 시 `MESSAGE TYPE E`와 함께 입력 필드로 커서 복귀'
      ),
      C: makeDevNodeSpec(
        'C',
        '3. 데이터 추출 및 가공',
        'DB 원천 테이블에서 조건에 맞는 데이터를 읽어 가공·집계하고 신호등을 부여합니다.',
        '입력값 및 권한 검증 통과',
        '1. 원천 헤더/디테일 테이블 `SELECT` 및 `FOR ALL ENTRIES` 조회\n2. `LOOP AT GT_DATA`로 금액 합계 및 `ZICON` 신호등(1/2/3) 계산',
        '각 모듈 표준 헤더/아이템 테이블 및 `GT_DATA`',
        '`FOR ALL ENTRIES` 수행 전 대상 테이블 `IS NOT INITIAL` 필수 확인'
      ),
      D: makeDevNodeSpec(
        'D',
        '3-1. 오류 메시지 반환',
        '예외·오류 발생 시 사용자에게 명확한 원인을 안내하고 불필요한 조회를 방지합니다.',
        '유효성/권한 검증 실패 또는 조회 결과 0건',
        '1. SE91 메시지 클래스 기준 안내/경고/오류 메시지 출력\n2. 선택화면 재입력 대기 또는 로그 적재',
        'SE91 커스텀 메시지 (`Z01`)',
        '0건 조회 시 빈 화면 덤프 대신 안내 문구가 정상 출력되는지 확인'
      ),
      E: makeDevNodeSpec(
        'E',
        '4. ALV 화면 출력 및 종료',
        '가공된 데이터를 Screen 0100 ALV Grid에 출력하고 사용자 명령 및 종료를 처리합니다.',
        '데이터 추출·가공 완료 후 `CALL SCREEN 0100`',
        '1. `CL_GUI_ALV_GRID->SET_TABLE_FOR_FIRST_DISPLAY` 호출\n2. `USER_COMMAND`(핫스팟·툴바) 및 `LEAVE TO SCREEN 0` 처리',
        '`CL_GUI_CUSTOM_CONTAINER`, `CL_GUI_ALV_GRID`',
        'F3 종료 시 컨테이너 메모리 해제(`FREE`) 누락 여부 확인'
      ),
    },
  },

  sample_01_standard: {
    name: 'Sample Type 01: SAP Standard 10-Step Flow',
    code: `graph TD;
  A([1. 시작 / INITIALIZATION]) --> B[/2. 선택화면 / SELECTION-SCREEN/];
  B --> C{3. 입력값 · 권한 검증};
  C -->|오류| B;
  C -->|정상| D[4. START-OF-SELECTION];
  D --> E[(5. 원천 데이터 추출 / SELECT)];
  E --> F[6. 비즈니스 계산 · 신호등];
  F --> G[7. ALV 그리드 출력 / 0100 PBO];
  G --> H{8. 사용자 명령 / PAI};
  H -->|핫스팟 드릴다운| I[9. 표준 T-Code 상세 조회];
  H -->|엑셀 · 툴바| J[9-1. 내보내기 · 후속 처리];
  H -->|종료 F3| K([10. 종료 / LEAVE TO SCREEN 0]);
  I --> G;
  J --> G;`,
    node_details: {
      A: makeDevNodeSpec(
        'A',
        '1. 시작 / INITIALIZATION',
        '선택화면 표시 전 기본 조회 조건(회사코드·조회기간)과 전역 변수를 초기화합니다.',
        'T-Code 실행 직후 진입 (`INITIALIZATION` 이벤트)',
        '1. 기본 조직코드 및 당월 1일~현재일 세팅\n2. 전역 테이블 `CLEAR` 및 ALV 변수 초기화',
        '모듈 기준 조직 마스터 (`T001` 등)',
        '월초/연초 날짜 경계에서도 기본 기간이 정상 세팅되는지 확인'
      ),
      B: makeDevNodeSpec(
        'B',
        '2. 선택화면 / SELECTION-SCREEN',
        '조회 조건 입력 화면을 구성하고 라디오버튼 선택에 따라 입력창을 동적 제어합니다.',
        '`INITIALIZATION` 완료 후 `AT SELECTION-SCREEN OUTPUT`',
        '1. `BLOCK` 단위 조회 조건 배치\n2. `LOOP AT SCREEN`으로 조건별 `SCREEN-INPUT` / `SCREEN-ACTIVE` 전환',
        'DDIC Search Help 및 `VALUE-REQUEST`',
        '필수(`OBLIGATORY`) 표시와 라디오버튼 그룹 전환 동작 확인'
      ),
      C: makeDevNodeSpec(
        'C',
        '3. 입력값 · 권한 검증',
        '실행(F8) 시 필수 조건과 `AUTHORITY-CHECK` 권한을 사전 점검합니다.',
        '사용자가 실행(`F8`) 버튼 클릭',
        '1. 필수 조건 공백 및 기간 역전 검증\n2. 모듈 표준 `AUTHORITY-CHECK` 실행',
        '모듈 표준 권한 오브젝트 및 SE91 메시지',
        '권한 미보유 계정에서 에러 메시지 출력 후 차단되는지 검증'
      ),
      D: makeDevNodeSpec(
        'D',
        '4. START-OF-SELECTION',
        '입력 검증 통과 후 본격적인 데이터 추출 루틴을 시작하고 진행률을 안내합니다.',
        '3번 입력·권한 검증 통과',
        '1. 내부 테이블 초기화\n2. `SAPGUI_PROGRESS_INDICATOR` 호출 후 추출 루틴 실행',
        '실행 진행 표시 함수 (`SAPGUI_PROGRESS_INDICATOR`)',
        '반복 실행 시 이전 데이터 잔류 여부 확인'
      ),
      E: makeDevNodeSpec(
        'E',
        '5. 원천 데이터 추출 / SELECT',
        '조회 조건으로 DB 원천 테이블과 마스터 텍스트 테이블을 추출합니다.',
        '4번 `START-OF-SELECTION` 진입 완료',
        '1. 주요 원천 테이블 조인 추출\n2. 마스터 텍스트는 `FOR ALL ENTRIES`(전 `IS NOT INITIAL` 체크) 후 `BINARY SEARCH` 매핑',
        '모듈 표준 원천 테이블 및 마스터 텍스트 테이블',
        '조회 0건 시 `MESSAGE S002` 안내 후 불필요한 후속 루프 스킵'
      ),
      F: makeDevNodeSpec(
        'F',
        '6. 비즈니스 계산 · 신호등',
        '추출 데이터에서 금액/수량 차이를 계산하고 상태 신호등(`ZICON`: 1/2/3)을 판정합니다.',
        '5번 원천 데이터 `GT_DATA` 적재 완료',
        '1. `LOOP AT GT_DATA`로 차이 수량/금액 산출\n2. 정상(`1`), 주의(`2`), 오류/지연(`3`) 신호등 및 셀 강조 색상 설정',
        '`GT_DATA` (`ZICON`, `LVC_T_SCOL`)',
        '신호등 경계값 및 통화(`WAERS`) 소수점 환산 오차 점검'
      ),
      G: makeDevNodeSpec(
        'G',
        '7. ALV 그리드 출력 / 0100 PBO',
        'Screen 0100 PBO에서 `CL_GUI_ALV_GRID`를 생성해 컬럼과 합계를 화면에 바인딩합니다.',
        '6번 데이터 가공 완료 후 `CALL SCREEN 0100`',
        '1. `CL_GUI_CUSTOM_CONTAINER` & `CL_GUI_ALV_GRID` 최초 1회 생성\n2. `LVC_T_FCAT`, `LVC_S_LAYO` 바인딩 및 `SET_TABLE_FOR_FIRST_DISPLAY` 호출',
        '`CL_GUI_CUSTOM_CONTAINER`, `CL_GUI_ALV_GRID`',
        '재조회 시 컨테이너 중복 생성(`CNTL_ERROR`) 방지 여부 확인'
      ),
      H: makeDevNodeSpec(
        'H',
        '8. 사용자 명령 / PAI',
        '사용자의 핫스팟 클릭, 툴바 버튼 클릭, 뒤로가기(F3) 명령을 분기 처리합니다.',
        'ALV 화면에서 사용자 인터랙션 발생 (`PAI`)',
        '1. `GV_OK_CODE` 및 ALV 이벤트(`HOTSPOT_CLICK`, `USER_COMMAND`) 수신\n2. 드릴다운(9번), 툴바(9-1번), 종료(10번)으로 분기',
        '`GV_OK_CODE`, `LCL_EVENT_RECEIVER`',
        '소계/합계 행 클릭 시 덤프(`ITAB_LINE_NOT_FOUND`) 방지 확인'
      ),
      I: makeDevNodeSpec(
        'I',
        '9. 표준 T-Code 상세 조회',
        '클릭한 전표/마스터 키로 SAP 표준 조회 트랜잭션을 즉시 실행합니다.',
        '8번에서 핫스팟 또는 더블클릭 이벤트 발생',
        '1. `SET PARAMETER ID`로 키 전달\n2. `CALL TRANSACTION ... AND SKIP FIRST SCREEN` 실행 후 복귀 시 화면 갱신',
        '각 모듈 표준 조회 T-Code (`FB03`, `VA03`, `ME23N`, `KS03` 등)',
        '표준 화면에서 F3 복귀 시 원래 선택 목록 유지 여부 확인'
      ),
      J: makeDevNodeSpec(
        'J',
        '9-1. 내보내기 · 후속 처리',
        '선택 행에 대해 커스텀 툴바 액션이나 엑셀 다운로드를 실행합니다.',
        '8번에서 툴바 또는 엑셀(`&XXL`) 명령 발생',
        '1. `GET_SELECTED_ROWS`로 선택 행 추출\n2. 커스텀 기능 수행 후 `REFRESH_TABLE_DISPLAY` 호출',
        'ALV 표준 `&XXL` 및 커스텀 `FCODE`',
        '행을 선택하지 않고 일괄 처리 버튼 클릭 시 안내 메시지 출력 확인'
      ),
      K: makeDevNodeSpec(
        'K',
        '10. 종료 / LEAVE TO SCREEN 0',
        '할당된 컨테이너와 그리드 객체를 정리하고 프로그램을 안전하게 종료합니다.',
        '8번에서 F3 / BACK / EXIT 명령 입력',
        '1. `GO_GRID->FREE( )`, `GO_CONTAINER->FREE( )` 호출\n2. `LEAVE TO SCREEN 0` 실행',
        '메모리 및 GUI Control 리소스',
        '반복 진입/종료 후 GUI 리소스 누수 여부 점검'
      ),
    },
  },

  sample_02_master_detail: {
    name: 'Sample Type 02: Master-Detail 2-Grid Flow',
    code: `graph TD;
  A([1. 시작 / INITIALIZATION]) --> B[/2. 선택화면 / SELECTION-SCREEN/];
  B --> C{3. 입력값 · 권한 검증};
  C -->|오류| B;
  C -->|정상| D[(4. 상단 헤더 추출 / Header SELECT)];
  D --> E[5. 상단 헤더 ALV 바인딩 / 0100];
  E --> F{6. 상단 행 선택 / Row Click};
  F -->|행 선택| G[(7. 하단 상세 추출 / Item SELECT)];
  G --> H[8. 하단 상세 ALV 동기화 / REFRESH];
  H --> I{9. 사용자 명령 / PAI};
  I -->|드릴다운 · 저장| J[10. 상세 T-Code · 후속 처리];
  I -->|종료 F3| K([11. 종료 / LEAVE TO SCREEN 0]);
  J --> E;`,
    node_details: {
      A: makeDevNodeSpec(
        'A',
        '1. 시작 / INITIALIZATION',
        '2단 Master-Detail 화면 구성 변수와 선택화면 기본 조회 조건을 초기화합니다.',
        'T-Code 실행 직후 진입',
        '1. 기본 조직/일자 조건 초기화\n2. 상단(`GT_HEADER`)·하단(`GT_ITEM`) 인터널 테이블 초기화',
        '표준 기준 정보 및 2-Grid 제어 변수',
        '초기 화면 진입 시 잔류 데이터 없음 확인'
      ),
      B: makeDevNodeSpec(
        'B',
        '2. 선택화면 / SELECTION-SCREEN',
        '상단 헤더 목록을 필터링할 조직·기간·문서번호 조회 조건을 입력받습니다.',
        '`INITIALIZATION` 완료 후 진입',
        '1. 필수/선택 조회 조건 화면 배치\n2. F4 검색 도움말 및 동적 화면 제어',
        '선택화면 파라미터 및 `SELECT-OPTIONS`',
        '필수 입력 표시 및 조회 옵션 전환 점검'
      ),
      C: makeDevNodeSpec(
        'C',
        '3. 입력값 · 권한 검증',
        '실행 전 입력값 정합성과 `AUTHORITY-CHECK` 권한을 검증합니다.',
        'F8 실행 입력 시 호출',
        '1. 필수 입력값 및 날짜 구간 검증\n2. 모듈 표준 권한 오브젝트 점검',
        '모듈별 `AUTHORITY-CHECK` 오브젝트',
        '검증 실패 시 오류 메시지(`TYPE E`) 및 입력창 복귀'
      ),
      D: makeDevNodeSpec(
        'D',
        '4. 상단 헤더 추출 / Header SELECT',
        '조회 조건으로 상단 마스터/전표 헤더 데이터를 추출해 `GT_HEADER`에 적재합니다.',
        '3번 입력·권한 검증 통과',
        '1. 상단 원천 테이블 조회 및 마스터 명칭 조인\n2. 상단 상태 신호등(`ZICON`) 및 요약 금액 계산',
        '상단 헤더 원천 테이블 (`BKPF`, `VBAK`, `EKKO` 등)',
        '0건 조회 시 안내 메시지 출력 후 종료 방지'
      ),
      E: makeDevNodeSpec(
        'E',
        '5. 상단 헤더 ALV 바인딩 / 0100',
        '스플리터 상단 영역(Container 1)에 헤더 목록을 바인딩하고 1행 기준으로 하단을 초기 연동합니다.',
        '4번 `GT_HEADER` 추출 완료',
        '1. `CL_GUI_SPLITTER_CONTAINER` 2행 1열 분할(45:55)\n2. 상단 `GO_GRID_HDR->SET_TABLE_FOR_FIRST_DISPLAY` 및 1행 자동 선택',
        '`CL_GUI_SPLITTER_CONTAINER`, `CL_GUI_ALV_GRID`',
        '초기 1행이 있을 때 하단 그리드가 비어 보이지 않도록 초기 연동 확인'
      ),
      F: makeDevNodeSpec(
        'F',
        '6. 상단 행 선택 / Row Click',
        '사용자가 상단 그리드의 특정 행을 클릭/더블클릭하면 연결 키(Foreign Key)를 추출합니다.',
        '사용자가 상단 ALV 행 선택 또는 더블클릭',
        '1. `HANDLE_DOUBLE_CLICK` / `SELECTION_CHANGED` 이벤트 수신\n2. `READ TABLE GT_HEADER INDEX E_ROW-INDEX`로 연결 키 추출',
        '상·하단 연결 키 (`BELNR`, `VBELN`, `EBELN` 등)',
        '합계/소계 행 클릭 시(`ROWTYPE IS NOT INITIAL`) 무시 처리 확인'
      ),
      G: makeDevNodeSpec(
        'G',
        '7. 하단 상세 추출 / Item SELECT',
        '선택된 상단 키에 해당하는 하단 품목/분개 상세 내역을 추출합니다.',
        '6번에서 연결 키 추출 완료',
        '1. 연결 키 조건으로 하단 원천 테이블 조회(또는 캐시 필터링)\n2. 상세 컬럼, 텍스트, 합계 금액 계산 후 `GT_ITEM` 적재',
        '하단 상세 원천 테이블 (`BSEG`, `VBAP`, `EKPO` 등)',
        '상단 행 전환 시 이전 하단 내역이 섞이지 않도록 `CLEAR GT_ITEM` 필수 확인'
      ),
      H: makeDevNodeSpec(
        'H',
        '8. 하단 상세 ALV 동기화 / REFRESH',
        '스플리터 하단 영역(Container 2)의 그리드를 새로운 상세 데이터로 즉시 새로고침합니다.',
        '7번 `GT_ITEM` 준비 완료',
        '1. `GO_GRID_ITM->REFRESH_TABLE_DISPLAY( IS_STABLE = LS_STABLE )` 호출\n2. `CL_GUI_CFW=>FLUSH( )` 실행',
        '하단 `CL_GUI_ALV_GRID` 인스턴스',
        '상단 클릭 즉시 하단 제목/합계/행 건수가 동기화되는지 확인'
      ),
      I: makeDevNodeSpec(
        'I',
        '9. 사용자 명령 / PAI',
        '상·하단 핫스팟 드릴다운, 커스텀 툴바 일괄 처리, 프로그램 종료 명령을 처리합니다.',
        '화면 0100 `PAI` 이벤트 발생',
        '1. `GV_OK_CODE` 및 ALV 이벤트 분기\n2. 후속 처리(10번) 또는 종료(11번) 이동',
        '`GV_OK_CODE`, 커스텀 `FCODE`',
        '툴바 실행 전 선택 행 유무 검증 확인'
      ),
      J: makeDevNodeSpec(
        'J',
        '10. 상세 T-Code · 후속 처리',
        '표준 트랜잭션 드릴다운 또는 툴바 기반 상태 갱신/전표 처리를 수행합니다.',
        '9번에서 드릴다운 또는 툴바 버튼 실행',
        '1. `SET PARAMETER ID` & `CALL TRANSACTION` 또는 BAPI/기능 호출\n2. 처리 후 상·하단 데이터 재조회 및 화면 갱신',
        '표준 T-Code 또는 BAPI/커스텀 처리 함수',
        '처리 실패 시 `BAPI_TRANSACTION_ROLLBACK` 및 오류 메시지 출력 확인'
      ),
      K: makeDevNodeSpec(
        'K',
        '11. 종료 / LEAVE TO SCREEN 0',
        '상·하단 그리드와 스플리터 컨테이너 리소스를 모두 해제하고 종료합니다.',
        '9번에서 F3 / 종료 명령 입력',
        '1. `GO_GRID_ITM->FREE( )`, `GO_GRID_HDR->FREE( )`, `GO_SPLITTER->FREE( )`\n2. `LEAVE TO SCREEN 0`',
        'GUI Control 리소스 전체',
        '반복 진입/종료 시 메모리 누수 없음 확인'
      ),
    },
  },

  sample_04_cds_pivot: {
    name: 'Sample Type 04: CDS View / Pivot Flow',
    code: `graph TD;
  A([1. 시작 / INITIALIZATION]) --> B[/2. 분석 조건 입력 / SELECTION-SCREEN/];
  B --> C[(3. CDS View · 원천 추출 / ACDOCA)];
  C --> D[4. 다차원 피벗 · 소계 집계];
  D --> E[5. 피벗 ALV 출력 / 0100 PBO];
  E --> F{6. 동적 슬라이서 · 명령};
  F -->|축 전환 · 필터| D;
  F -->|엑셀 다운로드| G[7. 리포트 파일 생성];
  F -->|종료 F3| H([8. 종료 / LEAVE TO SCREEN 0]);`,
    node_details: {
      A: makeDevNodeSpec(
        'A',
        '1. 시작 / INITIALIZATION',
        '다차원 분석 기준 연도·기간 및 기본 피벗 레이아웃 변수를 초기화합니다.',
        '프로그램 실행 직후 진입',
        '1. 기본 회계연도 및 당월 기간 설정\n2. 피벗 집계 테이블 초기화',
        '분석 기준 마스터 (`T001`, `FINSC_LEDGER`)',
        '연도/기간 기본값 정상 세팅 확인'
      ),
      B: makeDevNodeSpec(
        'B',
        '2. 분석 조건 입력 / SELECTION-SCREEN',
        '회사코드, 회계연도, 원장/계정/코스트센터 범위 등 다차원 분석 조건을 입력받습니다.',
        '`INITIALIZATION` 완료 후 선택화면 출력',
        '1. 필수 분석 조건 입력 및 기간 검증\n2. 집계 단위(월별/분기별/계정별) 옵션 제어',
        '선택화면 파라미터 및 권한 검증',
        '대용량 기간 조회 시 경고 또는 기간 제한 확인'
      ),
      C: makeDevNodeSpec(
        'C',
        '3. CDS View · 원천 추출 / ACDOCA',
        'SAP HANA Code-Pushdown 기반 CDS View 또는 `ACDOCA`에서 집계 원천 데이터를 조회합니다.',
        '분석 조건 검증 통과 후 실행',
        '1. `SELECT` 시 DB 레이어에서 `SUM` / `GROUP BY` 1차 집계 수행\n2. 필요한 마스터 텍스트 매핑',
        '`ACDOCA`, CDS View (`I_JOURNALENTRYITEM` 등)',
        'DB 레벨 집계로 대량 데이터 메모리 초과 방지 확인'
      ),
      D: makeDevNodeSpec(
        'D',
        '4. 다차원 피벗 · 소계 집계',
        '행/열 차원 축(기간, 계정, 조직)에 맞춰 크로스탭 매트릭스와 소계·증감률을 계산합니다.',
        '3번 원천 데이터 추출 또는 6번 축 전환 요청',
        '1. 기간/차원 축 기준 동적 컬럼 매핑\n2. 행 합계·열 합계 및 전월 대비 증감률 계산',
        '동적 내부 테이블 (`CL_ABAP_STRUCTDESCR`)',
        '동적 피벗 컬럼 생성 시 통화(`WAERS`) 참조 연결 확인'
      ),
      E: makeDevNodeSpec(
        'E',
        '5. 피벗 ALV 출력 / 0100 PBO',
        '계산된 크로스탭 피벗 결과를 ALV 그리드에 출력하고 정렬·소계를 표시합니다.',
        '4번 피벗 집계 완료',
        '1. 동적 필드카탈로그(`DO_SUM = X`) 생성\n2. `SET_TABLE_FOR_FIRST_DISPLAY` 호출',
        '`CL_GUI_ALV_GRID`, `LVC_T_FCAT`',
        '가로 컬럼 수가 많아질 때 수평 스크롤 및 틀고정(`KEY = X`) 확인'
      ),
      F: makeDevNodeSpec(
        'F',
        '6. 동적 슬라이서 · 명령',
        '사용자의 행/열 축 변경, 필터 재적용, 엑셀 다운로드, 종료 명령을 분기합니다.',
        '피벗 화면에서 사용자 명령 발생',
        '1. 축 전환 요청 시 4번 집계 루틴 재호출\n2. 다운로드(7번) 또는 종료(8번) 분기',
        '`GV_OK_CODE`, 사용자 레이아웃 Variant',
        '축 전환 후에도 선택 조건이 유지되는지 확인'
      ),
      G: makeDevNodeSpec(
        'G',
        '7. 리포트 파일 생성',
        '현재 피벗 집계 표 그대로 엑셀(`.xlsx`) 파일로 내보냅니다.',
        '6번에서 엑셀 다운로드 실행',
        '1. `CL_SALV_EX_RESULT_DATA_TABLE` 또는 `&XXL` 실행\n2. 다운로드 경로 선택 및 완료 알림',
        '표준 ALV Export / SAP GUI File Dialog',
        '수치 금액과 천 단위 서식이 엑셀에서 숫자형으로 유지되는지 확인'
      ),
      H: makeDevNodeSpec(
        'H',
        '8. 종료 / LEAVE TO SCREEN 0',
        '피벗 화면 리소스를 정리하고 종료합니다.',
        '6번에서 F3 / 종료 입력',
        '1. 컨테이너/그리드 `FREE( )`\n2. `LEAVE TO SCREEN 0`',
        'GUI 리소스 해제',
        '반복 실행 후 정상 복귀 확인'
      ),
    },
  },
};

/**
 * Returns effective Mermaid Code and Node Details for any ProgramSpec.
 * Automatically generates module-aware flowcharts when missing and backfills
 * any node missing rich 5-part developer specs.
 */
export function getEffectiveDataFlow(spec: ProgramSpec): {
  mermaidCode: string;
  nodeDetails: Record<string, { label?: string; markdown: string }>;
} {
  const config = spec.data_flow;
  const generated = generateRichDataFlowFromSpec(spec);
  const code = config?.mermaid_code?.trim() || generated.mermaid_code || MERMAID_TEMPLATES.sample_01_standard.code;
  const existingDetails = (config?.node_details || {}) as Record<
    string,
    { label?: string; markdown: string }
  >;

  const parsed = parseMermaidCode(code);
  const nodeDetails: Record<string, { label?: string; markdown: string }> = {
    ...existingDetails,
  };

  parsed.nodes.forEach((n) => {
    const existing = nodeDetails[n.id];
    const generatedNode = generated.node_details?.[n.id];
    const hasRichExisting = existing?.markdown && existing.markdown.trim().length >= 80;
    if (hasRichExisting) {
      nodeDetails[n.id] = {
        label: existing.label || n.label,
        markdown: existing.markdown,
      };
      return;
    }

    const prevNodes = parsed.edges
      .filter((e) => e.to === n.id)
      .map((e) => {
        const src = parsed.nodes.find((pn) => pn.id === e.from);
        return `${e.from}: ${src?.label || e.from}${e.label ? ` (${e.label})` : ''}`;
      });
    const nextNodes = parsed.edges
      .filter((e) => e.from === n.id)
      .map((e) => {
        const dst = parsed.nodes.find((pn) => pn.id === e.to);
        return `${e.to}: ${dst?.label || e.to}${e.label ? ` (${e.label})` : ''}`;
      });

    nodeDetails[n.id] = {
      label: existing?.label || n.label,
      markdown:
        generatedNode?.markdown && generatedNode.label === n.label
          ? generatedNode.markdown
          : buildRichNodeDetailMarkdown(spec, {
              id: n.id,
              label: n.label,
              shape: n.shape,
              prevNodes,
              nextNodes,
            }),
    };
  });

  return {
    mermaidCode: code,
    nodeDetails,
  };
}

/**
 * Robust Mermaid Flowchart parser supporting:
 * - Direction (TD, TB, LR, RL)
 * - Standard nodes: A[Rect], A(Round), A([Stadium]), A{Diamond}, A[(Cylinder)], A[/Trapezoid/]
 * - Arrow connections: -->, -.->, ==>, -->|Label|, -- Label -->
 */
export function parseMermaidCode(code: string): {
  nodes: ParsedMermaidNode[];
  edges: ParsedMermaidEdge[];
  direction: 'TD' | 'LR';
} {
  const nodesMap = new Map<string, ParsedMermaidNode>();
  const edges: ParsedMermaidEdge[] = [];
  let direction: 'TD' | 'LR' = 'TD';

  const clean = code.trim();
  const firstLine = clean.split('\n')[0] || '';
  if (firstLine.includes('LR') || firstLine.includes('RL')) {
    direction = 'LR';
  }

  const extractNodeInfo = (
    token: string
  ): { id: string; label: string; shape: ParsedMermaidNode['shape'] } | null => {
    const s = token.trim();
    if (!s) return null;

    // Cylinder: A[(label)]
    const cylMatch = s.match(/^([A-Za-z0-9_\-]+)\[\((.*?)\)\]$/);
    if (cylMatch) {
      return { id: cylMatch[1], label: cylMatch[2].trim(), shape: 'cylinder' };
    }

    // Stadium: A([label])
    const stadiumMatch = s.match(/^([A-Za-z0-9_\-]+)\(\[(.*?)\]\)$/);
    if (stadiumMatch) {
      return { id: stadiumMatch[1], label: stadiumMatch[2].trim(), shape: 'stadium' };
    }

    // Circle: A((label))
    const circleMatch = s.match(/^([A-Za-z0-9_\-]+)\(\((.*?)\)\)$/);
    if (circleMatch) {
      return { id: circleMatch[1], label: circleMatch[2].trim(), shape: 'circle' };
    }

    // Diamond: A{label}
    const diamondMatch = s.match(/^([A-Za-z0-9_\-]+)\{(.*?)\}$/);
    if (diamondMatch) {
      return { id: diamondMatch[1], label: diamondMatch[2].trim(), shape: 'diamond' };
    }

    // Trapezoid / Parallelogram: A[/label/]
    const trapMatch = s.match(/^([A-Za-z0-9_\-]+)\[\/(.*?)\/\]$/);
    if (trapMatch) {
      return { id: trapMatch[1], label: trapMatch[2].trim(), shape: 'trapezoid' };
    }

    // Rounded: A(label)
    const roundMatch = s.match(/^([A-Za-z0-9_\-]+)\((.*?)\)$/);
    if (roundMatch) {
      return { id: roundMatch[1], label: roundMatch[2].trim(), shape: 'round' };
    }

    // Rect: A[label]
    const rectMatch = s.match(/^([A-Za-z0-9_\-]+)\[(.*?)\]$/);
    if (rectMatch) {
      return { id: rectMatch[1], label: rectMatch[2].trim(), shape: 'rect' };
    }

    // Simple ID without bracket: A
    const simpleMatch = s.match(/^([A-Za-z0-9_\-]+)$/);
    if (simpleMatch) {
      return { id: simpleMatch[1], label: simpleMatch[1], shape: 'rect' };
    }

    return null;
  };

  const registerNode = (nodeInfo: {
    id: string;
    label: string;
    shape: ParsedMermaidNode['shape'];
  }) => {
    const existing = nodesMap.get(nodeInfo.id);
    if (!existing) {
      nodesMap.set(nodeInfo.id, {
        id: nodeInfo.id,
        label: nodeInfo.label || nodeInfo.id,
        shape: nodeInfo.shape,
        rawText: `${nodeInfo.id}[${nodeInfo.label}]`,
      });
    } else {
      if (nodeInfo.label && nodeInfo.label !== nodeInfo.id) {
        existing.label = nodeInfo.label;
      }
      if (nodeInfo.shape !== 'rect') {
        existing.shape = nodeInfo.shape;
      }
    }
  };

  const statements = clean
    .split(/[\n;]/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s &&
        !s.startsWith('graph') &&
        !s.startsWith('flowchart') &&
        !s.startsWith('%%')
    );

  let edgeCounter = 1;

  for (const stmt of statements) {
    const edgeRegex = /(.*?)(-->\|(.*?)\||\-\-(.*?)\-\->|==>|\-\.\->|-->)(.*)/;
    const match = stmt.match(edgeRegex);

    if (match) {
      const leftPart = match[1].trim();
      const edgeSymbol = match[2];
      const pipeLabel = match[3];
      const midLabel = match[4];
      const rightPart = match[5].trim();

      const edgeLabel = (pipeLabel || midLabel || '').trim();
      const isDotted = edgeSymbol.includes('-.');
      const isThick = edgeSymbol.includes('==');

      const leftNode = extractNodeInfo(leftPart);
      const rightNode = extractNodeInfo(rightPart);

      if (leftNode) registerNode(leftNode);
      if (rightNode) registerNode(rightNode);

      if (leftNode && rightNode) {
        edges.push({
          id: `e-${edgeCounter++}`,
          from: leftNode.id,
          to: rightNode.id,
          label: edgeLabel || undefined,
          style: isDotted ? 'dotted' : isThick ? 'thick' : 'normal',
        });
      }
    } else {
      const singleNode = extractNodeInfo(stmt);
      if (singleNode) {
        registerNode(singleNode);
      }
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
    direction,
  };
}

/**
 * Calculates neat layout coordinates for Mermaid nodes
 */
export function layoutMermaidDiagram(
  nodes: ParsedMermaidNode[],
  edges: ParsedMermaidEdge[],
  direction: 'TD' | 'LR' = 'TD'
): LayoutedNode[] {
  if (nodes.length === 0) return [];

  // Map node ID to index of first appearance in the Mermaid statements
  const nodeIndex = new Map<string, number>();
  nodes.forEach((n, idx) => nodeIndex.set(n.id, idx));

  // Identify back-edges: edges that loop backward (or cause cycles)
  // In SAP / Mermaid workflows, nodes are authored in chronological sequence.
  // Any edge pointing backwards in appearance order (or creating a cycle) is a loop-back edge.
  const backEdgeIds = new Set<string>();
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(u: string) {
    visiting.add(u);
    const outEdges = edges.filter((e) => e.from === u);
    for (const e of outEdges) {
      const v = e.to;
      const uIdx = nodeIndex.get(u) ?? 0;
      const vIdx = nodeIndex.get(v) ?? 0;

      if (vIdx <= uIdx || visiting.has(v)) {
        backEdgeIds.add(e.id);
      } else if (!visited.has(v)) {
        dfs(v);
      }
    }
    visiting.delete(u);
    visited.add(u);
  }

  nodes.forEach((n) => {
    if (!visited.has(n.id)) {
      dfs(n.id);
    }
  });

  // Build DAG using strictly forward edges to assign clean, uniform downward layers
  const forwardEdges = edges.filter((e) => !backEdgeIds.has(e.id));
  const incomingForward: Record<string, string[]> = {};
  const outgoingForward: Record<string, string[]> = {};
  nodes.forEach((n) => {
    incomingForward[n.id] = [];
    outgoingForward[n.id] = [];
  });

  forwardEdges.forEach((e) => {
    if (incomingForward[e.to]) incomingForward[e.to].push(e.from);
    if (outgoingForward[e.from]) outgoingForward[e.from].push(e.to);
  });

  // Topological / BFS longest-path on forward DAG
  const inDegree: Record<string, number> = {};
  const nodeLayers: Record<string, number> = {};
  nodes.forEach((n) => {
    inDegree[n.id] = (incomingForward[n.id] || []).length;
    nodeLayers[n.id] = 0;
  });

  const queue: string[] = [];
  nodes.forEach((n) => {
    if (inDegree[n.id] === 0) {
      queue.push(n.id);
      nodeLayers[n.id] = 0;
    }
  });

  while (queue.length > 0) {
    const currId = queue.shift()!;
    const currLayer = nodeLayers[currId] || 0;
    const children = outgoingForward[currId] || [];

    for (const childId of children) {
      nodeLayers[childId] = Math.max(nodeLayers[childId] || 0, currLayer + 1);
      inDegree[childId]--;
      if (inDegree[childId] === 0) {
        queue.push(childId);
      }
    }
  }

  // Handle any nodes not reached by forward roots
  nodes.forEach((n) => {
    if (nodeLayers[n.id] === undefined) {
      nodeLayers[n.id] = 0;
    }
  });

  // Group nodes by layer
  const layersMap: Record<number, ParsedMermaidNode[]> = {};
  nodes.forEach((n) => {
    const l = nodeLayers[n.id];
    if (!layersMap[l]) layersMap[l] = [];
    layersMap[l].push(n);
  });

  const layerIndices = Object.keys(layersMap)
    .map(Number)
    .sort((a, b) => a - b);

  // Compact dimensions per RFQ v1.24 + event-label 1.5x vertical spacing per RFQ v1.25
  const isTD = direction === 'TD';
  const nodeW = 160;
  const standardNodeH = 38; // Compact node height
  const gapX = 32; // Horizontal gap between sibling nodes
  const layerStepY = 70; // Standard uniform vertical pitch between layers
  const labeledLayerStepY = Math.round(layerStepY * 1.5); // 1.5x vertical pitch when arrows carry event text
  const topPadding = 24;
  const sidePadding = 75; // Margin for side-loop curves

  const getNodeDimensions = (node: ParsedMermaidNode): { w: number; h: number } => {
    if (node.shape === 'diamond') {
      return { w: 160, h: 44 };
    }
    if (node.shape === 'cylinder') {
      return { w: 160, h: 42 };
    }
    if (node.shape === 'stadium' || node.shape === 'circle') {
      return { w: 164, h: 36 };
    }
    return { w: nodeW, h: standardNodeH };
  };

  let maxLayerBreadth = 0;
  layerIndices.forEach((l) => {
    const lNodes = layersMap[l];
    const totalW =
      lNodes.reduce((sum, n) => sum + getNodeDimensions(n).w, 0) +
      Math.max(0, lNodes.length - 1) * gapX;
    if (totalW > maxLayerBreadth) maxLayerBreadth = totalW;
  });

  const totalCanvasWidth = Math.max(660, maxLayerBreadth + sidePadding * 2);

  // Compute cumulative Y centers for each layer:
  // If any forward edge spanning between layer[idx] and layer[idx + 1] has label text,
  // increase the vertical step to 1.5x for comfortable breathing room.
  const layerCenterYMap: Record<number, number> = {};
  layerIndices.forEach((layerIndex, i) => {
    if (i === 0) {
      layerCenterYMap[layerIndex] = topPadding;
      return;
    }
    const prevLayerIndex = layerIndices[i - 1];
    const hasLabeledForwardEdge = forwardEdges.some((e) => {
      if (!e.label || !e.label.trim()) return false;
      const fromLayer = nodeLayers[e.from];
      const toLayer = nodeLayers[e.to];
      return fromLayer <= prevLayerIndex && toLayer >= layerIndex;
    });
    const step = hasLabeledForwardEdge ? labeledLayerStepY : layerStepY;
    layerCenterYMap[layerIndex] = layerCenterYMap[prevLayerIndex] + step;
  });

  const layouted: LayoutedNode[] = [];

  layerIndices.forEach((layerIndex) => {
    const layerNodes = layersMap[layerIndex];
    const dims = layerNodes.map((n) => getNodeDimensions(n));
    const layerBreadth =
      dims.reduce((sum, d) => sum + d.w, 0) + Math.max(0, layerNodes.length - 1) * gapX;
    let cursorX = (totalCanvasWidth - layerBreadth) / 2;
    const layerCenterY = layerCenterYMap[layerIndex] ?? topPadding;

    layerNodes.forEach((node, idx) => {
      const { w, h } = dims[idx];

      const x = isTD
        ? Math.round(cursorX)
        : Math.round(sidePadding + layerIndex * (nodeW + gapX));
      const y = isTD
        ? Math.round(layerCenterY - h / 2)
        : Math.round(topPadding + idx * (standardNodeH + 20));

      cursorX += w + gapX;

      layouted.push({
        ...node,
        x,
        y,
        width: w,
        height: h,
        layer: layerIndex,
      });
    });
  });

  return layouted;
}

interface MermaidFlowChartSvgProps {
  mermaidCode?: string;
  nodeDetails?: Record<string, { label?: string; markdown: string }>;
  selectedNodeId?: string | null;
  onSelectNode?: (nodeId: string) => void;
  readOnly?: boolean;
  scale?: number;
  className?: string;
  fitToWidth?: boolean;
}

/**
 * Clean, high-fidelity SVG renderer for Mermaid Flowcharts.
 * Fully compatible with screen display, full-screen modals, and A4 print/PDF exports.
 */
export const MermaidFlowChartSvg: React.FC<MermaidFlowChartSvgProps> = ({
  mermaidCode = '',
  nodeDetails = {},
  selectedNodeId,
  onSelectNode,
  readOnly = false,
  scale = 1,
  className = '',
  fitToWidth = false,
}) => {
  const { t } = useLanguage();
  const parsed = useMemo(() => parseMermaidCode(mermaidCode), [mermaidCode]);
  const layoutedNodes = useMemo(
    () => layoutMermaidDiagram(parsed.nodes, parsed.edges, parsed.direction),
    [parsed]
  );

  const svgBounds = useMemo(() => {
    if (layoutedNodes.length === 0) return { width: 500, height: 300 };
    let maxX = 0;
    let maxY = 0;
    layoutedNodes.forEach((n) => {
      const right = n.x + n.width + 65;
      const bottom = n.y + n.height + 35;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    });
    return {
      width: Math.max(660, maxX),
      height: Math.max(260, maxY),
    };
  }, [layoutedNodes]);

  if (layoutedNodes.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 text-xs italic">
        {t('Flowchart diagram code is empty.', '흐름도 다이어그램 코드가 비어 있습니다.')}
      </div>
    );
  }

  const markerId = `mermaid-arrow-${readOnly ? 'ro' : 'edit'}`;
  const glowId = `node-glow-${readOnly ? 'ro' : 'edit'}`;

  return (
    <svg
      viewBox={`0 0 ${svgBounds.width} ${svgBounds.height}`}
      width={fitToWidth ? '100%' : svgBounds.width * scale}
      height={fitToWidth ? undefined : svgBounds.height * scale}
      className={`select-none mx-auto block ${className}`}
      style={{
        maxWidth: '100%',
        height: fitToWidth ? 'auto' : undefined,
      }}
    >
      <defs>
        {/* Arrow marker */}
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
        </marker>
        {/* Active node glow filter */}
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#3b82f6" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* Draw Edges */}
      {parsed.edges.map((edge) => {
        const source = layoutedNodes.find((n) => n.id === edge.from);
        const target = layoutedNodes.find((n) => n.id === edge.to);
        if (!source || !target) return null;

        const isSelectedEdge =
          selectedNodeId === edge.from || selectedNodeId === edge.to;

        const isBackEdge = target.layer <= source.layer || target.y <= source.y + 10;

        let pathD = '';
        let labelX = 0;
        let labelY = 0;

        if (isBackEdge) {
          // Backward loop edge: route around the side gracefully without crossing over nodes
          const routeLeft = source.x <= svgBounds.width / 2;

          if (routeLeft) {
            // Route along the left side
            const startX = source.x;
            const startY = source.y + source.height / 2;
            const endX = target.x;
            const endY = target.y + target.height / 2;
            const curveX = Math.min(startX, endX) - 45;

            pathD = `M ${startX} ${startY} C ${curveX} ${startY}, ${curveX} ${endY}, ${endX} ${endY}`;
            labelX = curveX + 4;
            labelY = (startY + endY) / 2;
          } else {
            // Route along the right side
            const startX = source.x + source.width;
            const startY = source.y + source.height / 2;
            const endX = target.x + target.width;
            const endY = target.y + target.height / 2;
            const curveX = Math.max(startX, endX) + 45;

            pathD = `M ${startX} ${startY} C ${curveX} ${startY}, ${curveX} ${endY}, ${endX} ${endY}`;
            labelX = curveX - 4;
            labelY = (startY + endY) / 2;
          }
        } else {
          // Forward edge: flows downward
          const startX = source.x + source.width / 2;
          const startY = source.y + source.height;
          const endX = target.x + target.width / 2;
          const endY = target.y;

          if (Math.abs(startX - endX) < 2) {
            // Perfectly straight vertical line (uniform pitch)
            pathD = `M ${startX} ${startY} L ${endX} ${endY}`;
          } else {
            // Smooth vertical S-curve
            const midY = (startY + endY) / 2;
            pathD = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
          }

          labelX = (startX + endX) / 2;
          labelY = (startY + endY) / 2;
        }

        return (
          <g key={edge.id} className="transition-all">
            <path
              d={pathD}
              fill="none"
              stroke={isSelectedEdge ? '#2563eb' : '#94a3b8'}
              strokeWidth={isSelectedEdge ? 2.2 : 1.5}
              strokeDasharray={edge.style === 'dotted' ? '4 4' : undefined}
              markerEnd={`url(#${markerId})`}
            />

            {/* Edge label badge */}
            {edge.label && (
              <g transform={`translate(${labelX}, ${labelY})`}>
                <rect
                  x={-Math.max(16, edge.label.length * 5)}
                  y="-9"
                  width={Math.max(32, edge.label.length * 10)}
                  height="18"
                  rx="9"
                  fill="#ffffff"
                  stroke={isSelectedEdge ? '#93c5fd' : '#cbd5e1'}
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y="3"
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill={isSelectedEdge ? '#1d4ed8' : '#475569'}
                  fontFamily="sans-serif"
                >
                  {edge.label}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {/* Draw Nodes */}
      {layoutedNodes.map((node) => {
        const isSelected = selectedNodeId === node.id;
        const hasDetail = !!nodeDetails[node.id]?.markdown?.trim();

        return (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            onClick={() => {
              if (onSelectNode) onSelectNode(node.id);
            }}
            className={onSelectNode ? 'cursor-pointer group' : ''}
            filter={isSelected ? `url(#${glowId})` : undefined}
          >
            {/* Shape rendering */}
            {node.shape === 'diamond' ? (
              // Diamond (Decision)
              <polygon
                points={`${node.width / 2},0 ${node.width},${node.height / 2} ${node.width / 2},${node.height} 0,${node.height / 2}`}
                fill={isSelected ? '#eff6ff' : '#ffffff'}
                stroke={isSelected ? '#2563eb' : '#64748b'}
                strokeWidth={isSelected ? '2.5' : '1.5'}
                className="transition-colors group-hover:stroke-blue-500"
              />
            ) : node.shape === 'cylinder' ? (
              // Cylinder (Database)
              <g>
                <rect
                  x="0"
                  y="7"
                  width={node.width}
                  height={node.height - 7}
                  rx="5"
                  fill={isSelected ? '#eff6ff' : '#ffffff'}
                  stroke={isSelected ? '#2563eb' : '#0284c7'}
                  strokeWidth={isSelected ? '2.5' : '1.5'}
                />
                <ellipse
                  cx={node.width / 2}
                  cy="7"
                  rx={node.width / 2}
                  ry="6"
                  fill={isSelected ? '#dbeafe' : '#f0f9ff'}
                  stroke={isSelected ? '#2563eb' : '#0284c7'}
                  strokeWidth={isSelected ? '2.5' : '1.5'}
                />
              </g>
            ) : node.shape === 'stadium' ? (
              // Stadium / Capsule (Start / End)
              <rect
                x="0"
                y="0"
                width={node.width}
                height={node.height}
                rx={node.height / 2}
                fill={isSelected ? '#eff6ff' : '#ffffff'}
                stroke={isSelected ? '#2563eb' : '#059669'}
                strokeWidth={isSelected ? '2.5' : '1.5'}
                className="transition-colors group-hover:stroke-emerald-600"
              />
            ) : node.shape === 'round' ? (
              // Rounded Rect
              <rect
                x="0"
                y="0"
                width={node.width}
                height={node.height}
                rx="14"
                fill={isSelected ? '#eff6ff' : '#ffffff'}
                stroke={isSelected ? '#2563eb' : '#64748b'}
                strokeWidth={isSelected ? '2.5' : '1.5'}
                className="transition-colors group-hover:stroke-blue-500"
              />
            ) : (
              // Default Rectangle (Process)
              <rect
                x="0"
                y="0"
                width={node.width}
                height={node.height}
                rx="4"
                fill={isSelected ? '#eff6ff' : '#ffffff'}
                stroke={isSelected ? '#2563eb' : '#64748b'}
                strokeWidth={isSelected ? '2.5' : '1.5'}
                className="transition-colors group-hover:stroke-blue-500"
              />
            )}

            {/* Node ID Badge in top-left */}
            <g transform="translate(6, 6)">
              <rect
                x="0"
                y="0"
                width={Math.max(18, node.id.length * 7 + 6)}
                height="14"
                rx="3"
                fill={isSelected ? '#2563eb' : '#e2e8f0'}
              />
              <text
                x={Math.max(9, (node.id.length * 7 + 6) / 2)}
                y="10"
                textAnchor="middle"
                fontSize="9"
                fontWeight="700"
                fill={isSelected ? '#ffffff' : '#334155'}
                fontFamily="monospace"
              >
                {node.id}
              </text>
            </g>

            {/* Has Detailed Specification indicator dot */}
            {hasDetail && (
              <circle
                cx={node.width - 8}
                cy="8"
                r="3.5"
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="1"
              />
            )}

            {/* Node Text Label */}
            <text
              x={node.width / 2}
              y={node.height / 2 + (node.shape === 'cylinder' ? 4 : 3)}
              textAnchor="middle"
              fontSize="11"
              fontWeight={isSelected ? '700' : '600'}
              fill={isSelected ? '#1e3a8a' : '#1e293b'}
              fontFamily="sans-serif"
            >
              {node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
