/**
 * 판매상태 승격 write — 신규 31건 DRAFT → ON_SALE/SOLD_OUT (39차)
 *
 * 입력 : --data 로 매번 명시한다(기본값 없음). 상태 변경은 곧 사이트 노출이므로
 *        어떤 파일을 적용했는지가 감사 기록의 핵심이다.
 * 대상 : product.status / product.isVisible — 이 2컬럼만
 * 기본 : DRY-RUN. --apply 없이는 어떤 write도 하지 않음
 *
 * ★ 이 작업은 곧 사이트 공개다. deriveIsVisible이 ON_SALE·SOLD_OUT 모두 true를
 *   반환하므로, --apply 즉시 대상 상품 페이지가 공개되고 사이트맵이 늘어난다.
 *
 * 이 스크립트는 판정기가 아니다. 승격 대상·목표 상태는 39차 검토에서 확정되어
 * JSON에 고정되었다. 목표가 바뀌면 JSON을 다시 만들지, 이 스크립트를 고치지 않는다.
 *
 * 사용법
 *   node scripts/product-promote-write.js --data <경로>            DRY-RUN
 *   node scripts/product-promote-write.js --data <경로> --apply     실제 반영
 *
 * 무접근 컬럼
 *   compatible_models / specs / highlights / seo_* / content_status / content_meta
 *   group_id / group_role / variant_label — 전부 write 대상이 아니다.
 *   갱신시각 컬럼은 Prisma가 자동 관리하므로 참조하지 않는다.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CHUNK_SIZE = 20;

// ────────────────────────────────────────────────────────────
// 상태 — lib/product-status.ts 복제 블록
// ────────────────────────────────────────────────────────────

/**
 * 출처: lib/product-status.ts 의 PRODUCT_STATUS / VISIBLE_VALUES / deriveIsVisible().
 *
 * ts↔js 경계로 직접 import할 수 없고(tsx·ts-node 미설치, 패키지 추가 금지),
 * 37차 scripts/status-backfill.js 가 택한 방식과 동일하게 동등 로직을 복제한다.
 * 저쪽이 바뀌면 이쪽도 함께 바꿔야 한다.
 *
 * 상태 문자열 리터럴은 이 블록에만 존재한다. 아래 코드는 전부 이 상수를 경유하며,
 * 리터럴을 직접 비교하지 않는다.
 */
const PRODUCT_STATUS = {
  ON_SALE: 'ON_SALE',
  SOLD_OUT: 'SOLD_OUT',
  DISCONTINUED: 'DISCONTINUED',
  DRAFT: 'DRAFT',
};

const VISIBLE_VALUES = [PRODUCT_STATUS.ON_SALE, PRODUCT_STATUS.SOLD_OUT, 'SALE'];

function deriveIsVisible(status) {
  return VISIBLE_VALUES.includes(status);
}

/** 이 스크립트가 승격 목표로 허용하는 상태 — 수동 잠금 상태로의 전이는 다루지 않는다 */
const ALLOWED_TO_STATUS = [PRODUCT_STATUS.ON_SALE, PRODUCT_STATUS.SOLD_OUT];

/** 승격 출발점 — 등록 준비 상태에서만 승격한다 */
const REQUIRED_FROM_STATUS = PRODUCT_STATUS.DRAFT;

/** 사용자 입력·데이터 오류용. 스택 없이 메시지만 출력하고 exit 1 한다. */
class FatalError extends Error {}

// ────────────────────────────────────────────────────────────
// 인자 파싱
// ────────────────────────────────────────────────────────────

const USAGE = [
  '사용법: node scripts/product-promote-write.js --data <경로> [옵션]',
  '',
  '  --data <경로>    입력 JSON 경로 (필수 — 기본값 없음)',
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

function mark(ok) {
  return ok ? '✓' : '✗';
}

function truncate(text, max) {
  const str = String(text);
  return str.length <= max ? str : `${str.slice(0, max)}…`;
}

/** 'prod-200' → 200. 패턴이 아니면 null. */
function idNumber(id) {
  const m = /^prod-(\d+)$/.exec(id);
  return m ? parseInt(m[1], 10) : null;
}

/** 입력 경로를 ROOT 기준으로 해석한다. 저장소 밖 경로는 거부 — 감사 대상 입력을 repo 안에 묶는다. */
function resolveDataPath(input) {
  const resolved = path.resolve(ROOT, input);
  if (!resolved.startsWith(ROOT + path.sep)) {
    throw new FatalError(`저장소(ROOT) 밖 경로는 사용할 수 없습니다: ${input}`);
  }
  return resolved;
}

// ────────────────────────────────────────────────────────────
// 데이터 로드
// ────────────────────────────────────────────────────────────

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

  if (!isPlainObject(parsed)) {
    throw new FatalError('데이터 파일 최상위가 객체가 아닙니다.');
  }
  if (!Array.isArray(parsed.records) || parsed.records.length === 0) {
    throw new FatalError('데이터 파일에 records 배열이 없거나 비어 있습니다.');
  }
  if (!isPlainObject(parsed.expectedAfter) || !isPlainObject(parsed.expectedAfter.dbBefore)) {
    throw new FatalError('데이터 파일에 expectedAfter.dbBefore 가 없습니다(사전·사후 대조 불가).');
  }

  return parsed;
}

