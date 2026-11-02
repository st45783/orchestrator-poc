// PLAN 작업 4 확인 — 업무 스키마·테이블·staff 뷰가 있고, 업무별 DB 역할의 권한 칸막이가 제대로 막히는지 본다.
// 실행: npm run db:check-schema
// 모든 시험은 트랜잭션 안에서 하고 되돌리므로 DB는 바뀌지 않는다.
import { getDb, closeDb } from "../lib/db/client.ts";

const EXPECTED = {
  hr: ["employees", "leaves"],
  finance: ["dept_budgets", "monthly_pnl"],
  sales: ["contracts", "customers", "staff"],
  security: ["access_requests", "security_events", "staff"],
  dev: ["issues", "projects", "staff"],
};

// 시험이 끝나면 되돌리기 위한 신호
class Rollback extends Error {}

let failures = 0;
function report(ok, label, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

// role로 바꿔 query를 실행해 보고, 성공했는지와 오류 메시지를 돌려준다 (항상 되돌림)
async function tryAs(sql, role, query, { readOnly = false } = {}) {
  try {
    await sql.begin(readOnly ? "read only" : "", async (tx) => {
      await tx.unsafe(`set local role ${role}`);
      await tx.unsafe(query);
      throw new Rollback();
    });
  } catch (error) {
    if (error instanceof Rollback) return { ok: true };
    return { ok: false, message: error.message };
  }
}

async function expectAllowed(sql, role, query, label) {
  const result = await tryAs(sql, role, query);
  report(result.ok, label, result.ok ? "허용됨" : `예상과 달리 거부: ${result.message}`);
}

async function expectDenied(sql, role, query, label, options) {
  const result = await tryAs(sql, role, query, options);
  report(!result.ok, label, result.ok ? "예상과 달리 허용됨" : `거부됨: ${result.message}`);
}

try {
  const sql = getDb();

  console.log("── 테이블·뷰 ──");
  for (const [schema, names] of Object.entries(EXPECTED)) {
    const rows = await sql`
      select table_name from information_schema.tables
      where table_schema = ${schema} order by table_name`;
    const actual = rows.map((r) => r.table_name);
    report(JSON.stringify(actual) === JSON.stringify(names), `${schema}: ${actual.join(", ") || "(없음)"}`);
  }

  console.log("── 업무별 역할 ──");
  const roles = await sql`select rolname from pg_roles where rolname like 'agent\_%' order by rolname`;
  report(roles.length === 5, `역할 ${roles.length}개: ${roles.map((r) => r.rolname).join(", ")}`);

  console.log("── 권한 칸막이 ──");
  await expectAllowed(sql, "agent_hr", "select count(*) from hr.employees", "인사 역할이 인사 테이블 조회");
  await expectAllowed(sql, "agent_sales", "select count(*) from sales.staff", "영업 역할이 staff 뷰 조회");
  await expectDenied(sql, "agent_sales", "select count(*) from hr.employees", "영업 역할이 인사 테이블 직접 조회");
  await expectDenied(sql, "agent_finance", "select count(*) from sales.contracts", "재무 역할이 영업 테이블 조회");
  await expectDenied(sql, "agent_sales", "insert into sales.staff (name, department) values ('가짜', '영업팀')", "영업 역할이 staff 뷰로 직원 추가");
  await expectDenied(sql, "agent_dev", "create table dev.temp_test (id int)", "개발 역할이 테이블 생성");
  await expectDenied(sql, "agent_hr", "drop table hr.leaves", "인사 역할이 테이블 삭제");

  console.log("── 데이터 규칙 ──");
  await expectAllowed(sql, "agent_hr", "insert into hr.employees (name, department, position, hired_at) values ('시험', '개발팀', '사원', '2026-05-01')", "기간 안 날짜로 직원 등록");
  await expectDenied(sql, "agent_hr", "insert into hr.employees (name, department, position, hired_at) values ('시험', '개발팀', '사원', '2026-11-15')", "기간 밖 날짜(2026-11-15)로 직원 등록");
  await expectDenied(sql, "agent_hr", "insert into hr.employees (name, department, position, hired_at) values ('시험', '마케팅팀', '사원', '2026-05-01')", "없는 부서(마케팅팀)로 직원 등록");
  await expectDenied(sql, "agent_hr", "insert into hr.employees (name, department, position, hired_at) values ('시험', '개발팀', '사원', '2026-05-01')", "읽기 전용 트랜잭션에서 등록", { readOnly: true });

  console.log("── 외부 공개 역할 ──");
  await expectDenied(sql, "anon", "select count(*) from hr.employees", "anon(비로그인 공개 역할)이 인사 테이블 조회");
  await expectDenied(sql, "authenticated", "select count(*) from finance.monthly_pnl", "authenticated 역할이 재무 테이블 조회");

  console.log(failures === 0 ? "\n모든 확인 통과" : `\n실패 ${failures}건`);
  if (failures > 0) process.exitCode = 1;
} catch (error) {
  console.error("확인 중 오류:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
