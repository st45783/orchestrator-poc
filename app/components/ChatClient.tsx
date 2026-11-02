"use client";
// PLAN 작업 15·17 — 채팅 화면: 질문 입력, 답변 목록, 모델 선택 메뉴, 개인정보 안내, 오류 문구 표시.
// PLAN 작업 21·22 — 업무별 질문 예시 버튼, 직전 질문·답을 함께 보내 이어 묻기.
// Design Ref: §1 화면 구성 ①~⑦. 오류일 때는 정해진 문구 하나만 보이고 패널은 그리지 않는다.
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatResponse, ChatTurn, DecisionPanel as Panel } from "@/lib/types.ts";
import type { ModelOption } from "@/lib/models.ts";
import { FIXED_ERROR_MESSAGE } from "@/lib/errors.ts";
import DecisionPanel from "./DecisionPanel.tsx";

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; text: string; panel?: Panel; isError?: boolean };

/** 업무별 질문 예시 1개씩 (작업 21) */
const EXAMPLES = [
  { label: "인사", question: "부서별 인원 수 알려줘" },
  { label: "재무", question: "이번 달 매출과 영업이익 알려줘" },
  { label: "영업", question: "계약 금액이 가장 큰 고객사는 어디야?" },
  { label: "보안", question: "아직 조치 안 된 보안 이벤트 있어?" },
  { label: "개발", question: "긴급 우선순위 이슈는 몇 개야?" },
];

export default function ChatClient({ models, defaultModel }: { models: readonly ModelOption[]; defaultModel: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [model, setModel] = useState(defaultModel);
  const [loading, setLoading] = useState(false);
  // 직전에 제대로 답한 질문·답 (오류·되묻기는 문맥으로 쓰지 않는다)
  const [previous, setPrevious] = useState<ChatTurn | undefined>(undefined);
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 새 메시지가 오면 맨 아래로 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(question);
  }

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || loading) return;

    setMessages((prev) => [...prev, { id: nextId.current++, role: "user", text }]);
    setQuestion("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, model, previous }),
      });
      const body = (await res.json()) as ChatResponse;
      const reply: Message =
        "error" in body
          ? { id: nextId.current++, role: "assistant", text: body.error, isError: true }
          : { id: nextId.current++, role: "assistant", text: body.answer, panel: body.panel };
      setMessages((prev) => [...prev, reply]);
      if (!("error" in body) && body.panel.outcome === "answered") {
        setPrevious({ question: text, answer: body.answer });
      }
    } catch {
      // 네트워크 오류 등 응답을 못 받은 경우에도 정해진 문구 하나만 보여준다
      setMessages((prev) => [...prev, { id: nextId.current++, role: "assistant", text: FIXED_ERROR_MESSAGE, isError: true }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-white text-zinc-900 dark:bg-black dark:text-zinc-100">
      {/* ① 앱 이름, ② 모델 선택 */}
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-lg font-bold tracking-tight">오케스트레이터 서비스</h1>
          <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            모델
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={loading}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* ③ 내 질문, ④ 답변, ⑤ 판단 과정 패널 */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-4 py-6">
          {messages.length === 0 && (
            <p className="py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
              인사·재무·영업·보안·개발 업무 정보를 평소 말투로 물어보세요.
              <br />
              예: 개발팀 인원과 이번 달 인건비 알려줘
            </p>
          )}
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-zinc-900 px-4 py-2.5 text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {m.text}
                </p>
              </div>
            ) : (
              <div key={m.id} className="max-w-full">
                <p
                  className={`whitespace-pre-wrap rounded-2xl rounded-bl-sm px-4 py-2.5 ${
                    m.isError
                      ? "bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-200"
                      : "bg-zinc-100 dark:bg-zinc-900"
                  }`}
                >
                  {m.text}
                </p>
                {m.panel && <DecisionPanel panel={m.panel} />}
              </div>
            ),
          )}
          {loading && <p className="text-sm text-zinc-500 dark:text-zinc-400">답변을 만드는 중…</p>}
          <div ref={bottomRef} />
        </div>
      </main>

      {/* ⑥ 입력창, ⑦ 개인정보 안내 */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 pt-3" aria-label="질문 예시">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              type="button"
              disabled={loading}
              onClick={() => void send(ex.question)}
              title={ex.question}
              className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <span className="font-semibold">{ex.label}</span> · {ex.question}
            </button>
          ))}
        </div>
        <form onSubmit={onSubmit} className="mx-auto flex max-w-3xl gap-2 px-4 pt-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="질문을 입력하세요"
            maxLength={500}
            aria-label="질문"
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="shrink-0 rounded-xl bg-zinc-900 px-5 py-2.5 font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
          >
            보내기
          </button>
        </form>
        <p className="mx-auto max-w-3xl px-4 pt-2 pb-3 text-xs text-amber-700 dark:text-amber-400">
          ⚠ 실제 개인정보를 입력하지 마세요
        </p>
      </footer>
    </div>
  );
}
