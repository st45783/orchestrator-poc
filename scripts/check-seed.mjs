// PLAN 작업 5 확인 — 합성데이터가 PRD·DESIGN 규칙대로 들어갔는지 본다. DB는 바꾸지 않는다.
// 실행: npm run db:check-seed
import { getDb, closeDb } from "../lib/db/client.ts";

// PRD §6 건수 (부서 예산은 부서 5 × 10개월 × 인건비·운영비 2)
const EXPECTED_COUNTS = {
  "hr.employees": 50,
  "hr.leaves": 100,
  "finance.monthly_pnl": 10,
  "finance.dept_budgets": 100,
  "sales.customers": 30,
  "sales.contracts": 100,
  "security.security_events": 40,
  "security.access_requests": 30,
  "dev.projects": 10,
  "dev.issues": 150,
};

let failures = 0;
function report(ok, label, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

try {
  const sql = getDb();

  console.log("── 건수 (PRD §6) ──");
  for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
    const [{ n }] = await sql.unsafe(`select count(*)::int as n from ${table}`);
    report(n === expected, `${table}: ${n}건`, n === expected ? "" : `기대 ${expected}건`);
  }

  console.log("── 담당자는 인사 직원 50명 안에서, 맞는 부서에서, 입사 후에 ──");
  const checks = [
    ["휴가: 입사일 이후 시작", "select count(*)::int as n from hr.leaves l join hr.employees e on e.id = l.employee_id where l.start_date < e.hired_at"],
    ["계약: 담당자가 영업팀", "select count(*)::int as n from sales.contracts c join hr.employees e on e.id = c.owner_employee_id where e.department <> '영업팀'"],
    ["계약: 담당자 입사 후 계약", "select count(*)::int as n from sales.contracts c join hr.employees e on e.id = c.owner_employee_id where c.contract_date < e.hired_at"],
    ["프로젝트: 리더가 개발팀", "select count(*)::int as n from dev.projects p join hr.employees e on e.id = p.lead_employee_id where e.department <> '개발팀'"],
    ["이슈: 담당자가 개발팀", "select count(*)::int as n from dev.issues i join hr.employees e on e.id = i.assignee_employee_id where e.department <> '개발팀'"],
    ["이슈: 프로젝트 시작 후, 담당자 입사 후 생성", "select count(*)::int as n from dev.issues i join dev.projects p on p.id = i.project_id join hr.employees e on e.id = i.assignee_employee_id where i.created_at < p.start_date or i.created_at < e.hired_at"],
    ["권한 요청: 요청자 입사 후", "select count(*)::int as n from security.access_requests a join hr.employees e on e.id = a.requester_employee_id where a.requested_at < e.hired_at"],
  ];
  for (const [label, query] of checks) {
    const [{ n }] = await sql.unsafe(query);
    report(n === 0, label, n === 0 ? "" : `어긋난 행 ${n}건`);
  }
  const [{ n: staffCount }] = await sql`select count(*)::int as n from sales.staff`;
  report(staffCount === 50, `staff 뷰로 보이는 직원 ${staffCount}명`);

  console.log("── 인건비 일치 (DESIGN §3) ──");
  const mismatches = await sql`
    select to_char(p.month, 'YYYY-MM') as month, p.labor_cost, coalesce(sum(b.spent), 0)::bigint as dept_sum
    from finance.monthly_pnl p
    left join finance.dept_budgets b on b.month = p.month and b.category = '인건비'
    group by p.month, p.labor_cost
    having p.labor_cost <> coalesce(sum(b.spent), 0)`;
  report(mismatches.length === 0, "10개월 모두 부서 인건비 합계 = 월별 손익 인건비",
    mismatches.map((m) => `${m.month}: ${m.labor_cost} ≠ ${m.dept_sum}`).join(", "));

  console.log("── 개인정보 컬럼 없음 (PRD §7) ──");
  const pii = await sql`
    select table_schema || '.' || table_name || '.' || column_name as col
    from information_schema.columns
    where table_schema in ('hr', 'finance', 'sales', 'security', 'dev')
      and column_name ~* '(phone|mobile|email|address|ssn|resident|account|bank|birth)'`;
  report(pii.length === 0, "연락처·주소·주민번호·계좌 컬럼", pii.length === 0 ? "없음" : pii.map((r) => r.col).join(", "));

  console.log("── 자동 번호 이어짐 ──");
  const seqs = await sql`
    select schemaname || '.' || sequencename as seq, last_value from pg_sequences
    where schemaname in ('hr', 'finance', 'sales', 'security', 'dev') order by 1`;
  const behind = [];
  for (const s of seqs) {
    const table = s.seq.replace(/_id_seq$/, "");
    const [{ max }] = await sql.unsafe(`select coalesce(max(id), 0)::int as max from ${table}`);
    if (Number(s.last_value ?? 0) < max) behind.push(`${table} (번호 ${s.last_value} < 최대 ${max})`);
  }
  report(behind.length === 0, `다음 등록 번호가 기존 번호와 겹치지 않음 (${seqs.length}개 테이블)`, behind.join(", "));

  console.log(failures === 0 ? "\n모든 확인 통과" : `\n실패 ${failures}건`);
  if (failures > 0) process.exitCode = 1;
} catch (error) {
  console.error("확인 중 오류:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
