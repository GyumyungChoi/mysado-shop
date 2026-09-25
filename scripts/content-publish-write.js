/**
 * 콘텐츠 축 승격 write — review → published (Phase 7 100차 · C-4 · 이월 #98)
 *
 * 🔴 이 스크립트는 사이트 노출을 바꾸지 않는다. 노출은 판매 축(status·isVisible)이 정하고,
 *    content_status 를 읽는 런타임 코드는 0건이다(75·94차 실측). 여기서 바꾸는 것은
 *    콘텐츠 성숙도 표기뿐이며, M축 계측(published / 전체)의 눈금이다.
 *    이름에 promote 를 쓰지 않은 이유 — scripts/product-promote-write.js 가 이미
 *    판매 상태 승격(DRAFT→ON_SALE)을 뜻한다(46차 §1-1).
 *
 * 승격 조건 = 사람이 승인한 목록 × 게이트 재판정 (100차 D-A 승인)
 *   1. --data JSON 의 ids 가 곧 승인 목록이다(36차 "승인 절차"). 기본값은 없다.
 *   2. 각 행의 현재 contentStatus 가 fromStatus('review') 여야 한다(expectedCurrent).
 *      이미 targetStatus('published') 인 행은 "이미 반영"으로 건너뛴다(멱등).
 *      그 밖의 값이면 전량 중단한다.
 *   3. publish-gate.js 판정으로 관문 1(G1~G5)과 관문 2(G7)를 모두 통과해야 한다.
 *      G5(seoTitle 전역 유일)는 집합 규칙이라 대상만이 아니라 product 전 행을 읽어 판정한다.
 *   하나라도 어긋나면 아무것도 쓰지 않는다(전량 선검사 후 일괄 쓰기 — 71차).
 *
 * 쓰기
 *   - Prisma 로만 쓴다. psql 로 쓰면 updated_at 이 안 움직여 허브 증분 수집에 안 잡힌다
 *     (79차 · 94차 D3). 그래서 updatedAt 을 배치 시각으로 명시해 함께 쓴다.
 *   - 한 트랜잭션 안에서 행마다 조건부 전이를 한다.
 *       updateMany({ where: { id, contentStatus: fromStatus }, data: { contentStatus, updatedAt } })
 *     where 에 id 가 들어간 **단일 행 전이**이며 여러 행을 한꺼번에 바꾸는 호출이 아니다.
 *     count 가 1이 아니면 예외 → 트랜잭션 전체 롤백(97차 #104 결제 상태 전이와 같은 규칙).
 *   - contentStatus·updatedAt 외의 필드는 건드리지 않는다
 *     (서술·사실 tier·contentMeta·판매 축 무접근).
 *
 * 사용법
 *   node scripts/content-publish-write.js --data <경로>            DRY-RUN (쓰기 없음)
 *   node scripts/content-publish-write.js --data <경로> --apply    실제 DB 반영
 *
 * 입력 JSON
 *   { "session": "100차", "note": "...", "fromStatus": "review", "targetStatus": "published",
 *     "expectedCount": 42, "ids": ["prod-001", ...] }
 *   expectedCount 는 ids 개수와 같아야 한다 — 복사·붙여넣기 중 목록이 잘리는 것을 막는다.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { judgeAll } = require('./publish-gate');

const ROOT = path.join(__dirname, '..');

/** 이 스크립트가 허용하는 유일한 전이. 입력으로 바꿀 수 없게 고정한다. */
const FROM_STATUS = 'review';
const TARGET_STATUS = 'published';

const ID_PATTERN = /^prod-\d+$/;

/** 사용자 입력·데이터 오류용. 스택 없이 메시지만 출력하고 exit 1 한다. */
class FatalError extends Error {}

// ────────────────────────────────────────────────────────────
// 인자 파싱
// ────────────────────────────────────────────────────────────

const USAGE = [
  '사용법: node scripts/content-publish-write.js --data <경로> [--apply]',
  '',
  '  --data <경로>    승인 목록 JSON (필수 — 기본값 없음)',
  '  --apply          실제 DB 반영 (없으면 DRY-RUN, 아무것도 쓰지 않는다)',
  '  --help           이 도움말',
].join('\n');

