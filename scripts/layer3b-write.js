/**
 * STEP 3 — Layer3b 서술 tier write (36차)
 *
 * 입력 : data/layer3b-write입력-36차.json (대표 4건: prod-007·001·066·172)
 * 대상 : product.highlights / description / seoTitle / seoDescription
 *        + contentMeta 머지 + contentStatus raw→review
 * 기본 : DRY-RUN. --apply 없이는 어떤 write도 하지 않음
 *
 * 이 스크립트는 생성기가 아니다. 서술은 36차 비전 추출·사람 검수로 확정되어
 * JSON에 고정되었다. 문안이 바뀌면 JSON을 다시 만들지, 이 스크립트를 고치지 않는다.
 *
 * 사용법
 *   node scripts/layer3b-write.js              DRY-RUN (조회만, write 없음)
 *   node scripts/layer3b-write.js --apply       실제 DB 반영
 *   node scripts/layer3b-write.js --only prod-007   특정 대표만 (콤마로 다중)
 *   node scripts/layer3b-write.js --force       locked:true 인 서술 필드도 덮어씀
 *
 * 하는 일 (item 단위 $transaction)
 *   1. 대표 상품: 서술 4필드 UPDATE + contentMeta 머지 + contentStatus='review'
 *   2. unit=group:* 이면 inheritTo 멤버에 서술 4필드 복사
 *      + contentMeta.<필드>.source='inherited:<대표id>' + contentStatus='review'
 *
 * 절대 하지 않는 것 (환각·사실오염 마지막 방어선)
 *   - 사실 tier(compatibleModels·specs) UPDATE 금지. data 객체에 아예 넣지 않는다.
 *   - contentMeta 통째 교체 금지 — 기존 사실 tier provenance를 보존하는 머지만 한다.
 *   - published 승격 금지. 이미 published인 행은 강등하지 않고 건너뛴다.
 *   - 입력 JSON에 없는 상품 무접근(prod-116·VARIETY 그룹 포함).
 *
 * 선행 조건
 *   STEP 1(그룹 분할) 완료가 전제다. unit=group:<키> 항목마다 해당 그룹의 실제
 *   멤버 수가 (대표 1 + inheritTo n)과 일치하는지 검사하고, 어긋나면 중단한다.
 *   (prod-007 → GP-FPF766HI 6명. 분할 전이면 16명이라 여기서 걸린다.)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'layer3b-write입력-36차.json');

/** 서술 tier 4필드. contentMeta 키 = Prisma 필드명. */
const NARRATIVE_FIELDS = ['highlights', 'description', 'seoTitle', 'seoDescription'];

/** 사용자 입력·데이터 오류용. 스택 없이 메시지만 출력하고 exit 1 한다. */
class FatalError extends Error {}

// ────────────────────────────────────────────────────────────
// 인자 파싱
// ────────────────────────────────────────────────────────────

const USAGE = [
  '사용법: node scripts/layer3b-write.js [옵션]',
  '',
  '  (옵션 없음)      DRY-RUN — 계획만 출력하고 아무것도 쓰지 않는다',
  '  --apply          실제 DB 반영',
  '  --only <ids>     특정 대표 id만 처리 (콤마 구분, 예: --only prod-007)',
  '  --force          locked:true 인 서술 필드도 덮어쓴다',
  '  --help           이 도움말',
].join('\n');

