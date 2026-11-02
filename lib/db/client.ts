// Design Ref: §7 — 합성 DB(Supabase Postgres)에 서버에서만 접속하는 연결.
// 연결 풀러(transaction 방식)는 prepared statement를 쓰지 못하므로 prepare: false 로 연결한다.
import "server-only";
import postgres from "postgres";

let sql: postgres.Sql | undefined;

/**
 * DB 연결을 돌려준다. 처음 부를 때 한 번만 만든다.
 * 빌드할 때는 DB에 접속하지 않도록, 모듈을 불러오는 시점이 아니라 실제로 쓸 때 연결한다.
 */
export function getDb(): postgres.Sql {
  if (!sql) {
    const url = process.env.SUPABASE_DB_URL;
    if (!url) {
      throw new Error("SUPABASE_DB_URL 환경변수가 없습니다.");
    }
    sql = postgres(url, {
      prepare: false,
      ssl: "require",
      // 업무 여러 개를 동시에 조회할 수 있게 연결을 몇 개 둔다
      max: 5,
      connect_timeout: 10,
      idle_timeout: 20,
    });
  }
  return sql;
}

/** 스크립트처럼 끝나야 하는 곳에서 연결을 모두 닫는다. */
export async function closeDb(): Promise<void> {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = undefined;
  }
}
