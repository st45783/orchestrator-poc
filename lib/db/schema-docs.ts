// PLAN 작업 6 — 업무별 DB 설명서. 쿼리 전용 에이전트가 SQL을 만들 때 프롬프트에 그대로 넣는다.
// Design Ref: §3 — 설명서에 적힌 테이블·컬럼만 쓴다 (PRD must ② 규칙 1). 영업·보안·개발에는 staff 뷰를 포함한다.
// 테이블·허용 값은 supabase/migrations/0001_domain_schemas.sql 과 같아야 한다. 바꾸면 둘 다 고친다.
// Vercel 배포 시 파일이 함께 묶이도록 .md 대신 코드 모듈로 둔다.
import type { Domain } from "../types";

const COMMON = `
공통 규칙:
- 데이터 기준일은 2026-10-31이다. "이번 달"은 2026년 10월, "지난달"은 2026년 9월이다.
- 데이터는 2026-01-01 ~ 2026-10-31 범위만 있다.
- 금액 단위는 모두 원(KRW)이다.
- 테이블 이름에 스키마를 붙이지 않는다 (예: employees). 이 업무의 스키마로 이미 맞춰져 있다.
- 아래에 없는 테이블·컬럼은 존재하지 않는다.`;

export const SCHEMA_DOCS: Record<Domain, string> = {
  hr: `# 인사(hr) DB 설명서

## employees — 직원 (50명)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | integer | 직원 번호 |
| name | text | 이름 |
| department | text | 부서: '인사팀', '재무팀', '영업팀', '보안팀', '개발팀' |
| position | text | 직급: '사원', '대리', '과장', '차장', '부장' |
| hired_at | date | 입사일 (2026년 안) |

## leaves — 휴가 내역 (100건)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | integer | 휴가 번호 |
| employee_id | integer | 직원 번호 (employees.id) |
| leave_type | text | 종류: '연차', '반차', '병가', '경조사' |
| start_date | date | 시작일 |
| end_date | date | 종료일 |
| days | numeric | 사용 일수 (반차는 0.5) |
| status | text | 상태: '신청', '승인', '반려' |
${COMMON}`,

  finance: `# 재무(finance) DB 설명서

## monthly_pnl — 월별 손익 (2026-01 ~ 2026-10, 10건)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| month | date | 해당 월의 1일 (예: '2026-10-01'이 10월) |
| revenue | bigint | 매출 |
| cost | bigint | 총비용 (인건비 + 운영비 + 매출원가) |
| labor_cost | bigint | 회사 전체 인건비 |
| operating_profit | bigint | 영업이익 = revenue - cost |

## dept_budgets — 부서별 월 예산·집행액 (부서 5 × 10개월 × 2종류 = 100건)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | integer | 번호 |
| department | text | 부서: '인사팀', '재무팀', '영업팀', '보안팀', '개발팀' |
| month | date | 해당 월의 1일 |
| category | text | 종류: '인건비', '운영비' |
| budget | bigint | 예산 |
| spent | bigint | 실제 집행액 |

참고: 부서별 인건비는 dept_budgets에서 category = '인건비'의 spent로 구한다.
월별 dept_budgets 인건비 spent 합계는 monthly_pnl.labor_cost와 같다.
${COMMON}`,

  sales: `# 영업(sales) DB 설명서

## customers — 고객사 (30곳)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | integer | 고객사 번호 |
| name | text | 고객사 이름 |
| industry | text | 업종: '제조', '유통', '금융', 'IT', '의료', '교육', '물류' |
| region | text | 지역: '서울', '경기', '인천', '부산', '대구', '대전', '광주' |

## contracts — 계약 (100건)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | integer | 계약 번호 |
| customer_id | integer | 고객사 번호 (customers.id) |
| owner_employee_id | integer | 영업 담당자 직원 번호 (staff.id) |
| contract_date | date | 계약(기회) 일자 |
| amount | bigint | 금액 |
| stage | text | 진행 단계: '문의', '제안', '협상', '계약', '실패' ('계약'이 성사된 건) |

## staff — 직원 이름 보기 (조회 전용)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | integer | 직원 번호 |
| name | text | 이름 |
| department | text | 부서 |

담당자 이름은 contracts.owner_employee_id = staff.id 로 연결해 찾는다.
${COMMON}`,

  security: `# 보안(security) DB 설명서

## security_events — 보안 점검·사고 이력 (40건)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | integer | 번호 |
| occurred_at | date | 발생(실시)일 |
| category | text | 구분: '점검', '사고' |
| type | text | 유형. 점검: '정기 점검', '취약점 점검', '모의 해킹' / 사고: '악성코드', '피싱', '계정 도용', '정보 유출' |
| severity | text | 심각도: '낮음', '보통', '높음', '심각' |
| action_status | text | 조치 상태: '미조치', '조치중', '조치완료' |

## access_requests — 권한 요청 (30건)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | integer | 번호 |
| requester_employee_id | integer | 요청자 직원 번호 (staff.id) |
| system_name | text | 시스템: 'ERP', '그룹웨어', 'VPN', '회계 시스템', 'CRM', '코드 저장소', '배포 서버' |
| requested_at | date | 요청일 |
| status | text | 상태: '요청', '승인', '반려' |

## staff — 직원 이름 보기 (조회 전용)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | integer | 직원 번호 |
| name | text | 이름 |
| department | text | 부서 |
${COMMON}`,

  dev: `# 개발(dev) DB 설명서

## projects — 프로젝트 (10개)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | integer | 프로젝트 번호 |
| name | text | 프로젝트 이름 |
| lead_employee_id | integer | 리더 직원 번호 (staff.id) |
| start_date | date | 시작일 |
| status | text | 상태: '계획', '진행', '완료', '보류' |

## issues — 이슈 (150건)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | integer | 이슈 번호 |
| project_id | integer | 프로젝트 번호 (projects.id) |
| title | text | 제목 |
| status | text | 상태: '할일', '진행중', '완료' |
| priority | text | 우선순위: '낮음', '보통', '높음', '긴급' |
| assignee_employee_id | integer | 담당자 직원 번호 (staff.id) |
| created_at | date | 생성일 |

## staff — 직원 이름 보기 (조회 전용)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | integer | 직원 번호 |
| name | text | 이름 |
| department | text | 부서 |
${COMMON}`,
};
