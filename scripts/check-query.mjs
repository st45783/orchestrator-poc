// PLAN 작업 9~11 확인 — 쿼리 안전장치가 막을 것을 막는지, 쿼리 에이전트·서브 에이전트가 답을 가져오는지 본다.
// 실행: npm run db:check-query   (뒷부분은 OpenAI를 몇 번 부르므로 요금이 조금 든다)
// 쓰기 시험은 값을 바꾸지 않는 UPDATE(status = status)와, 중단되어 되돌려지는 UPDATE만 쓴다.
import { runDomainQuery } from "../lib/db/run-query.ts";
import { runDomainCall } from "../lib/agents/domains.ts";
import { DEFAULT_MODEL } from "../lib/models.ts";
import { closeDb } from "../lib/db/client.ts";

let failures = 0;
function report(ok, label, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}
async function expectRun(label, domain, sql, write, check) {
  try {
    const result = await runDomainQuery(domain, sql, write);
    const [ok, detail] = check(result);
    report(ok, label, detail);
  } catch (error) {
    report(false, label, `예상과 달리 실패: ${error.message}`);
  }
}
async function expectBlocked(label, domain, sql, write) {
  try {
    await runDomainQuery(domain, sql, write);
    report(false, label, "예상과 달리 실행됨");
  } catch (error) {
    report(true, label, `막힘: ${error.message}`);
  }
}

try {
  console.log("── 쿼리 안전장치 (AI 없이 직접 시험) ──");
  await expectRun("인사 조회", "hr", "select count(*)::int as n from employees", false,
    (r) => [r.rows[0].n === 50, `직원 ${r.rows[0].n}명`]);
  await expectRun("150건 조회 → 100행 + 총 건수", "dev", "select * from issues", false,
    (r) => [r.rows.length === 100 && r.total === 150 && r.truncated, `행 ${r.rows.length}, 총 ${r.total}, 잘림 ${r.truncated}`]);
  await expectBlocked("여러 문장 이어 붙이기", "hr", "select 1; delete from leaves", false);
  await expectBlocked("조회 요청에 INSERT", "hr", "insert into leaves (employee_id, leave_type, start_date, end_date, days, status) values (1, '연차', '2026-10-01', '2026-10-01', 1, '신청')", false);
  await expectBlocked("조회 요청에 WITH 안의 DELETE (읽기 전용이 거부)", "hr", "with x as (delete from leaves returning *) select count(*) from x", false);
  await expectBlocked("영업이 인사 테이블 직접 조회", "sales", "select * from hr.employees", false);
  await expectBlocked("테이블 삭제", "dev", "drop table issues", true);
  await expectBlocked("주석으로 숨기기", "hr", "select 1 -- 주석", false);
  await expectRun("쓰기 요청의 UPDATE (값은 그대로)", "hr", "update leaves set status = status where id = 1 returning id", true,
    (r) => [r.affected === 1, `바뀐 행 ${r.affected}`]);

  console.log("── 역할 바꾸기 우회 차단 (gap 1) ──");
  await expectBlocked("영업 쿼리에서 postgres 역할로 바꾸기", "sales", "select set_config('role', 'postgres', true) as r", false);
  await expectBlocked("영업 쿼리에서 재무 역할로 바꾸기", "sales", "select set_config('role', 'agent_finance', true) as r", false);
  await expectBlocked("역할 바꾸기 + query_to_xml 로 재무 테이블 읽기", "sales",
    "select set_config('role', 'postgres', true) as r, query_to_xml('select count(*) as n from finance.monthly_pnl', false, false, '') as x", false);

  console.log("── 중단 시 실행·커밋 안 함 (gap 2·3) ──");
  {
    const aborted = AbortSignal.abort();
    try {
      await runDomainQuery("hr", "select count(*) from employees", false, aborted);
      report(false, "이미 중단된 요청", "예상과 달리 실행됨");
    } catch (error) {
      report(true, "이미 중단된 요청은 SQL을 실행하지 않음", error.message);
    }

    // 1.5초 걸리는 쓰기를 0.5초 만에 중단 → 취소되고 되돌려져 값이 그대로여야 한다
    const before = (await runDomainQuery("hr", "select status from leaves where id = 1", false)).rows[0];
    const next = before.status === "반려" ? "승인" : "반려";
    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error("시험 중단")), 500);
    let committed = true;
    try {
      await runDomainQuery("hr", `update leaves set status = '${next}' where id = 1 and pg_sleep(1.5)::text = '' returning id`, true, controller.signal);
    } catch {
      committed = false;
    }
    const after = (await runDomainQuery("hr", "select status from leaves where id = 1", false)).rows[0];
    report(!committed && after.status === before.status, "실행 중 중단된 쓰기는 되돌려짐",
      `중단 전 ${before.status} → 중단 후 ${after.status}${committed ? " (커밋됨!)" : ""}`);
  }

  console.log(`── 쿼리 에이전트·서브 에이전트 (${DEFAULT_MODEL}) ──`);
  const cases = [
    { domain: "hr", tool: "db", task: "개발팀 인원 수", write: false },
    { domain: "finance", tool: "db", task: "2026년 10월 개발팀 인건비 집행액", write: false },
    { domain: "sales", tool: "db", task: "계약이 성사된 건 중 금액이 가장 큰 3건의 고객사, 담당자 이름, 금액", write: false },
    { domain: "security", tool: "mock_api", task: "계정 잠금 해제 요청", write: false },
  ];
  for (const call of cases) {
    const started = Date.now();
    try {
      const result = await runDomainCall(call, { model: DEFAULT_MODEL });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const detail = result.record.tool === "db"
        ? `${seconds}초 | SQL: ${result.record.sql[0]} | 결과: ${JSON.stringify(result.data).slice(0, 160)}`
        : `${seconds}초 | ${result.record.message}`;
      report(true, `${call.domain} · ${call.tool} · ${call.task}`, detail);
    } catch (error) {
      report(false, `${call.domain} · ${call.tool} · ${call.task}`, error.message);
    }
  }

  console.log(failures === 0 ? "\n모든 확인 통과" : `\n실패 ${failures}건`);
  if (failures > 0) process.exitCode = 1;
} finally {
  await closeDb();
}
