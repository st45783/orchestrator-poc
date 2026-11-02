// PLAN 작업 12·13 — 오케스트레이터. 질문을 분석해 업무·도구를 고르고, 서브 에이전트를 동시에 부른 뒤
// 받은 데이터만으로 답을 합친다. 판단 과정 패널은 실제 호출 기록으로 만든다.
// Design Ref: §2 데이터 흐름, §4.1 오케스트레이터
import "server-only";
import { z } from "zod";
import {
  DOMAINS,
  DOMAIN_LABELS,
  TOOLS,
  TOOL_LABELS,
  type ChatSuccessResponse,
  type DecisionPanel,
  type Domain,
  type DomainCall,
  type PanelDomain,
  type PanelToolRecord,
} from "../types.ts";
import { MOCK_APIS } from "../mock-api.ts";
import { askStructured } from "../openai.ts";
import { runDomainCall, type DomainCallResult } from "./domains.ts";

/** 판단 이유 최대 길이 (PRD must ① 규칙 7) */
const REASON_MAX = 50;
/** 기본 되묻기 문장 (PRD must ① 규칙 3 예시) */
export const DEFAULT_CLARIFY_MESSAGE =
  "업무 정보를 조회하는 서비스입니다. 인사·재무·영업·보안·개발 중 어떤 내용을 찾으시나요?";
/** 데이터 기간 밖 안내 (PRD must ① 규칙 6) */
export const OUT_OF_RANGE_MESSAGE = "2026-01~2026-10 데이터만 있습니다";
/** 쓰기(등록·수정·삭제)를 허용하는 질문 표현 (DESIGN §4.1 쓰기 허용 검사) */
const WRITE_WORDS = /(등록|추가|넣어|수정|변경|바꿔|바꾸|고쳐|삭제|지워|제거|취소)/;

const routingSchema = z.object({
  action: z.enum(["route", "clarify", "out_of_range"]),
  reason: z.string().describe("판단 이유 한 문장, 50자 이내"),
  clarify_message: z.string().describe("action이 clarify일 때 되묻는 문장. 아니면 빈 문자열"),
  calls: z.array(
    z.object({
      domain: z.enum(DOMAINS),
      tool: z.enum(TOOLS),
      task: z.string().describe("서브 에이전트가 할 일. 질문에서 이 업무에 해당하는 부분만 구체적으로"),
      write: z.boolean().describe("합성 DB의 데이터를 등록·수정·삭제해야 하면 true"),
    }),
  ),
});

const mockApiLines = DOMAINS.map((d) => `  - ${d}: ${MOCK_APIS[d].action}`).join("\n");

