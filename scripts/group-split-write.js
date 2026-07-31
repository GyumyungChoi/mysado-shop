/**
 * STEP 1 — 그룹 분할 write (36차)
 *
 * 입력 : data/group-split입력-36차.json (36차 확정 — FLIPSUIT 6 유지 / VARIETY 10 신규)
 * 대상 : product_group.title UPDATE + product_group 1행 INSERT + product 10행 재배정
 * 기본 : DRY-RUN. --apply 없이는 어떤 write도 하지 않음
 *
 * 35차 SKU 11자 프리픽스가 제품군 2종(플립수트 카드 / 버라이어티 마그넷)을 한 그룹으로
 * 병합한 결함을 교정한다. 판정은 36차 검토에서 확정되어 JSON에 고정되었다.
 * 그룹 규칙이 바뀌면 JSON을 다시 만들지, 이 스크립트를 고치지 않는다.
 *
 * 사용법
 *   node scripts/group-split-write.js            기본 = DRY-RUN (조회만, write 없음)
 *   node scripts/group-split-write.js --apply     실제 DB 반영
 *
 * 하는 일 (정확히 이것만, additive)
 *   1. UPDATE product_group SET title=... WHERE group_key='GP-FPF766HI'
 *      (representativeId·members 불변 — 제자리 유지)
 *   2. INSERT product_group 1행 (group_key='GP-FPF766HI-VR', content_status='raw')
 *   3. UPDATE product SET group_id=<VARIETY.id>, group_role=... WHERE id IN (prod-127..136)
 *
 * 절대 하지 않는 것
 *   - FLIPSUIT 6개(prod-007~012)의 group_id·group_role 변경 금지.
 *   - 어떤 행도 DELETE 금지. variant_label 재작성 금지(35-1 라벨 정제는 별도 건).
 *
 * 안전장치
 *   - member.id가 DB에 하나라도 없으면 아무것도 쓰지 않고 종료.
 *   - representativeId ⊂ members 이고 PRIMARY 정확히 1건인지 재검증.
 *   - update-existing 그룹의 members가 실제로 그 그룹에 있는지 확인(제자리 전제 검증).
 *   - group_key UNIQUE → 이미 있으면 재사용(재INSERT 금지) = 멱등.
 *   - $transaction 으로 INSERT + 10 UPDATE 원자 처리. 부분 반영 금지.
 *   - apply 후 postConditions(그룹 19 / FLIPSUIT 6 / VARIETY 10 / grouped 90 불변) 검증.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'group-split입력-36차.json');

/** 사용자 입력·데이터 오류용. 스택 없이 메시지만 출력하고 exit 1 한다. */
class FatalError extends Error {}

// ────────────────────────────────────────────────────────────
// 인자 파싱
// ────────────────────────────────────────────────────────────