// ────────────────────────────────────────────────────────────
// 사전 검증 (§5) — 순서대로, 하나라도 실패하면 전체 중단
// ────────────────────────────────────────────────────────────

async function preflight(prisma, parsed) {
  const records = parsed.records;
  const failures = [];
  console.log('[사전 검증]');

  // 1. 건수
  const expectedCount = parsed.stats && typeof parsed.stats.records === 'number' ? parsed.stats.records : records.length;
  const countOk = records.length === expectedCount;
  console.log(`  1. 건수: ${records.length} (stats ${expectedCount}) ${mark(countOk)}`);
  if (!countOk) failures.push(`records 건수(${records.length})가 stats.records(${expectedCount})와 다릅니다.`);

  // 2. id 범위 — 신규 대역만, 기존 대역 미포함
  const nums = records.map((r) => idNumber(r.id));
  const badPattern = records.filter((r, i) => nums[i] === null).map((r) => r.id);
  const legacy = records.filter((r, i) => nums[i] !== null && nums[i] < 200).map((r) => r.id);
  const rangeOk = badPattern.length === 0 && legacy.length === 0;
  console.log(`  2. id 범위: 형식오류 ${badPattern.length}건 / 기존대역(prod-001~199) ${legacy.length}건 ${mark(rangeOk)}`);
  if (badPattern.length > 0) failures.push(`id 형식 오류: ${badPattern.join(', ')}`);
  if (legacy.length > 0) failures.push(`기존 199건이 입력에 포함되어 있습니다: ${legacy.join(', ')}`);

  // 3. JSON 내부 중복
  const seen = new Set();
  const dups = new Set();
  records.forEach((r) => {
    if (seen.has(r.id)) dups.add(r.id);
    seen.add(r.id);
  });
  const dupOk = dups.size === 0;
  console.log(`  3. JSON 내부 id 중복: ${dups.size}건 ${mark(dupOk)}`);
  if (!dupOk) failures.push(`입력에 중복 id가 있습니다: ${[...dups].join(', ')}`);

  // DB 조회 — 이후 검증이 공유한다
  const ids = records.map((r) => r.id);
  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, status: true, stock: true, isVisible: true },
  });
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const missing = ids.filter((id) => !rowById.has(id));
  if (missing.length > 0) {
    console.log(`     DB 미존재 ${missing.length}건: ${missing.join(', ')} ✗`);
    failures.push(`입력 id ${missing.length}건이 DB에 없습니다.`);
  }

  // 4. 현재 status 가 전건 DRAFT — 이미 승격됐거나 다른 상태인 상품을 덮어쓰지 않는다
  const notDraft = rows.filter((r) => r.status !== REQUIRED_FROM_STATUS);
  const fromOk = notDraft.length === 0 && missing.length === 0;
  console.log(`  4. 현재 status === ${REQUIRED_FROM_STATUS}: 어긋남 ${notDraft.length}건 ${mark(fromOk)}`);
  notDraft.forEach((r) => console.log(`     ${r.id}: DB status=${r.status}`));
  if (notDraft.length > 0) {
    failures.push(`DB 현재 상태가 ${REQUIRED_FROM_STATUS}가 아닌 상품이 ${notDraft.length}건 있습니다.`);
  }
  // 입력의 fromStatus 도 같은 값이어야 한다(입력 자체의 정합).
  const badFrom = records.filter((r) => r.fromStatus !== REQUIRED_FROM_STATUS);
  if (badFrom.length > 0) {
    console.log(`     입력 fromStatus 어긋남 ${badFrom.length}건 ✗`);
    failures.push(`입력 fromStatus가 ${REQUIRED_FROM_STATUS}가 아닌 레코드가 ${badFrom.length}건 있습니다.`);
  }

  // 5. 재고 일치 — 확정 시점과 실행 시점 사이의 재고 변동을 잡는다
  const stockMismatch = records
    .filter((r) => rowById.has(r.id) && rowById.get(r.id).stock !== r.expectedStock)
    .map((r) => `${r.id}: DB ${rowById.get(r.id).stock} / 기대 ${r.expectedStock}`);
  const stockOk = stockMismatch.length === 0;
  console.log(`  5. 재고 일치: 불일치 ${stockMismatch.length}건 ${mark(stockOk)}`);
  stockMismatch.forEach((m) => console.log(`     ${m}`));
  if (!stockOk) {
    failures.push('재고가 확정 시점과 달라졌습니다. 목표 상태를 사람이 다시 판단해야 합니다.');
  }

  // 6. 재고 ↔ toStatus 정합 (재고>0 → ON_SALE / 재고=0 → SOLD_OUT)
  const badTarget = records.filter((r) => !ALLOWED_TO_STATUS.includes(r.toStatus));
  const badPair = records.filter((r) => {
    if (!ALLOWED_TO_STATUS.includes(r.toStatus)) return false;
    const wanted = r.expectedStock > 0 ? PRODUCT_STATUS.ON_SALE : PRODUCT_STATUS.SOLD_OUT;
    return r.toStatus !== wanted;
  });
  const pairOk = badTarget.length === 0 && badPair.length === 0;
  console.log(`  6. 재고↔toStatus 정합: 허용외 상태 ${badTarget.length}건 / 부정합 ${badPair.length}건 ${mark(pairOk)}`);
  badTarget.forEach((r) => console.log(`     ${r.id}: toStatus=${r.toStatus} (허용: ${ALLOWED_TO_STATUS.join('/')})`));
  badPair.forEach((r) => console.log(`     ${r.id}: stock=${r.expectedStock} 인데 toStatus=${r.toStatus}`));
  if (badTarget.length > 0) failures.push(`허용되지 않은 toStatus가 ${badTarget.length}건 있습니다.`);
  if (badPair.length > 0) failures.push(`재고와 목표 상태가 어긋난 레코드가 ${badPair.length}건 있습니다.`);

  // 7. dbBefore 대조 — 현재 DB 분포가 확정 시점과 같은지
  const before = parsed.expectedAfter.dbBefore;
  const dist = await prisma.product.groupBy({ by: ['status'], _count: { _all: true } });
  const distMap = new Map(dist.map((g) => [g.status, g._count._all]));
  const visible = await prisma.product.count({ where: { isVisible: true } });
  const beforeKeys = Object.keys(before).filter((k) => k !== 'visible');
  const beforeMismatch = beforeKeys.filter((k) => (distMap.get(k) ?? 0) !== before[k]);
  const visibleOk = before.visible === undefined || visible === before.visible;
  const beforeOk = beforeMismatch.length === 0 && visibleOk;
  console.log(
    `  7. dbBefore 대조: ${dist.map((g) => `${g.status} ${g._count._all}`).join(' / ')} / visible ${visible} ${mark(beforeOk)}`
  );
  beforeMismatch.forEach((k) => console.log(`     ${k}: DB ${distMap.get(k) ?? 0} / 기대 ${before[k]}`));
  if (!visibleOk) console.log(`     visible: DB ${visible} / 기대 ${before.visible}`);
  if (!beforeOk) failures.push('현재 DB 분포가 입력의 dbBefore와 다릅니다. 확정 이후 DB가 변경되었습니다.');

  // 8. isVisible 파생 확인 — 파생 규칙이 바뀌었는데 입력이 낡은 경우를 잡는다
  const derivMismatch = records.filter((r) => deriveIsVisible(r.toStatus) !== r.expectedIsVisible);
  const derivOk = derivMismatch.length === 0;
  console.log(`  8. isVisible 파생 일치: 어긋남 ${derivMismatch.length}건 ${mark(derivOk)}`);
  derivMismatch.forEach((r) =>
    console.log(`     ${r.id}: deriveIsVisible(${r.toStatus})=${deriveIsVisible(r.toStatus)} / 기대 ${r.expectedIsVisible}`)
  );
  if (!derivOk) {
    failures.push('파생 규칙 결과가 입력의 expectedIsVisible과 다릅니다. lib/product-status.ts 변경 여부를 확인하세요.');
  }

  console.log('');
  return { failures, rowById };
}

