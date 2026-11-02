// PLAN 작업 14 — 정해진 오류 문구와 서버 로그. 화면 표시는 작업 17에서 한다.
// Design Ref: §2 — 어느 단계든 OpenAI·DB 오류나 시간 초과면 이 문구 하나만 보여준다 (PRD must ① 규칙 9).

export const FIXED_ERROR_MESSAGE = "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요";

/** 상세 오류는 서버 로그에만 남긴다. 사용자 화면에는 보내지 않는다. */
export function logServerError(where: string, error: unknown): void {
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[${where}] ${detail}`);
}
