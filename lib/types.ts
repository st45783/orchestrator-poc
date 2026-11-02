// Design Ref: §2.1, §4.1, §4.2 — 업무·도구·패널·API 모양을 한 곳에 모아 모든 모듈이 같은 기준을 쓰게 한다.
// 브라우저와 서버가 함께 쓰므로 비밀 값이나 서버 전용 코드는 넣지 않는다.

/** 업무 코드 5개. 이 목록 밖의 업무는 만들지 않는다 (PRD must ① 규칙 1). */
export const DOMAINS = ["hr", "finance", "sales", "security", "dev"] as const;
export type Domain = (typeof DOMAINS)[number];

/** 화면에 보이는 업무 이름 */
export const DOMAIN_LABELS: Record<Domain, string> = {
  hr: "인사",
  finance: "재무",
  sales: "영업",
  security: "보안",
  dev: "개발",
};

/** 서브 에이전트가 쓰는 도구 2가지: 합성 DB, 가짜 API */
export const TOOLS = ["db", "mock_api"] as const;
export type Tool = (typeof TOOLS)[number];

/** 화면에 보이는 도구 이름 */
export const TOOL_LABELS: Record<Tool, string> = {
  db: "합성 DB",
  mock_api: "가짜 API",
};

/** 문자열이 업무 코드인지 확인한다 (AI 응답 검사용). */
export function isDomain(value: unknown): value is Domain {
  return typeof value === "string" && (DOMAINS as readonly string[]).includes(value);
}

/** 문자열이 도구 이름인지 확인한다 (AI 응답 검사용). */
export function isTool(value: unknown): value is Tool {
  return typeof value === "string" && (TOOLS as readonly string[]).includes(value);
}

// ── 오케스트레이터 (DESIGN §4.1) ──────────────────────────────

/** 오케스트레이터 판단 결과: 호출 / 되묻기 / 데이터 기간 밖 */
export type OrchestratorAction = "route" | "clarify" | "out_of_range";

/** 오케스트레이터가 서브 에이전트에게 맡기는 호출 1건 */
export type DomainCall = {
  domain: Domain;
  tool: Tool;
  /** 서브 에이전트가 할 일 (자연어) */
  task: string;
  /** DB에 쓰기(등록·수정·삭제)를 허용할지. 서버가 원문 질문을 보고 최종 결정한다 */
  write: boolean;
};

/** OpenAI 호출 ①(질문 분석)의 출력 모양 */
export type RoutingDecision = {
  action: OrchestratorAction;
  /** 판단 이유 한 문장 (50자 이내) */
  reason: string;
  /** 되묻기 문장 (action이 clarify일 때만) */
  clarifyMessage?: string;
  calls: DomainCall[];
};

// ── 판단 과정 패널 (DESIGN §1 ⑤, §2.1) ───────────────────────

/** 패널의 업무 상태: 호출됨 / 해당 없음 두 가지뿐 (PRD must ① 패널 규칙) */
export type PanelStatus = "called" | "skipped";

/** 응답 종류: 답변 / 되묻기 / 데이터 기간 밖 */
export type ResponseOutcome = "answered" | "clarify" | "out_of_range";

/** 한 업무 안에서 실제로 사용한 도구 1개의 기록 */
export type PanelToolRecord = {
  tool: Tool;
  /** 조회한 테이블 (합성 DB일 때) */
  tables?: string[];
  /** 실제로 실행한 SQL 원문 (합성 DB일 때) */
  sql?: string[];
  /** 가짜 API가 돌려준 안내 문구 (가짜 API일 때) */
  message?: string;
};

/** 패널의 업무 한 줄. 패널은 5개 업무를 항상 모두 보여준다 */
export type PanelDomain = {
  domain: Domain;
  label: string;
  status: PanelStatus;
  /** 실제 호출 기록에서 만든다. status가 skipped면 없음 */
  tools?: PanelToolRecord[];
};

export type DecisionPanel = {
  outcome: ResponseOutcome;
  /** 판단 이유 한 문장 (50자 이내) */
  reason: string;
  domains: PanelDomain[];
};

// ── 서버 API /api/chat (DESIGN §2.1) ─────────────────────────

export type ChatRequest = {
  question: string;
  /** 허용 목록에 있는 모델 이름 */
  model: string;
};

export type ChatSuccessResponse = {
  answer: string;
  panel: DecisionPanel;
};

export type ChatErrorResponse = {
  error: string;
};

export type ChatResponse = ChatSuccessResponse | ChatErrorResponse;