// ────────────────────────────────────────────────────────────
// 출력
// ────────────────────────────────────────────────────────────

const RULE = '─────────────────────────────────────';

function printPlan(records) {
  const byTarget = {};
  records.forEach((r) => {
    byTarget[r.toStatus] = (byTarget[r.toStatus] ?? 0) + 1;
  });

  console.log('[승격 예정]');
  console.log(
    `  ${records.length}건 승격 예정 (${ALLOWED_TO_STATUS.map((s) => `${s} ${byTarget[s] ?? 0}`).join(' / ')})`
  );
  const sizes = [];
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    sizes.push(Math.min(CHUNK_SIZE, records.length - i));
  }
  console.log(`  청크 구성: ${sizes.length}개 (${sizes.join(' + ')})`);
  console.log('');
  console.log('  ★ 적용 즉시 노출됩니다 — 상품 페이지 공개 + 사이트맵 증가');
  console.log('');

  records.forEach((r) => {
    console.log(
      `    ${r.id}  ${r.fromStatus} → ${r.toStatus.padEnd(9)} ` +
        `isVisible=${deriveIsVisible(r.toStatus)}  stock=${String(r.expectedStock).padStart(3)}  ` +
        truncate(r.name, 34)
    );
  });
  console.log('');
}

// ────────────────────────────────────────────────────────────
// write (§7) — 이 함수 안 1곳이 유일한 write 호출부이며 --apply 분기에서만 호출된다
// ────────────────────────────────────────────────────────────