function parseArgs(argv) {
  const opts = { apply: false, data: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--apply') {
      opts.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--data' || arg.startsWith('--data=')) {
      const raw = arg === '--data' ? argv[(i += 1)] : arg.slice('--data='.length);
      if (!raw) throw new FatalError('--data 뒤에 경로를 지정하세요.');
      opts.data = raw;
    } else {
      throw new FatalError(`알 수 없는 인자: ${arg}\n\n${USAGE}`);
    }
  }

  return opts;
}

// ────────────────────────────────────────────────────────────
// 유틸
// ────────────────────────────────────────────────────────────

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function truncate(text, max) {
  const str = String(text);
  return str.length <= max ? str : `${str.slice(0, max)}…`;
}

/** 판정 사유 한 줄 — "MISSING_SEO_TITLE · MISSING_NARRATIVE[description]" */
function fmtReasons(items) {
  return items
    .map((f) => (Array.isArray(f.detail) && f.detail.length > 0 ? `${f.code}[${f.detail.join(', ')}]` : f.code))
    .join(' · ');
}

// ────────────────────────────────────────────────────────────
// 입력 로드·검증
// ────────────────────────────────────────────────────────────

/** 입력 경로를 ROOT 기준으로 해석한다. 저장소 밖 경로는 거부 — 감사 대상 입력을 repo 안에 묶는다. */
function resolveDataPath(input) {
  const resolved = path.resolve(ROOT, input);
  if (!resolved.startsWith(ROOT + path.sep)) {
    throw new FatalError(`저장소(ROOT) 밖 경로는 사용할 수 없습니다: ${input}`);
  }
  return resolved;
}

