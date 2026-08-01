/**
 * M1 — 판매상태 backfill (37차)
 *
 * 대상 : product.status (구값 → 신값) + product.isVisible (status 파생 동기화)
 * 기본 : DRY-RUN. --apply 없이는 어떤 write도 하지 않음
 *
 * DDL 없음. status는 Postgres enum이 아니라 text 컬럼이라(37차 실측)
 * 스키마 변경·마이그레이션이 일절 불필요하며 순수 UPDATE만 수행한다.
 *
 * 선행(앱 레이어, prod 배포 완료):
 *   162842c lib/product-status.ts 신설 (dual-read 술어)
 *   b5139d8 호출부 5곳 리터럴 비교 제거 + ProductCard 품절 뱃지
 * 즉 신값 DB를 앱이 이미 해석할 수 있다. 이 스크립트는 데이터만 바꾼다.
 *
 * 사용법
 *   node scripts/status-backfill.js            DRY-RUN (조회·검증만, write 없음)
 *   node scripts/status-backfill.js --apply     실제 DB 반영
 *
 * 전환 규칙 (§3-2)
 *   SALE                          → ON_SALE       is_active=true
 *   OUTOFSTOCK ∈ DISCONTINUED_IDS → DISCONTINUED  is_active=false
 *   OUTOFSTOCK ∉ DISCONTINUED_IDS → SOLD_OUT      is_active=true   ← 43개 노출 복귀
 *
 * 무접근 필드 (§5-1)
 *   content_status / content_meta / highlights / specs / compatible_models / seo_*
 *   는 이 스크립트의 write 대상이 아니다. 서술 tier 11행(review)과 사실 tier는 불변.
 *
 * 멱등성 (§7)
 *   2회 실행 시 사전검증 2에서 중단된다(이미 신값이라 SALE 146이 아님).
 *   이는 의도된 동작이다. 자동 재시도·자동 복구 로직을 넣지 않는다.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ────────────────────────────────────────────────────────────
// 상태 상수 — lib/product-status.ts 와 동일해야 한다
// ────────────────────────────────────────────────────────────

const STATUS = {
  ON_SALE: 'ON_SALE',
  SOLD_OUT: 'SOLD_OUT',
  DISCONTINUED: 'DISCONTINUED',
};

const LEGACY = {
  SALE: 'SALE',
  OUTOFSTOCK: 'OUTOFSTOCK',
};

/**
 * is_active 파생 규칙.
 *
 * 출처: lib/product-status.ts 의 deriveIsVisible() / VISIBLE_VALUES.
 * ts↔js 경계로 직접 import할 수 없어 동일 로직을 복제한다.
 * 저쪽이 바뀌면 이쪽도 함께 바꿔야 한다(M2에서 LEGACY 제거 예정).
 */
const VISIBLE_VALUES = [STATUS.ON_SALE, STATUS.SOLD_OUT, LEGACY.SALE];

function deriveIsVisible(status) {
  return VISIBLE_VALUES.includes(status);
}

/** 단종 화이트리스트 — 이 10개 외에는 어떤 상품도 DISCONTINUED로 만들지 않는다 (§3-1) */
const DISCONTINUED_IDS = [
  'prod-116', //                                          36차 확정 (이미지 부재·단종)
  'prod-120', 'prod-125', 'prod-185', 'prod-196', //       캐릭터 라이선스 굿즈
  'prod-114', 'prod-115', 'prod-153', 'prod-158', 'prod-164', // S25 계열
];

/** 기대 결과 — 불일치 시 중단 (§3-3) */
const EXPECTED = {
  total: 199,
  legacySale: 146,
  legacyOutOfStock: 53,
  onSale: 146,
  soldOut: 43,
  discontinued: 10,
  visibleTrue: 189,
  visibleFalse: 10,
};

/** 사용자 입력·데이터 오류용. 스택 없이 메시지만 출력하고 exit 1 한다. */
class FatalError extends Error {}

// ────────────────────────────────────────────────────────────
// 인자 파싱
// ────────────────────────────────────────────────────────────

const USAGE = [
  '사용법: node scripts/status-backfill.js [옵션]',
  '',
  '  (옵션 없음)      DRY-RUN — 검증·계획만 출력하고 아무것도 쓰지 않는다',
  '  --apply          실제 DB 반영',
  '  --help           이 도움말',
].join('\n');