async function applyPromotions(prisma, records) {
  const total = Math.ceil(records.length / CHUNK_SIZE);
  const done = [];

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const chunkNo = Math.floor(i / CHUNK_SIZE) + 1;

    try {
      // ★ 유일한 write 호출부. update(id 단건)만 사용한다.
      // eslint-disable-next-line no-await-in-loop
      await prisma.$transaction(
        chunk.map((r) =>
          prisma.product.update({
            where: { id: r.id },
            data: { status: r.toStatus, isVisible: deriveIsVisible(r.toStatus) },
          })
        )
      );
    } catch (err) {
      console.error('');
      console.error(`❌ ${chunkNo}/${total} 번째 청크에서 실패했습니다 — 해당 트랜잭션은 롤백되었습니다.`);
      console.error(`   해당 청크 id: ${chunk.map((r) => r.id).join(', ')}`);
      console.error(`   원인: ${err.message}`);
      if (done.length > 0) {
        console.error('');
        console.error(`   앞선 ${done.length}건은 이미 반영되었고 롤백되지 않습니다.`);
        console.error('   재실행하면 사전 검증 4(현재 status)에서 중단되므로, 남은 건만 처리하려면');
        console.error('   사람이 입력 JSON을 분리해 판단하십시오.');
      }
      throw new FatalError(`${chunkNo}번째 청크 실패로 전체 중단합니다(다음 청크 진행 안 함).`);
    }

    chunk.forEach((r) => {
      done.push(r.id);
      console.log(`  ${r.id}  ${r.fromStatus} → ${r.toStatus}  isVisible=${deriveIsVisible(r.toStatus)}`);
    });
    console.log(`  [${chunkNo}/${total}] 청크 완료 — 누적 ${done.length}건`);
  }

  console.log('');
  return done;
}

// ────────────────────────────────────────────────────────────
// 사후 검증 (§8) — --apply 시에만
// ────────────────────────────────────────────────────────────

