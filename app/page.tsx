// PLAN 작업 15 — 채팅 화면 (화면은 이 하나뿐이다). 모델 목록은 서버가 정해 둔 것만 넘긴다.
import { ALLOWED_MODELS, DEFAULT_MODEL } from "@/lib/models.ts";
import ChatClient from "./components/ChatClient.tsx";

export default function Home() {
  return <ChatClient models={ALLOWED_MODELS} defaultModel={DEFAULT_MODEL} />;
}
