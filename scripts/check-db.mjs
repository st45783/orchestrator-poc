// PLAN 작업 3 — 서버 DB 연결(lib/db/client.ts)로 Supabase에 접속해 `select 1`이 되는지 확인한다.
// 실행: npm run db:check
// 접속 주소·비밀번호는 출력하지 않는다.
import { getDb, closeDb } from "../lib/db/client.ts";

try {
  const sql = getDb();
  const [row] = await sql`select 1 as ok, current_database() as db, current_setting('server_version') as version`;
  if (row?.ok !== 1) {
    throw new Error("select 1 결과가 1이 아닙니다.");
  }
  console.log("DB 연결 성공: select 1 = 1");
  console.log(`데이터베이스: ${row.db} / Postgres 버전: ${row.version}`);
} catch (error) {
  console.error("DB 연결 실패:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
