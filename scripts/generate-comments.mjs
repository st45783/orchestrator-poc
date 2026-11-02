// DB 설명서(lib/db/schema-docs.ts)를 DB 자체의 설명(COMMENT)으로 옮기는 SQL을 만든다.
// Supabase 대시보드에서 테이블·컬럼 설명이 보이게 하고, AI가 읽는 설명서와 내용을 같게 유지한다.
// 생성: npm run db:comments:generate   → supabase/migrations/0003_comments.sql
// 적용: npm run db:migrate -- supabase/migrations/0003_comments.sql
import { writeFileSync } from "node:fs";
import { SCHEMA_DOCS } from "../lib/db/schema-docs.ts";
import { DOMAIN_LABELS } from "../lib/types.ts";

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const lines = [
  "-- 자동 생성 파일 — 직접 고치지 말고 lib/db/schema-docs.ts 를 고친 뒤 npm run db:comments:generate 로 다시 만든다.",
  "-- 스키마·테이블·컬럼 설명(COMMENT)만 바꾼다. 데이터와 권한은 바뀌지 않는다.",
  "",
];
let tables = 0;
let columns = 0;

for (const [schema, doc] of Object.entries(SCHEMA_DOCS)) {
  lines.push(`-- ── ${DOMAIN_LABELS[schema]} (${schema}) ──`);
  lines.push(`comment on schema ${schema} is ${q(`${DOMAIN_LABELS[schema]} 업무 합성데이터 (오케스트레이터 PoC, 2026-01~2026-10)`)};`);
  let table = null;
  for (const line of doc.split("\n")) {
    const head = line.match(/^## (\w+) — (.+)$/);
    if (head) {
      table = head[1];
      // staff 는 뷰, 나머지는 테이블
      const kind = table === "staff" ? "view" : "table";
      lines.push(`comment on ${kind} ${schema}.${table} is ${q(head[2])};`);
      tables += 1;
      continue;
    }
    const col = line.match(/^\| (\w+) \| \w+ \| (.+) \|$/);
    if (col && table && col[1] !== "컬럼") {
      lines.push(`comment on column ${schema}.${table}.${col[1]} is ${q(col[2])};`);
      columns += 1;
    }
  }
  lines.push("");
}

writeFileSync(new URL("../supabase/migrations/0003_comments.sql", import.meta.url), lines.join("\n"));
console.log(`생성 완료: supabase/migrations/0003_comments.sql (스키마 ${Object.keys(SCHEMA_DOCS).length}, 테이블·뷰 ${tables}, 컬럼 ${columns})`);
