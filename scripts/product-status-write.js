/**
 * STEP 2 — 상품 상태 write (36차: prod-116 단종·품절)
 *
 * 대상 : product.stock / status / isVisible
 * 기본 : DRY-RUN. --apply 없이는 어떤 write도 하지 않음
 *
 * 상태 변경은 노출에 직결되므로 이 스크립트는 **화이트리스트 방식**이다.
 * 아래 TARGETS 에 선언된 상품 외에는 어떤 id도 건드릴 수 없다. 대상을 늘리려면
 * 사람이 TARGETS 를 명시적으로 편집해야 한다(인자로 임의 id를 주입할 수 없음).
 *
 * 사용법
 *   node scripts/product-status-write.js                 DRY-RUN — TARGETS 전체
 *   node scripts/product-status-write.js --apply          실제 DB 반영
 *   node scripts/product-status-write.js --only prod-116  TARGETS 중 일부만 (추가 좁히기)
 *
 * 필드명 주의 (CLAUDE.md gotcha)
 *   Prisma 필드 ≠ DB 컬럼. 실제 스키마는 다음과 같다:
 *     stock      Int     @map("stock_quantity")
 *     isVisible  Boolean @map("is_active")
 *   즉 Prisma에서는 stock·isVisible 이며 stockQuantity·isActive 가 아니다.
 *
 * 단종 표현
 *   status 에 단종 전용값(SUSPENSION/CLOSE)이 운용되면 TARGETS 의 status 를 그것으로
 *   바꾸면 된다. 현재 DB에 관측된 값은 SALE/OUTOFSTOCK 뿐이라
 *   OUTOFSTOCK + isVisible=false 조합으로 단종 효과(비노출)를 달성한다.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/**
 * 이 스크립트가 건드릴 수 있는 전체 목록. 여기 없는 id는 어떤 인자로도 접근 불가.
 * 36차 결정: prod-116(Z폴드7 실리콘 케이스) 이미지 부재로 판매 안 함 → 단종·품절.
 */
const TARGETS = [
  {
    id: 'prod-116',
    reason: '36차 단종 결정 (Z폴드7 실리콘 케이스, 이미지 부재)',
    data: { stock: 0, status: 'OUTOFSTOCK', isVisible: false },
  },
];

/** 사용자 입력·데이터 오류용. 스택 없이 메시지만 출력하고 exit 1 한다. */
class FatalError extends Error {}

// ────────────────────────────────────────────────────────────
// 인자 파싱
// ────────────────────────────────────────────────────────────

const USAGE = [
  '사용법: node scripts/product-status-write.js [옵션]',
  '',
  '  (옵션 없음)      DRY-RUN — 계획만 출력하고 아무것도 쓰지 않는다',
  '  --apply          실제 DB 반영',
  '  --only <ids>     TARGETS 중 지정 id만 처리 (콤마 구분)',
  '  --help           이 도움말',
  '',
  `현재 TARGETS: ${TARGETS.map((t) => t.id).join(', ')}`,
].join('\n');

function parseArgs(argv) {
  const opts = { apply: false, only: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--apply') {
      opts.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--only' || arg.startsWith('--only=')) {
      const raw = arg === '--only' ? argv[(i += 1)] : arg.slice('--only='.length);
      if (!raw) throw new FatalError('--only 뒤에 id를 지정하세요 (예: --only prod-116).');
      const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) throw new FatalError('--only 값이 비어 있습니다.');
      opts.only = ids;
    } else {
      throw new FatalError(`알 수 없는 인자: ${arg}\n\n${USAGE}`);
    }
  }

  return opts;
}

function applyOnlyFilter(targets, only) {
  if (!only) return targets;

  const byId = new Map(targets.map((t) => [t.id, t]));
  // 화이트리스트 밖의 id는 거부한다. --only 로 대상을 넓힐 수 없다.
  const outside = only.filter((id) => !byId.has(id));
  if (outside.length > 0) {
    throw new FatalError(
      `--only 로 지정한 id가 TARGETS 화이트리스트에 없습니다: ${outside.join(', ')}\n` +
        '대상을 늘리려면 스크립트의 TARGETS 를 명시적으로 편집하세요.'
    );
  }
  return only.map((id) => byId.get(id));
}

