/**
 * 37-1 — 신규 상품 31건 INSERT (38차)
 *
 * 입력 : data/신규상품-38차-확정-31.json (38차 확정·검증 완료 — 폴더블8 라인업 prod-200~230)
 * 대상 : product 신규 31행 INSERT
 * 기본 : DRY-RUN. --apply 없이는 어떤 write도 하지 않음
 *
 * 이 스크립트는 파서가 아니다. 네이버 원본 파싱·필드 변환·SKU 디코딩·그룹 판정은
 * 38차 대화에서 완료되어 JSON에 확정값으로 고정되었다. 데이터가 바뀌면 JSON을
 * 다시 만들지, 이 스크립트를 고치지 않는다.
 *
 * 사용법
 *   node scripts/product-insert-38.js            DRY-RUN (검증만, write 없음)
 *   node scripts/product-insert-38.js --apply     실제 INSERT
 *
 * 구조적 차단 (§1)
 *   이 파일에는 create 외의 write 경로가 존재하지 않는다. 기존 199행을 건드릴 수
 *   있는 호출부가 코드에 아예 없으므로, 규칙 위반이 아니라 구조적으로 불가능하다.
 *   create 호출부는 단 1곳이며 --apply 분기 안에만 있다(insertChunks 내부).
 *
 * 고정값 3종 (§4-3) — JSON에 없고 스크립트가 부여
 *   status        'DRAFT'                    신규 등록 시작점 (37차 §3-1)
 *   isVisible     deriveIsVisible('DRAFT')   하드코딩 금지 — 파생 함수 결과 사용
 *   contentStatus 'raw'                      서술 tier 미착수
 *
 * 설정하지 않는 컬럼 (스키마 기본값에 위임)
 *   compatibleModels / specs / highlights / seoTitle / seoDescription / contentMeta
 *   groupId / variantLabel / groupRole / createdAt
 *   갱신시각 컬럼은 Prisma가 자동 관리하므로 이 스크립트가 참조하지 않는다.
 *
 * intended_status 는 읽되 DB에 쓰지 않는다. 승격은 별도 단계다(분포만 출력).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', '신규상품-38차-확정-31.json');
const CATEGORIES_PATH = path.join(ROOT, 'data', 'categories.json');

const CHUNK_SIZE = 20;
const EXPECTED_COUNT = 31;
const EXPECTED_EXISTING = 199;

/** 기존 199행의 status 분포 — INSERT 전후로 불변이어야 한다 (§4-5) */
const EXPECTED_EXISTING_DIST = { ON_SALE: 146, SOLD_OUT: 43, DISCONTINUED: 10 };

// ────────────────────────────────────────────────────────────
// 상태 — lib/product-status.ts 와 동일해야 한다
// ────────────────────────────────────────────────────────────

/**
 * 출처: lib/product-status.ts 의 PRODUCT_STATUS / VISIBLE_VALUES / deriveIsVisible().
 * ts↔js 경계로 직접 import할 수 없어 동일 로직을 복제한다.
 * 저쪽이 바뀌면 이쪽도 함께 바꿔야 한다(37차 status-backfill.js와 같은 방침).
 */
const STATUS_DRAFT = 'DRAFT';
const VISIBLE_VALUES = ['ON_SALE', 'SOLD_OUT', 'SALE'];

function deriveIsVisible(status) {
  return VISIBLE_VALUES.includes(status);
}

const NEW_CONTENT_STATUS = 'raw';

/** 사용자 입력·데이터 오류용. 스택 없이 메시지만 출력하고 exit 1 한다. */
class FatalError extends Error {}

// ────────────────────────────────────────────────────────────
// 인자 파싱
// ────────────────────────────────────────────────────────────