function parseArgs(argv) {
  const opts = { apply: false, force: false, only: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--apply') {
      opts.apply = true;
    } else if (arg === '--force') {
      opts.force = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--only' || arg.startsWith('--only=')) {
      const raw = arg === '--only' ? argv[(i += 1)] : arg.slice('--only='.length);
      if (!raw) throw new FatalError('--only 뒤에 id를 지정하세요 (예: --only prod-007).');
      const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) throw new FatalError('--only 값이 비어 있습니다.');
      opts.only = ids;
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

/** 서술 값 비교용 깊은 동등 비교 (JSON 값만 다룬다) */
function deepEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

function truncate(text, max) {
  const str = String(text);
  return str.length <= max ? str : `${str.slice(0, max)}…`;
}

function preview(value) {
  if (Array.isArray(value)) return `[${value.length}건] ${truncate(value[0] ?? '', 40)}`;
  if (value === null || value === undefined || value === '') return '(비어 있음)';
  return truncate(value, 52);
}

// ────────────────────────────────────────────────────────────
// 데이터 로드·검증
// ────────────────────────────────────────────────────────────

function loadInput() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new FatalError(
      `데이터 파일이 없습니다: ${DATA_PATH}\n` +
        '36차 산출물인 Layer3b 확정 서술 JSON을 위 경로에 놓은 뒤 다시 실행하세요.'
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (err) {
    throw new FatalError(`데이터 파일 JSON 파싱 실패: ${DATA_PATH}\n${err.message}`);
  }

  validateInput(parsed);
  return parsed;
}

function validateInput(parsed) {
  const errors = [];

  if (!isPlainObject(parsed)) {
    throw new FatalError('데이터 파일 최상위가 객체가 아닙니다.');
  }
  if (parsed.targetStatus !== 'review') {
    throw new FatalError(
      `targetStatus는 'review'여야 합니다 (현재: ${parsed.targetStatus}). published 직행은 금지입니다.`
    );
  }
  if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
    throw new FatalError('데이터 파일에 items 배열이 없거나 비어 있습니다.');
  }

  const seenIds = new Set();

  parsed.items.forEach((item, index) => {
    const where = `[${index}] ${item && item.id ? item.id : '(id 없음)'}`;

    if (!isPlainObject(item)) {
      errors.push(`${where}: item이 객체가 아닙니다.`);
      return;
    }
    if (typeof item.id !== 'string' || item.id.trim() === '') {
      errors.push(`${where}: id는 비어 있지 않은 문자열이어야 합니다.`);
    } else if (seenIds.has(item.id)) {
      errors.push(`${where}: id가 중복되었습니다.`);
    } else {
      seenIds.add(item.id);
    }

    if (typeof item.unit !== 'string' || (item.unit !== 'singleton' && !item.unit.startsWith('group:'))) {
      errors.push(`${where}: unit은 'singleton' 또는 'group:<키>' 여야 합니다 (현재: ${item.unit}).`);
    }
    if (!Array.isArray(item.inheritTo)) {
      errors.push(`${where}: inheritTo는 배열이어야 합니다(빈 배열 허용).`);
    } else {
      if (item.unit === 'singleton' && item.inheritTo.length > 0) {
        errors.push(`${where}: singleton인데 inheritTo가 비어 있지 않습니다.`);
      }
      item.inheritTo.forEach((mid) => {
        if (typeof mid !== 'string' || mid.trim() === '') {
          errors.push(`${where}: inheritTo에 잘못된 id가 있습니다.`);
        } else if (mid === item.id) {
          errors.push(`${where}: inheritTo에 대표 자신(${mid})이 포함되어 있습니다.`);
        } else if (seenIds.has(mid)) {
          errors.push(`${where}: inheritTo id(${mid})가 다른 항목과 겹칩니다.`);
        } else {
          seenIds.add(mid);
        }
      });
    }

    const gen = item.generated;
    if (!isPlainObject(gen)) {
      errors.push(`${where}: generated 객체가 없습니다.`);
    } else {
      if (!Array.isArray(gen.highlights) || gen.highlights.length === 0 || gen.highlights.some((h) => typeof h !== 'string')) {
        errors.push(`${where}: generated.highlights는 비어 있지 않은 문자열 배열이어야 합니다.`);
      }
      ['description', 'seoTitle', 'seoDescription'].forEach((f) => {
        if (typeof gen[f] !== 'string' || gen[f].trim() === '') {
          errors.push(`${where}: generated.${f}는 비어 있지 않은 문자열이어야 합니다.`);
        }
      });
    }

    const prov = item.provenance;
    if (!isPlainObject(prov)) {
      errors.push(`${where}: provenance 객체가 없습니다.`);
    } else {
      if (typeof prov.source !== 'string' || prov.source.trim() === '') {
        errors.push(`${where}: provenance.source는 비어 있지 않은 문자열이어야 합니다.`);
      }
      if (prov.locked !== false) {
        // 서술 tier는 재생성 가능해야 하므로 locked:false 가 원칙이다.
        errors.push(`${where}: 서술 tier의 provenance.locked는 false여야 합니다 (현재: ${prov.locked}).`);
      }
    }

    // 사실 tier가 입력에 섞여 들어오면 즉시 거부한다.
    ['compatibleModels', 'specs', 'groundingUsed', 'newFactCandidates'].forEach((forbidden) => {
      if (isPlainObject(gen) && Object.prototype.hasOwnProperty.call(gen, forbidden)) {
        errors.push(`${where}: generated.${forbidden}는 이 스크립트의 write 대상이 아닙니다(사실 tier 오염 방지).`);
      }
    });
  });

  if (errors.length > 0) {
    throw new FatalError(`데이터 파일 검증 실패 (${errors.length}건)\n  - ${errors.slice(0, 30).join('\n  - ')}`);
  }
}

