// PLAN 작업 8 — 화면 메뉴에서 고를 수 있는 OpenAI 모델 목록과 기본 모델.
// Design Ref: §4.4 — 목록에 없는 모델 이름은 서버가 거부한다 (비싼 모델 남용 방지).
// 2026-11-02 사용자 결정: 기본은 gpt-4.1-mini, 목록은 오케스트레이션·도구 호출 성능을 감안해 고른다.
// npm run ai:check 시험에서 gpt-4o-mini는 복합 질문 라우팅을 틀려 목록에서 뺐다.
// 비밀 값이 없으므로 화면과 서버가 함께 쓴다.

export type ModelOption = {
  id: string;
  /** 메뉴에 보이는 이름 */
  label: string;
};

export const ALLOWED_MODELS: readonly ModelOption[] = [
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini (기본 · 빠름)" },
  { id: "gpt-4.1", label: "GPT-4.1 (정확도 우선)" },
  { id: "gpt-5-mini", label: "GPT-5 mini (추론형 · 느림)" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini (추론형 · 최신)" },
];

export const DEFAULT_MODEL = "gpt-4.1-mini";

export function isAllowedModel(model: unknown): model is string {
  return typeof model === "string" && ALLOWED_MODELS.some((m) => m.id === model);
}
