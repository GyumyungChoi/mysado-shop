/**
 * 42차 — specs.color 배열 → 문자열 정정 write
 *
 * 34차에 locked:true 로 잠근 `contentMeta["specs.color"]` 를 덮는 최초의 스크립트다.
 * 잠금을 되돌리는 유일한 승인 경로이므로, 되돌린 흔적(corrections)을 반드시 남긴다.
 * 43차 절단 정정(18건)도 이 스크립트를 그대로 재사용한다.
 *
 * 기본 DRY-RUN. --apply 없이는 어떤 write도 하지 않는다.
 *
 * 사용법
 *   node scripts/specs-color-fix-write.js --data data/specs-color-fix입력-42차.json
 *   node scripts/specs-color-fix-write.js --data data/specs-color-fix입력-42차.json --apply
 *
 * 하는 일 (행당 update 1회 — 두 필드를 한 번에)
 *   1. specs.color = newValue (문자열).  specs의 다른 키는 읽어서 그대로 되쓴다.
 *   2. contentMeta["specs.color"] = { locked:true, source:'human', updatedAt:<실행시각>,
 *                                     corrections:[...기존, 이번 정정] }
 *
 * 절대 하지 않는 것
 *   - expectedCurrent 불일치 자동 보정 — 불일치는 "입력 작성 이후 DB가 변했다"는 사건이다.
 *   - specs / contentMeta 의 다른 키 접근 (compatibleModels·seoTitle 등 무접근).
 *   - raw SQL / updateMany / findUnique — 각각 raw 금지·행별 update·findUniqueOrThrow.
 *   - locked 해제 — true 를 유지한다.
 *
 * 멱등성
 *   이미 정정된 행은 specs.color 가 문자열이므로 V5(배열 대조)에서 자동으로 막힌다.
 *   별도 가드를 두지 않는 대신, 그 사유를 로그로 구분해 알린다.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** 이 스크립트가 다루는 유일한 필드 경로. contentMeta 키이자 specs 키의 근거다. */
const FIELD_KEY = 'specs.color';
const SPEC_KEY = 'color';

/** 사용자 입력·데이터 오류용. 스택 없이 메시지만 출력하고 exit 1 한다. */
class FatalError extends Error {}

// ────────────────────────────────────────────────────────────
// 인자 파싱
// ────────────────────────────────────────────────────────────

const USAGE = [
  '사용법: node scripts/specs-color-fix-write.js --data <경로> [--apply]',
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

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new FatalError('데이터 파일 최상위는 비어 있지 않은 배열이어야 합니다.');
  }
  return parsed;
}

// ────────────────────────────────────────────────────────────
// 검증 V1~V3 (입력 파일만으로 판정)
// ────────────────────────────────────────────────────────────

/** 입력 파일 안에서 id가 두 번 이상 나오는 집합. 어느 행이 진짜인지 알 수 없으므로 전부 skip 대상이다. */
function findDuplicateIds(items) {
  const seen = new Set();
  const dup = new Set();
  items.forEach((item) => {
    if (!isPlainObject(item) || typeof item.id !== 'string') return;
    if (seen.has(item.id)) dup.add(item.id);
    seen.add(item.id);
  });
  return dup;
}

function validateItem(item, dupIds) {
  const errors = [];

  if (!isPlainObject(item)) {
    return ['V1 항목이 객체가 아닙니다.'];
  }

  // V1 — 필수키 존재
  ['id', 'expectedCurrent', 'newValue', 'reason'].forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(item, key)) {
      errors.push(`V1 필수키 누락: ${key}`);
    }
  });

  // V2 — 자료형
  if (typeof item.id !== 'string' || item.id.trim() === '') {
    errors.push('V2 id는 비어 있지 않은 문자열이어야 합니다.');
  }
  if (!Array.isArray(item.expectedCurrent)) {
    errors.push('V2 expectedCurrent는 배열이어야 합니다.');
  } else if (item.expectedCurrent.some((v) => typeof v !== 'string')) {
    errors.push('V2 expectedCurrent의 원소는 모두 문자열이어야 합니다.');
  }
  if (typeof item.newValue !== 'string' || item.newValue.trim() === '') {
    errors.push('V2 newValue는 비어 있지 않은 문자열이어야 합니다.');
  }
  if (typeof item.reason !== 'string' || item.reason.trim() === '') {
    errors.push('V2 reason은 비어 있지 않은 문자열이어야 합니다.');
  }

  // V3 — 입력 파일 내 id 중복
  if (typeof item.id === 'string' && dupIds.has(item.id)) {
    errors.push(`V3 id가 입력 파일에서 중복됩니다: ${item.id}`);
  }

  return errors;
}

// ────────────────────────────────────────────────────────────
// V5 — expectedCurrent 대조 (이 스크립트의 핵심)
// ────────────────────────────────────────────────────────────