function applyOnlyFilter(items, only) {
  if (!only) return items;

  const byId = new Map(items.map((it) => [it.id, it]));
  const missing = only.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new FatalError(`--only 로 지정한 id가 데이터 파일에 없습니다: ${missing.join(', ')}`);
  }
  return only.map((id) => byId.get(id));
}

// ────────────────────────────────────────────────────────────
// 변경 계획 계산
// ────────────────────────────────────────────────────────────

function isLocked(meta, field) {
  const entry = meta[field];
  return isPlainObject(entry) && entry.locked === true;
}

/**
 * 값이 그대로이고 source·locked도 같으면 기존 엔트리를 보존한다
 * (updatedAt 의 무의미한 갱신 방지 — 34차와 동일 규약).
 */
function nextMetaEntry(meta, field, source, valueChanged, timestamp) {
  const prev = meta[field];
  if (!valueChanged && isPlainObject(prev) && prev.source === source && prev.locked === false) {
    return { entry: prev, changed: false };
  }
  return { entry: { source, locked: false, updatedAt: timestamp }, changed: true };
}

/**
 * 한 행(대표 또는 상속멤버)의 변경 계획.
 * values = 쓰려는 서술 4필드, source = contentMeta에 기록할 출처.
 */
function buildRowPlan(row, values, source, targetStatus, opts, timestamp) {
  const meta = isPlainObject(row.contentMeta) ? row.contentMeta : {};
  const nextMeta = { ...meta };

  const data = {};
  const lines = [];
  const lockedSkips = [];
  let metaChanged = false;

  NARRATIVE_FIELDS.forEach((field) => {
    if (isLocked(meta, field) && !opts.force) {
      lockedSkips.push(field);
      return;
    }

    const want = values[field];
    const current = row[field];
    const valueChanged = !deepEqual(current, want);

    if (valueChanged) {
      data[field] = want;
      lines.push(`    ${field.padEnd(16)}: ${preview(current)}  ->  ${preview(want)}`);
    }

    const next = nextMetaEntry(meta, field, source, valueChanged, timestamp);
    nextMeta[field] = next.entry;
    if (next.changed) metaChanged = true;
  });

  // 사실 tier provenance를 보존하는 머지 — contentMeta 통째 교체가 아니다.
  if (metaChanged) {
    data.contentMeta = nextMeta;
  }

  // contentStatus 승격. published는 강등하지 않는다.
  let statusNote = null;
  if (row.contentStatus === 'published') {
    statusNote = 'published — 강등하지 않고 유지';
  } else if (row.contentStatus !== targetStatus && lockedSkips.length < NARRATIVE_FIELDS.length) {
    data.contentStatus = targetStatus;
    lines.push(`    ${'contentStatus'.padEnd(16)}: ${row.contentStatus}  ->  ${targetStatus}`);
  }

  const hasChange = Object.keys(data).length > 0;
  if (hasChange && lines.length === 0) {
    lines.push('    contentMeta      : 거버넌스 기록만 갱신');
  }

  return {
    id: row.id,
    name: row.name,
    data,
    lines,
    lockedSkips,
    statusNote,
    hasChange,
  };
}

// ────────────────────────────────────────────────────────────
// 선행조건 (STEP 1 완료 여부)
// ────────────────────────────────────────────────────────────

/**
 * unit=group:<키> 항목은 그룹 실제 멤버 수가 (대표1 + inheritTo n)과 같아야 한다.
 * 분할 전이면 GP-FPF766HI가 16명이라 여기서 걸린다 = STEP 1 미완 탐지.
 */
async function checkGroupPreconditions(prisma, items, rowById) {
  const problems = [];

  for (const item of items) {
    if (item.unit === 'singleton') continue;

    const groupKey = item.unit.slice('group:'.length);
    // eslint-disable-next-line no-await-in-loop
    const group = await prisma.productGroup.findUnique({ where: { groupKey } });
    if (!group) {
      problems.push(`${item.id}: unit=${item.unit} 인데 group_key='${groupKey}' 그룹이 DB에 없습니다.`);
      continue;
    }

    const repRow = rowById.get(item.id);
    if (repRow.groupId !== group.id) {
      problems.push(`${item.id}: 대표가 '${groupKey}' 그룹에 속해 있지 않습니다.`);
    }

    // eslint-disable-next-line no-await-in-loop
    const members = await prisma.product.findMany({
      where: { groupId: group.id },
      select: { id: true },
    });
    const expected = 1 + item.inheritTo.length;
    if (members.length !== expected) {
      problems.push(
        `${item.id}: '${groupKey}' 실제 멤버 ${members.length}명 ≠ 입력 기대 ${expected}명 ` +
          '(STEP 1 그룹 분할이 선행되어야 합니다).'
      );
    }

    const memberIds = new Set(members.map((m) => m.id));
    const outside = item.inheritTo.filter((mid) => !memberIds.has(mid));
    if (outside.length > 0) {
      problems.push(`${item.id}: inheritTo 중 '${groupKey}' 그룹 밖 멤버 — ${outside.join(', ')}`);
    }
  }

  return problems;
}

