/**
 * Layer 3a — 확정 호환모델·색상 DB 반영 스크립트 (34차)
 *
 * 입력 : data/layer3a-확정데이터-199.json (기본값, --data 로 교체 가능. 사람 검증 완료 확정값)
 * 대상 : product.compatibleModels / specs.color / contentMeta / contentStatus
 * 기본 : DRY-RUN. --apply 없이는 어떤 write도 하지 않음
 *
 * 이 스크립트는 파서를 포함하지 않는다. 추출·판정은 33차에 완료되어
 * JSON에 확정값으로 고정되었다. 규칙이 바뀌면 JSON을 다시 만들지,
 * 이 스크립트를 고치지 않는다.
 *
 * 사용법
 *   node scripts/layer3a-write.js                  기본 = DRY-RUN (조회만, write 없음)
 *   node scripts/layer3a-write.js --apply          실제 DB 반영
 *   node scripts/layer3a-write.js --only prod-050  특정 id만 (콤마로 다중 지정)
 *   node scripts/layer3a-write.js --force          locked:true 필드도 덮어씀
 *   node scripts/layer3a-write.js --with-pending   _pending* 키도 specs에 반영
 *
 * 거버넌스
 *   contentMeta 는 "필드명 → {source, locked, updatedAt}" 객체다.
 *   compatibleModels / specs.color 는 사실 tier + 사람 검증 완료이므로 locked:true 로
 *   기록되어, 이후 규칙·AI 재실행이 덮어쓰지 못한다. 재실행 시 locked 필드는 스킵된다
 *   (--force 로만 무시 가능). _pending* 유래 필드는 보류 결정이라 locked:false.
 *
 * 안전장치
 *   - JSON의 id 중 DB에 없는 게 하나라도 있으면 아무것도 쓰지 않고 종료한다.
 *   - update(id 단건)만 사용한다. deleteMany/updateMany/upsert/createMany 금지.
 *   - --apply 는 20건 청크 트랜잭션으로 나눠 실행한다.
 *
 * 주의: 이 스크립트는 dev/prod가 공유하는 운영 DB에 붙는다. --apply 전에 반드시
 *       pg_dump 백업 → dry-run 검토 → --only 단건 시범 순서를 지킬 것.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_DATA_FILE = 'data/layer3a-확정데이터-199.json';

const CHUNK_SIZE = 20;
const VALID_SOURCES = ['human', 'sku-decode', 'name-rule', 'none'];

// contentMeta 키 = Prisma 필드 경로. specs 하위는 점 표기.
const F_MODELS = 'compatibleModels';
const F_COLOR = 'specs.color';
const F_ATTACH = 'specs.attachType';
const F_UNVERIFIED = 'specs.compatibleModelsUnverified';

/** 사용자 입력·데이터 오류용. 스택 없이 메시지만 출력하고 exit 1 한다. */
class FatalError extends Error {}

// ────────────────────────────────────────────────────────────
// 인자 파싱 (라이브러리 없이 process.argv 직접 처리)
// ────────────────────────────────────────────────────────────

const USAGE = [
  '사용법: node scripts/layer3a-write.js [옵션]',
  '',
  '  (옵션 없음)      DRY-RUN — 계획만 출력하고 아무것도 쓰지 않는다',
  '  --apply          실제 DB 반영',
  '  --only <ids>     특정 id만 처리 (콤마 구분, 예: --only prod-050,prod-051)',
  '  --force          locked:true 인 필드도 덮어쓴다',
  '  --with-pending   _pendingAttachType / _pendingUnverified 도 specs에 반영',
  `  --data <경로>    입력 JSON 경로 (기본: ${DEFAULT_DATA_FILE})`,
  '  --help           이 도움말',
].join('\n');

