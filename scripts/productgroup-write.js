/**
 * ProductGroup write — 35차 확정 그룹 배정 반영 스크립트
 *
 * 입력 : data/productgroup-write입력-35차.json (35차 검토 확정 — 18그룹/90상품)
 * 대상 : product_group 신규 INSERT + product.groupId/groupRole/variantLabel UPDATE
 * 기본 : DRY-RUN. --apply 없이는 어떤 write도 하지 않음
 *
 * 이 스크립트는 추출·판정을 하지 않는다. 그룹 배정은 35차 검토에서 확정되어
 * JSON에 고정되었다. 그룹 규칙이 바뀌면 JSON을 다시 만들지, 이 스크립트를 고치지 않는다.
 *
 * 사용법
 *   node scripts/productgroup-write.js              기본 = DRY-RUN (조회만, write 없음)
 *   node scripts/productgroup-write.js --apply       실제 DB 반영
 *   node scripts/productgroup-write.js --only <키>   특정 groupKey만 (콤마로 다중 지정)
 *
 * 안전장치
 *   - member.id / representativeId 가 DB product에 하나라도 없으면 전체 중단(부분 적용 금지).
 *   - representativeId ⊂ members, PRIMARY 정확히 1건 여부를 write 전 재검증.
 *   - product_group.group_key UNIQUE → 이미 있으면 재사용(재INSERT 금지) = 멱등.
 *   - member UPDATE는 group_id·role·variant_label이 이미 목표값과 같으면 스킵(무변경).
 *   - 그룹 단위 $transaction으로 INSERT+UPDATE를 원자 처리.
 *   - apply 후 product_group 총 행 수 / group_id NOT NULL product 행 수를
 *     입력 JSON의 stats(groups/groupedProducts)와 대조해 불일치 시 경고.
 *   - ungroupedIds(109건)는 입력 JSON에 write 대상으로 존재하지 않으므로 건드리지 않는다.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'productgroup-write입력-35차.json');

/** 사용자 입력·데이터 오류용. 스택 없이 메시지만 출력하고 exit 1 한다. */
class FatalError extends Error {}

// ────────────────────────────────────────────────────────────
// 인자 파싱
// ────────────────────────────────────────────────────────────

