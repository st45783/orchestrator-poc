// PLAN 작업 10 — 쿼리 안전장치. AI가 만든 SQL을 업무별 권한·읽기 전용·100행 제한 안에서만 실행한다.
// Design Ref: §4.3 — 규칙을 프롬프트에만 맡기지 않고 코드와 DB 권한으로 강제한다 (CLAUDE.md §6).
import "server-only";
import type { Domain } from "../types.ts";
import { getDomainDb } from "./client.ts";

export const MAX_ROWS = 100;
/** 쓰기 한 번에 바꿀 수 있는 최대 행 수 (CHECK.md #12). 넘으면 되돌린다 */
export const MAX_WRITE_ROWS = 10;
const STATEMENT_TIMEOUT_MS = 5_000;

/** 실행 전에 막은 SQL. 메시지는 AI에게 돌려줘 고치게 한다. */
export class QueryBlockedError extends Error {}

export type QueryResult = {
  /** 실제로 실행한 SQL 문장 그대로 (패널에 표시, PRD must ② 규칙 5) */
  sql: string;
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
  // 수정·삭제는 대상을 좁히는 WHERE가 있어야 한다 (CHECK.md #12)
  if ((first === "update" || first === "delete") && !/\bwhere\b/i.test(text)) {
    throw new QueryBlockedError("UPDATE·DELETE에는 바꿀 행을 정하는 WHERE 조건이 있어야 합니다.");
  }
  return text;
}

/** 요청이 마감·실패로 중단됐을 때 */
export class QueryAbortedError extends Error {}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new QueryAbortedError("요청이 중단되어 SQL을 실행하지 않습니다.");
}

/**
 * 업무 하나의 SQL을 실행한다.
 * - 업무 역할(agent_{업무})로 직접 로그인한 연결을 쓴다. 다른 업무 테이블은 권한이 없어 DB가 거부하고,
 *   쿼리 안에서 역할을 바꿀 수도 없다.
 * - 조회는 읽기 전용 트랜잭션: 쓰기 SQL이 들어와도 DB가 거부한다.
 * - 요청이 중단(signal)되면 실행 중인 SQL을 취소하고, 커밋 직전에도 다시 확인해 되돌린다 (DESIGN §2 50초 마감).
 */
export async function runDomainQuery(domain: Domain, raw: string, write: boolean, signal?: AbortSignal): Promise<QueryResult> {
  const text = checkSql(raw, write);
  throwIfAborted(signal);
  const sql = getDomainDb(domain);
  return sql.begin(write ? "read write" : "read only", async (tx) => {
    // 실행 중인 쿼리를 중단 신호에 맞춰 취소한다
    const run = async (query: string) => {
      throwIfAborted(signal);
      const pending = tx.unsafe(query);
      const cancel = () => pending.cancel();
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        return await pending;
      } finally {
        signal?.removeEventListener("abort", cancel);
      }
    };

    // domain은 5개 업무 코드 중 하나로 검사된 값이다. 로그인 역할의 기본값과 같지만 트랜잭션마다 다시 건다
    await run(`set local search_path to ${domain}`);
    await run(`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

    // AI가 쓴 SQL을 감싸지 않고 그대로 한 번만 실행한다. 그래서 패널의 SQL이 실제 실행한 문장과 같다 (CHECK.md #13)
    let result: QueryResult;
    if (write) {
      const rows = await run(text);
      if (rows.count > MAX_WRITE_ROWS) {
        // 예외를 던져 트랜잭션을 되돌린다
        throw new QueryBlockedError(
          `한 번에 ${MAX_WRITE_ROWS}건까지만 바꿀 수 있습니다 (이번 SQL은 ${rows.count}건). WHERE 조건을 좁혀 주세요.`,
        );
      }
      result = { sql: text, rows: [...rows].slice(0, MAX_ROWS), affected: rows.count };
    } else {
      // 전체 건수는 받은 행 수로 세고, 화면·답에는 앞의 100행만 넘긴다
      const rows = await run(text);
      result = { sql: text, rows: [...rows].slice(0, MAX_ROWS), total: rows.length, truncated: rows.length > MAX_ROWS };
    }
    // 커밋 직전에 중단됐는지 다시 본다. 중단됐으면 예외로 트랜잭션을 되돌린다
    throwIfAborted(signal);
    return result;
  });
}