function parseArgs(argv) {
  const opts = { apply: false };

  argv.forEach((arg) => {
    if (arg === '--apply') {
      opts.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else {
      throw new FatalError(`알 수 없는 인자: ${arg}\n\n${USAGE}`);
    }
  });

  return opts;
}

// ────────────────────────────────────────────────────────────
// 사전검증 (§4) — 트랜잭션을 열기 전에 전부 수행한다
// ────────────────────────────────────────────────────────────

function mark(ok) {
  return ok ? '✓' : '✗';
}

async function preflight(prisma) {
  const failures = [];
  console.log('[사전검증]');

  // 1. 총 상품 수
  const total = await prisma.product.count();
  const totalOk = total === EXPECTED.total;
  console.log(`  총 상품 수: ${total} ${mark(totalOk)}`);
  if (!totalOk) failures.push(`총 상품 수가 ${EXPECTED.total}이 아닙니다 (실제 ${total}).`);

  // 2. 현재 status 분포 — 신값이 섞여 있으면 중복 실행 가능성이므로 중단
  const grouped = await prisma.product.groupBy({ by: ['status'], _count: { _all: true } });
  const counts = new Map(grouped.map((g) => [g.status, g._count._all]));
  const sale = counts.get(LEGACY.SALE) ?? 0;
  const oos = counts.get(LEGACY.OUTOFSTOCK) ?? 0;
  const others = grouped.filter((g) => g.status !== LEGACY.SALE && g.status !== LEGACY.OUTOFSTOCK);
  const distOk = sale === EXPECTED.legacySale && oos === EXPECTED.legacyOutOfStock && others.length === 0;
  console.log(`  현재 분포: SALE ${sale} / OUTOFSTOCK ${oos} ${mark(distOk)}`);
  if (others.length > 0) {
    console.log(`    기타 상태: ${others.map((g) => `${g.status} ${g._count._all}`).join(' / ')}`);
  }
  if (!distOk) {
    failures.push(
      `현재 분포가 SALE ${EXPECTED.legacySale} / OUTOFSTOCK ${EXPECTED.legacyOutOfStock} 이 아닙니다. ` +
        '이미 backfill이 적용되었을 수 있습니다(멱등성 §7 — 재실행은 사람이 판단).'
    );
  }

  // 3. 화이트리스트 10개 실존 + 전부 OUTOFSTOCK
  const wlRows = await prisma.product.findMany({
    where: { id: { in: DISCONTINUED_IDS } },
    select: { id: true, status: true, stock: true, isVisible: true },
  });
  const wlById = new Map(wlRows.map((r) => [r.id, r]));
  const wlMissing = DISCONTINUED_IDS.filter((id) => !wlById.has(id));
  const wlNotOos = wlRows.filter((r) => r.status !== LEGACY.OUTOFSTOCK);
  const wlOk = wlMissing.length === 0 && wlNotOos.length === 0;
  console.log(
    `  화이트리스트: ${wlRows.length}/${DISCONTINUED_IDS.length} 실존, ` +
      `${wlNotOos.length === 0 ? '전부 OUTOFSTOCK' : `${wlNotOos.length}건 OUTOFSTOCK 아님`} ${mark(wlOk)}`
  );
  if (wlMissing.length > 0) {
    console.log(`    존재하지 않는 id: ${wlMissing.join(', ')}`);
    failures.push(`화이트리스트 id ${wlMissing.length}건이 DB에 없습니다.`);
  }
  if (wlNotOos.length > 0) {
    wlNotOos.forEach((r) => console.log(`    ${r.id}: status=${r.status}`));
    failures.push(
      `화이트리스트에 OUTOFSTOCK이 아닌 상품이 ${wlNotOos.length}건 있습니다. ` +
        '판매중 상품을 단종 처리하는 사고를 막기 위해 중단합니다.'
    );
  }

  // 4. 3축 정합성 — SALE은 stock>0 && is_active=true, OUTOFSTOCK은 stock=0 && is_active=false
  const badSale = await prisma.product.findMany({
    where: { status: LEGACY.SALE, OR: [{ stock: { lte: 0 } }, { isVisible: false }] },
    select: { id: true, stock: true, isVisible: true },
  });
  const badOos = await prisma.product.findMany({
    where: { status: LEGACY.OUTOFSTOCK, OR: [{ stock: { gt: 0 } }, { isVisible: true }] },
    select: { id: true, stock: true, isVisible: true },
  });
  const axisOk = badSale.length === 0 && badOos.length === 0;
  console.log(`  3축 정합성: 모순 ${badSale.length + badOos.length}건 ${mark(axisOk)}`);
  [...badSale, ...badOos].forEach((r) => console.log(`    ${r.id}: stock=${r.stock} is_active=${r.isVisible}`));
  if (!axisOk) failures.push(`status·stock·is_active 3축 모순이 ${badSale.length + badOos.length}건 있습니다.`);

  // 5. 전환 후 예상 분포가 기대값과 일치하는지 계산 검증
  const planOnSale = sale;
  const planDiscontinued = wlRows.filter((r) => r.status === LEGACY.OUTOFSTOCK).length;
  const planSoldOut = oos - planDiscontinued;
  const planVisibleTrue = planOnSale + planSoldOut;
  const planOk =
    planOnSale === EXPECTED.onSale &&
    planSoldOut === EXPECTED.soldOut &&
    planDiscontinued === EXPECTED.discontinued &&
    planVisibleTrue === EXPECTED.visibleTrue;
  console.log(
    `  전환 후 예상: ON_SALE ${planOnSale} / SOLD_OUT ${planSoldOut} / DISCONTINUED ${planDiscontinued} ${mark(planOk)}`
  );
  if (!planOk) {
    failures.push(
      `전환 후 예상 분포가 기대값(${EXPECTED.onSale}/${EXPECTED.soldOut}/${EXPECTED.discontinued})과 다릅니다.`
    );
  }

  console.log('');

  return {
    failures,
    plan: { onSale: planOnSale, soldOut: planSoldOut, discontinued: planDiscontinued },
  };
}

// ────────────────────────────────────────────────────────────
// 출력
// ────────────────────────────────────────────────────────────

function printPlan(plan) {
  console.log('[전환 계획]');
  console.log(
    `  SALE(${plan.onSale})       → ${STATUS.ON_SALE.padEnd(13)}is_active=${deriveIsVisible(STATUS.ON_SALE)}`
  );
  console.log(
    `  OUTOFSTOCK(${plan.soldOut})  → ${STATUS.SOLD_OUT.padEnd(13)}is_active=${deriveIsVisible(STATUS.SOLD_OUT)}   ← 노출 복귀`
  );
  console.log(
    `  OUTOFSTOCK(${plan.discontinued})  → ${STATUS.DISCONTINUED.padEnd(13)}is_active=${deriveIsVisible(STATUS.DISCONTINUED)}`
  );
  // 사후 감사 트레일 — 단종 대상은 id를 전부 출력한다 (§6).
  const sorted = [...DISCONTINUED_IDS].sort();
  for (let i = 0; i < sorted.length; i += 5) {
    console.log(`    ${sorted.slice(i, i + 5).join(', ')}${i + 5 < sorted.length ? ',' : ''}`);
  }
  console.log('');
}

// ────────────────────────────────────────────────────────────
// write (§5)
// ────────────────────────────────────────────────────────────

/**
 * 단일 트랜잭션으로 199행 전체를 처리한다. 부분 성공 상태를 남기지 않는다.
 *
 * updateMany 순서가 중요하다: 화이트리스트(2번)가 잔여 OUTOFSTOCK(3번)보다 먼저여야
 * 단종 10개가 SOLD_OUT으로 잘못 넘어가지 않는다.
 */
async function applyBackfill(prisma, plan) {
  return prisma.$transaction(async (tx) => {
    const r1 = await tx.product.updateMany({
      where: { status: LEGACY.SALE },
      data: { status: STATUS.ON_SALE, isVisible: deriveIsVisible(STATUS.ON_SALE) },
    });
    if (r1.count !== plan.onSale) {
      throw new Error(`updateMany 1 기대 ${plan.onSale}행, 실제 ${r1.count}행 — 롤백합니다.`);
    }

    const r2 = await tx.product.updateMany({
      where: { id: { in: DISCONTINUED_IDS } },
      data: { status: STATUS.DISCONTINUED, isVisible: deriveIsVisible(STATUS.DISCONTINUED) },
    });
    if (r2.count !== plan.discontinued) {
      throw new Error(`updateMany 2 기대 ${plan.discontinued}행, 실제 ${r2.count}행 — 롤백합니다.`);
    }

    const r3 = await tx.product.updateMany({
      where: { status: LEGACY.OUTOFSTOCK },
      data: { status: STATUS.SOLD_OUT, isVisible: deriveIsVisible(STATUS.SOLD_OUT) },
    });
    if (r3.count !== plan.soldOut) {
      throw new Error(`updateMany 3 기대 ${plan.soldOut}행, 실제 ${r3.count}행 — 롤백합니다.`);
    }

    return { r1: r1.count, r2: r2.count, r3: r3.count };
  });
}

async function printResult(prisma, counts) {
  console.log('[결과]');
  console.log(`  updateMany 1: ${counts.r1}행`);
  console.log(`  updateMany 2: ${counts.r2}행`);
  console.log(`  updateMany 3: ${counts.r3}행`);

  const grouped = await prisma.product.groupBy({ by: ['status'], _count: { _all: true } });
  const byStatus = new Map(grouped.map((g) => [g.status, g._count._all]));
  console.log(
    `  최종 분포: ON_SALE ${byStatus.get(STATUS.ON_SALE) ?? 0} / ` +
      `SOLD_OUT ${byStatus.get(STATUS.SOLD_OUT) ?? 0} / ` +
      `DISCONTINUED ${byStatus.get(STATUS.DISCONTINUED) ?? 0}`
  );

  const visTrue = await prisma.product.count({ where: { isVisible: true } });
  const visFalse = await prisma.product.count({ where: { isVisible: false } });
  console.log(`  is_active: true ${visTrue} / false ${visFalse}`);

  const leftover = grouped.filter((g) => g.status === LEGACY.SALE || g.status === LEGACY.OUTOFSTOCK);
  if (leftover.length > 0) {
    console.log(`  ⚠ 구값 잔존: ${leftover.map((g) => `${g.status} ${g._count._all}`).join(' / ')}`);
  }
  console.log('');
}

// ────────────────────────────────────────────────────────────
// 실행
// ────────────────────────────────────────────────────────────

/**
 * node로 직접 실행하면 Next.js와 달리 .env.local 이 자동 로드되지 않는다.
 * Node 20.6+ 의 process.loadEnvFile 이 있으면 DATABASE_URL 이 없을 때만 보충한다.
 */
function ensureDatabaseUrl() {
  if (process.env.DATABASE_URL) return;

  const envPath = path.join(ROOT, '.env.local');
  if (typeof process.loadEnvFile === 'function' && fs.existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
    } catch (err) {
      // 로드 실패는 치명적이지 않다 — 아래 안내 문구로 넘긴다.
    }
  }

  if (!process.env.DATABASE_URL) {
    console.warn('⚠ DATABASE_URL 이 설정되지 않았습니다. 접속에 실패하면 다음처럼 실행하세요:');
    console.warn('  node --env-file=.env.local scripts/status-backfill.js');
    console.warn('');
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('');
  console.log(opts.apply ? '=== M1 판매상태 backfill — APPLY (실제 DB 반영) ===' : '=== M1 판매상태 backfill — DRY-RUN (변경 없음) ===');
  console.log('');

  ensureDatabaseUrl();

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const { failures, plan } = await preflight(prisma);

    if (failures.length > 0) {
      console.error('사전검증 실패 — 아무것도 쓰지 않고 종료합니다.');
      failures.forEach((f) => console.error(`  - ${f}`));
      throw new FatalError(`사전검증 ${failures.length}건 실패로 중단합니다.`);
    }

    printPlan(plan);

    if (opts.apply) {
      const counts = await applyBackfill(prisma, plan);
      await printResult(prisma, counts);
      console.log('[APPLY] 반영 완료.');
    } else {
      console.log('[DRY-RUN] 실제 반영하려면 --apply 를 붙여 다시 실행하세요.');
    }
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('');
  if (err instanceof FatalError) {
    console.error(`❌ ${err.message}`);
  } else {
    console.error('❌ 예기치 못한 오류로 중단했습니다.');
    console.error(err);
  }
  console.error('');
  process.exitCode = 1;
});