function loadInput(dataPath) {
  if (!fs.existsSync(dataPath)) {
    throw new FatalError(`데이터 파일이 없습니다: ${dataPath}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (err) {
    throw new FatalError(`데이터 파일 JSON 파싱 실패: ${dataPath}\n${err.message}`);
  }

  validateInput(parsed);
  return parsed;
}

function validateInput(parsed) {
  if (!isPlainObject(parsed)) {
    throw new FatalError('데이터 파일 최상위가 객체가 아닙니다.');
  }
  if (parsed.fromStatus !== FROM_STATUS || parsed.targetStatus !== TARGET_STATUS) {
    throw new FatalError(
      `이 스크립트는 ${FROM_STATUS} → ${TARGET_STATUS} 전이만 합니다 ` +
        `(입력: ${parsed.fromStatus} → ${parsed.targetStatus}).`
    );
  }
  if (!Array.isArray(parsed.ids) || parsed.ids.length === 0) {
    throw new FatalError('데이터 파일에 ids 배열이 없거나 비어 있습니다.');
  }

  const errors = [];
  const seen = new Set();
  parsed.ids.forEach((id, index) => {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
      errors.push(`[${index}] id 형식이 prod-<숫자> 가 아닙니다: ${JSON.stringify(id)}`);
    } else if (seen.has(id)) {
      errors.push(`[${index}] id 중복: ${id}`);
    } else {
      seen.add(id);
    }
  });

  if (!Number.isInteger(parsed.expectedCount)) {
    errors.push('expectedCount 가 정수가 아닙니다.');
  } else if (parsed.expectedCount !== parsed.ids.length) {
    errors.push(`expectedCount(${parsed.expectedCount}) ≠ ids 개수(${parsed.ids.length}) — 목록이 잘렸거나 늘었습니다.`);
  }

  if (errors.length > 0) {
    throw new FatalError(`데이터 파일 검증 실패 (${errors.length}건)\n  - ${errors.slice(0, 30).join('\n  - ')}`);
  }
}

// ────────────────────────────────────────────────────────────
// 계획 계산 (DB 읽기 결과만으로 판정 — 쓰기 없음)
// ────────────────────────────────────────────────────────────

/**
 * 반환: { candidates, alreadyDone, missing, wrongStatus, gateFail, doneButBlocked, outsideCandidates }
 *   candidates        : 승격할 행 (review · 관문 1·2 통과)
 *   alreadyDone       : 이미 published — 건너뜀
 *   missing           : DB 에 없는 id                       → 중단
 *   wrongStatus       : review·published 가 아닌 id          → 중단
 *   gateFail          : review 이지만 관문 1 또는 2 미통과     → 중단
 *   doneButBlocked    : 이미 published 인데 관문 미통과         → 경고만 (쓰지 않음)
 *   outsideCandidates : 목록 밖인데 review · 관문 2 통과       → 참고만 (승인 목록 누락 탐지)
 */
function buildPlan(ids, rows) {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const { results } = judgeAll(rows);
  const resultById = new Map(results.map((r) => [r.id, r]));
  const idSet = new Set(ids);

  const plan = {
    candidates: [],
    alreadyDone: [],
    missing: [],
    wrongStatus: [],
    gateFail: [],
    doneButBlocked: [],
    outsideCandidates: [],
  };

  ids.forEach((id) => {
    const row = rowById.get(id);
    if (!row) {
      plan.missing.push(id);
      return;
    }
    const result = resultById.get(id);
    const reasons = result.failures.concat(result.publishBlockers);

    if (row.contentStatus === TARGET_STATUS) {
      plan.alreadyDone.push(row);
      if (!result.publishable) plan.doneButBlocked.push({ row, reasons });
      return;
    }
    if (row.contentStatus !== FROM_STATUS) {
      plan.wrongStatus.push(row);
      return;
    }
    if (!result.publishable) {
      plan.gateFail.push({ row, reasons });
      return;
    }
    plan.candidates.push(row);
  });

  results.forEach((r) => {
    if (!idSet.has(r.id) && r.contentStatus === FROM_STATUS && r.publishable) {
      plan.outsideCandidates.push(rowById.get(r.id));
    }
  });

  return plan;
}

// ────────────────────────────────────────────────────────────
// 출력
// ────────────────────────────────────────────────────────────

const RULE = '─────────────────────────────────────';

function printPlan(plan) {
  console.log('');
  console.log(`■ 승격 대상 (${FROM_STATUS} → ${TARGET_STATUS})  ${plan.candidates.length}건`);
  plan.candidates.forEach((row) => {
    console.log(`  ${row.id}  ${truncate(row.name, 50)}`);
  });

  if (plan.alreadyDone.length > 0) {
    console.log('');
    console.log(`■ 이미 ${TARGET_STATUS} — 건너뜀  ${plan.alreadyDone.length}건`);
    console.log(`  ${plan.alreadyDone.map((row) => row.id).join(', ')}`);
  }

  if (plan.doneButBlocked.length > 0) {
    console.log('');
    console.log(`⚠ 이미 ${TARGET_STATUS} 인데 관문 미통과 ${plan.doneButBlocked.length}건 — 이 스크립트는 강등하지 않는다`);
    plan.doneButBlocked.forEach(({ row, reasons }) => console.log(`  ${row.id}  ${fmtReasons(reasons)}`));
  }

  console.log('');
  console.log(`참고 · 승인 목록 밖 ${FROM_STATUS} · 관문 2 통과  ${plan.outsideCandidates.length}건`);
  if (plan.outsideCandidates.length > 0) {
    console.log(`  ${plan.outsideCandidates.map((row) => row.id).join(', ')}`);
  }
  console.log('');
}

function printProblems(plan) {
  if (plan.missing.length > 0) {
    console.error(`DB에 없는 id ${plan.missing.length}건: ${plan.missing.join(', ')}`);
  }
  if (plan.wrongStatus.length > 0) {
    console.error(`${FROM_STATUS}·${TARGET_STATUS} 가 아닌 행 ${plan.wrongStatus.length}건`);
    plan.wrongStatus.forEach((row) => console.error(`  ${row.id}  contentStatus=${row.contentStatus}`));
  }
  if (plan.gateFail.length > 0) {
    console.error(`게이트 미통과 ${plan.gateFail.length}건`);
    plan.gateFail.forEach(({ row, reasons }) => console.error(`  ${row.id}  ${fmtReasons(reasons)}`));
  }
}

function printSummary(plan, ids, opts) {
  console.log(RULE);
  console.log(`승인 목록            ${ids.length}`);
  console.log(`승격 ${opts.apply ? '완료' : '예정'}            ${plan.candidates.length}`);
  console.log(`이미 반영            ${plan.alreadyDone.length}`);
  console.log(RULE);
  console.log('바꾸는 필드           contentStatus · updatedAt(배치 시각)');
  console.log('무접근               서술·사실 tier·contentMeta·판매 축(status·isVisible)');
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
    console.warn('  node --env-file=.env.local scripts/content-publish-write.js --data <경로>');
    console.warn('');
  }
}

async function applyPlan(prisma, plan, batchTime) {
  const ids = plan.candidates.map((row) => row.id);

  // 한 트랜잭션 — 42건 중 하나라도 조건부 전이에 실패하면 전부 롤백된다.
  await prisma.$transaction(
    async (tx) => {
      for (const id of ids) {
        // eslint-disable-next-line no-await-in-loop
        const result = await tx.product.updateMany({
          where: { id, contentStatus: FROM_STATUS },
          data: { contentStatus: TARGET_STATUS, updatedAt: batchTime },
        });
        if (result.count !== 1) {
          throw new FatalError(
            `${id}: 조건부 전이 ${result.count}건 — 선검사 이후 상태가 바뀌었습니다. 트랜잭션 전체를 롤백했습니다.`
          );
        }
      }
    },
    { timeout: 30000 }
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('');
  console.log(
    opts.apply
      ? `=== 콘텐츠 축 승격 ${FROM_STATUS} → ${TARGET_STATUS} — APPLY (실제 DB 반영) ===`
      : `=== 콘텐츠 축 승격 ${FROM_STATUS} → ${TARGET_STATUS} — DRY-RUN (변경 없음) ===`
  );
  console.log('※ 사이트 노출과 무관하다 — 노출은 판매 축(status·isVisible)이 정한다.');
  console.log('');

  if (!opts.data) {
    throw new FatalError('--data 로 승인 목록 JSON 경로를 지정하세요. 기본값은 제공하지 않습니다.');
  }
  const dataPath = resolveDataPath(opts.data);
  console.log(`입력 파일: ${path.relative(ROOT, dataPath)}`);

  const parsed = loadInput(dataPath);
  console.log(`승인 목록 로드: ${parsed.ids.length}건 (expectedCount ${parsed.expectedCount} 일치)`);

  ensureDatabaseUrl();

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    // G5 는 집합 규칙이므로 전 행을 읽는다. 필드는 publish-gate-report.js 와 같다.
    const rows = await prisma.product.findMany({
      select: {
        id: true,
        name: true,
        images: true,
        price: true,
        categoryId: true,
        compatibleModels: true,
        specs: true,
        seoTitle: true,
        seoDescription: true,
        highlights: true,
        description: true,
        contentMeta: true,
        contentStatus: true,
      },
      orderBy: { id: 'asc' },
    });
    console.log(`product 전 행 읽기: ${rows.length}건 (G5 전역 판정용)`);

    const plan = buildPlan(parsed.ids, rows);

    if (plan.missing.length + plan.wrongStatus.length + plan.gateFail.length > 0) {
      console.error('');
      printProblems(plan);
      throw new FatalError('선검사 실패 — 아무것도 쓰지 않고 종료합니다. 승인 목록 또는 데이터를 먼저 확인하세요.');
    }
    console.log('선검사: 전 id 존재 · 상태 · 관문 1·2 통과 OK');

    printPlan(plan);

    // 배치 식별이 쉽도록 실행 시각 하나를 전 행에 같게 쓴다.
    const batchTime = new Date();

    if (opts.apply) {
      if (plan.candidates.length === 0) {
        console.log('승격할 행이 없습니다. (이미 모두 반영됨)');
        console.log('');
      } else {
        await applyPlan(prisma, plan, batchTime);
        const after = await prisma.product.findMany({
          where: { id: { in: plan.candidates.map((row) => row.id) } },
          select: { id: true, contentStatus: true },
        });
        const done = after.filter((row) => row.contentStatus === TARGET_STATUS).length;
        // 자체 확인일 뿐이다 — 독립 psql 교차검증을 대신하지 않는다.
        console.log(`자체 재조회: ${done} / ${plan.candidates.length} 건이 ${TARGET_STATUS}`);
        console.log('');
      }
    }

    printSummary(plan, parsed.ids, opts);

    if (!opts.apply) {
      console.log('[DRY-RUN] 대상 목록을 육안 확인한 뒤 --apply 를 붙여 다시 실행하세요.');
    } else {
      console.log(`[APPLY] 반영 완료 (배치 시각 ${batchTime.toISOString()}).`);
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