/**
 * DB 현재값과 expectedCurrent를 원소 순서까지 포함해 비교한다.
 * 정렬하지 않는다 — 순서 차이도 "DB가 변했다"는 신호로 취급한다.
 * 반환: null 이면 일치, 아니면 불일치 사유 문자열.
 */
function compareExpected(current, expected) {
  if (!Array.isArray(current)) {
    return `V5 DB 현재값이 배열이 아닙니다 (${typeof current}: ${JSON.stringify(current)})`;
  }
  if (current.length !== expected.length) {
    return `V5 길이 불일치 — DB ${current.length} vs 입력 ${expected.length} / DB=${JSON.stringify(current)}`;
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (current[i] !== expected[i]) {
      return `V5 [${i}] 불일치 — DB ${JSON.stringify(current[i])} vs 입력 ${JSON.stringify(expected[i])} / DB=${JSON.stringify(current)}`;
    }
  }
  return null;
}

/**
 * 이 행이 "이미 42차 정정을 받은 행"인지 판정한다(멱등 안내용).
 * V5 실패 사유가 재실행 때문인지, 정말로 DB가 변한 사건인지 구분해 알린다.
 */
function looksAlreadyCorrected(row) {
  const meta = isPlainObject(row.contentMeta) ? row.contentMeta[FIELD_KEY] : null;
  if (!isPlainObject(meta)) return false;
  return meta.source === 'human' && Array.isArray(meta.corrections) && meta.corrections.length > 0;
}

// ────────────────────────────────────────────────────────────
// 변경 계획
// ────────────────────────────────────────────────────────────

/**
 * 행당 update 1회분 data를 만든다.
 * specs·contentMeta 모두 "읽어서 JS에서 병합 → 객체 전체 write" 다.
 * jsonb 부분 갱신(`NULL || jsonb` 함정)을 피하려는 의도적 선택이다.
 */
function buildPlan(item, row, timestamp) {
  const specs = isPlainObject(row.specs) ? row.specs : {};
  const meta = isPlainObject(row.contentMeta) ? row.contentMeta : {};
  const prevEntry = isPlainObject(meta[FIELD_KEY]) ? meta[FIELD_KEY] : {};

  const notes = [];
  if (prevEntry.locked !== true) {
    // 34차 기준이면 9행 모두 locked:true 다. 아니라면 사람이 알아야 한다.
    notes.push(`기존 ${FIELD_KEY}.locked 가 true가 아니었습니다 (${JSON.stringify(prevEntry.locked)}) — locked:true 로 기록합니다.`);
  }
  if (prevEntry.source === undefined || prevEntry.updatedAt === undefined) {
    notes.push(`기존 ${FIELD_KEY}에 source/updatedAt 이 없어 previous* 가 null 로 기록됩니다.`);
  }

  // 되돌린 흔적. 기존 corrections가 있으면 누적한다(43차가 같은 필드를 다시 정정한다).
  const prevCorrections = Array.isArray(prevEntry.corrections) ? prevEntry.corrections : [];
  const correction = {
    previousValue: specs[SPEC_KEY], // DB 실측값 (V5 통과 = expectedCurrent와 동일)
    previousSource: prevEntry.source === undefined ? null : prevEntry.source,
    previousUpdatedAt: prevEntry.updatedAt === undefined ? null : prevEntry.updatedAt,
    reason: item.reason,
    correctedAt: timestamp,
  };

  const nextSpecs = { ...specs, [SPEC_KEY]: item.newValue };
  const nextMeta = {
    ...meta,
    [FIELD_KEY]: {
      locked: true,
      source: 'human',
      updatedAt: timestamp,
      corrections: [...prevCorrections, correction],
    },
  };

  return {
    id: item.id,
    data: { specs: nextSpecs, contentMeta: nextMeta },
    notes,
    correctionCount: prevCorrections.length + 1,
  };
}

// ────────────────────────────────────────────────────────────
// 출력
// ────────────────────────────────────────────────────────────

const RULE = '─────────────────────────────────────';