// ────────────────────────────────────────────────────────────
// 변경 계획 계산
// ────────────────────────────────────────────────────────────

const FIELD_LABEL = {
  stock: 'stock (stock_quantity)',
  status: 'status',
  isVisible: 'isVisible (is_active)',
};

function buildPlan(target, row) {
  const data = {};
  const lines = [];

  Object.entries(target.data).forEach(([field, want]) => {
    const current = row[field];
    if (current !== want) {
      data[field] = want;
      lines.push(`    ${FIELD_LABEL[field].padEnd(24)}: ${String(current)}  ->  ${String(want)}`);
    }
  });

  return {
    id: target.id,
    name: row.name,
    reason: target.reason,
    current: { stock: row.stock, status: row.status, isVisible: row.isVisible },
    data,
    lines,
    hasChange: Object.keys(data).length > 0,
  };
}

// ────────────────────────────────────────────────────────────
// 출력
// ────────────────────────────────────────────────────────────

const RULE = '─────────────────────────────────────';

function printPlans(plans) {
  plans.forEach((plan) => {
    console.log('');
    console.log(`${plan.id}  ${plan.name}`);
    console.log(`  사유        : ${plan.reason}`);
    console.log(
      `  현재 상태   : stock=${plan.current.stock} / status=${plan.current.status} / isVisible=${plan.current.isVisible}`
    );
    if (plan.hasChange) {
      console.log('  변경 예정   :');
      plan.lines.forEach((line) => console.log(line));
    } else {
      console.log('  변경 없음 (이미 목표값과 동일 — no-op)');
    }
  });
  console.log('');
}

function printSummary(plans, opts, activeCount) {
  const changed = plans.filter((p) => p.hasChange).length;
  console.log(RULE);
  console.log(`대상            ${plans.length}`);
  console.log(`변경 ${opts.apply ? '완료' : '예정'}       ${changed}`);
  console.log(`변경 없음       ${plans.length - changed}`);
  if (activeCount !== null) {
    console.log(RULE);
    console.log(`판매노출 상품 수 (isVisible=true)   ${activeCount}`);
  }
  console.log(RULE);
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
    console.warn('  node --env-file=.env.local scripts/product-status-write.js');
    console.warn('');
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('');
  console.log(opts.apply ? '=== STEP 2 상품 상태 — APPLY (실제 DB 반영) ===' : '=== STEP 2 상품 상태 — DRY-RUN (변경 없음) ===');
  if (opts.only) console.log(`옵션: --only ${opts.only.join(',')}`);
  console.log('');

  const targets = applyOnlyFilter(TARGETS, opts.only);
  console.log(`화이트리스트 ${TARGETS.length}건 중 처리 대상 ${targets.length}건`);

  ensureDatabaseUrl();

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const ids = targets.map((t) => t.id);
    const rows = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, stock: true, status: true, isVisible: true },
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));

    const missing = ids.filter((id) => !rowById.has(id));
    if (missing.length > 0) {
      console.error(`DB에 없는 상품 id ${missing.length}건 — 아무것도 쓰지 않고 종료합니다.`);
      missing.forEach((id) => console.error(`  - ${id}`));
      throw new FatalError('TARGETS 와 DB가 어긋났습니다.');
    }

    const plans = targets.map((t) => buildPlan(t, rowById.get(t.id)));

    printPlans(plans);

    if (opts.apply) {
      const toApply = plans.filter((p) => p.hasChange);
      if (toApply.length === 0) {
        console.log('변경할 내용이 없습니다. (이미 모두 목표값)');
        console.log('');
      } else {
        // update(id 단건)만 사용한다. updateMany/upsert 금지.
        await prisma.$transaction(
          toApply.map((plan) => prisma.product.update({ where: { id: plan.id }, data: plan.data }))
        );
        toApply.forEach((plan) => console.log(`${plan.id} 완료`));
        console.log('');
      }
    }

    // baseline 기록용 — 판매노출 상품 수는 dry-run에서도 참고값으로 출력한다.
    const activeCount = await prisma.product.count({ where: { isVisible: true } });

    printSummary(plans, opts, activeCount);

    if (!opts.apply) {
      console.log('[DRY-RUN] 실제 반영하려면 --apply 를 붙여 다시 실행하세요.');
    } else {
      console.log('[APPLY] 반영 완료.');
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