async function postVerify(prisma, parsed) {
  const records = parsed.records;
  const expected = parsed.expectedAfter;
  console.log('[사후 검증]');
  const warnings = [];

  // 전체 status 분포
  const dist = await prisma.product.groupBy({ by: ['status'], _count: { _all: true } });
  const distMap = new Map(dist.map((g) => [g.status, g._count._all]));
  const wantDist = expected.statusDistribution;
  const distMismatch = Object.keys(wantDist).filter((k) => (distMap.get(k) ?? 0) !== wantDist[k]);
  console.log(`  전체 분포: ${dist.map((g) => `${g.status} ${g._count._all}`).join(' / ')} ${mark(distMismatch.length === 0)}`);
  distMismatch.forEach((k) => console.log(`     ${k}: DB ${distMap.get(k) ?? 0} / 기대 ${wantDist[k]}`));
  if (distMismatch.length > 0) warnings.push('전체 status 분포가 expectedAfter와 다릅니다.');

  // 노출 상품 수
  const visible = await prisma.product.count({ where: { isVisible: true } });
  const visOk = visible === expected.visibleProducts;
  console.log(`  노출 상품 수: ${visible} (기대 ${expected.visibleProducts}) ${mark(visOk)}`);
  if (!visOk) warnings.push(`노출 상품 수가 기대(${expected.visibleProducts})와 다릅니다.`);

  // DRAFT 잔여
  const draftLeft = distMap.get(REQUIRED_FROM_STATUS) ?? 0;
  console.log(`  ${REQUIRED_FROM_STATUS} 잔여: ${draftLeft} ${mark(draftLeft === 0)}`);
  if (draftLeft !== 0) warnings.push(`${REQUIRED_FROM_STATUS} 상품이 ${draftLeft}건 남았습니다.`);

  // 대상 전수 대조 (샘플 아님)
  const ids = records.map((r) => r.id);
  const rows = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, isVisible: true },
  });
  const rowById = new Map(rows.map((r) => [r.id, r]));
  const bad = records.filter((r) => {
    const row = rowById.get(r.id);
    return !row || row.status !== r.toStatus || row.isVisible !== deriveIsVisible(r.toStatus);
  });
  console.log(`  대상 ${records.length}건 전수 대조: 어긋남 ${bad.length}건 ${mark(bad.length === 0)}`);
  bad.forEach((r) => {
    const row = rowById.get(r.id);
    console.log(`     ${r.id}: DB ${row ? `${row.status}/${row.isVisible}` : '(없음)'} / 기대 ${r.toStatus}/${deriveIsVisible(r.toStatus)}`);
  });
  if (bad.length > 0) warnings.push(`대상 ${bad.length}건이 목표 상태와 다릅니다.`);

  // 기존 199건 불변 — write 대상이 아니므로 발생 불가이나 구조 검증용
  const legacyDist = await prisma.product.groupBy({
    by: ['status'],
    where: { id: { notIn: ids } },
    _count: { _all: true },
  });
  const legacyMap = new Map(legacyDist.map((g) => [g.status, g._count._all]));
  const before = expected.dbBefore;
  const legacyKeys = Object.keys(before).filter((k) => k !== 'visible' && k !== REQUIRED_FROM_STATUS);
  const legacyBad = legacyKeys.filter((k) => (legacyMap.get(k) ?? 0) !== before[k]);
  console.log(
    `  기존 199건 분포: ${legacyDist.map((g) => `${g.status} ${g._count._all}`).join(' / ')} ${mark(legacyBad.length === 0)}`
  );
  legacyBad.forEach((k) => console.log(`     ${k}: DB ${legacyMap.get(k) ?? 0} / 기대 ${before[k]}`));
  if (legacyBad.length > 0) warnings.push('기존 199건의 status 분포가 바뀌었습니다.');

  console.log('');
  if (warnings.length > 0) {
    console.warn('⚠ 사후 검증 경고:');
    warnings.forEach((w) => console.warn(`  - ${w}`));
    console.warn('');
  }
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
    console.warn('  node --env-file=.env.local scripts/product-promote-write.js --data <경로>');
    console.warn('');
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('');
  console.log(opts.apply ? '=== 판매상태 승격 — APPLY (실제 DB 반영) ===' : '=== 판매상태 승격 — DRY-RUN (변경 없음) ===');
  console.log('');

  if (!opts.data) {
    throw new FatalError('--data 로 입력 JSON 경로를 지정하세요. 기본값은 제공하지 않습니다.');
  }
  const dataPath = resolveDataPath(opts.data);
  console.log(`입력 파일: ${path.relative(ROOT, dataPath)}`);

  const parsed = loadInput(dataPath);
  console.log(`데이터 파일 로드: ${parsed.records.length}건`);
  console.log('');

  ensureDatabaseUrl();

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const { failures } = await preflight(prisma, parsed);

    if (failures.length > 0) {
      console.error('사전 검증 실패 — 아무것도 쓰지 않고 종료합니다(부분 실행 없음).');
      failures.forEach((f) => console.error(`  - ${f}`));
      throw new FatalError(`사전 검증 ${failures.length}건 실패로 중단합니다.`);
    }

    printPlan(parsed.records);

    if (opts.apply) {
      console.log('[승격 실행]');
      const done = await applyPromotions(prisma, parsed.records);
      console.log(RULE);
      console.log(`승격 완료: ${done.length}건`);
      console.log(RULE);
      console.log('');
      await postVerify(prisma, parsed);
      console.log('[APPLY] 반영 완료 — 사이트에 노출됩니다.');
    } else {
      console.log(RULE);
      console.log(`${parsed.records.length}건 승격 예정 — DB 무변경`);
      console.log(RULE);
      console.log('');
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
