// PLAN 작업 5 — 합성데이터 생성기. 고정 시드를 쓰므로 몇 번을 실행해도 같은 seed.sql이 나온다.
// Design Ref: §3 — 직원 50명을 먼저 만들고, 다른 업무의 담당자는 그 50명 안에서 뽑는다.
//                  월별 부서 인건비(dept_budgets) 합계 = 월별 손익의 인건비(monthly_pnl.labor_cost).
// 모든 이름·회사명은 지어낸 것이다. 개인정보 항목(연락처·주소·주민번호·계좌)은 만들지 않는다.
// 생성: npm run db:seed:generate        → supabase/seed/seed.sql
// 적용: npm run db:migrate -- supabase/seed/seed.sql
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ── 고정 시드 난수 (mulberry32) ───────────────────────────
let seed = 20261031;
function random(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}
function weighted<T>(entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = random() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll < 0) return value;
  }
  return entries[entries.length - 1][0];
}
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

// ── 날짜: 2026-01-01을 0일째로 센다. 2026-10-31은 303일째 ──
const YEAR_START = Date.UTC(2026, 0, 1);
const DAY_MS = 86_400_000;
const LAST_DAY = 303;
const MONTHS = 10;
function toDate(day: number): string {
  return new Date(YEAR_START + day * DAY_MS).toISOString().slice(0, 10);
}
function monthStart(month: number): number {
  return (Date.UTC(2026, month, 1) - YEAR_START) / DAY_MS;
}
function monthEnd(month: number): number {
  return (Date.UTC(2026, month + 1, 1) - YEAR_START) / DAY_MS - 1;
}
/** from~to 사이 평일 하루 (주말이면 다시 뽑는다) */
function weekday(from: number, to: number): number {
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(LAST_DAY, Math.max(from, to));
  for (let i = 0; i < 20; i++) {
    const day = randomInt(lo, hi);
    const w = new Date(YEAR_START + day * DAY_MS).getUTCDay();
    if (w !== 0 && w !== 6) return day;
  }
  return randomInt(lo, hi);
}

// ── 인사: 직원 50명 ───────────────────────────────────────
type Department = "인사팀" | "재무팀" | "영업팀" | "보안팀" | "개발팀";
type Position = "사원" | "대리" | "과장" | "차장" | "부장";
type Employee = { id: number; name: string; department: Department; position: Position; hiredDay: number };

const HEADCOUNT: [Department, number][] = [
  ["인사팀", 6],
  ["재무팀", 7],
  ["영업팀", 12],
  ["보안팀", 8],
  ["개발팀", 17],
];
/** 직급별 월 인건비(원) */
const MONTHLY_SALARY: Record<Position, number> = {
  사원: 3_500_000,
  대리: 4_300_000,
  과장: 5_200_000,
  차장: 6_200_000,
  부장: 7_500_000,
};
const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송", "류", "홍"];
const GIVEN = ["민", "서", "지", "현", "우", "준", "하", "윤", "도", "예", "수", "은", "채", "시", "유", "주", "진", "태", "연", "다", "건", "성", "나", "아", "혜", "재", "영", "규", "빈", "람"];