const USAGE = [
  '사용법: node scripts/product-insert-38.js [옵션]',
  '',
  '  (옵션 없음)      DRY-RUN — 검증·계획만 출력하고 아무것도 쓰지 않는다',
  '  --apply          실제 INSERT',
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
// 유틸
// ────────────────────────────────────────────────────────────

function mark(ok) {
  return ok ? '✓' : '✗';
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new FatalError(`${label} 파일이 없습니다: ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new FatalError(`${label} JSON 파싱 실패: ${filePath}\n${err.message}`);
  }
}

/** 'prod-200' → 200. 패턴이 아니면 null. */
function idNumber(id) {
  const m = /^prod-(\d+)$/.exec(id);
  return m ? parseInt(m[1], 10) : null;
}

function findDuplicates(values) {
  const seen = new Set();
  const dups = new Set();
  values.forEach((v) => {
    if (seen.has(v)) dups.add(v);
    seen.add(v);
  });
  return [...dups];
}

// ────────────────────────────────────────────────────────────
// 사전 검증 (§4-2) — 순서대로 수행, 하나라도 실패하면 전체 중단
// ────────────────────────────────────────────────────────────

async function preflight(prisma, records) {
  const failures = [];
  console.log('[사전 검증]');

  // 1. 건수
  const countOk = records.length === EXPECTED_COUNT;
  console.log(`  1. JSON 건수: ${records.length} ${mark(countOk)}`);
  if (!countOk) failures.push(`JSON 건수가 ${EXPECTED_COUNT}이 아닙니다 (실제 ${records.length}).`);

  const ids = records.map((r) => r.id);
  const skus = records.map((r) => r.sku);
  const origins = records.map((r) => r.origin_product_no);
  const channels = records.map((r) => r.channel_product_no);
  const names = records.map((r) => r.name);
  const sortOrders = records.map((r) => r.sort_order);

  // 2. id 충돌
  const idHits = await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const idOk = idHits.length === 0;
  console.log(`  2. id 충돌: ${idHits.length}건 ${mark(idOk)}`);
  if (!idOk) {
    console.log(`     충돌 id: ${idHits.map((r) => r.id).join(', ')}`);
    failures.push(`JSON의 id ${idHits.length}건이 이미 DB에 있습니다.`);
  }

  // 3. id 채번 정합 — 문자열 max가 아니라 정수 변환 후 max
  const existingIds = await prisma.product.findMany({ select: { id: true } });
  const existingNums = existingIds.map((r) => idNumber(r.id)).filter((n) => n !== null);
  const maxNum = existingNums.length > 0 ? Math.max(...existingNums) : 0;
  const firstNum = idNumber(ids[0]);
  const seqOk = maxNum + 1 === firstNum;
  console.log(`  3. id 채번: 기존 max ${maxNum} → max+1 ${maxNum + 1} / JSON 첫 id ${firstNum} ${mark(seqOk)}`);
  if (!seqOk) {
    failures.push(
      `id 채번이 어긋납니다 (기존 max+1=${maxNum + 1}, JSON 첫 id=${firstNum}). ` +
        '대화 시점 이후 다른 상품이 등록되었을 수 있습니다.'
    );
  }

  // 4. sort_order 충돌
  const soHits = await prisma.product.findMany({
    where: { sortOrder: { in: sortOrders } },
    select: { id: true, sortOrder: true },
  });
  const soOk = soHits.length === 0;
  console.log(`  4. sort_order 충돌: ${soHits.length}건 ${mark(soOk)}`);
  if (!soOk) {
    console.log(`     충돌: ${soHits.map((r) => `${r.id}(${r.sortOrder})`).join(', ')}`);
    failures.push(`sort_order ${soHits.length}건이 이미 DB에 있습니다.`);
  }

  // 5. SKU 충돌
  const skuHits = await prisma.product.findMany({
    where: { sku: { in: skus } },
    select: { id: true, sku: true },
  });
  const skuOk = skuHits.length === 0;
  console.log(`  5. SKU 충돌: ${skuHits.length}건 ${mark(skuOk)}`);
  if (!skuOk) {
    console.log(`     충돌: ${skuHits.map((r) => `${r.id}(${r.sku})`).join(', ')}`);
    failures.push(`SKU ${skuHits.length}건이 이미 DB에 있습니다.`);
  }

  // 6. origin / channel_product_no 충돌
  const originHits = await prisma.product.findMany({
    where: { originProductNo: { in: origins } },
    select: { id: true, originProductNo: true },
  });
  const channelHits = await prisma.product.findMany({
    where: { channelProductNo: { in: channels } },
    select: { id: true, channelProductNo: true },
  });
  const noOk = originHits.length === 0 && channelHits.length === 0;
  console.log(`  6. origin/channel 충돌: origin ${originHits.length}건 / channel ${channelHits.length}건 ${mark(noOk)}`);
  if (!noOk) {
    originHits.forEach((r) => console.log(`     origin 충돌: ${r.id}(${r.originProductNo})`));
    channelHits.forEach((r) => console.log(`     channel 충돌: ${r.id}(${r.channelProductNo})`));
    failures.push('origin/channel_product_no 충돌이 있습니다.');
  }

  // 7. 상품명 충돌
  const nameHits = await prisma.product.findMany({ where: { name: { in: names } }, select: { id: true, name: true } });
  const nameOk = nameHits.length === 0;
  console.log(`  7. 상품명 충돌: ${nameHits.length}건 ${mark(nameOk)}`);
  if (!nameOk) {
    nameHits.forEach((r) => console.log(`     ${r.id}: ${r.name}`));
    failures.push(`상품명 ${nameHits.length}건이 이미 DB에 있습니다.`);
  }

  // 8. category_id 유효성 — FK가 없으므로 코드가 검사한다
  const categories = readJson(CATEGORIES_PATH, 'categories.json');
  const catIds = new Set(categories.map((c) => c.id));
  const badCats = records.filter((r) => !catIds.has(r.category_id));
  const catOk = badCats.length === 0;
  console.log(`  8. category_id 유효성: 미등록 ${badCats.length}건 ${mark(catOk)}`);
  if (!catOk) {
    [...new Set(badCats.map((r) => r.category_id))].forEach((c) => console.log(`     미등록 category_id: ${c}`));
    failures.push(`categories.json에 없는 category_id가 ${badCats.length}건 있습니다.`);
  }

  // 9. JSON 내부 중복
  const dupReport = [
    ['id', findDuplicates(ids)],
    ['sku', findDuplicates(skus)],
    ['origin', findDuplicates(origins)],
    ['channel', findDuplicates(channels)],
    ['name', findDuplicates(names)],
  ];
  const dupTotal = dupReport.reduce((sum, [, d]) => sum + d.length, 0);
  const dupOk = dupTotal === 0;
  console.log(`  9. JSON 내부 중복: ${dupTotal}건 ${mark(dupOk)}`);
  if (!dupOk) {
    dupReport.forEach(([label, d]) => {
      if (d.length > 0) console.log(`     ${label} 중복: ${d.join(', ')}`);
    });
    failures.push(`JSON 내부에 중복이 ${dupTotal}건 있습니다.`);
  }

  console.log('');
  return failures;
}

// ────────────────────────────────────────────────────────────
// 필드 매핑 (§4-3)
// ────────────────────────────────────────────────────────────

/**
 * 확정 JSON 1건 → Prisma create data.
 * 변환 로직이 아니라 이름 대응이다. 값은 JSON 그대로 쓰고, 고정값 3종만 스크립트가 부여한다.
 */
function toCreateData(rec) {
  return {
    id: rec.id,
    sku: rec.sku,
    categoryId: rec.category_id,
    categoryName: rec.category_name,
    name: rec.name,
    price: rec.price,
    discountedPrice: rec.discounted_price,
    stock: rec.stock_quantity,
    status: STATUS_DRAFT,
    isVisible: deriveIsVisible(STATUS_DRAFT),
    description: rec.description,
    detailHtml: rec.detail_html,
    images: rec.images,
    brand: rec.brand,
    manufacturerName: rec.manufacturer_name,
    modelName: rec.model_name,
    tags: rec.tags,
    deliveryFee: rec.delivery_fee,
    returnFee: rec.return_fee,
    exchangeFee: rec.exchange_fee,
    sortOrder: rec.sort_order,
    contentStatus: NEW_CONTENT_STATUS,
    originProductNo: rec.origin_product_no,
    channelProductNo: rec.channel_product_no,
    naverCategoryId: rec.naver_category_id,
    naverWholeCategoryId: rec.naver_whole_category_id,
    smartstoreUrl: rec.smartstore_url,
    registeredAt: new Date(rec.registered_at),
    channelModifiedAt: new Date(rec.channel_modified_at),
  };
}

// ────────────────────────────────────────────────────────────
// 출력
// ────────────────────────────────────────────────────────────

const RULE = '─────────────────────────────────────';

function printPlan(records) {
  const intended = {};
  records.forEach((r) => {
    intended[r.intended_status] = (intended[r.intended_status] ?? 0) + 1;
  });

  console.log('[INSERT 예정]');
  console.log(`  건수        : ${records.length}건 (${records[0].id} ~ ${records[records.length - 1].id})`);
  console.log(`  status      : ${STATUS_DRAFT} (전건 고정)`);
  console.log(`  isVisible   : ${deriveIsVisible(STATUS_DRAFT)}  ← deriveIsVisible('${STATUS_DRAFT}') 결과`);
  console.log(`  contentStatus: ${NEW_CONTENT_STATUS} (전건 고정)`);
  console.log(
    `  intended_status 분포 : ${Object.entries(intended).map(([k, v]) => `${k} ${v}`).join(' / ')}  ← DB 미반영(참고용)`
  );

  const chunks = Math.ceil(records.length / CHUNK_SIZE);
  const sizes = [];
  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    sizes.push(Math.min(CHUNK_SIZE, records.length - i));
  }
  console.log(`  청크 구성   : ${chunks}개 (${sizes.join(' + ')})`);
  console.log('');

  console.log('  대상 목록:');
  records.forEach((r) => {
    const price = r.discounted_price ?? r.price;
    console.log(
      `    ${r.id}  sort=${r.sort_order}  ${String(r.sku).padEnd(14)} ` +
        `${String(price).padStart(7)}원 stock=${String(r.stock_quantity).padStart(3)} ` +
        `[${r.intended_status}]  ${r.name.length > 38 ? `${r.name.slice(0, 38)}…` : r.name}`
    );
  });
  console.log('');
}

// ────────────────────────────────────────────────────────────
// INSERT (§4-4) — create 호출부는 이 함수 안 1곳뿐이며 --apply 분기에서만 호출된다
// ────────────────────────────────────────────────────────────

async function insertChunks(prisma, records) {
  const total = Math.ceil(records.length / CHUNK_SIZE);
  const inserted = [];

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE);
    const chunkNo = Math.floor(i / CHUNK_SIZE) + 1;

    let rows;
    try {
      // ★ 이 파일의 유일한 write 호출부.
      // eslint-disable-next-line no-await-in-loop
      rows = await prisma.$transaction(
        chunk.map((rec) => prisma.product.create({ data: toCreateData(rec), select: { id: true } }))
      );
    } catch (err) {
      console.error('');
      console.error(`❌ ${chunkNo}/${total} 번째 청크에서 실패했습니다 — 해당 트랜잭션은 롤백되었습니다.`);
      console.error(`   해당 청크 id: ${chunk.map((r) => r.id).join(', ')}`);
      console.error(`   원인: ${err.message}`);
      console.error('');
      if (inserted.length > 0) {
        console.error(`   앞선 ${inserted.length}건은 이미 반영되었고 롤백되지 않습니다:`);
        console.error(`   ${inserted.join(', ')}`);
        console.error('   원인 해결 후 재실행하면 사전검증 2(id 충돌)에서 중단되므로,');
        console.error('   남은 건만 넣으려면 사람이 JSON을 분리해 판단하십시오.');
      }
      throw new FatalError(`${chunkNo}번째 청크 실패로 전체 중단합니다(다음 청크 진행 안 함).`);
    }

    rows.forEach((row) => {
      inserted.push(row.id);
      console.log(`  INSERT ${row.id}`);
    });
    console.log(`  [${chunkNo}/${total}] 청크 완료 — 누적 ${inserted.length}건`);
  }

  console.log('');
  return inserted;
}

// ────────────────────────────────────────────────────────────
// 사후 검증 (§4-5) — --apply 시에만
// ────────────────────────────────────────────────────────────

async function postVerify(prisma, records) {
  console.log('[사후 검증]');
  const warnings = [];

  const newIds = records.map((r) => r.id);

  // 총건수 199 → 230
  const total = await prisma.product.count();
  const expectedTotal = EXPECTED_EXISTING + records.length;
  const totalOk = total === expectedTotal;
  console.log(`  총 product 건수: ${total} (기대 ${expectedTotal}) ${mark(totalOk)}`);
  if (!totalOk) warnings.push(`총건수가 기대(${expectedTotal})와 다릅니다.`);

  // 신규 31건 고정값
  const wrongFixed = await prisma.product.count({
    where: {
      id: { in: newIds },
      NOT: { status: STATUS_DRAFT, isVisible: deriveIsVisible(STATUS_DRAFT), contentStatus: NEW_CONTENT_STATUS },
    },
  });
  const fixedOk = wrongFixed === 0;
  console.log(
    `  신규 고정값(status=${STATUS_DRAFT}/isVisible=${deriveIsVisible(STATUS_DRAFT)}/contentStatus=${NEW_CONTENT_STATUS}): ` +
      `어긋남 ${wrongFixed}건 ${mark(fixedOk)}`
  );
  if (!fixedOk) warnings.push(`신규 ${wrongFixed}건의 고정값이 기대와 다릅니다.`);

  // 기존 199건 분포 불변 — write 경로가 없으므로 발생 불가이나 구조 검증용
  const existingDist = await prisma.product.groupBy({
    by: ['status'],
    where: { id: { notIn: newIds } },
    _count: { _all: true },
  });
  const distMap = new Map(existingDist.map((g) => [g.status, g._count._all]));
  const distOk = Object.entries(EXPECTED_EXISTING_DIST).every(([k, v]) => (distMap.get(k) ?? 0) === v)
    && existingDist.reduce((s, g) => s + g._count._all, 0) === EXPECTED_EXISTING;
  console.log(
    `  기존 ${EXPECTED_EXISTING}건 분포: ` +
      `${existingDist.map((g) => `${g.status} ${g._count._all}`).join(' / ')} ${mark(distOk)}`
  );
  if (!distOk) {
    warnings.push(
      `기존 ${EXPECTED_EXISTING}건의 status 분포가 바뀌었습니다 ` +
        `(기대 ON_SALE ${EXPECTED_EXISTING_DIST.ON_SALE} / SOLD_OUT ${EXPECTED_EXISTING_DIST.SOLD_OUT} / DISCONTINUED ${EXPECTED_EXISTING_DIST.DISCONTINUED}).`
    );
  }

  // 신규 31건 sku·name 전수 대조 (샘플 아님)
  const newRows = await prisma.product.findMany({
    where: { id: { in: newIds } },
    select: { id: true, sku: true, name: true },
  });
  const byId = new Map(newRows.map((r) => [r.id, r]));
  const mismatches = [];
  records.forEach((rec) => {
    const row = byId.get(rec.id);
    if (!row) {
      mismatches.push(`${rec.id}: DB에 없음`);
      return;
    }
    if (row.sku !== rec.sku) mismatches.push(`${rec.id}: sku 불일치 (DB ${row.sku} / JSON ${rec.sku})`);
    if (row.name !== rec.name) mismatches.push(`${rec.id}: name 불일치`);
  });
  const matchOk = mismatches.length === 0;
  console.log(`  신규 ${records.length}건 sku·name 전수 대조: 불일치 ${mismatches.length}건 ${mark(matchOk)}`);
  mismatches.forEach((m) => console.log(`     ${m}`));
  if (!matchOk) warnings.push(`신규 건의 sku·name 불일치가 ${mismatches.length}건 있습니다.`);

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
    console.warn('  node --env-file=.env.local scripts/product-insert-38.js');
    console.warn('');
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('');
  console.log(opts.apply ? '=== 37-1 신규 상품 INSERT — APPLY (실제 DB 반영) ===' : '=== 37-1 신규 상품 INSERT — DRY-RUN (변경 없음) ===');
  console.log('');

  const records = readJson(DATA_PATH, '확정 데이터');
  if (!Array.isArray(records)) {
    throw new FatalError(`데이터 파일 최상위가 배열이 아닙니다: ${DATA_PATH}`);
  }
  console.log(`데이터 파일 로드: ${records.length}건`);
  console.log('');

  ensureDatabaseUrl();

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const failures = await preflight(prisma, records);

    if (failures.length > 0) {
      console.error('사전 검증 실패 — 아무것도 쓰지 않고 종료합니다(부분 실행 없음).');
      failures.forEach((f) => console.error(`  - ${f}`));
      throw new FatalError(`사전 검증 ${failures.length}건 실패로 중단합니다.`);
    }

    printPlan(records);

    if (opts.apply) {
      console.log('[INSERT 실행]');
      const inserted = await insertChunks(prisma, records);
      console.log(RULE);
      console.log(`INSERT 완료: ${inserted.length}건`);
      console.log(RULE);
      console.log('');
      await postVerify(prisma, records);
      console.log('[APPLY] 반영 완료.');
    } else {
      console.log(RULE);
      console.log(`${records.length}건 INSERT 예정 — DB 무변경`);
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