const USAGE = [
  '사용법: node scripts/group-split-write.js [옵션]',
  '',
  '  (옵션 없음)      DRY-RUN — 계획만 출력하고 아무것도 쓰지 않는다',
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

const VALID_OPS = ['update-existing', 'insert-new'];

function loadInput() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new FatalError(
      `데이터 파일이 없습니다: ${DATA_PATH}\n` +
        '36차 산출물인 그룹 분할 확정 JSON을 위 경로에 놓은 뒤 다시 실행하세요.'
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
  if (!Array.isArray(parsed.targetGroups) || parsed.targetGroups.length === 0) {
    throw new FatalError('데이터 파일에 targetGroups 배열이 없거나 비어 있습니다.');
  }

  const seenGroupKeys = new Set();
  const seenMemberIds = new Set();

  parsed.targetGroups.forEach((g, index) => {
    const where = `[${index}] ${g && g.groupKey ? g.groupKey : '(groupKey 없음)'}`;

    if (!isPlainObject(g)) {
      errors.push(`${where}: 그룹이 객체가 아닙니다.`);
      return;
    }
    if (!VALID_OPS.includes(g.op)) {
      errors.push(`${where}: op은 ${VALID_OPS.join(' / ')} 중 하나여야 합니다 (현재: ${g.op}).`);
    }
    if (typeof g.groupKey !== 'string' || g.groupKey.trim() === '') {
      errors.push(`${where}: groupKey는 비어 있지 않은 문자열이어야 합니다.`);
    } else if (seenGroupKeys.has(g.groupKey)) {
      errors.push(`${where}: groupKey가 중복되었습니다.`);
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
      errors.push(`${where}: contentStatus는 'raw'여야 합니다 (현재: ${g.contentStatus}).`);
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
    });

    if (primaries.length !== 1) {
      errors.push(`${where}: PRIMARY는 그룹당 정확히 1건이어야 합니다 (현재 ${primaries.length}건).`);
    } else if (primaries[0].id !== g.representativeId) {
      errors.push(
        `${where}: representativeId(${g.representativeId})가 PRIMARY member(${primaries[0].id})와 일치하지 않습니다.`
      );
    }
  });

  if (errors.length > 0) {
    throw new FatalError(`데이터 파일 검증 실패 (${errors.length}건)\n  - ${errors.slice(0, 30).join('\n  - ')}`);
  }
}

// ────────────────────────────────────────────────────────────
// 변경 계획 계산
// ────────────────────────────────────────────────────────────

/**
 * update-existing 그룹의 계획.
 * 이 op은 product_group.title 만 건드린다. members는 제자리 유지가 전제이므로
 * "실제로 이미 그 그룹에 올바른 role로 있는지"만 검증하고 UPDATE는 하지 않는다.
 */
function buildUpdateExistingPlan(group, existingGroup, rowById) {
  if (!existingGroup) {
    throw new FatalError(
      `op=update-existing 인데 group_key='${group.groupKey}' 그룹이 DB에 없습니다.\n` +
        '35차 ProductGroup write가 선행되어야 합니다.'
    );
  }

  const titleChanged = existingGroup.title !== group.title;
  const repChanged = existingGroup.representativeId !== group.representativeId;

  // 제자리 전제 검증 — 이 멤버들은 이미 이 그룹에 이 role로 있어야 한다.
  const misplaced = [];
  group.members.forEach((m) => {
    const row = rowById.get(m.id);
    if (row.groupId !== existingGroup.id || row.groupRole !== m.role) {
      misplaced.push({
        id: m.id,
        expected: `${existingGroup.id}/${m.role}`,
        actual: `${row.groupId}/${row.groupRole}`,
      });
    }
  });

  return {
    kind: 'update-existing',
    groupKey: group.groupKey,
    title: group.title,
    titleWas: existingGroup.title,
    titleChanged,
    repChanged,
    existingGroupId: existingGroup.id,
    members: group.members,
    misplaced,
    hasChange: titleChanged,
  };
}

/**
 * insert-new 그룹의 계획.
 * 그룹 INSERT(또는 기존 재사용) + 멤버 재배정 UPDATE.
 * variant_label 은 건드리지 않는다(불변).
 */
