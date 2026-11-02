// PLAN 작업 12~14 확인 — /api/chat 에 대표 질문을 보내 라우팅·되묻기·기간 밖·오류 처리를 본다.
// 실행: npm run dev 를 켠 상태에서 npm run chat:check
//       다른 모델: $env:MODEL="gpt-4.1"; npm run chat:check
//       배포 주소를 시험하려면 BASE_URL 환경변수를 준다 (PowerShell: $env:BASE_URL="https://..."; npm run chat:check)
// 쓰기 질문은 넣지 않는다 (데이터를 바꾸므로 작업 19 채점에서 따로 다룬다).
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const CASES = [
  { q: "개발팀 인원 알려줘", expect: { outcome: "answered", called: ["hr:db"] } },
  { q: "개발팀 인원과 이번 달 인건비 알려줘", expect: { outcome: "answered", called: ["hr:db", "finance:db"] } },
  { q: "휴가 신청해줘", expect: { outcome: "answered", called: ["hr:mock_api"] } },
  { q: "개발 이슈 전체 목록 보여줘", expect: { outcome: "answered", called: ["dev:db"], answerIncludes: "총 150건 중 100건만 보여줍니다" } },
  { q: "점심 메뉴 추천해줘", expect: { outcome: "clarify", called: [] } },
  { q: "2025년 12월 매출 알려줘", expect: { outcome: "out_of_range", called: [], answerIncludes: "2026-01~2026-10 데이터만 있습니다" } },
  // CHECK.md #7 — AI가 놓쳐도 서버가 기간 밖으로 처리
  { q: "작년 매출 알려줘", expect: { outcome: "out_of_range", called: [], answerIncludes: "2026-01~2026-10 데이터만 있습니다" } },
  { q: "11월 개발팀 인건비 알려줘", expect: { outcome: "out_of_range", called: [], answerIncludes: "2026-01~2026-10 데이터만 있습니다" } },
  { q: "개발팀 인원 알려줘", model: "gpt-9-ultra", expect: { status: 400 } },
  // 작업 22 — 문맥 이어 묻기
  {
    q: "그럼 영업팀은?",
    previous: { question: "개발팀 인원 알려줘", answer: "개발팀 인원은 17명입니다." },
    expect: { outcome: "answered", called: ["hr:db"], answerIncludes: "12" },
  },
  {
    q: "휴가 신청해줘",
    previous: { question: "개발팀 인원 알려줘", answer: "개발팀 인원은 17명입니다." },
    expect: { outcome: "answered", called: ["hr:mock_api"] },
  },
];

let failures = 0;
for (const c of CASES) {
  const started = Date.now();
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: c.q, model: c.model ?? process.env.MODEL, previous: c.previous }),
  });
  const body = await res.json();
  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  const problems = [];
  if (c.expect.status) {
    if (res.status !== c.expect.status) problems.push(`상태 ${res.status} (기대 ${c.expect.status})`);
  } else if (res.status !== 200) {
    problems.push(`상태 ${res.status}: ${body.error}`);
  } else {
    const called = body.panel.domains
      .filter((d) => d.status === "called")
      .flatMap((d) => d.tools.map((t) => `${d.domain}:${t.tool}`))
      .sort();
    if (body.panel.domains.length !== 5) problems.push("패널 업무가 5개가 아님");
    if (body.panel.outcome !== c.expect.outcome) problems.push(`응답 종류 ${body.panel.outcome} (기대 ${c.expect.outcome})`);
    if (JSON.stringify(called) !== JSON.stringify([...c.expect.called].sort())) problems.push(`호출 ${called.join(",") || "없음"} (기대 ${c.expect.called.join(",") || "없음"})`);
    if (body.panel.reason.length > 50) problems.push(`판단 이유 ${body.panel.reason.length}자`);
    if (c.expect.answerIncludes && !body.answer.includes(c.expect.answerIncludes)) problems.push(`답에 "${c.expect.answerIncludes}" 없음`);
  }

  if (problems.length) failures += 1;
  console.log(`${problems.length ? "❌" : "✅"} ${c.previous ? `(직전: ${c.previous.question}) ` : ""}${c.q}${c.model ? ` [${c.model}]` : ""} — ${seconds}초${problems.length ? ` — ${problems.join(" / ")}` : ""}`);
  if (res.status === 200) {
    console.log(`   답: ${body.answer.replace(/\n+/g, " ⏎ ").slice(0, 200)}`);
    console.log(`   이유: ${body.panel.reason}`);
  } else {
    console.log(`   오류 문구: ${body.error}`);
  }
}
console.log(failures === 0 ? "\n모든 확인 통과" : `\n실패 ${failures}건`);
if (failures > 0) process.exitCode = 1;
