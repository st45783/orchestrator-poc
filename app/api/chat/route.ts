// PLAN 작업 14 — 채팅 서버 API. 질문·모델을 검사하고 오케스트레이터를 50초 마감 안에서 실행한다.
// Design Ref: §2.1 서버 API 형식, §2 요청 전체 마감 50초
import type { ChatErrorResponse, ChatResponse } from "@/lib/types.ts";
import { DEFAULT_MODEL, isAllowedModel } from "@/lib/models.ts";
import { orchestrate } from "@/lib/agents/orchestrator.ts";
import { FIXED_ERROR_MESSAGE, logServerError } from "@/lib/errors.ts";

/** 서버 함수 제한 (Vercel) */
export const maxDuration = 60;

/** 요청 하나의 마감. 서버 함수 제한보다 먼저 끝나게 한다 */
const DEADLINE_MS = 50_000;
const QUESTION_MAX = 500;

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message } satisfies ChatErrorResponse, { status });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("질문을 확인해 주세요.", 400);
  }
  const { question, model } = (body ?? {}) as { question?: unknown; model?: unknown };

  if (typeof question !== "string" || !question.trim() || question.length > QUESTION_MAX) {
    return errorResponse("질문을 확인해 주세요.", 400);
  }
  // 모델이 없으면 기본 모델, 목록에 없는 이름이면 거부 (DESIGN §4.4)
  const chosenModel = model === undefined || model === "" ? DEFAULT_MODEL : model;
  if (!isAllowedModel(chosenModel)) {
    return errorResponse("허용되지 않은 모델입니다.", 400);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("요청 마감 50초 초과")), DEADLINE_MS);
  try {
    const result = await Promise.race([
      orchestrate(question.trim(), chosenModel, controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
      }),
    ]);
    return Response.json(result satisfies ChatResponse);
  } catch (error) {
    logServerError("api/chat", error);
    return errorResponse(FIXED_ERROR_MESSAGE, 500);
  } finally {
    clearTimeout(timer);
  }
}