function buildInsertNewPlan(group, existingGroup, rowById) {
  const groupAction = existingGroup ? 'reuse' : 'create';

  const memberPlans = group.members.map((m) => {
    const row = rowById.get(m.id);
    const alreadyApplied =
      !!existingGroup && row.groupId === existingGroup.id && row.groupRole === m.role;

    return {
      id: m.id,
      role: m.role,
      current: { groupId: row.groupId, groupRole: row.groupRole },
      needsUpdate: !alreadyApplied,
    };
  });

  const hasChange = groupAction === 'create' || memberPlans.some((p) => p.needsUpdate);

  return {
    kind: 'insert-new',
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

function printPlans(plans, groupIdByKey) {
  plans.forEach((plan) => {
    console.log('');
    console.log(`${plan.groupKey}  ${truncate(plan.title, 44)}`);

    if (plan.kind === 'update-existing') {
      console.log(`  처리        : 기존 그룹 title 정제 (id=${plan.existingGroupId})`);
      if (plan.titleChanged) {
        console.log(`    title     : "${plan.titleWas}"  ->  "${plan.title}"`);
      } else {
        console.log('    title     : 변경 없음 (이미 동일)');
      }
      console.log(`  members     : ${plan.members.length}건 제자리 유지 (group_id·group_role 무변경)`);
      if (plan.misplaced.length > 0) {
        console.log(`    ⚠ 제자리 아님 ${plan.misplaced.length}건:`);
        plan.misplaced.forEach((m) => console.log(`      - ${m.id}: 기대 ${m.expected} / 실제 ${m.actual}`));
      }
      if (plan.repChanged) {
        console.log('    ⚠ representativeId가 DB와 다릅니다 (이 스크립트는 rep를 변경하지 않습니다).');
      }
      return;
    }

    const toUpdate = plan.memberPlans.filter((p) => p.needsUpdate);
    console.log(`  대표 상품   : ${plan.representativeId}`);
    console.log(
      `  그룹 처리   : ${plan.groupAction === 'create' ? '신규 생성' : `기존 재사용 (id=${plan.existingGroupId})`}`
    );
    console.log(`  member 수   : ${plan.memberPlans.length}`);
    if (toUpdate.length === 0) {
      console.log('  변경 없음 (이미 반영됨)');
    } else {
      console.log(`  재배정 대상 : ${toUpdate.length}건 (variant_label 불변)`);
      toUpdate.forEach((mp) => {
        const from = mp.current.groupId ? `${groupIdByKey.get(mp.current.groupId) ?? mp.current.groupId}/${mp.current.groupRole}` : '(그룹없음)';
        console.log(`    - ${mp.id}: ${from}  ->  ${plan.groupKey}/${mp.role}`);
      });
    }
  });
  console.log('');
}

function printPostConditions(guard, expected) {
  console.log(RULE);
  console.log('사후조건 검증 (apply 후)');
  const rows = [
    ['product_group 총 행 수', guard.groupCount, expected.groupCount],
    ['GP-FPF766HI 멤버 수', guard.flipsuitMembers, expected.flipsuitMembers],
    ['GP-FPF766HI-VR 멤버 수', guard.varietyMembers, expected.varietyMembers],
    ['group_id NOT NULL product', guard.groupedTotal, expected.groupedTotal],
  ];
  rows.forEach(([label, actual, exp]) => {
    const mark = actual === exp ? '' : '  ⚠ 불일치';
    console.log(`  ${label.padEnd(28)} ${String(actual).padStart(4)}  (기대 ${exp})${mark}`);
  });
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
    console.warn('  node --env-file=.env.local scripts/group-split-write.js');
    console.warn('');
  }
}

async function applyPlans(prisma, plans) {
  const targets = plans.filter((p) => p.hasChange);
  if (targets.length === 0) {
    console.log('변경할 내용이 없습니다. (이미 모두 반영됨)');
    console.log('');
    return;
  }

  for (let i = 0; i < targets.length; i += 1) {
    const plan = targets[i];

    try {
      // eslint-disable-next-line no-await-in-loop
      await prisma.$transaction(async (tx) => {
        if (plan.kind === 'update-existing') {
          // title 만 갱신. representativeId·members 는 손대지 않는다.
          await tx.productGroup.update({
            where: { id: plan.existingGroupId },
            data: { title: plan.title },
          });
          return;
        }

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
          // variantLabel 은 data에 넣지 않는다 — 35차 라벨 유지.
          // eslint-disable-next-line no-await-in-loop
          await tx.product.update({
            where: { id: mp.id },
            data: { groupId, groupRole: mp.role },
          });
        }
      });
    } catch (err) {
      console.error('');
      console.error(`❌ ${plan.groupKey} 처리 중 실패했습니다.`);
      console.error(`   원인: ${err.message}`);
      console.error('');
      console.error(`   이전 ${i}개 그룹은 이미 반영되었습니다(그룹 단위 트랜잭션이라 롤백되지 않음).`);
      console.error('   원인 해결 후 같은 명령을 다시 실행하면, 이미 반영된 건은 변경 없음으로');
      console.error('   스킵되어 중복 반영되지 않습니다(멱등).');
      throw new FatalError(`${plan.groupKey} 트랜잭션 실패로 중단합니다.`);
    }

    console.log(`[${i + 1}/${targets.length}] ${plan.groupKey} 완료`);
  }
  console.log('');
}

