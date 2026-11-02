// PLAN 작업 8 — 서버에서만 쓰는 OpenAI 연결과, 정해진 JSON 모양으로 답을 받는 도우미.
// Design Ref: §4.1 — AI 응답은 정해진 모양(JSON)으로 받고 서버가 검사한다. §2 — 요청 전체 마감(signal)을 따른다.
import "server-only";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";

let client: OpenAI | undefined;

function getOpenAI(): OpenAI {
  if (!client) {
    // 키는 OPENAI_API_KEY 환경변수에서 자동으로 읽는다
    client = new OpenAI({ timeout: 20_000, maxRetries: 1 });
  }
  return client;
}

/**
 * 추론형 모델(gpt-5·o 계열)은 temperature를 지원하지 않는다.
 * 대신 추론 강도를 낮춰, 호출이 3번 이상 이어져도 50초 마감 안에 끝나게 한다.
 */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o\d)/.test(model);
}

type StructuredRequest<T extends z.ZodType> = {
  model: string;
  /** 역할·규칙 설명 */
  system: string;
  /** 이번에 처리할 내용 */
  user: string;
  schema: T;
  /** 응답 형식 이름 (영문·밑줄) */
  name: string;
  signal?: AbortSignal;
};

/** OpenAI를 불러 schema 모양의 JSON으로 답을 받는다. 모양이 안 맞으면 오류를 던진다. */
export async function askStructured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<z.infer<T>> {
  const completion = await getOpenAI().chat.completions.parse(
    {
      model: req.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      response_format: zodResponseFormat(req.schema, req.name),
      ...(isReasoningModel(req.model) ? { reasoning_effort: "low" as const } : { temperature: 0 }),
    },
    { signal: req.signal },
  );
  const parsed = completion.choices[0]?.message.parsed;
  if (parsed == null) {
    throw new Error(`OpenAI 응답을 해석하지 못했습니다 (${req.name})`);
  }
  return parsed as z.infer<T>;
}