// ────────────────────────────────────────────────────────────
// 출력
// ────────────────────────────────────────────────────────────

const RULE = '─────────────────────────────────────';

function printPlans(itemPlans) {
  itemPlans.forEach((ip) => {
    console.log('');
    console.log(`■ ${ip.id}  ${truncate(ip.name, 40)}   [${ip.unit}]`);
    console.log(`  출처        : ${ip.source}`);

    const rep = ip.rep;
    if (rep.hasChange) {
      console.log('  대표 변경   :');
      rep.lines.forEach((line) => console.log(line));
    } else {
      console.log('  대표        : 변경 없음 (이미 반영됨)');
    }
    if (rep.lockedSkips.length > 0) {
      console.log(`    ⚠ locked 스킵: ${rep.lockedSkips.join(', ')}`);
    }
    if (rep.statusNote) console.log(`    ⚠ contentStatus ${rep.statusNote}`);

    if (ip.members.length === 0) {
      console.log('  상속        : 없음 (단독)');
      return;
    }

    const changedMembers = ip.members.filter((m) => m.hasChange);
    console.log(`  상속 범위   : ${ip.members.length}명 → ${ip.members.map((m) => m.id).join(', ')}`);
    console.log(`    source    : inherited:${ip.id}`);
    console.log(`    갱신 대상 : ${changedMembers.length}명`);
    ip.members.forEach((m) => {
      if (!m.hasChange) {
        console.log(`      - ${m.id}: 변경 없음`);
        return;
      }
      console.log(`      - ${m.id}: 서술 4필드 + contentStatus`);
      if (m.lockedSkips.length > 0) console.log(`        ⚠ locked 스킵: ${m.lockedSkips.join(', ')}`);
      if (m.statusNote) console.log(`        ⚠ contentStatus ${m.statusNote}`);
    });
  });
  console.log('');
}

function printSummary(itemPlans, opts) {
  const allRows = itemPlans.flatMap((ip) => [ip.rep, ...ip.members]);
  const changed = allRows.filter((r) => r.hasChange).length;
  const lockedSkipRows = allRows.filter((r) => r.lockedSkips.length > 0).length;
  const repCount = itemPlans.length;
  const memberCount = itemPlans.reduce((sum, ip) => sum + ip.members.length, 0);

  console.log(RULE);
  console.log(`대표 상품            ${repCount}`);
  console.log(`상속 멤버            ${memberCount}`);
  console.log(`대상 행 합계         ${allRows.length}   (기대: 대표+상속)`);
  console.log(`변경 ${opts.apply ? '완료' : '예정'}            ${changed}`);
  console.log(`변경 없음            ${allRows.length - changed}`);
  console.log(`locked 스킵 행       ${lockedSkipRows}`);
  console.log(RULE);
  console.log('사실 tier(compatibleModels·specs) : 무접근 — 이 스크립트는 write 대상에 포함하지 않음');
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
    console.warn('  node --env-file=.env.local scripts/layer3b-write.js');
    console.warn('');
  }
}

