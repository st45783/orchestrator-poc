// PLAN 작업 7 — 업무별 가짜 API 5개. 실제로 아무 작업도 하지 않고 정해진 "(가상)" 문구만 돌려준다.
// Design Ref: §4.2 — 문구는 서버가 답 뒤에 원문 그대로 붙인다 (§2 핵심 원칙).
import type { Domain, PanelToolRecord } from "./types";

export const MOCK_APIS: Record<Domain, { action: string; message: string }> = {
  hr: { action: "휴가 신청", message: "휴가 신청이 접수되었습니다(가상)" },
  finance: { action: "비용 처리 요청", message: "비용 처리 요청이 접수되었습니다(가상)" },
  sales: { action: "견적서 발행", message: "견적서가 발행되었습니다(가상)" },
  security: { action: "계정 잠금 해제 요청", message: "계정 잠금 해제 요청이 접수되었습니다(가상)" },
  dev: { action: "배포 요청", message: "배포 요청이 접수되었습니다(가상)" },
};

/** 업무의 가짜 API를 호출한다. 확인 없이 바로 정해진 문구를 돌려준다 (PRD must ① 규칙 5). */
export function callMockApi(domain: Domain): PanelToolRecord {
  return { tool: "mock_api", message: MOCK_APIS[domain].message };
}
