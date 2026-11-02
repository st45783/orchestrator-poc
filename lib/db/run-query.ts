// PLAN 작업 10 — 쿼리 안전장치. AI가 만든 SQL을 업무별 권한·읽기 전용·100행 제한 안에서만 실행한다.
// Design Ref: §4.3 — 규칙을 프롬프트에만 맡기지 않고 코드와 DB 권한으로 강제한다 (CLAUDE.md §6).
import "server-only";
import type { Domain } from "../types.ts";
import { getDb } from "./client.ts";

export const MAX_ROWS = 100;
const STATEMENT_TIMEOUT_MS = 5_000;

/** 실행 전에 막은 SQL. 메시지는 AI에게 돌려줘 고치게 한다. */
export class QueryBlockedError extends Error {}

export type QueryResult = {
  /** 조회 결과 행 (최대 100행) 또는 쓰기의 RETURNING 결과 */
  rows: Record<string, unknown>[];
  /** 조회일 때 전체 건수 */
  total?: number;
  /** 100행을 넘어 잘렸는지 */
  truncated?: boolean;
  /** 쓰기일 때 바뀐 행 수 */
  affected?: number;
};

/** 사용자에게 보여줄 100건 안내 문구 (PRD must ② 규칙 2) */
export function truncationNotice(total: number): string {
  return `총 ${total}건 중 ${MAX_ROWS}건만 보여줍니다`;
}

/** 실행 전 검사: 문장 1개, 주석 없음, 조회는 SELECT/WITH만, 쓰기는 INSERT/UPDATE/DELETE만 */
export function checkSql(raw: string, write: boolean): string {
  const text = raw.trim().replace(/;\s*$/, "").trim();
  if (!text) throw new QueryBlockedError("SQL이 비어 있습니다.");
  if (text.includes(";")) throw new QueryBlockedError("SQL은 한 문장만 쓸 수 있습니다. 세미콜론(;)을 쓰지 마세요.");
  if (text.includes("--") || text.includes("/*")) throw new QueryBlockedError("SQL에 주석을 쓰지 마세요.");

  const first = text.match(/^\w+/)?.[0].toLowerCase();
  if (write) {
    if (!["insert", "update", "delete"].includes(first ?? "")) {
      throw new QueryBlockedError("데이터 변경 요청이므로 INSERT, UPDATE, DELETE 중 하나로 시작해야 합니다.");
    }
  } else if (!["select", "with"].includes(first ?? "")) {
    throw new QueryBlockedError("조회 요청이므로 SELECT(또는 WITH)로 시작하는 조회문만 쓸 수 있습니다. 데이터를 바꾸지 마세요.");
  }
  if (/\b(drop|alter|truncate|create|grant|revoke|copy|vacuum|reindex|comment)\b/i.test(text)) {
    throw new QueryBlockedError("테이블 구조나 권한을 바꾸는 문장은 쓸 수 없습니다.");
  }
  return text;
}

/**
 * 업무 하나의 SQL을 실행한다.
 * - 트랜잭션마다 업무 역할(agent_{업무})과 검색 경로를 설정한다. 연결 풀러는 트랜잭션이 끝나면 설정을 잊는다.
 * - 조회는 읽기 전용 트랜잭션: 쓰기 SQL이 들어와도 DB가 거부한다.
 * - 다른 업무 테이블은 역할 권한이 없어 DB가 거부한다.
 */
export async function runDomainQuery(domain: Domain, raw: string, write: boolean): Promise<QueryResult> {
  const text = checkSql(raw, write);
  const sql = getDb();
  return sql.begin(write ? "read write" : "read only", async (tx) => {
    // domain은 5개 업무 코드 중 하나로 검사된 값이다
    await tx.unsafe(`set local role agent_${domain}`);
    await tx.unsafe(`set local search_path to ${domain}`);
    await tx.unsafe(`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

    if (write) {
      const result = await tx.unsafe(text);
      return { rows: [...result], affected: result.count };
    }
    const [{ total }] = await tx.unsafe(`select count(*)::int as total from (${text}) as q`);
    const rows = await tx.unsafe(`select * from (${text}) as q limit ${MAX_ROWS}`);
    return { rows: [...rows], total, truncated: total > MAX_ROWS };
  });
}