const usedNames = new Set<string>();
function fakeName(): string {
  for (;;) {
    const name = pick(SURNAMES) + pick(GIVEN) + pick(GIVEN);
    if (name[1] !== name[2] && !usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
}

const draft: Omit<Employee, "id">[] = [];
for (const [department, count] of HEADCOUNT) {
  for (let i = 0; i < count; i++) {
    // 부서마다 처음 두 명은 1월 초에 입사한 관리자 (담당자를 뽑을 사람이 항상 있게)
    const position: Position =
      i === 0 ? "부장" : i === 1 ? pick(["차장", "과장"] as const)
      : weighted([["사원", 40], ["대리", 30], ["과장", 18], ["차장", 8], ["부장", 4]] as const);
    const hiredDay = i < 2 ? weekday(1, 9) : weekday(0, LAST_DAY - 5);
    draft.push({ name: fakeName(), department, position, hiredDay });
  }
}
const employees: Employee[] = shuffle(draft).map((e, index) => ({ id: index + 1, ...e }));
const byDept = (dept: Department, onDay = LAST_DAY) =>
  employees.filter((e) => e.department === dept && e.hiredDay <= onDay);

// ── 인사: 휴가 100건 ──────────────────────────────────────
type Leave = { employeeId: number; type: string; start: number; end: number; days: number; status: string };
const leaves: Leave[] = [];
for (let i = 0; i < 100; i++) {
  const emp = pick(employees.filter((e) => e.hiredDay <= LAST_DAY - 10));
  const type = weighted([["연차", 60], ["반차", 20], ["병가", 12], ["경조사", 8]] as const);
  const length = type === "반차" ? 1 : type === "연차" ? randomInt(1, 3) : type === "병가" ? randomInt(1, 2) : randomInt(1, 5);
  const start = weekday(emp.hiredDay + 7, LAST_DAY - length + 1);
  const end = Math.min(LAST_DAY, start + length - 1);
  const days = type === "반차" ? 0.5 : end - start + 1;
  const status = start > LAST_DAY - 14
    ? weighted([["신청", 60], ["승인", 35], ["반려", 5]] as const)
    : weighted([["승인", 82], ["반려", 10], ["신청", 8]] as const);
  leaves.push({ employeeId: emp.id, type, start, end, days, status });
}

// ── 재무: 부서별 월 예산·집행 / 월별 손익 ────────────────
const OPEX_BASE: Record<Department, number> = {
  인사팀: 8_000_000,
  재무팀: 6_000_000,
  영업팀: 25_000_000,
  보안팀: 15_000_000,
  개발팀: 30_000_000,
};
type Budget = { department: Department; month: number; category: "인건비" | "운영비"; budget: number; spent: number };
type Pnl = { month: number; revenue: number; cost: number; laborCost: number };
const budgets: Budget[] = [];
const pnl: Pnl[] = [];
const roundTo = (value: number, unit: number) => Math.round(value / unit) * unit;

for (let m = 0; m < MONTHS; m++) {
  let labor = 0;
  let opex = 0;
  for (const [dept] of HEADCOUNT) {
    // 그 달 말일까지 입사한 사람의 월 인건비 합계
    const laborSpent = byDept(dept, monthEnd(m)).reduce((sum, e) => sum + MONTHLY_SALARY[e.position], 0);
    const laborBudget = roundTo(laborSpent * (0.98 + random() * 0.12), 100_000);
    const opexSpent = roundTo(OPEX_BASE[dept] * (0.8 + random() * 0.4), 10_000);
    budgets.push({ department: dept, month: m, category: "인건비", budget: laborBudget, spent: laborSpent });
    budgets.push({ department: dept, month: m, category: "운영비", budget: OPEX_BASE[dept], spent: opexSpent });
    labor += laborSpent;
    opex += opexSpent;
  }
  const revenue = roundTo(600_000_000 * (1 + 0.02 * m) * (0.92 + random() * 0.16), 1_000_000);
  const costOfSales = roundTo(revenue * (0.35 + random() * 0.1), 1_000_000);
  // 총비용 = 인건비 + 부서 운영비 + 매출원가
  pnl.push({ month: m, revenue, cost: labor + opex + costOfSales, laborCost: labor });
}

// ── 영업: 고객사 30곳, 계약 100건 ────────────────────────
const CUSTOMER_PREFIX = ["가온", "나래", "다솜", "라온", "마루", "바름", "새봄", "아라", "자람", "차오름", "한결", "해솔", "온새미", "별하", "소담", "슬기", "여울", "윤슬", "은솔", "초롱", "푸름", "하람", "늘품", "도담", "시나브로", "예그리나", "이든", "그루", "단비", "모람"];
const INDUSTRY_SUFFIX: Record<string, string[]> = {
  제조: ["정밀", "산업"],
  유통: ["상사", "유통"],
  금융: ["캐피탈", "투자"],
  IT: ["소프트", "시스템즈"],
  의료: ["메디칼", "헬스케어"],
  교육: ["에듀", "러닝"],
  물류: ["로지스", "물류"],
};
const REGIONS = ["서울", "경기", "인천", "부산", "대구", "대전", "광주"];
const customers = CUSTOMER_PREFIX.map((prefix, index) => {
  const industry = pick(Object.keys(INDUSTRY_SUFFIX));
  return { id: index + 1, name: prefix + pick(INDUSTRY_SUFFIX[industry]), industry, region: pick(REGIONS) };
});

type Contract = { customerId: number; ownerId: number; day: number; amount: number; stage: string };
const contracts: Contract[] = [];
for (let i = 0; i < 100; i++) {
  const day = weekday(10, LAST_DAY);
  const owner = pick(byDept("영업팀", day));
  const stage = day < 200
    ? weighted([["계약", 45], ["실패", 15], ["협상", 15], ["제안", 15], ["문의", 10]] as const)
    : weighted([["문의", 25], ["제안", 25], ["협상", 25], ["계약", 20], ["실패", 5]] as const);
  contracts.push({ customerId: pick(customers).id, ownerId: owner.id, day, amount: randomInt(50, 3000) * 100_000, stage });
}

// ── 보안: 점검·사고 이력 40건, 권한 요청 30건 ────────────
const INSPECTION_TYPES = ["정기 점검", "취약점 점검", "모의 해킹"] as const;
const INCIDENT_TYPES = ["악성코드", "피싱", "계정 도용", "정보 유출"] as const;
type SecurityEvent = { day: number; category: string; type: string; severity: string; actionStatus: string };
const securityEvents: SecurityEvent[] = [];
for (let i = 0; i < 40; i++) {
  const category = weighted([["점검", 45], ["사고", 55]] as const);
  const day = weekday(0, LAST_DAY);
  const type = category === "점검" ? pick(INSPECTION_TYPES) : pick(INCIDENT_TYPES);
  const severity = category === "점검"
    ? weighted([["낮음", 50], ["보통", 35], ["높음", 15]] as const)
    : weighted([["낮음", 20], ["보통", 35], ["높음", 30], ["심각", 15]] as const);
  const actionStatus = day < 240
    ? weighted([["조치완료", 85], ["조치중", 10], ["미조치", 5]] as const)
    : weighted([["조치완료", 40], ["조치중", 35], ["미조치", 25]] as const);
  securityEvents.push({ day, category, type, severity, actionStatus });
}

const SYSTEMS = ["ERP", "그룹웨어", "VPN", "회계 시스템", "CRM", "코드 저장소", "배포 서버"];
type AccessRequest = { requesterId: number; system: string; day: number; status: string };
const accessRequests: AccessRequest[] = [];
for (let i = 0; i < 30; i++) {
  const requester = pick(employees);
  const day = weekday(requester.hiredDay + 1, LAST_DAY);
  const status = day > LAST_DAY - 14
    ? weighted([["요청", 60], ["승인", 30], ["반려", 10]] as const)
    : weighted([["승인", 70], ["반려", 15], ["요청", 15]] as const);
  accessRequests.push({ requesterId: requester.id, system: pick(SYSTEMS), day, status });
}

// ── 개발: 프로젝트 10개, 이슈 150건 ──────────────────────
const PROJECT_NAMES = ["사내 메신저 개편", "결제 모듈 고도화", "고객 포털 리뉴얼", "모바일 앱 2.0", "데이터 분석 플랫폼", "인사 시스템 연동", "보안 로그 수집기", "검색 기능 개선", "배포 자동화", "API 게이트웨이 구축"];
const devLeads = byDept("개발팀").filter((e) => ["과장", "차장", "부장"].includes(e.position));
type Project = { id: number; name: string; leadId: number; startDay: number; status: string };
const projects: Project[] = PROJECT_NAMES.map((name, index) => {
  const lead = pick(devLeads);
  const startDay = weekday(lead.hiredDay + 5, 260);
  const status = startDay > 220
    ? weighted([["계획", 50], ["진행", 50]] as const)
    : weighted([["진행", 50], ["완료", 30], ["보류", 10], ["계획", 10]] as const);
  return { id: index + 1, name, leadId: lead.id, startDay, status };
});

const ISSUE_TITLES = ["로그인 오류 수정", "응답 속도 개선", "화면 깨짐 수정", "알림 발송 누락", "권한 검사 추가", "테스트 코드 보강", "문서 업데이트", "엑셀 다운로드 오류", "검색 결과 정렬 오류", "세션 만료 처리", "입력값 검증 추가", "API 응답 형식 변경", "모바일 화면 대응", "로그 형식 통일", "의존성 버전 올리기"];
type Issue = { projectId: number; title: string; status: string; priority: string; assigneeId: number; day: number };
const issues: Issue[] = [];
for (let i = 0; i < 150; i++) {
  const project = pick(projects);
  const day = weekday(project.startDay, LAST_DAY);
  const assignee = pick(byDept("개발팀", day));
  const status = project.status === "완료"
    ? "완료"
    : weighted([["할일", 30], ["진행중", 30], ["완료", 40]] as const);
  const priority = weighted([["낮음", 25], ["보통", 45], ["높음", 22], ["긴급", 8]] as const);
  issues.push({ projectId: project.id, title: pick(ISSUE_TITLES), status, priority, assigneeId: assignee.id, day });
}

// ── SQL 쓰기 ─────────────────────────────────────────────
const q = (value: string) => `'${value.replace(/'/g, "''")}'`;
function insert(table: string, columns: string[], rows: (string | number)[][]): string {
  const values = rows.map((row) => `  (${row.join(", ")})`).join(",\n");
  return `insert into ${table} (${columns.join(", ")}) values\n${values};\n`;
}

const IDENTITY_TABLES = [
  "hr.employees", "hr.leaves", "finance.dept_budgets", "sales.customers", "sales.contracts",
  "security.security_events", "security.access_requests", "dev.projects", "dev.issues",
];

const out = [
  "-- 자동 생성 파일 — 직접 고치지 말고 supabase/seed/generate.ts 를 고친 뒤 npm run db:seed:generate 로 다시 만든다.",
  "-- 적용: npm run db:migrate -- supabase/seed/seed.sql",
  "-- 주의: 기존 합성데이터를 모두 지우고 다시 채운다.",
  "",
  `truncate ${[...IDENTITY_TABLES, "finance.monthly_pnl"].join(", ")} restart identity cascade;`,
  "",
  insert("hr.employees", ["id", "name", "department", "position", "hired_at"],
    employees.map((e) => [e.id, q(e.name), q(e.department), q(e.position), q(toDate(e.hiredDay))])),
  insert("hr.leaves", ["id", "employee_id", "leave_type", "start_date", "end_date", "days", "status"],
    leaves.map((l, i) => [i + 1, l.employeeId, q(l.type), q(toDate(l.start)), q(toDate(l.end)), l.days, q(l.status)])),
  insert("finance.monthly_pnl", ["month", "revenue", "cost", "labor_cost"],
    pnl.map((p) => [q(toDate(monthStart(p.month))), p.revenue, p.cost, p.laborCost])),
  insert("finance.dept_budgets", ["id", "department", "month", "category", "budget", "spent"],
    budgets.map((b, i) => [i + 1, q(b.department), q(toDate(monthStart(b.month))), q(b.category), b.budget, b.spent])),
  insert("sales.customers", ["id", "name", "industry", "region"],
    customers.map((c) => [c.id, q(c.name), q(c.industry), q(c.region)])),
  insert("sales.contracts", ["id", "customer_id", "owner_employee_id", "contract_date", "amount", "stage"],
    contracts.map((c, i) => [i + 1, c.customerId, c.ownerId, q(toDate(c.day)), c.amount, q(c.stage)])),
  insert("security.security_events", ["id", "occurred_at", "category", "type", "severity", "action_status"],
    securityEvents.map((s, i) => [i + 1, q(toDate(s.day)), q(s.category), q(s.type), q(s.severity), q(s.actionStatus)])),
  insert("security.access_requests", ["id", "requester_employee_id", "system_name", "requested_at", "status"],
    accessRequests.map((a, i) => [i + 1, a.requesterId, q(a.system), q(toDate(a.day)), q(a.status)])),
  insert("dev.projects", ["id", "name", "lead_employee_id", "start_date", "status"],
    projects.map((p) => [p.id, q(p.name), p.leadId, q(toDate(p.startDay)), q(p.status)])),
  insert("dev.issues", ["id", "project_id", "title", "status", "priority", "assignee_employee_id", "created_at"],
    issues.map((s, i) => [i + 1, s.projectId, q(s.title), q(s.status), q(s.priority), s.assigneeId, q(toDate(s.day))])),
  "-- 번호(ID)를 직접 넣었으므로, 다음 자동 번호가 이어지도록 맞춘다",
  ...IDENTITY_TABLES.map((t) => `select setval(pg_get_serial_sequence('${t}', 'id'), (select max(id) from ${t}));`),
  "",
].join("\n");

const target = fileURLToPath(new URL("./seed.sql", import.meta.url));
writeFileSync(target, out);
console.log(`생성 완료: supabase/seed/seed.sql (직원 ${employees.length}, 휴가 ${leaves.length}, 손익 ${pnl.length}, 부서예산 ${budgets.length}, 고객사 ${customers.length}, 계약 ${contracts.length}, 보안이력 ${securityEvents.length}, 권한요청 ${accessRequests.length}, 프로젝트 ${projects.length}, 이슈 ${issues.length})`);
