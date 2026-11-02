// PLAN 작업 16 — 판단 과정 패널. 5개 업무를 항상 모두 보여주고, 상태는 "호출됨 / 해당 없음"만 쓴다.
// PLAN 작업 23 — 호출된 업무를 누르면 조회한 테이블·실행한 SQL·가짜 API 응답을 펼쳐 본다.
// Design Ref: §1 ⑤ — 패널 내용은 서버의 실제 호출 기록 그대로다 (PRD must ① 규칙 8, must ② 규칙 5).
import { TOOL_LABELS, type DecisionPanel as Panel, type PanelDomain } from "@/lib/types.ts";

function domainTag(d: PanelDomain): string {
  if (d.status === "skipped" || !d.tools?.length) return `[${d.label}]`;
  return `[${d.label} · ${d.tools.map((t) => TOOL_LABELS[t.tool]).join(" + ")}]`;
}

export default function DecisionPanel({ panel }: { panel: Panel }) {
  const sqlLines = panel.domains.flatMap((d) =>
    (d.tools ?? []).flatMap((t) => (t.sql ?? []).map((sql) => ({ label: d.label, sql }))),
  );

  return (
    <section
      aria-label="판단 과정"
      className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h3 className="mb-3 text-xs font-semibold tracking-wide text-zinc-500 dark:text-zinc-400">판단 과정</h3>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="shrink-0 font-mono text-xs text-zinc-500 sm:pt-1.5 dark:text-zinc-400">질문 ─▶ 오케스트레이터 ─▶</div>
        <ul className="flex-1 space-y-1.5">
          {panel.domains.map((d) => {
            const mockApi = d.tools?.some((t) => t.tool === "mock_api");
            if (d.status !== "called") {
              return (
                <li key={d.domain} className="flex items-center justify-between gap-3 px-3 py-1.5 text-zinc-400 dark:text-zinc-500">
                  <span className="font-medium">{domainTag(d)}</span>
                  <span className="text-xs">⬜ 해당 없음</span>
                </li>
              );
            }
            return (
              <li key={d.domain}>
                <details className="group rounded-lg bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-1.5">
                    <span className="font-medium">
                      <span className="mr-1 inline-block transition-transform group-open:rotate-90" aria-hidden>▸</span>
                      {domainTag(d)}
                      {mockApi && <span className="ml-1 font-normal">호출 → 결과 수신(가상)</span>}
                    </span>
                    <span className="text-xs">✅ 호출됨</span>
                  </summary>
                  <div className="space-y-2 px-3 pt-1 pb-3 text-xs">
                    {d.tools?.map((t, i) =>
                      t.tool === "db" ? (
                        <div key={i}>
                          <p>
                            <span className="font-semibold">조회한 테이블:</span> {t.tables?.length ? t.tables.join(", ") : "—"}
                          </p>
                          {t.sql?.map((s, j) => (
                            <code key={j} className="mt-1 block whitespace-pre-wrap break-all rounded-md bg-white px-2 py-1.5 font-mono text-zinc-800 ring-1 ring-emerald-200 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-emerald-900">
                              {s}
                            </code>
                          ))}
                        </div>
                      ) : (
                        <p key={i}>
                          <span className="font-semibold">가짜 API 응답:</span> {t.message}
                        </p>
                      ),
                    )}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-3 text-zinc-700 dark:text-zinc-300">
        <span className="font-semibold">판단 이유:</span> “{panel.reason}”
      </p>

      {sqlLines.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 font-semibold text-zinc-700 dark:text-zinc-300">실행한 SQL</p>
          <ul className="space-y-1.5">
            {sqlLines.map((line, i) => (
              <li key={i} className="text-xs">
                <span className="mr-1 text-zinc-500 dark:text-zinc-400">▸ {line.label}:</span>
                <code className="block whitespace-pre-wrap break-all rounded-md bg-white px-2 py-1.5 font-mono text-zinc-800 ring-1 ring-zinc-200 dark:bg-zinc-950 dark:text-zinc-200 dark:ring-zinc-800">
                  {line.sql}
                </code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