function parseArgs(argv) {
  const opts = { apply: false, force: false, withPending: false, only: null, data: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--apply') {
      opts.apply = true;
    } else if (arg === '--force') {
      opts.force = true;
    } else if (arg === '--with-pending') {
      opts.withPending = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--only' || arg.startsWith('--only=')) {
      const raw = arg === '--only' ? argv[(i += 1)] : arg.slice('--only='.length);
      if (!raw) throw new FatalError('--only 뒤에 id를 지정하세요 (예: --only prod-050).');
      const ids = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) throw new FatalError('--only 값이 비어 있습니다.');
      opts.only = ids;
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

/** specs·contentMeta 비교용 깊은 동등 비교 (JSON 값만 다룬다) */
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

function fmtList(arr) {
  return `[${arr.join(', ')}]`;
}

function fmtValue(value) {
  if (value === undefined) return '(없음)';
  if (Array.isArray(value)) return fmtList(value);
  return String(value);
}

function truncate(text, max) {
  const str = String(text);
  return str.length <= max ? str : `${str.slice(0, max)}…`;
}

// ────────────────────────────────────────────────────────────
// 데이터 로드·검증
// ────────────────────────────────────────────────────────────

/** 입력 경로를 ROOT 기준으로 해석한다. 저장소 밖 경로는 거부 — 감사 대상 입력을 repo 안에 묶는다. */
function resolveDataPath(input) {
  const resolved = path.resolve(ROOT, input);
  if (!resolved.startsWith(ROOT + path.sep)) {
    throw new FatalError(`저장소(ROOT) 밖 경로는 사용할 수 없습니다: ${input}`);
  }
  return resolved;
}

function loadRecords(dataPath) {
  if (!fs.existsSync(dataPath)) {
    throw new FatalError(
      `데이터 파일이 없습니다: ${dataPath}\n` +
        '확정 데이터 JSON을 위 경로에 놓은 뒤 다시 실행하세요.'
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (err) {
    throw new FatalError(`데이터 파일 JSON 파싱 실패: ${dataPath}\n${err.message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new FatalError(`데이터 파일 최상위가 배열이 아닙니다: ${dataPath}`);
  }
  if (parsed.length === 0) {
    throw new FatalError('데이터 파일이 비어 있습니다.');
  }

  validateRecords(parsed);
  assertNoDuplicateIds(parsed);

  return parsed;
}

function validateRecords(records) {
  const errors = [];

  records.forEach((rec, index) => {
    const where = `[${index}] ${rec && rec.id ? rec.id : '(id 없음)'}`;

    if (!isPlainObject(rec)) {
      errors.push(`${where}: 레코드가 객체가 아닙니다.`);
      return;
    }
    if (typeof rec.id !== 'string' || rec.id.trim() === '') {
      errors.push(`${where}: id는 비어 있지 않은 문자열이어야 합니다.`);
    }
    if (!Array.isArray(rec.compatibleModels) || rec.compatibleModels.some((m) => typeof m !== 'string')) {
      errors.push(`${where}: compatibleModels는 문자열 배열이어야 합니다(빈 배열 허용).`);
    }
    if (!VALID_SOURCES.includes(rec.modelSource)) {
      errors.push(`${where}: modelSource는 ${VALID_SOURCES.join(' / ')} 중 하나여야 합니다 (현재: ${rec.modelSource}).`);
    }
    if (rec.color !== undefined && rec.color !== null) {
      const colorOk =
        typeof rec.color === 'string' ||
        (Array.isArray(rec.color) && rec.color.length > 0 && rec.color.every((c) => typeof c === 'string'));
      if (!colorOk) errors.push(`${where}: color는 문자열 또는 비어 있지 않은 문자열 배열이어야 합니다.`);
    }
  });

  if (errors.length > 0) {
    throw new FatalError(`데이터 파일 검증 실패 (${errors.length}건)\n  - ${errors.slice(0, 20).join('\n  - ')}`);
  }
}

function assertNoDuplicateIds(records) {
  const seen = new Set();
  const dups = new Set();
  records.forEach((rec) => {
    if (seen.has(rec.id)) dups.add(rec.id);
    seen.add(rec.id);
  });
  if (dups.size > 0) {
    throw new FatalError(`데이터 파일에 중복 id가 있습니다 (${dups.size}건): ${[...dups].join(', ')}`);
  }
}

function applyOnlyFilter(records, only) {
  if (!only) return records;

  const byId = new Map(records.map((rec) => [rec.id, rec]));
  const missing = only.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new FatalError(`--only 로 지정한 id가 데이터 파일에 없습니다: ${missing.join(', ')}`);
  }
  return only.map((id) => byId.get(id));
}

// ────────────────────────────────────────────────────────────
// 변경 계획 계산
// ────────────────────────────────────────────────────────────

/**
 * 기존 contentMeta 엔트리를 살펴 이 필드를 쓸 수 있는지 판정한다.
 * locked:true 면 --force 없이는 스킵.
 */
function isLocked(meta, field) {
  const entry = meta[field];
  return isPlainObject(entry) && entry.locked === true;
}

/**
 * 필드 하나의 거버넌스 엔트리를 계산한다.
 * 값이 그대로이고 source·locked도 같으면 기존 엔트리를 보존한다(updatedAt 무의미한 갱신 방지).
 */
function nextMetaEntry(meta, field, source, locked, valueChanged, timestamp) {
  const prev = meta[field];
  if (!valueChanged && isPlainObject(prev) && prev.source === source && prev.locked === locked) {
    return { entry: prev, changed: false };
  }
  return { entry: { source, locked, updatedAt: timestamp }, changed: true };
}

/**
 * 레코드 1건의 변경 계획.
 * 반환: { id, name, data, lines, lockedSkips, colorWritten, statusPromoted, hasChange }
 */
function buildPlan(rec, row, opts, timestamp) {
  const meta = isPlainObject(row.contentMeta) ? row.contentMeta : {};
  const nextMeta = { ...meta };
  const baseSpecs = isPlainObject(row.specs) ? row.specs : {};
  const nextSpecs = { ...baseSpecs };

  const data = {};
  const lines = [];
  const lockedSkips = [];
  let metaChanged = false;
  let colorWritten = false;

  // ── compatibleModels ──────────────────────────────────────
  if (isLocked(meta, F_MODELS) && !opts.force) {
    lockedSkips.push(F_MODELS);
  } else {
    const current = Array.isArray(row.compatibleModels) ? row.compatibleModels : [];
    const valueChanged = !deepEqual(current, rec.compatibleModels);
    if (valueChanged) {
      data.compatibleModels = rec.compatibleModels;
      lines.push(
        `   compatibleModels : ${fmtList(current)}  ->  ${fmtList(rec.compatibleModels)}  (${rec.modelSource})`
      );
    }
    const next = nextMetaEntry(meta, F_MODELS, rec.modelSource, true, valueChanged, timestamp);
    nextMeta[F_MODELS] = next.entry;
    if (next.changed) metaChanged = true;
  }

  // ── specs.color ───────────────────────────────────────────
  // color 없는 레코드(98건)는 specs.color를 아예 건드리지 않는다(빈 문자열·null 주입 금지).
  const hasColor = rec.color !== undefined && rec.color !== null;
  if (hasColor) {
    if (isLocked(meta, F_COLOR) && !opts.force) {
      lockedSkips.push(F_COLOR);
    } else {
      const current = Object.prototype.hasOwnProperty.call(baseSpecs, 'color') ? baseSpecs.color : undefined;
      const valueChanged = !deepEqual(current, rec.color);
      nextSpecs.color = rec.color;
      colorWritten = true;
      if (valueChanged) {
        lines.push(`   specs.color      : ${fmtValue(current)}  ->  ${fmtValue(rec.color)}`);
      }
      // 색상은 전부 상품명 유래이므로 source 고정.
      const next = nextMetaEntry(meta, F_COLOR, 'name-rule', true, valueChanged, timestamp);
      nextMeta[F_COLOR] = next.entry;
      if (next.changed) metaChanged = true;
    }
  }

  // ── 보류 결정 필드 (--with-pending 일 때만) ────────────────
  // 결정이 나면 플래그만 붙이면 되도록 스크립트 수정 없이 대응한다. locked는 false.
  if (opts.withPending) {
    const pendings = [
      { field: F_ATTACH, specKey: 'attachType', value: rec._pendingAttachType },
      { field: F_UNVERIFIED, specKey: 'compatibleModelsUnverified', value: rec._pendingUnverified },
    ];

    pendings.forEach(({ field, specKey, value }) => {
      if (value === undefined || value === null) return;
      if (isLocked(meta, field) && !opts.force) {
        lockedSkips.push(field);
        return;
      }
      const current = Object.prototype.hasOwnProperty.call(baseSpecs, specKey) ? baseSpecs[specKey] : undefined;
      const valueChanged = !deepEqual(current, value);
      nextSpecs[specKey] = value;
      if (valueChanged) {
        lines.push(`   ${field.padEnd(17)}: ${fmtValue(current)}  ->  ${fmtValue(value)}`);
      }
      const next = nextMetaEntry(meta, field, 'human', false, valueChanged, timestamp);
      nextMeta[field] = next.entry;
      if (next.changed) metaChanged = true;
    });
  }

  if (!deepEqual(baseSpecs, nextSpecs)) {
    data.specs = nextSpecs;
  }
  if (metaChanged) {
    data.contentMeta = nextMeta;
  }

  // ── contentStatus ─────────────────────────────────────────
  // 이미 draft 이상으로 진행된 상품은 건드리지 않는다.
  let statusPromoted = false;
  if (row.contentStatus === 'raw' && lockedSkips.length < countTargetFields(rec, opts)) {
    data.contentStatus = 'draft';
    statusPromoted = true;
    lines.push(`   contentStatus    : raw  ->  draft`);
  }

  const hasChange = Object.keys(data).length > 0;
  // 값은 그대로인데 거버넌스 기록만 갱신되는 경우도 있으므로 출력에 남긴다.
  if (hasChange && lines.length === 0) {
    lines.push('   contentMeta      : 거버넌스 기록만 갱신');
  }

  return {
    id: rec.id,
    name: rec.name,
    data,
    lines,
    lockedSkips,
    colorWritten,
    statusPromoted,
    hasChange,
  };
}

/** 이 레코드에서 쓰기 대상이 되는 필드 수 (전부 locked 스킵이면 상태도 올리지 않기 위함) */
function countTargetFields(rec, opts) {
  let n = 1; // compatibleModels
  if (rec.color !== undefined && rec.color !== null) n += 1;
  if (opts.withPending) {
    if (rec._pendingAttachType !== undefined && rec._pendingAttachType !== null) n += 1;
    if (rec._pendingUnverified !== undefined && rec._pendingUnverified !== null) n += 1;
  }
  return n;
}

// ────────────────────────────────────────────────────────────
// 출력
// ────────────────────────────────────────────────────────────

const RULE = '─────────────────────────────────────';

function printPlans(plans) {
  const changed = plans.filter((p) => p.hasChange);
  if (changed.length === 0) {
    console.log('변경할 내용이 없습니다. (이미 모두 반영되었거나 locked 스킵)');
    return;
  }
  changed.forEach((plan) => {
    console.log('');
    console.log(`${plan.id}  ${truncate(plan.name, 44)}`);
    plan.lines.forEach((line) => console.log(line));
  });
  console.log('');
}

function printSummary(records, plans, opts) {
  const changedCount = plans.filter((p) => p.hasChange).length;
  const unchangedCount = plans.length - changedCount;
  const lockedSkipCount = plans.reduce((sum, p) => sum + p.lockedSkips.length, 0);
  const lockedSkipRecords = plans.filter((p) => p.lockedSkips.length > 0).length;
  const colorCount = plans.filter((p) => p.colorWritten).length;
  const statusCount = plans.filter((p) => p.statusPromoted).length;

  const sourceDist = VALID_SOURCES.map((src) => {
    const n = records.filter((rec) => rec.modelSource === src).length;
    return `${src} ${n}`;
  }).join(' / ');

  console.log(RULE);
  console.log(`대상            ${plans.length}`);
  console.log(`변경 ${opts.apply ? '완료' : '예정'}       ${changedCount}`);
  console.log(`변경 없음       ${unchangedCount}   (이미 동일)`);
  console.log(`locked 스킵     ${lockedSkipCount}   (필드 단위 / 레코드 ${lockedSkipRecords}건)`);
  console.log(RULE);
  console.log(`source 분포   ${sourceDist}`);
  console.log(`color 기록      ${colorCount}`);
  console.log(`contentStatus   raw->draft ${statusCount}`);
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
    console.warn('  node --env-file=.env.local scripts/layer3a-write.js');
    console.warn('');
  }
}

async function applyPlans(prisma, plans) {
  const targets = plans.filter((p) => p.hasChange);
  if (targets.length === 0) return;

  const totalChunks = Math.ceil(targets.length / CHUNK_SIZE);

  for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
    const chunk = targets.slice(i, i + CHUNK_SIZE);
    const chunkNo = Math.floor(i / CHUNK_SIZE) + 1;

    try {
      // update(id 단건)만 사용한다. updateMany/upsert 금지.
      // eslint-disable-next-line no-await-in-loop
      await prisma.$transaction(
        chunk.map((plan) => prisma.product.update({ where: { id: plan.id }, data: plan.data }))
      );
    } catch (err) {
      console.error('');
      console.error(`❌ ${chunkNo}/${totalChunks} 번째 청크에서 실패했습니다.`);
      console.error(`   해당 청크 id: ${chunk.map((p) => p.id).join(', ')}`);
      console.error(`   원인: ${err.message}`);
      console.error('');
      console.error(`   ${chunkNo - 1}개 청크(${i}건)는 이미 반영되었고 롤백되지 않습니다.`);
      console.error('   원인 해결 후 같은 명령을 다시 실행하면, 이미 쓴 건은 locked 스킵되어');
      console.error('   중복 반영되지 않습니다(멱등). --force 는 붙이지 마세요.');
      throw new FatalError('청크 트랜잭션 실패로 중단합니다.');
    }

    console.log(`[${chunkNo}/${totalChunks}] ${Math.min(i + CHUNK_SIZE, targets.length)}건 완료`);
  }
  console.log('');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('');
  console.log(opts.apply ? '=== APPLY (실제 DB 반영) ===' : '=== DRY-RUN (변경 없음) ===');
  const flags = [
    opts.only ? `--only ${opts.only.join(',')}` : null,
    opts.force ? '--force (locked 무시)' : null,
    opts.withPending ? '--with-pending (_pending* 반영)' : null,
  ].filter(Boolean);
  if (flags.length > 0) console.log(`옵션: ${flags.join(' / ')}`);
  console.log('');

  const dataPath = resolveDataPath(opts.data ?? DEFAULT_DATA_FILE);
  console.log(`입력 파일: ${path.relative(ROOT, dataPath)}`);
  const allRecords = loadRecords(dataPath);
  const records = applyOnlyFilter(allRecords, opts.only);
  console.log(`데이터 파일 로드: ${allRecords.length}건 (처리 대상 ${records.length}건)`);

  ensureDatabaseUrl();

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const ids = records.map((rec) => rec.id);
    const rows = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        name: true,
        compatibleModels: true,
        specs: true,
        contentMeta: true,
        contentStatus: true,
      },
    });

    // id 하나라도 DB에 없으면 부분 반영 없이 즉시 멈춘다.
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const missing = ids.filter((id) => !rowById.has(id));
    if (missing.length > 0) {
      console.error(`DB에 없는 id ${missing.length}건 — 아무것도 쓰지 않고 종료합니다.`);
      missing.forEach((id) => console.error(`  - ${id}`));
      throw new FatalError('데이터 파일과 DB가 어긋났습니다. JSON을 먼저 정정하세요.');
    }

    // 배치 식별이 쉽도록 실행 시작 시각 하나를 전체 레코드에 동일 적용한다.
    const timestamp = new Date().toISOString();
    const plans = records.map((rec) => buildPlan(rec, rowById.get(rec.id), opts, timestamp));

    printPlans(plans);

    if (opts.apply) {
      await applyPlans(prisma, plans);
    }

    printSummary(records, plans, opts);

    if (!opts.apply) {
      console.log('[DRY-RUN] 실제 반영하려면 --apply 를 붙여 다시 실행하세요.');
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
