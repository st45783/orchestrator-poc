// PLAN 작업 19 — 테스트 질문 60개를 /api/chat 에 보내 정답표로 채점하고 eval/results-<모델>.md 로 남긴다.
// 실행: npm run dev 를 켠 상태에서 npm run eval
//       다른 모델: PowerShell에서 $env:MODEL="gpt-4.1"; npm run eval
// 채점 기준 (PRD §3):
//   - 단일 50문항: 호출한 업무·도구가 정답과 정확히 같아야 정답 → 목표 90% 이상
//   - 복합 10문항: 필요한 업무를 모두 호출하고, 업무별 결과(숫자)가 답에 들어가야 성공 → 목표 8개 이상
// 주의: 등록·수정·삭제 질문 5개가 합성데이터를 바꾼다. 복합 질문을 먼저 돌리고, 끝나면 시드를 다시 넣는다.
import { readFile, writeFile } from "node:fs/promises";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const MODEL = process.env.MODEL ?? "gpt-4.1-mini";
const CONCURRENCY = 3;

const { single, composite } = JSON.parse(await readFile("eval/questions.json", "utf8"));

async function ask(q) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: q, model: MODEL }),
    });
    const body = await res.json();
    return { status: res.status, body, seconds: (Date.now() - started) / 1000 };
  } catch (error) {
    return { status: 0, body: { error: error.message }, seconds: (Date.now() - started) / 1000 };
  }
}

/** 동시에 CONCURRENCY개씩 보낸다 */
async function runAll(items, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

function calledOf(body) {
  if (!body?.panel) return [];
  return body.panel.domains
    .filter((d) => d.status === "called")
    .flatMap((d) => [...new Set(d.tools.map((t) => `${d.domain}:${t.tool}`))])
    .sort();
}

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n+/g, " ⏎ ");

console.log(`모델 ${MODEL}, 서버 ${BASE_URL}`);

// 복합 질문 먼저 (쓰기 질문이 데이터를 바꾸기 전에)
const compositeRows = await runAll(composite, async (item) => {
  const r = await ask(item.q);
  const called = calledOf(r.body);
  const allCalled = item.expect.every((e) => called.includes(e));
  const answer = (r.body.answer ?? "").replace(/,/g, "");
  const missing = Object.entries(item.must_include).flatMap(([domain, values]) =>
    values.filter((v) => !answer.includes(v.replace(/,/g, ""))).map((v) => `${domain}:${v}`),
  );
  const ok = r.status === 200 && allCalled && missing.length === 0;
  console.log(`${ok ? "✅" : "❌"} ${item.id} ${item.q} (${r.seconds.toFixed(1)}초)${ok ? "" : ` — 호출 ${called.join(",") || "없음"}${missing.length ? ` / 답에 없음 ${missing.join(",")}` : ""}`}`);
  return { item, r, called, allCalled, missing, ok };
});

const singleRows = await runAll(single, async (item) => {
  const r = await ask(item.q);
  const called = calledOf(r.body);
  const ok = r.status === 200 && JSON.stringify(called) === JSON.stringify([...item.expect].sort());
  console.log(`${ok ? "✅" : "❌"} ${item.id} ${item.q} (${r.seconds.toFixed(1)}초)${ok ? "" : ` — 실제 ${called.join(",") || r.body.panel?.outcome || r.body.error}`}`);
  return { item, r, called, ok };
});

const singleCorrect = singleRows.filter((x) => x.ok).length;
const compositeCorrect = compositeRows.filter((x) => x.ok).length;
const rate = Math.round((singleCorrect / singleRows.length) * 1000) / 10;
const all = [...singleRows, ...compositeRows];
const avg = all.reduce((s, x) => s + x.r.seconds, 0) / all.length;
const max = Math.max(...all.map((x) => x.r.seconds));
const errors = all.filter((x) => x.r.status !== 200).length;
const longReasons = all.filter((x) => (x.r.body.panel?.reason ?? "").length > 50).length;

const summary = [
  `| 지표 | 결과 | 목표 | 판정 |`,
  `|---|---|---|---|`,
  `| 라우팅 정답률 (단일 50문항) | ${singleCorrect}/${singleRows.length} (${rate}%) | 90% 이상 | ${rate >= 90 ? "✅ 달성" : "❌ 미달"} |`,
  `| 복합 질문 처리 | ${compositeCorrect}/${compositeRows.length} | 8개 이상 | ${compositeCorrect >= 8 ? "✅ 달성" : "❌ 미달"} |`,
  `| 오류 응답 | ${errors}건 | 0건 | ${errors === 0 ? "✅" : "❌"} |`,
  `| 판단 이유 50자 초과 | ${longReasons}건 | 0건 | ${longReasons === 0 ? "✅" : "❌"} |`,
  `| 응답 시간 | 평균 ${avg.toFixed(1)}초 · 최대 ${max.toFixed(1)}초 | 50초 마감 안 | ${max < 50 ? "✅" : "❌"} |`,
].join("\n");

const md = `# 채점 결과 — ${MODEL}

- 실행: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · 서버 ${BASE_URL}
- 자동 채점은 개발용 사전 채점이다. PRD §3에 따라 최종 채점은 사람이 판단 과정 패널을 보며 정답표로 한다.
- 복합 질문의 "결과 포함"은 업무별 정답 숫자가 답에 있는지로 자동 확인했다. MIX-10은 정답 숫자를 정하지 않아 호출 여부만 본다.

## 요약

${summary}

## 단일 질문 50개

| 번호 | 질문 | 정답 (업무:도구) | 실제 | 정답 여부 | 판단 이유 | 답변 |
|---|---|---|---|---|---|---|
${singleRows.map((x) => `| ${x.item.id} | ${cell(x.item.q)} | ${x.item.expect.join(", ")} | ${x.called.join(", ") || cell(x.r.body.panel?.outcome ?? x.r.body.error)} | ${x.ok ? "✅" : "❌"} | ${cell(x.r.body.panel?.reason)} | ${cell((x.r.body.answer ?? x.r.body.error ?? "").slice(0, 120))} |`).join("\n")}

## 복합 질문 10개

| 번호 | 질문 | 필요 업무 | 실제 호출 | 모두 호출 | 업무별 결과 포함 | 성공 | 답변 |
|---|---|---|---|---|---|---|---|
${compositeRows.map((x) => `| ${x.item.id} | ${cell(x.item.q)} | ${x.item.expect.join(", ")} | ${x.called.join(", ") || "없음"} | ${x.allCalled ? "✅" : "❌"} | ${x.missing.length ? `❌ 없음: ${x.missing.join(", ")}` : "✅"} | ${x.ok ? "✅" : "❌"} | ${cell((x.r.body.answer ?? x.r.body.error ?? "").slice(0, 160))} |`).join("\n")}
`;

const file = `eval/results-${MODEL}.md`;
await writeFile(file, md);
console.log(`\n${summary}\n\n결과 저장: ${file}`);
console.log("⚠ 등록·수정·삭제 질문이 합성데이터를 바꿨습니다. 되돌리려면: npm run db:migrate -- supabase/seed/seed.sql");
