// PLAN 작업 8 확인 — 허용 목록의 모델마다 정해진 JSON 모양으로 답하는지와 걸린 시간을 본다.
// 실행: npm run ai:check   (모델마다 짧은 호출 1번, 요금이 조금 든다)
import { z } from "zod";
import { askStructured } from "../lib/openai.ts";
import { ALLOWED_MODELS, DEFAULT_MODEL } from "../lib/models.ts";

const schema = z.object({
  domains: z.array(z.enum(["hr", "finance", "sales", "security", "dev"])),
  reason: z.string(),
});

let failures = 0;
for (const { id } of ALLOWED_MODELS) {
  const started = Date.now();
  try {
    const result = await askStructured({
      model: id,
      name: "routing_check",
      system: "질문에 필요한 업무를 고른다. hr=인사, finance=재무, sales=영업, security=보안, dev=개발. 판단 이유는 한 문장.",
      user: "개발팀 인원과 이번 달 인건비 알려줘",
      schema,
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`✅ ${id}${id === DEFAULT_MODEL ? " (기본)" : ""} — ${seconds}초 — 업무: ${result.domains.join(", ")} / 이유: ${result.reason}`);
  } catch (error) {
    failures += 1;
    console.log(`❌ ${id} — ${error instanceof Error ? error.message : error}`);
  }
}
if (failures > 0) process.exitCode = 1;
