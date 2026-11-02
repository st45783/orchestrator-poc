-- 업무별 DB 역할이 직접 로그인하도록 바꾼다 (gap 분석 1번: 역할 바꾸기 우회 차단).
-- 이전에는 서버가 postgres로 로그인한 뒤 SET LOCAL ROLE agent_{업무} 로 바꿨다.
-- 그런데 Postgres는 로그인한 사용자(postgres)로 되돌아가는 것을 항상 허용하므로,
-- 쿼리 안의 set_config('role', 'postgres', true) 로 다른 업무 테이블을 읽을 수 있었다.
-- 업무 역할로 직접 로그인하면 되돌아갈 상위 역할이 없고, 다른 업무 역할의 멤버도 아니므로 막힌다.
-- 비밀번호는 이 파일에 쓰지 않는다. scripts/set-agent-password.mjs 가 .env 의 AGENT_DB_PASSWORD 로 설정한다.
-- 실행: npm run db:migrate -- supabase/migrations/0002_agent_logins.sql

alter role agent_hr       login connection limit 10;
alter role agent_finance  login connection limit 10;
alter role agent_sales    login connection limit 10;
alter role agent_security login connection limit 10;
alter role agent_dev      login connection limit 10;

-- 업무 역할은 로그인 후 자기 업무 스키마를 기본 검색 경로로 쓴다
alter role agent_hr       set search_path = hr;
alter role agent_finance  set search_path = finance;
alter role agent_sales    set search_path = sales;
alter role agent_security set search_path = security;
alter role agent_dev      set search_path = dev;

-- 쿼리 하나가 오래 붙잡지 않도록 기본 시간 제한을 둔다 (코드에서도 트랜잭션마다 다시 건다)
alter role agent_hr       set statement_timeout = '5s';
alter role agent_finance  set statement_timeout = '5s';
alter role agent_sales    set statement_timeout = '5s';
alter role agent_security set statement_timeout = '5s';
alter role agent_dev      set statement_timeout = '5s';
