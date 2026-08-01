/**
 * 37차 ④ — 상품 데이터 정제 (사실 tier 편입 + 이름 접두어 제거)
 *
 * 기본 DRY-RUN. --apply 없이는 어떤 write도 하지 않는다.
 *
 * 1) 사실 tier 편입 (36-1 이월)
 *    prod-066  specs.color    = '투명'
 *    prod-172  specs.material = '아크릴'
 *    → contentMeta에 필드경로 키로 provenance 기록 (locked:true, human-verified)
 *
 * 2) 이름 접두어 제거 (37차 Chris 지시)
 *    prod-050 / prod-051  '단순개봉미사용상품 ' 제거
 *    tags·seoTitle에는 해당 문자열 없음(37차 실측) → name만 대상
 *
 * 무접근: status·isVisible·stock·compatibleModels·highlights·contentStatus
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const NAME_PREFIX = '단순개봉미사용상품 ';

/** specs 편입 대상 — 필드경로 키로 provenance 기록 */
const SPEC_TARGETS = [
  { id: 'prod-066', key: 'color',    value: '투명',   expectName: '갤럭시 S26' },
  { id: 'prod-172', key: 'material', value: '아크릴', expectName: null },
];

/** 이름 정제 대상 */
const NAME_TARGETS = ['prod-050', 'prod-051'];

const ALL_IDS = [...SPEC_TARGETS.map((t) => t.id), ...NAME_TARGETS];

async function main() {
  console.log(`=== 상품 데이터 정제 — ${APPLY ? 'APPLY (실제 DB 반영)' : 'DRY-RUN (변경 없음)'} ===\n`);

  const rows = await prisma.product.findMany({
    where: { id: { in: ALL_IDS } },
    select: { id: true, name: true, specs: true, contentMeta: true },
  });
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  // ── 사전검증 ──
  console.log('[사전검증]');
  const missing = ALL_IDS.filter((id) => !byId[id]);
  if (missing.length) {
    console.error(`  ABORT: 미존재 id ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log(`  대상 ${ALL_IDS.length}개 전부 실존 ✓`);

  // specs 대상: 해당 키가 이미 있으면 중단 (덮어쓰기 방지)
  for (const t of SPEC_TARGETS) {
    const specs = byId[t.id].specs;
    if (specs && Object.prototype.hasOwnProperty.call(specs, t.key)) {
      console.error(`  ABORT: ${t.id}.specs.${t.key} 이미 존재 (값: ${JSON.stringify(specs[t.key])})`);
      process.exit(1);
    }
  }
  console.log(`  specs 키 미존재 확인 ✓ (덮어쓰기 없음)`);

  // 이름 대상: 접두어가 정확히 1회, 맨 앞에 있어야 함
  for (const id of NAME_TARGETS) {
    const name = byId[id].name;
    if (!name.startsWith(NAME_PREFIX)) {
      console.error(`  ABORT: ${id} 접두어 불일치 — "${name}"`);
      process.exit(1);
    }
    if (name.split(NAME_PREFIX).length - 1 !== 1) {
      console.error(`  ABORT: ${id} 접두어 다중 출현`);
      process.exit(1);
    }
  }
  console.log(`  접두어 위치·횟수 확인 ✓`);

  // 정제 후 이름이 다른 상품과 충돌하지 않는지
  const newNames = NAME_TARGETS.map((id) => byId[id].name.slice(NAME_PREFIX.length));
  const dup = await prisma.product.findMany({
    where: { name: { in: newNames }, id: { notIn: NAME_TARGETS } },
    select: { id: true, name: true },
  });
  if (dup.length) {
    console.error(`  ABORT: 정제 후 이름 충돌 — ${dup.map((d) => `${d.id}(${d.name})`).join(', ')}`);
    process.exit(1);
  }
  console.log(`  정제 후 이름 충돌 없음 ✓\n`);

  // ── 변경 계획 ──
  const now = new Date().toISOString();
  const plan = [];

  for (const t of SPEC_TARGETS) {
    const row = byId[t.id];
    const nextSpecs = { ...(row.specs || {}), [t.key]: t.value };
    const nextMeta = {
      ...(row.contentMeta || {}),
      [`specs.${t.key}`]: { source: 'human-verified', locked: true, updatedAt: now },
    };
    plan.push({ id: t.id, data: { specs: nextSpecs, contentMeta: nextMeta } });
    console.log(`[specs] ${t.id}`);
    console.log(`  specs        ${JSON.stringify(row.specs)} → ${JSON.stringify(nextSpecs)}`);
    console.log(`  contentMeta  + "specs.${t.key}": {source:human-verified, locked:true}`);
    console.log(`  기존 meta 키 보존: ${Object.keys(row.contentMeta || {}).join(', ')}`);
  }

  for (const id of NAME_TARGETS) {
    const before = byId[id].name;
    const after = before.slice(NAME_PREFIX.length);
    plan.push({ id, data: { name: after } });
    console.log(`\n[name] ${id}`);
    console.log(`  before  ${before}`);
    console.log(`  after   ${after}`);
  }

  if (!APPLY) {
    console.log('\n[DRY-RUN] 실제 반영하려면 --apply 를 붙여 다시 실행하세요.');
    return;
  }

  // ── write (단일 트랜잭션) ──
  await prisma.$transaction(async (tx) => {
    for (const p of plan) {
      const r = await tx.product.update({ where: { id: p.id }, data: p.data });
      if (!r) throw new Error(`update 실패: ${p.id}`);
    }
  });

  console.log(`\n[결과] ${plan.length}건 반영 완료.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
