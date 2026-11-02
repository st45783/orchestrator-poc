// Design Ref: §7 — 합성 DB(Supabase Postgres)에 서버에서만 접속하는 연결.
// 연결 풀러(transaction 방식)는 prepared statement를 쓰지 못하므로 prepare: false 로 연결한다.
import "server-only";
import postgres from "postgres";
import type { Domain } from "../types.ts";

const OPTIONS = { prepare: false, ssl: "require", connect_timeout: 10, idle_timeout: 20 } as const;

let adminSql: postgres.Sql | undefined;
const domainSql = new Map<Domain, postgres.Sql>();

/**
 * 관리용 연결 (postgres 사용자). 스키마 적용·시드·확인 스크립트에서만 쓴다.
 * AI가 만든 SQL은 이 연결로 실행하지 않는다 — getDomainDb 를 쓴다.
 * 빌드할 때는 DB에 접속하지 않도록, 모듈을 불러오는 시점이 아니라 실제로 쓸 때 연결한다.
 */
export function getDb(): postgres.Sql {
  if (!adminSql) {
    const url = process.env.SUPABASE_DB_URL;
    if (!url) {
      throw new Error("SUPABASE_DB_URL 환경변수가 없습니다.");
    }
    adminSql = postgres(url, { ...OPTIONS, max: 5 });
  }
  return adminSql;
}

/**
 * 업무 역할(agent_{업무})로 직접 로그인한 연결. AI가 만든 SQL은 반드시 이 연결로 실행한다.
 * 로그인 사용자 자체가 업무 역할이므로, 쿼리 안에서 역할을 바꿔 다른 업무 테이블을 읽을 수 없다
 * (supabase/migrations/0002_agent_logins.sql).
 */
export function getDomainDb(domain: Domain): postgres.Sql {
  let sql = domainSql.get(domain);
  if (!sql) {
    const base = process.env.SUPABASE_DB_URL;
    const password = process.env.AGENT_DB_PASSWORD;
    if (!base || !password) {
      throw new Error("SUPABASE_DB_URL 또는 AGENT_DB_PASSWORD 환경변수가 없습니다.");
    }
    // 연결 풀러 사용자 이름은 "역할.프로젝트ID" 모양이다 (예: postgres.abcd → agent_hr.abcd)
    const url = new URL(base);
    const projectRef = url.username.split(".")[1];
    url.username = projectRef ? `agent_${domain}.${projectRef}` : `agent_${domain}`;
    url.password = password;
    sql = postgres(url.toString(), { ...OPTIONS, max: 2 });
    domainSql.set(domain, sql);
  }
  return sql;
}

/** 스크립트처럼 끝나야 하는 곳에서 연결을 모두 닫는다. */
export async function closeDb(): Promise<void> {
  const all = [adminSql, ...domainSql.values()].filter((s): s is postgres.Sql => Boolean(s));
  adminSql = undefined;
  domainSql.clear();
  await Promise.all(all.map((s) => s.end({ timeout: 5 })));
}