async function applyPlans(prisma, itemPlans) {
  const targets = itemPlans.filter((ip) => ip.rep.hasChange || ip.members.some((m) => m.hasChange));
  if (targets.length === 0) {
    console.log('변경할 내용이 없습니다. (이미 모두 반영됨)');
    console.log('');
    return;
  }

  for (let i = 0; i < targets.length; i += 1) {
    const ip = targets[i];
    const rows = [ip.rep, ...ip.members].filter((r) => r.hasChange);

    try {
      // 대표와 상속멤버는 한 트랜잭션으로 묶는다 — 대표만 review인 반쪽 상태 방지.
      // update(id 단건)만 사용한다. updateMany/upsert 금지.
      // eslint-disable-next-line no-await-in-loop
      await prisma.$transaction(
        rows.map((r) => prisma.product.update({ where: { id: r.id }, data: r.data }))
      );
    } catch (err) {
      console.error('');
      console.error(`❌ ${ip.id} (${ip.unit}) 처리 중 실패했습니다.`);
      console.error(`   해당 행: ${rows.map((r) => r.id).join(', ')}`);
      console.error(`   원인: ${err.message}`);
      console.error('');
      console.error(`   이전 ${i}개 항목은 이미 반영되었습니다(항목 단위 트랜잭션이라 롤백되지 않음).`);
      console.error('   원인 해결 후 같은 명령을 다시 실행하면, 이미 반영된 행은 변경 없음으로');
      console.error('   스킵되어 중복 반영되지 않습니다(멱등).');
      throw new FatalError(`${ip.id} 트랜잭션 실패로 중단합니다.`);
    }

    console.log(`[${i + 1}/${targets.length}] ${ip.id} + 상속 ${rows.length - (ip.rep.hasChange ? 1 : 0)}명 완료`);
  }
  console.log('');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('');
  console.log(opts.apply ? '=== STEP 3 Layer3b 서술 — APPLY (실제 DB 반영) ===' : '=== STEP 3 Layer3b 서술 — DRY-RUN (변경 없음) ===');
  const flags = [opts.only ? `--only ${opts.only.join(',')}` : null, opts.force ? '--force (locked 무시)' : null].filter(Boolean);
  if (flags.length > 0) console.log(`옵션: ${flags.join(' / ')}`);
  console.log('');

  const parsed = loadInput();
  const items = applyOnlyFilter(parsed.items, opts.only);
  console.log(`데이터 파일 로드: 대표 ${parsed.items.length}건 (처리 대상 ${items.length}건), targetStatus=${parsed.targetStatus}`);

  ensureDatabaseUrl();

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const allIds = [...new Set(items.flatMap((it) => [it.id, ...it.inheritTo]))];
    const rows = await prisma.product.findMany({
      where: { id: { in: allIds } },
      select: {
        id: true,
        name: true,
        groupId: true,
        highlights: true,
        description: true,
        seoTitle: true,
        seoDescription: true,
        contentMeta: true,
        contentStatus: true,
      },
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));

    // id 하나라도 DB에 없으면 부분 반영 없이 즉시 멈춘다.
    const missing = allIds.filter((id) => !rowById.has(id));
    if (missing.length > 0) {
      console.error(`DB에 없는 상품 id ${missing.length}건 — 아무것도 쓰지 않고 종료합니다.`);
      missing.forEach((id) => console.error(`  - ${id}`));
      throw new FatalError('데이터 파일과 DB가 어긋났습니다. JSON을 먼저 정정하세요.');
    }

    // STEP 1(그룹 분할) 선행 확인.
    const problems = await checkGroupPreconditions(prisma, items, rowById);
    if (problems.length > 0) {
      console.error('선행조건 위반 — STEP 1(그룹 분할)이 완료되지 않았거나 DB가 입력과 어긋납니다.');
      problems.forEach((p) => console.error(`  - ${p}`));
      throw new FatalError('선행조건 미충족으로 중단합니다. STEP 1을 먼저 --apply 하세요.');
    }
    console.log('선행조건 확인: 그룹 멤버 수·소속 정합 OK (STEP 1 완료)');

    // 배치 식별이 쉽도록 실행 시작 시각 하나를 전체에 동일 적용한다.
    const timestamp = new Date().toISOString();

    const itemPlans = items.map((item) => {
      const values = {
        highlights: item.generated.highlights,
        description: item.generated.description,
        seoTitle: item.generated.seoTitle,
        seoDescription: item.generated.seoDescription,
      };

      const rep = buildRowPlan(
        rowById.get(item.id),
        values,
        item.provenance.source,
        parsed.targetStatus,
        opts,
        timestamp
      );

      // 상속 멤버는 같은 서술을 복사하되 출처만 inherited:<대표id> 로 남긴다.
      const members = item.inheritTo.map((mid) =>
        buildRowPlan(rowById.get(mid), values, `inherited:${item.id}`, parsed.targetStatus, opts, timestamp)
      );

      return { id: item.id, name: rowById.get(item.id).name, unit: item.unit, source: item.provenance.source, rep, members };
    });

    printPlans(itemPlans);

    if (opts.apply) {
      await applyPlans(prisma, itemPlans);
    }

    printSummary(itemPlans, opts);

    if (!opts.apply) {
      console.log('[DRY-RUN] 상속 범위를 육안 확인한 뒤 --apply 를 붙여 다시 실행하세요.');
    } else {
      console.log(`[APPLY] 반영 완료 (배치 시각 ${timestamp}).`);
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