async function runPostConditionGuard(prisma) {
  const groupCount = await prisma.productGroup.count();
  const groupedTotal = await prisma.product.count({ where: { groupId: { not: null } } });

  const flipsuit = await prisma.productGroup.findUnique({ where: { groupKey: 'GP-FPF766HI' } });
  const variety = await prisma.productGroup.findUnique({ where: { groupKey: 'GP-FPF766HI-VR' } });

  const flipsuitMembers = flipsuit ? await prisma.product.count({ where: { groupId: flipsuit.id } }) : 0;
  const varietyMembers = variety ? await prisma.product.count({ where: { groupId: variety.id } }) : 0;

  return { groupCount, groupedTotal, flipsuitMembers, varietyMembers };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('');
  console.log(opts.apply ? '=== STEP 1 그룹 분할 — APPLY (실제 DB 반영) ===' : '=== STEP 1 그룹 분할 — DRY-RUN (변경 없음) ===');
  console.log('');

  const parsed = loadInput();
  console.log(`데이터 파일 로드: 대상 그룹 ${parsed.targetGroups.length}건`);

  ensureDatabaseUrl();

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const memberIds = [...new Set(parsed.targetGroups.flatMap((g) => g.members.map((m) => m.id)))];
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

    const groupKeys = parsed.targetGroups.map((g) => g.groupKey);
    const existingGroups = await prisma.productGroup.findMany({ where: { groupKey: { in: groupKeys } } });
    const existingByKey = new Map(existingGroups.map((g) => [g.groupKey, g]));

    // 로그에서 "어느 그룹에서 왔는지"를 groupKey로 보여주기 위한 역인덱스.
    const allGroups = await prisma.productGroup.findMany({ select: { id: true, groupKey: true } });
    const groupKeyById = new Map(allGroups.map((g) => [g.id, g.groupKey]));

    const plans = parsed.targetGroups.map((g) =>
      g.op === 'update-existing'
        ? buildUpdateExistingPlan(g, existingByKey.get(g.groupKey), rowById)
        : buildInsertNewPlan(g, existingByKey.get(g.groupKey), rowById)
    );

    // 제자리 전제가 깨졌으면(FLIPSUIT 멤버가 엉뚱한 그룹) 진행하지 않는다.
    const misplacedTotal = plans
      .filter((p) => p.kind === 'update-existing')
      .reduce((sum, p) => sum + p.misplaced.length, 0);

    printPlans(plans, groupKeyById);

    if (misplacedTotal > 0 && opts.apply) {
      throw new FatalError(
        `update-existing 그룹의 멤버 ${misplacedTotal}건이 제자리에 없습니다. ` +
          'DB 상태와 입력 JSON이 어긋났으므로 아무것도 쓰지 않고 중단합니다.'
      );
    }

    let guard = null;
    if (opts.apply) {
      await applyPlans(prisma, plans);
      guard = await runPostConditionGuard(prisma);
    }

    if (guard) {
      const pc = parsed.postConditions ?? {};
      printPostConditions(guard, {
        groupCount: 19,
        flipsuitMembers: 6,
        varietyMembers: pc['GP-FPF766HI-VR_members'] ?? 10,
        groupedTotal: pc.groupedTotal_unchanged ?? 90,
      });
    }

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
