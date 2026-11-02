# 오케스트레이터 서비스 (PoC)

직원이 채팅 화면에 평소 말투로 질문하면, **오케스트레이터**가 5개 업무(인사·재무·영업·보안·개발) 중 어느 업무의 어떤 도구(합성 DB·가짜 API)를 부를지 스스로 판단하고, 결과를 합쳐 답하는 서비스입니다. 답변 아래에는 어느 업무를 왜 호출했는지, 어떤 SQL을 실행했는지 보여주는 **판단 과정 패널**이 함께 나옵니다.

- **배포 주소:** https://orchestrator-poc-sigma.vercel.app
- **기획·심사 자료:** [PRD.md](PRD.md) (요구사항) · [PLAN.md](PLAN.md) (작업 계획) · [DESIGN.md](DESIGN.md) (설계) · [CHECK.md](CHECK.md) (점검 결과)

> 모든 데이터는 직접 만든 **합성데이터**입니다. 실제 회사·고객·개인 정보는 없습니다. 채팅창에 실제 개인정보를 입력하지 마세요.

## 왜 만들었나

사내에서 AI 에이전트를 만들 때마다 "이 질문은 어느 시스템 정보인가"를 판단하는 로직과 DB 조회 기능을 새로 붙여야 했습니다. 이 PoC는 오케스트레이터 하나가 질문을 업무·도구별로 나눠 보내면, 에이전트를 만드는 사람이 조회 기능을 직접 구현하지 않아도 된다는 것을 숫자(라우팅 정답률)로 확인합니다.

## 주요 기능

| 기능 | 설명 |
|---|---|
| 질의 라우팅 | 질문을 분석해 5개 업무 중 필요한 업무를 모두 고르고, 정보 질문은 합성 DB, 작업 요청(휴가 신청 등)은 가짜 API로 보낸다 |
| 복합 질문 | "개발팀 인원과 이번 달 인건비"처럼 여러 업무에 걸친 질문은 각 업무를 동시에 호출해 결과를 합친다 |
| 쿼리 전용 에이전트 | 업무별 DB 설명서를 읽고 SQL을 만들어 실행한다. 실패하면 오류를 보고 최대 2번 고쳐 다시 실행한다 |
| 판단 과정 패널 | 5개 업무의 "호출됨 / 해당 없음", 판단 이유(50자 이내), 실제 실행한 SQL을 보여준다. 업무를 누르면 조회한 테이블·가짜 API 응답이 펼쳐진다 |
| 되묻기·기간 안내 | 업무와 무관하거나 애매한 질문은 되묻고, 데이터 기간(2026-01~10) 밖 질문은 지어내지 않고 안내한다 |
| 이어 묻기 | "그럼 영업팀은?"처럼 직전 질문에 이어서 물을 수 있다 |
| 모델 선택 | 서버가 정한 허용 목록 안에서만 OpenAI 모델을 고를 수 있다 (기본 `gpt-4.1-mini`) |

## 안전장치

- AI가 만든 SQL은 **업무마다 별도 DB 계정**으로 실행해, 다른 업무의 데이터를 읽거나 쓸 수 없다.
- 조회 질문은 **읽기 전용**으로 실행한다. 데이터 변경은 "수정해줘"처럼 분명히 요청할 때만 하며, WHERE 조건이 필요하고 한 번에 10건까지만 바꾼다.
- 결과는 최대 100행까지만 보여주고 "총 ○건 중 100건만 보여줍니다"로 안내한다.
- 요청 하나는 50초 안에 끝난다. 시간 초과나 오류가 나면 진행 중인 작업을 멈추고 "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요" 한 문장만 보여준다.

## 성공 기준 결과 (자동 사전 채점)

| 기준 | 목표 | 결과 |
|---|---|---|
| 라우팅 정답률 (업무·도구 모두 맞아야 정답) | 50문항 중 90% 이상 | 50/50 (100%) |
| 복합 질문 처리 | 10개 중 8개 이상 | 10/10 |
| 오류 응답 · 판단 이유 50자 초과 | 0건 | 0건 |

채점 방법과 문항별 결과는 [eval/questions.json](eval/questions.json)과 [eval/results-gpt-4.1-mini.md](eval/results-gpt-4.1-mini.md)에 있습니다. PRD에 따라 최종 판정은 사람이 판단 과정 패널을 보며 합니다.

## 기술 스택

| 기술 | 역할 |
|---|---|
| Next.js 16 (App Router) · React 19 · Tailwind CSS 4 | 채팅 화면과 서버 API(`/api/chat`) |
| Supabase (Postgres) | 5개 업무의 합성데이터 |
| OpenAI API | 질문 분석, SQL 작성, 답 합치기 |
| Vercel | 배포 |

## 폴더 구조

```
app/
  page.tsx, components/   채팅 화면, 판단 과정 패널
  api/chat/route.ts       오케스트레이터 진입점
lib/
  agents/                 오케스트레이터, 쿼리 전용 에이전트, 업무 서브 에이전트
  db/                     DB 연결, SQL 안전장치, 업무별 DB 설명서
  mock-api.ts             가짜 API 5개
  models.ts, openai.ts    허용 모델 목록, OpenAI 연결
supabase/
  migrations/             스키마·테이블·업무별 DB 계정 생성 SQL
  seed/                   합성데이터 생성기와 seed.sql
eval/                     테스트 60문항·정답표, 채점 결과
scripts/                  DB 적용·확인, 채점 스크립트
```

## 직접 실행하기

1. 패키지를 설치한다.

   ```bash
   npm install
   ```

2. `.env` 파일을 만들고 아래 값을 넣는다. (`.env`는 저장소에 올라가지 않는다)

   | 이름 | 내용 |
   |---|---|
   | `OPENAI_API_KEY` | OpenAI API 키 |
   | `SUPABASE_DB_URL` | Supabase 연결 풀러(transaction) 주소 |
   | `AGENT_DB_PASSWORD` | 업무별 DB 계정 비밀번호 (3단계에서 자동으로 만들어진다) |

3. DB를 만들고 합성데이터를 넣는다.

   ```bash
   npm run db:migrate -- supabase/migrations/0001_domain_schemas.sql
   npm run db:migrate -- supabase/migrations/0002_agent_logins.sql
   npm run db:migrate -- supabase/migrations/0003_comments.sql
   npm run db:set-agent-password
   npm run db:migrate -- supabase/seed/seed.sql
   ```

4. 개발 서버를 켜고 http://localhost:3000 을 연다.

   ```bash
   npm run dev
   ```

## 확인 명령

| 명령 | 확인하는 것 |
|---|---|
| `npm run db:check` | DB 접속 (`select 1`) |
| `npm run db:check-schema` | 테이블·업무별 권한 칸막이 |
| `npm run db:check-seed` | 합성데이터 건수·연결·인건비 일치 |
| `npm run db:check-query` | SQL 안전장치·쿼리 에이전트 |
| `npm run chat:check` | `/api/chat` 대표 질문 (개발 서버 필요, `BASE_URL`로 배포 주소 시험 가능) |
| `npm run eval` | 테스트 60문항 자동 채점 (끝나면 `npm run db:migrate -- supabase/seed/seed.sql`로 데이터 되돌리기) |