const ROUTING_PROMPT = `너는 사내 업무 정보 서비스의 오케스트레이터다. 직원의 질문을 보고 어느 업무의 어떤 도구를 부를지 정한다.

업무 (이 5개만 쓴다. 목록에 없는 업무는 만들지 않는다):
- hr(인사): 직원 50명(이름·부서·직급·입사일), 부서별 인원·명단, 휴가 내역(연차·반차·병가·경조사)
  예: 인원, 직원 수, 몇 명, 명단, 입사, 직급, 휴가
- finance(재무): 월별 손익(매출·비용·인건비·영업이익), 부서별 월 예산·집행액(인건비·운영비)
  예: 매출, 비용, 인건비, 운영비, 예산, 집행, 영업이익, 손익
- sales(영업): 고객사 30곳(이름·업종·지역), 계약 100건(일자·금액·담당자·진행 단계: 문의·제안·협상·계약·실패)
  예: 고객사, 지역별 고객, 계약, 수주, 성사, 문의, 제안, 협상, 영업 담당자
- security(보안): 보안 점검·사고 이력(유형·심각도·조치 상태), 시스템 권한 요청(ERP·VPN·그룹웨어 등)
  예: 보안 사고, 점검, 모의 해킹, 피싱, 악성코드, 조치, 권한 요청, VPN
- dev(개발): 프로젝트 10개, 이슈 150건(상태·우선순위·담당자)
  예: 프로젝트, 이슈, 버그, 우선순위, 개발 담당자

부서 이름에 속지 않는다:
- "영업팀 인원", "보안팀 직원 수", "개발팀 명단"처럼 인원·직원·명단·입사·직급은 어느 팀 이름이 붙어도 항상 hr이다.
- "개발팀 인건비", "영업팀 운영비"처럼 인건비·운영비·예산·집행액은 어느 팀 이름이 붙어도 항상 finance다.
- 영업(sales)·보안(security)·개발(dev) 업무에는 인원·인건비 데이터가 없다.

도구:
- db(합성 DB): 정보를 묻는 질문("~알려줘", "몇 명", "얼마", "목록", "내역")과,
  기존 기록(번호가 있는 휴가·예산·계약·권한 요청·이슈 등)을 등록·수정·삭제해 달라는 분명한 요청
- mock_api(가짜 API): 아래 5가지 작업을 새로 해 달라는 요청일 때만. "휴가 등록해줘"처럼 표현이 달라도 새 휴가 신청이면 mock_api
${mockApiLines}
  기존 기록의 상태를 바꾸는 요청(예: "권한 요청 3번을 승인으로 수정해줘")은 mock_api가 아니라 db 쓰기다.

규칙:
1. 질문에 필요한 업무를 모두 고른다. 두 업무 이상에 걸친 질문이면 각각 호출한다. 필요하면 5개 모두 호출한다.
   예: "개발팀 인원과 이번 달 인건비" → hr(개발팀 인원) + finance(개발팀 이번 달 인건비)
   예: "영업팀 직원 수와 성사된 계약 금액" → hr(영업팀 직원 수) + sales(성사된 계약 금액)
   예: "업무별 데이터 건수 알려줘" → 5개 업무 모두
2. 위 예시 단어처럼 업무가 하나로 정해지면 되묻지 말고 바로 호출한다.
   5개 업무 어디에도 해당하지 않거나(예: 점심 메뉴, 날씨), 정말로 어느 업무인지 알 수 없을 때만
   추측해서 호출하지 말고 action = clarify 로 되묻는다.
   되묻는 문장 예: "${DEFAULT_CLARIFY_MESSAGE}"
3. 데이터 기준일은 2026-10-31, "이번 달"은 2026년 10월이다. 데이터는 2026-01~2026-10만 있다.
   2025년 이전, 2026년 11~12월, 2027년 이후를 묻는 질문은 호출하지 말고 action = out_of_range 로 한다.
4. 가짜 API 작업은 확인 없이 바로 호출한다.
5. task에는 그 업무가 할 일을 질문에서 뽑아 구체적으로 적는다 (다른 업무 내용은 넣지 않는다).
6. write는 db 도구로 데이터를 등록·수정·삭제할 때만 true다. 조회는 false.
7. reason은 왜 그 업무·도구를 골랐는지 한국어 한 문장, 50자 이내로 쓴다.
   업무는 한글 이름(인사·재무·영업·보안·개발), 도구는 "합성 DB"·"가짜 API"로 쓴다. hr·db 같은 코드는 쓰지 않는다.
   예: "인원 수는 인사, 인건비는 재무 정보라서 두 업무를 호출함"
8. clarify·out_of_range이면 calls는 빈 배열이다.`;

const COMPOSE_PROMPT = `너는 사내 업무 정보 서비스의 답변 작성자다. 직원의 질문에 업무별 조회 결과만 써서 한국어로 답한다.

규칙:
- 아래 결과에 있는 숫자·이름만 쓴다. 결과에 없는 숫자나 이름을 지어내지 않는다.
- 결과가 비어 있으면 "해당 데이터가 없습니다"라고 말한다.
- 결과가 온 업무는 빠짐없이 각각 한 번 이상 답에 반영한다.
- 금액은 읽기 쉽게 쉼표를 넣어 원 단위로 쓴다 (예: 85,200,000원).
- 2~4문장으로 짧게 답한다. 목록이 필요하면 짧은 목록을 쓴다.
- "(가상)" 안내 문구나 "총 ○건 중 100건만 보여줍니다" 같은 안내는 쓰지 않는다. 서버가 따로 붙인다.`;

