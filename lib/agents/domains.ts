// PLAN 작업 11 — 업무 서브 에이전트 5개. 오케스트레이터가 정한 도구(합성 DB·가짜 API)를 그대로 부르고,
// 결과와 실제 호출 기록을 함께 돌려준다.
// Design Ref: §4.2 — 얇은 연결 역할. 패널은 이 호출 기록으로 만든다 (PRD must ① 규칙 8).
import "server-only";
import type { DomainCall, PanelToolRecord } from "../types.ts";
import { callMockApi } from "../mock-api.ts";
import { truncationNotice } from "../db/run-query.ts";
import { runQueryAgent } from "./query-agent.ts";

export type DomainCallResult = {
  call: DomainCall;
  /** 패널에 그대로 들어가는 실제 호출 기록 */
  record: PanelToolRecord;
  /** 답 합치기에 넘기는 데이터 */
  data: unknown;
  /** 답 뒤에 서버가 원문 그대로 붙일 문구 ("(가상)" 안내, 100건 안내) */
  notices: string[];
};

export async function runDomainCall(
  call: DomainCall,
  ctx: { model: string; signal?: AbortSignal },
): Promise<DomainCallResult> {
  if (call.tool === "mock_api") {
    const record = callMockApi(call.domain);
    return { call, record, data: { message: record.message }, notices: [record.message ?? ""] };
  }

  const { sql, tables, result } = await runQueryAgent({
    domain: call.domain,
    task: call.task,
    write: call.write,
    model: ctx.model,
    signal: ctx.signal,
  });
  const notices = result.truncated && result.total != null ? [truncationNotice(result.total)] : [];
  return {
    call,
    record: { tool: "db", tables, sql: [sql] },
    data: call.write
      ? { 바뀐_행_수: result.affected, 결과: result.rows }
      : { 전체_건수: result.total, 행: result.rows },
    notices,
  };
}
