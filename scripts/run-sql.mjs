// SQL 파일 하나를 Supabase DB에 한 트랜잭션으로 실행한다. 중간에 실패하면 전부 되돌린다.
// 실행: npm run db:migrate -- <SQL 파일 경로> [--dry-run]
//   --dry-run: 끝까지 실제로 실행해 본 뒤 되돌린다. DB는 바뀌지 않는다.
import { readFile } from "node:fs/promises";
import { getDb, closeDb } from "../lib/db/client.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const file = args.find((arg) => !arg.startsWith("--"));

if (!file) {
  console.error("사용법: npm run db:migrate -- <SQL 파일 경로> [--dry-run]");
  process.exit(1);
}

// 시험 실행을 되돌리기 위해 일부러 던지는 신호
class DryRunRollback extends Error {}

try {
  const text = await readFile(file, "utf8");
  const sql = getDb();
  await sql.begin(async (tx) => {
    // 인자 없는 unsafe는 여러 문장을 한 번에 보낼 수 있다
    await tx.unsafe(text);
    if (dryRun) throw new DryRunRollback();
  });
  console.log(`적용 완료: ${file}`);
} catch (error) {
  if (error instanceof DryRunRollback) {
    console.log(`시험 실행 성공 (되돌림, DB 변경 없음): ${file}`);
  } else {
    const position = error?.position ? ` (파일 안 위치: ${error.position}번째 글자)` : "";
    console.error(`실행 실패, 전부 되돌림: ${error instanceof Error ? error.message : error}${position}`);
    process.exitCode = 1;
  }
} finally {
  await closeDb();
}
