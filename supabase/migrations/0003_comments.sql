-- 자동 생성 파일 — 직접 고치지 말고 lib/db/schema-docs.ts 를 고친 뒤 npm run db:comments:generate 로 다시 만든다.
-- 스키마·테이블·컬럼 설명(COMMENT)만 바꾼다. 데이터와 권한은 바뀌지 않는다.

-- ── 인사 (hr) ──
comment on schema hr is '인사 업무 합성데이터 (오케스트레이터 PoC, 2026-01~2026-10)';
comment on table hr.employees is '직원 (50명)';
comment on column hr.employees.id is '직원 번호';
comment on column hr.employees.name is '이름';
comment on column hr.employees.department is '부서: ''인사팀'', ''재무팀'', ''영업팀'', ''보안팀'', ''개발팀''';
comment on column hr.employees.position is '직급: ''사원'', ''대리'', ''과장'', ''차장'', ''부장''';
comment on column hr.employees.hired_at is '입사일 (2026년 안)';
comment on table hr.leaves is '휴가 내역 (100건)';
comment on column hr.leaves.id is '휴가 번호';
comment on column hr.leaves.employee_id is '직원 번호 (employees.id)';
comment on column hr.leaves.leave_type is '종류: ''연차'', ''반차'', ''병가'', ''경조사''';
comment on column hr.leaves.start_date is '시작일';
comment on column hr.leaves.end_date is '종료일';
comment on column hr.leaves.days is '사용 일수 (반차는 0.5)';
comment on column hr.leaves.status is '상태: ''신청'', ''승인'', ''반려''';

-- ── 재무 (finance) ──
comment on schema finance is '재무 업무 합성데이터 (오케스트레이터 PoC, 2026-01~2026-10)';
comment on table finance.monthly_pnl is '월별 손익 (2026-01 ~ 2026-10, 10건)';
comment on column finance.monthly_pnl.month is '해당 월의 1일 (예: ''2026-10-01''이 10월)';
comment on column finance.monthly_pnl.revenue is '매출';
comment on column finance.monthly_pnl.cost is '총비용 (인건비 + 운영비 + 매출원가)';
comment on column finance.monthly_pnl.labor_cost is '회사 전체 인건비';
comment on column finance.monthly_pnl.operating_profit is '영업이익 = revenue - cost';
comment on table finance.dept_budgets is '부서별 월 예산·집행액 (부서 5 × 10개월 × 2종류 = 100건)';
comment on column finance.dept_budgets.id is '번호';
comment on column finance.dept_budgets.department is '부서: ''인사팀'', ''재무팀'', ''영업팀'', ''보안팀'', ''개발팀''';
comment on column finance.dept_budgets.month is '해당 월의 1일';
comment on column finance.dept_budgets.category is '종류: ''인건비'', ''운영비''';
comment on column finance.dept_budgets.budget is '예산';
comment on column finance.dept_budgets.spent is '실제 집행액';

-- ── 영업 (sales) ──
comment on schema sales is '영업 업무 합성데이터 (오케스트레이터 PoC, 2026-01~2026-10)';
comment on table sales.customers is '고객사 (30곳)';
comment on column sales.customers.id is '고객사 번호';
comment on column sales.customers.name is '고객사 이름';
comment on column sales.customers.industry is '업종: ''제조'', ''유통'', ''금융'', ''IT'', ''의료'', ''교육'', ''물류''';
comment on column sales.customers.region is '지역: ''서울'', ''경기'', ''인천'', ''부산'', ''대구'', ''대전'', ''광주''';
comment on table sales.contracts is '계약 (100건)';
comment on column sales.contracts.id is '계약 번호';
comment on column sales.contracts.customer_id is '고객사 번호 (customers.id)';
comment on column sales.contracts.owner_employee_id is '영업 담당자 직원 번호 (staff.id)';
comment on column sales.contracts.contract_date is '계약(기회) 일자';
comment on column sales.contracts.amount is '금액';
comment on column sales.contracts.stage is '진행 단계: ''문의'', ''제안'', ''협상'', ''계약'', ''실패'' (''계약''이 성사된 건)';
comment on view sales.staff is '직원 이름 보기 (조회 전용)';
comment on column sales.staff.id is '직원 번호';
comment on column sales.staff.name is '이름';
comment on column sales.staff.department is '부서';

-- ── 보안 (security) ──
comment on schema security is '보안 업무 합성데이터 (오케스트레이터 PoC, 2026-01~2026-10)';
comment on table security.security_events is '보안 점검·사고 이력 (40건)';
comment on column security.security_events.id is '번호';
comment on column security.security_events.occurred_at is '발생(실시)일';
comment on column security.security_events.category is '구분: ''점검'', ''사고''';
comment on column security.security_events.type is '유형. 점검: ''정기 점검'', ''취약점 점검'', ''모의 해킹'' / 사고: ''악성코드'', ''피싱'', ''계정 도용'', ''정보 유출''';
comment on column security.security_events.severity is '심각도: ''낮음'', ''보통'', ''높음'', ''심각''';
comment on column security.security_events.action_status is '조치 상태: ''미조치'', ''조치중'', ''조치완료''';
comment on table security.access_requests is '권한 요청 (30건)';
comment on column security.access_requests.id is '번호';
comment on column security.access_requests.requester_employee_id is '요청자 직원 번호 (staff.id)';
comment on column security.access_requests.system_name is '시스템: ''ERP'', ''그룹웨어'', ''VPN'', ''회계 시스템'', ''CRM'', ''코드 저장소'', ''배포 서버''';
comment on column security.access_requests.requested_at is '요청일';
comment on column security.access_requests.status is '상태: ''요청'', ''승인'', ''반려''';
comment on view security.staff is '직원 이름 보기 (조회 전용)';
comment on column security.staff.id is '직원 번호';
comment on column security.staff.name is '이름';
comment on column security.staff.department is '부서';

-- ── 개발 (dev) ──
comment on schema dev is '개발 업무 합성데이터 (오케스트레이터 PoC, 2026-01~2026-10)';
comment on table dev.projects is '프로젝트 (10개)';
comment on column dev.projects.id is '프로젝트 번호';
comment on column dev.projects.name is '프로젝트 이름';
comment on column dev.projects.lead_employee_id is '리더 직원 번호 (staff.id)';
comment on column dev.projects.start_date is '시작일';
comment on column dev.projects.status is '상태: ''계획'', ''진행'', ''완료'', ''보류''';
comment on table dev.issues is '이슈 (150건)';
comment on column dev.issues.id is '이슈 번호';
comment on column dev.issues.project_id is '프로젝트 번호 (projects.id)';
comment on column dev.issues.title is '제목';
comment on column dev.issues.status is '상태: ''할일'', ''진행중'', ''완료''';
comment on column dev.issues.priority is '우선순위: ''낮음'', ''보통'', ''높음'', ''긴급''';
comment on column dev.issues.assignee_employee_id is '담당자 직원 번호 (staff.id)';
comment on column dev.issues.created_at is '생성일';
comment on view dev.staff is '직원 이름 보기 (조회 전용)';
comment on column dev.staff.id is '직원 번호';
comment on column dev.staff.name is '이름';
comment on column dev.staff.department is '부서';