const composeSchema = z.object({ answer: z.string() });

function shortenReason(reason: string): string {
  const text = reason.trim();
  return text.length <= REASON_MAX ? text : `${text.slice(0, REASON_MAX - 1)}…`;
}

/** 실행 기록으로 5개 업무 패널을 만든다. 호출 기록이 없는 업무는 "해당 없음". */
function buildPanel(outcome: DecisionPanel["outcome"], reason: string, results: DomainCallResult[]): DecisionPanel {
  const domains: PanelDomain[] = DOMAINS.map((domain) => {
    const tools: PanelToolRecord[] = results.filter((r) => r.call.domain === domain).map((r) => r.record);
    return tools.length
      ? { domain, label: DOMAIN_LABELS[domain], status: "called", tools }
      : { domain, label: DOMAIN_LABELS[domain], status: "skipped" };
  });
  return { outcome, reason: shortenReason(reason), domains };
}

/** AI가 고른 호출 목록을 서버 규칙으로 정리한다. */
function sanitizeCalls(question: string, calls: z.infer<typeof routingSchema>["calls"]): DomainCall[] {
  const allowWrite = WRITE_WORDS.test(question);
  const seen = new Set<string>();
  const result: DomainCall[] = [];
  for (const c of calls) {
    const key = `${c.domain}:${c.tool}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // 쓰기는 합성 DB이고, 질문에 등록·수정·삭제 표현이 있을 때만 허용한다 (must ② 규칙 4)
    result.push({ domain: c.domain as Domain, tool: c.tool, task: c.task, write: c.tool === "db" && c.write && allowWrite });
  }
  return result;
}

export async function orchestrate(question: string, model: string, signal?: AbortSignal): Promise<ChatSuccessResponse> {
  // ① 질문 분석
  const routing = await askStructured({
    model,
    name: "routing_decision",
    system: ROUTING_PROMPT,
    user: question,
    schema: routingSchema,
    signal,
  });

  if (routing.action === "out_of_range") {
    return { answer: OUT_OF_RANGE_MESSAGE, panel: buildPanel("out_of_range", routing.reason, []) };
  }
  const calls = routing.action === "route" ? sanitizeCalls(question, routing.calls) : [];
  if (calls.length === 0) {
    const message = routing.clarify_message.trim() || DEFAULT_CLARIFY_MESSAGE;
    const reason = routing.reason.trim() || "질문이 어느 업무인지 알 수 없어 되물음";
    return { answer: message, panel: buildPanel("clarify", reason, []) };
  }

  // ② 업무 서브 에이전트 동시 호출
  const results = await Promise.all(calls.map((call) => runDomainCall(call, { model, signal })));

  // ③ 답 합치기 (가짜 API만 불렀다면 생략)
  let answer = "";
  if (results.some((r) => r.call.tool === "db")) {
    const data = results
      .filter((r) => r.call.tool === "db")
      .map((r) => ({ 업무: DOMAIN_LABELS[r.call.domain], 도구: TOOL_LABELS[r.call.tool], 할_일: r.call.task, 결과: r.data }));
    const composed = await askStructured({
      model,
      name: "final_answer",
      system: COMPOSE_PROMPT,
      user: `질문: ${question}\n\n업무별 결과(JSON):\n${JSON.stringify(data, null, 2)}`,
      schema: composeSchema,
      signal,
    });
    answer = composed.answer.trim();
  }

  // 정해진 문구는 서버가 원문 그대로 붙인다
  const notices = results.flatMap((r) => r.notices).filter(Boolean);
  answer = [answer, ...notices].filter(Boolean).join("\n\n");

  return { answer, panel: buildPanel("answered", routing.reason, results) };
}
