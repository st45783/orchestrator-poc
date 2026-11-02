// PLAN 작업 9 — 쿼리 전용 에이전트. 업무 DB 설명서를 읽고 SQL을 만들어 실행한다.
// Design Ref: §4.3 — 설명서의 테이블·컬럼만 사용(규칙 1), 실패 시 오류를 알려 최대 2번 고쳐 다시 실행(규칙 3).
import "server-only";
import { z } from "zod";
import type { Domain } from "../types.ts";
import { SCHEMA_DOCS } from "../db/schema-docs.ts";
import { runDomainQuery, type QueryResult } from "../db/run-query.ts";
import { askStructured } from "../openai.ts";

const MAX_RETRIES = 2;

const sqlSchema = z.object({
  sql: z.string().describe("실행할 PostgreSQL 문장 1개. 세미콜론·주석 없이."),
});

export type QueryAgentResult = {
  /** 실행에 성공한 SQL (패널에 그대로 표시) */
  sql: string;
  /** SQL이 사용한 테이블·뷰 이름 */
  tables: string[];
  result: QueryResult;
};

/** SQL이 모두 실패해 정해진 오류 문구로 바꿔야 하는 경우 */
export class QueryAgentError extends Error {}

function systemPrompt(domain: Domain, write: boolean): string {
  return `너는 PostgreSQL 조회문을 만드는 쿼리 전용 에이전트다.
아래 DB 설명서에 적힌 테이블과 컬럼만 쓴다. 설명서에 없는 이름은 절대 지어내지 않는다.

규칙:
- PostgreSQL 문장 딱 1개만 쓴다. 세미콜론(;)과 주석은 쓰지 않는다.
- ${write
    ? "데이터 변경 요청이다. INSERT, UPDATE, DELETE 중 하나만 쓰고, 끝에 RETURNING * 을 붙인다. 허용 값·날짜 범위를 지킨다."
    : "조회 요청이다. SELECT(또는 WITH)만 쓴다. 데이터를 바꾸지 않는다."}
- 건수·합계·평균처럼 집계로 답할 수 있으면 집계 SQL을 쓴다.
- 결과 컬럼에는 사람이 알아볼 수 있는 이름을 붙인다 (예: count(*) as 인원수).
- 직원 이름이 필요하면 직원 번호를 staff(또는 employees)와 연결해 이름을 가져온다.
- 결과 행 수는 서버가 100행으로 제한하므로 LIMIT은 질문이 요구할 때만 쓴다.

${SCHEMA_DOCS[domain]}`;
}

/** 쿼리에 쓰인 테이블 이름을 설명서 기준으로 찾는다 (패널 표시용) */
function tablesUsed(domain: Domain, sql: string): string[] {
  const known = [...SCHEMA_DOCS[domain].matchAll(/^## (\w+)/gm)].map((m) => m[1]);
  return known.filter((name) => new RegExp(`\\b${name}\\b`, "i").test(sql));
}

export async function runQueryAgent(params: {
  domain: Domain;
  task: string;
  write: boolean;
  model: string;
  signal?: AbortSignal;
}): Promise<QueryAgentResult> {
  const { domain, task, write, model, signal } = params;
  const failures: string[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const retryNote = failures.length
      ? `\n\n앞에서 실패한 시도:\n${failures.join("\n")}\n오류를 고친 새 SQL을 써라.`
      : "";
    const { sql } = await askStructured({
      model,
      name: "sql_query",
      system: systemPrompt(domain, write),
      user: `할 일: ${task}${retryNote}`,
      schema: sqlSchema,
      signal,
    });
    try {
      const result = await runDomainQuery(domain, sql, write);
      return { sql: sql.trim().replace(/;\s*$/, ""), tables: tablesUsed(domain, sql), result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`- SQL: ${sql}\n  오류: ${message}`);
      console.error(`[query-agent] ${domain} 시도 ${attempt + 1} 실패: ${message}`);
    }
  }
  throw new QueryAgentError(`${domain} 쿼리가 ${MAX_RETRIES + 1}번 모두 실패했습니다`);
}
