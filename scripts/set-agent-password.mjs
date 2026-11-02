// 업무별 DB 역할(agent_hr …)의 로그인 비밀번호를 설정한다.
// .env 에 AGENT_DB_PASSWORD 가 없으면 무작위로 만들어 .env 에 추가한 뒤 DB에 적용한다. 값은 출력하지 않는다.
// 실행: npm run db:set-agent-password
import { readFile, appendFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { getDb, closeDb } from "../lib/db/client.ts";

const ROLES = ["agent_hr", "agent_finance", "agent_sales", "agent_security", "agent_dev"];

const env = await readFile(".env", "utf8");
let password = env.match(/^AGENT_DB_PASSWORD="?([^"\r\n]*)"?/m)?.[1];
if (!password) {
  // 주소에 그대로 넣을 수 있도록 영문·숫자만 쓴다
  password = randomBytes(24).toString("base64url").replace(/[-_]/g, "x");
  await appendFile(".env", `${env.endsWith("\n") ? "" : "\n"}AGENT_DB_PASSWORD="${password}"\n`);
  console.log(".env 에 AGENT_DB_PASSWORD 를 새로 만들었습니다 (값은 출력하지 않음)");
}

try {
  const sql = getDb();
  for (const role of ROLES) {
    // 비밀번호는 영문·숫자뿐이라 따옴표 안에 그대로 넣어도 안전하다
    await sql.unsafe(`alter role ${role} password '${password}'`);
  }
  console.log(`비밀번호 설정 완료: ${ROLES.join(", ")}`);
} catch (error) {
  console.error("비밀번호 설정 실패:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