const USAGE = [
  '사용법: node scripts/productgroup-write.js [옵션]',
  '',
  '  (옵션 없음)      DRY-RUN — 계획만 출력하고 아무것도 쓰지 않는다',
  '  --apply          실제 DB 반영',
  '  --only <키>      특정 groupKey만 처리 (콤마 구분, 예: --only GP-FPF766HI)',
  '  --help           이 도움말',
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
      if (!raw) throw new FatalError('--only 뒤에 groupKey를 지정하세요 (예: --only GP-FPF766HI).');
      const keys = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (keys.length === 0) throw new FatalError('--only 값이 비어 있습니다.');
      opts.only = keys;
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

// ────────────────────────────────────────────────────────────
// 데이터 로드·검증
// ────────────────────────────────────────────────────────────

function loadInput() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new FatalError(
      `데이터 파일이 없습니다: ${DATA_PATH}\n` +
        '35차 산출물인 확정 그룹 배정 JSON을 위 경로에 놓은 뒤 다시 실행하세요.'
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
  if (!Array.isArray(parsed.groups) || parsed.groups.length === 0) {
    throw new FatalError('데이터 파일에 groups 배열이 없거나 비어 있습니다.');
  }
  if (!Array.isArray(parsed.ungroupedIds)) {
    throw new FatalError('데이터 파일에 ungroupedIds 배열이 없습니다.');
  }

  const seenGroupKeys = new Set();
  const seenMemberIds = new Set();

  parsed.groups.forEach((g, index) => {
    const where = `[${index}] ${g && g.groupKey ? g.groupKey : '(groupKey 없음)'}`;

    if (!isPlainObject(g)) {
      errors.push(`${where}: 그룹이 객체가 아닙니다.`);
      return;
    }
    if (typeof g.groupKey !== 'string' || g.groupKey.trim() === '') {
      errors.push(`${where}: groupKey는 비어 있지 않은 문자열이어야 합니다.`);
    } else if (seenGroupKeys.has(g.groupKey)) {
      errors.push(`${where}: groupKey가 중복되었습니다 (${g.groupKey}).`);
    } else {
      seenGroupKeys.add(g.groupKey);
    }
    if (typeof g.title !== 'string' || g.title.trim() === '') {
      errors.push(`${where}: title은 비어 있지 않은 문자열이어야 합니다.`);
    }
    if (typeof g.representativeId !== 'string' || g.representativeId.trim() === '') {
      errors.push(`${where}: representativeId는 비어 있지 않은 문자열이어야 합니다.`);
    }
    if (g.contentStatus !== 'raw') {
      errors.push(`${where}: contentStatus는 'raw'여야 합니다 (현재: ${g.contentStatus}). 이 스크립트는 최초 raw 생성 전용입니다.`);
    }
    if (!Array.isArray(g.members) || g.members.length === 0) {
      errors.push(`${where}: members 배열이 없거나 비어 있습니다.`);
      return;
    }

    const primaries = [];
    g.members.forEach((m, mIndex) => {
      const mWhere = `${where} members[${mIndex}]`;
      if (!isPlainObject(m)) {
        errors.push(`${mWhere}: member가 객체가 아닙니다.`);
        return;
      }
      if (typeof m.id !== 'string' || m.id.trim() === '') {
        errors.push(`${mWhere}: id는 비어 있지 않은 문자열이어야 합니다.`);
      } else if (seenMemberIds.has(m.id)) {
        errors.push(`${mWhere}: id가 다른 그룹과 중복되었습니다 (${m.id}).`);
      } else {
        seenMemberIds.add(m.id);
      }
      if (m.role !== 'PRIMARY' && m.role !== 'VARIANT') {
        errors.push(`${mWhere}: role은 PRIMARY 또는 VARIANT여야 합니다 (현재: ${m.role}).`);
      }
      if (m.role === 'PRIMARY') primaries.push(m);
      if (typeof m.variantLabel !== 'string' || m.variantLabel.trim() === '') {
        errors.push(`${mWhere}: variantLabel은 비어 있지 않은 문자열이어야 합니다.`);
      }
    });

    if (primaries.length !== 1) {
      errors.push(`${where}: PRIMARY는 그룹당 정확히 1건이어야 합니다 (현재 ${primaries.length}건).`);
    } else if (primaries[0].id !== g.representativeId) {
      errors.push(`${where}: representativeId(${g.representativeId})가 PRIMARY member(${primaries[0].id})와 일치하지 않습니다.`);
    }
  });

  // ungroupedIds와 그룹 member가 겹치면 안 된다 (배타적 분할이어야 함).
  parsed.ungroupedIds.forEach((id) => {
    if (seenMemberIds.has(id)) {
      errors.push(`ungroupedIds에 있는 id(${id})가 groups의 member로도 존재합니다.`);
    }
  });

  if (errors.length > 0) {
    throw new FatalError(`데이터 파일 검증 실패 (${errors.length}건)\n  - ${errors.slice(0, 30).join('\n  - ')}`);
  }
}

function applyOnlyFilter(groups, only) {
  if (!only) return groups;

  const byKey = new Map(groups.map((g) => [g.groupKey, g]));
  const missing = only.filter((key) => !byKey.has(key));
  if (missing.length > 0) {
    throw new FatalError(`--only 로 지정한 groupKey가 데이터 파일에 없습니다: ${missing.join(', ')}`);
  }
  return only.map((key) => byKey.get(key));
}

// ────────────────────────────────────────────────────────────
// 변경 계획 계산
// ────────────────────────────────────────────────────────────

/**
 * 그룹 1건의 변경 계획.
 * existingGroup: DB에 이미 groupKey로 존재하는 product_group row (없으면 undefined)
 * rowById: 이 그룹 members의 현재 product row(Map)
 */
function buildGroupPlan(group, existingGroup, rowById) {
  const groupAction = existingGroup ? 'reuse' : 'create';

  const memberPlans = group.members.map((m) => {
    const row = rowById.get(m.id);
    const targetGroupId = existingGroup ? existingGroup.id : null; // create 시 apply 단계에서 확정
    const alreadyApplied =
      !!existingGroup &&
      row.groupId === existingGroup.id &&
      row.groupRole === m.role &&
      row.variantLabel === m.variantLabel;

    return {
      id: m.id,
      role: m.role,
      variantLabel: m.variantLabel,
      current: { groupId: row.groupId, groupRole: row.groupRole, variantLabel: row.variantLabel },
      needsUpdate: !alreadyApplied,
    };
  });

  const hasChange = groupAction === 'create' || memberPlans.some((p) => p.needsUpdate);

  return {
    groupKey: group.groupKey,
    title: group.title,
    representativeId: group.representativeId,
    category: group.category ?? null,
    contentStatus: group.contentStatus,
    groupAction,
    existingGroupId: existingGroup ? existingGroup.id : null,
    memberPlans,
    hasChange,
  };
}

// ────────────────────────────────────────────────────────────
// 출력
// ────────────────────────────────────────────────────────────

const RULE = '─────────────────────────────────────';

function printPlans(plans) {
  plans.forEach((plan) => {
    const primaryCount = plan.memberPlans.filter((p) => p.role === 'PRIMARY').length;
    const variantCount = plan.memberPlans.filter((p) => p.role === 'VARIANT').length;
    const toUpdate = plan.memberPlans.filter((p) => p.needsUpdate);

    console.log('');
    console.log(`${plan.groupKey}  ${truncate(plan.title, 44)}`);
    console.log(`  대표 상품   : ${plan.representativeId}`);
    console.log(
      `  그룹 처리   : ${plan.groupAction === 'create' ? '신규 생성' : `기존 재사용 (id=${plan.existingGroupId})`}`
    );
    console.log(`  member 수   : ${plan.memberPlans.length} (PRIMARY ${primaryCount} / VARIANT ${variantCount})`);

    if (toUpdate.length === 0) {
      console.log('  변경 없음 (이미 반영됨)');
    } else {
      console.log(`  갱신 대상   : ${toUpdate.length}건`);
      toUpdate.forEach((mp) => {
        console.log(`    - ${mp.id} (${mp.role}) variantLabel="${truncate(mp.variantLabel, 36)}"`);
      });
    }
  });
  console.log('');
}

function printSummary(plans, opts, guard) {
  const created = plans.filter((p) => p.groupAction === 'create').length;
  const reused = plans.filter((p) => p.groupAction === 'reuse').length;
  const totalMembers = plans.reduce((sum, p) => sum + p.memberPlans.length, 0);
  const updatedMembers = plans.reduce((sum, p) => sum + p.memberPlans.filter((mp) => mp.needsUpdate).length, 0);

  console.log(RULE);
  console.log(`처리 그룹 수         ${plans.length}`);
  console.log(`  신규 생성 ${opts.apply ? '완료' : '예정'}     ${created}`);
  console.log(`  기존 재사용         ${reused}`);
  console.log(`대상 member 수       ${totalMembers}`);
  console.log(`  갱신 ${opts.apply ? '완료' : '예정'}         ${updatedMembers}`);
  console.log(`  변경 없음           ${totalMembers - updatedMembers}`);
  if (guard) {
    console.log(RULE);
    console.log('합계 가드 (apply 후 검증)');
    console.log(
      `  product_group 총 행 수          ${guard.groupCount}  (기대 ${guard.expectedGroups})` +
        (guard.groupCount === guard.expectedGroups ? '' : '  ⚠ 불일치')
    );
    console.log(
      `  group_id NOT NULL product 행 수  ${guard.groupedProductCount}  (기대 ${guard.expectedGroupedProducts})` +
        (guard.groupedProductCount === guard.expectedGroupedProducts ? '' : '  ⚠ 불일치')
    );
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
    console.warn('  node --env-file=.env.local scripts/productgroup-write.js');
    console.warn('');
  }
}

async function applyPlans(prisma, plans) {
  const targets = plans.filter((p) => p.hasChange);
  if (targets.length === 0) return;

  for (let i = 0; i < targets.length; i += 1) {
    const plan = targets[i];

    try {
      // eslint-disable-next-line no-await-in-loop
      await prisma.$transaction(async (tx) => {
        let groupId = plan.existingGroupId;

        if (plan.groupAction === 'create') {
          const created = await tx.productGroup.create({
            data: {
              groupKey: plan.groupKey,
              title: plan.title,
              representativeId: plan.representativeId,
              category: plan.category,
              contentStatus: plan.contentStatus,
            },
          });
          groupId = created.id;
        }

        const toUpdate = plan.memberPlans.filter((mp) => mp.needsUpdate);
        for (const mp of toUpdate) {
          // eslint-disable-next-line no-await-in-loop
          await tx.product.update({
            where: { id: mp.id },
            data: { groupId, groupRole: mp.role, variantLabel: mp.variantLabel },
          });
        }
      });
    } catch (err) {
      console.error('');
      console.error(`❌ ${plan.groupKey} 처리 중 실패했습니다.`);
      console.error(`   원인: ${err.message}`);
      console.error('');
      console.error(`   이전 ${i}개 그룹은 이미 반영되었습니다(그룹 단위 트랜잭션이라 롤백되지 않음).`);
      console.error('   원인 해결 후 같은 명령을 다시 실행하면, 이미 반영된 그룹/상품은');
      console.error('   변경 없음으로 스킵되어 중복 반영되지 않습니다(멱등).');
      throw new FatalError(`${plan.groupKey} 트랜잭션 실패로 중단합니다.`);
    }

    console.log(`[${i + 1}/${targets.length}] ${plan.groupKey} 완료`);
  }
  console.log('');
}

async function runSumGuard(prisma, parsed) {
  const groupCount = await prisma.productGroup.count();
  const groupedProductCount = await prisma.product.count({ where: { groupId: { not: null } } });
  return {
    groupCount,
    groupedProductCount,
    expectedGroups: parsed.stats.groups,
    expectedGroupedProducts: parsed.stats.groupedProducts,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('');
  console.log(opts.apply ? '=== APPLY (실제 DB 반영) ===' : '=== DRY-RUN (변경 없음) ===');
  if (opts.only) console.log(`옵션: --only ${opts.only.join(',')}`);
  console.log('');

  const parsed = loadInput();
  const groups = applyOnlyFilter(parsed.groups, opts.only);
  console.log(`데이터 파일 로드: 그룹 ${parsed.groups.length}건 (처리 대상 ${groups.length}건)`);

  ensureDatabaseUrl();

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const memberIds = [...new Set(groups.flatMap((g) => g.members.map((m) => m.id)))];
    const rows = await prisma.product.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, name: true, groupId: true, groupRole: true, variantLabel: true },
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));

    // id 하나라도 DB에 없으면 부분 반영 없이 즉시 멈춘다.
    const missing = memberIds.filter((id) => !rowById.has(id));
    if (missing.length > 0) {
      console.error(`DB에 없는 상품 id ${missing.length}건 — 아무것도 쓰지 않고 종료합니다.`);
      missing.forEach((id) => console.error(`  - ${id}`));
      throw new FatalError('데이터 파일과 DB가 어긋났습니다. JSON을 먼저 정정하세요.');
    }

    const groupKeys = groups.map((g) => g.groupKey);
    const existingGroups = await prisma.productGroup.findMany({ where: { groupKey: { in: groupKeys } } });
    const existingByKey = new Map(existingGroups.map((g) => [g.groupKey, g]));

    const plans = groups.map((g) => buildGroupPlan(g, existingByKey.get(g.groupKey), rowById));

    printPlans(plans);

    let guard = null;
    if (opts.apply) {
      await applyPlans(prisma, plans);
      guard = await runSumGuard(prisma, parsed);
    }

    printSummary(plans, opts, guard);

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