/** prod-010  ["네이비","우디"] -> "네이비"   reason=...  [OK] */
function formatLine(id, before, newValue, reason, verdict) {
  return [
    String(id).padEnd(9),
    `${JSON.stringify(before)} -> ${JSON.stringify(newValue)}`.padEnd(34),
    `reason=${reason}`.padEnd(34),
    `[${verdict}]`,
  ].join(' ');
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
    console.warn('  node --env-file=.env.local scripts/specs-color-fix-write.js --data <경로>');
    console.warn('');
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('');
  console.log(
    opts.apply
      ? '=== 42차 specs.color 정정 — APPLY (실제 DB 반영) ==='
      : '=== 42차 specs.color 정정 — DRY-RUN (변경 없음) ==='
  );
  console.log('');

  if (!opts.data) {
    throw new FatalError('--data 로 입력 JSON 경로를 지정하세요. 기본값은 제공하지 않습니다.');
  }
  const dataPath = resolveDataPath(opts.data);
  console.log(`입력 파일: ${path.relative(ROOT, dataPath)}`);

  const items = loadInput(dataPath);
  console.log(`대상 ${items.length}건 (locked:true 인 ${FIELD_KEY} 를 정정합니다 — 잠금은 유지)`);
  console.log('');

  ensureDatabaseUrl();

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  const dupIds = findDuplicateIds(items);
  // 배치 식별이 쉽도록 실행 시작 시각 하나를 전체에 동일 적용한다.
  const timestamp = new Date().toISOString();

  let passed = 0;
  let skipped = 0;
  let changed = 0;
  const skipDetails = [];

  try {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const label = isPlainObject(item) && typeof item.id === 'string' ? item.id : `[${i}]`;

      // ── V1~V3 ──
      const inputErrors = validateItem(item, dupIds);
      if (inputErrors.length > 0) {
        skipped += 1;
        console.log(`${String(label).padEnd(9)} ${'(입력 검증 실패)'.padEnd(34)} ${''.padEnd(34)} [SKIP]`);
        inputErrors.forEach((e) => console.log(`          ⚠ ${e}`));
        skipDetails.push(`${label}: ${inputErrors.join(' / ')}`);
        continue;
      }

      // ── V4 대상 존재 ──
      let row;
      try {
        // eslint-disable-next-line no-await-in-loop
        row = await prisma.product.findUniqueOrThrow({
          where: { id: item.id },
          select: { id: true, name: true, specs: true, contentMeta: true },
        });
      } catch (err) {
        skipped += 1;
        console.log(formatLine(item.id, item.expectedCurrent, item.newValue, item.reason, 'SKIP'));
        console.log(`          ⚠ V4 대상 상품이 DB에 없습니다 (${err.code || err.name}).`);
        skipDetails.push(`${item.id}: V4 대상 미존재`);
        continue;
      }

      // ── V5 expectedCurrent 대조 ──
      const currentColor = isPlainObject(row.specs) ? row.specs[SPEC_KEY] : undefined;
      const mismatch = compareExpected(currentColor, item.expectedCurrent);
      if (mismatch) {
        skipped += 1;
        console.log(formatLine(item.id, item.expectedCurrent, item.newValue, item.reason, 'SKIP'));
        console.log(`          ⚠ ${mismatch}`);
        if (looksAlreadyCorrected(row)) {
          // 재실행이라는 뜻. V5가 멱등 가드 역할을 대신한 정상 동작이다.
          console.log('          ↳ 이 행은 이미 정정됨(source=human, corrections 존재) — 재실행으로 인한 차단입니다.');
        } else {
          console.log('          ↳ 자동 보정하지 않습니다. 입력 파일 작성 이후 DB가 변했다는 신호이므로 원인을 규명하세요.');
        }
        skipDetails.push(`${item.id}: ${mismatch}`);
        continue;
      }

      // ── 통과 ──
      passed += 1;
      const plan = buildPlan(item, row, timestamp);
      console.log(formatLine(item.id, currentColor, item.newValue, item.reason, 'OK'));
      plan.notes.forEach((n) => console.log(`          ⚠ ${n}`));

      if (!opts.apply) continue;

      // 행당 두 필드(specs·contentMeta)는 하나의 update 로 — 반쪽 반영 불가.
      try {
        // eslint-disable-next-line no-await-in-loop
        await prisma.product.update({ where: { id: plan.id }, data: plan.data });
      } catch (err) {
        console.error('');
        console.error(`❌ ${plan.id} update 실패: ${err.message}`);
        console.error(`   이전 ${changed}건은 이미 반영되었습니다(행 단위 update라 롤백되지 않음).`);
        console.error('   원인 해결 후 재실행하면 반영된 행은 V5에서 자동으로 차단됩니다(멱등).');
        throw new FatalError(`${plan.id} 반영 실패로 중단합니다.`);
      }
      changed += 1;
      console.log(`          → 반영 완료 (corrections ${plan.correctionCount}건 누적, locked:true 유지)`);
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log('');
  console.log(RULE);
  console.log(`대상 ${items.length} / 통과 ${passed} / skip ${skipped} / 변경 ${changed}`);
  console.log(RULE);
  console.log(`무접근: ${FIELD_KEY} 외 contentMeta 키(compatibleModels·seoTitle 등)와 specs의 다른 키`);
  console.log(RULE);

  if (skipDetails.length > 0) {
    console.log('');
    console.log(`skip ${skipDetails.length}건 —`);
    skipDetails.forEach((d) => console.log(`  - ${d}`));
    console.log('');
    console.log('❌ 검증에 실패한 행이 있어 종료코드 1로 마칩니다.');
    process.exitCode = 1;
  }

  console.log('');
  if (!opts.apply) {
    console.log('[DRY-RUN] 위 계획을 육안 확인한 뒤 --apply 를 붙여 다시 실행하세요.');
  } else {
    console.log(`[APPLY] 반영 완료 (배치 시각 ${timestamp}).`);
  }
  console.log('');
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
