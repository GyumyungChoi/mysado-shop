/**
 * 게시 게이트 리포트 (Phase 7 46차) — DB 읽기 + 집계 + 출력
 *
 * 판정 규칙은 scripts/publish-gate.js 에 있고, 이 파일은 I/O만 담당한다.
 *
 * 읽기 전용 스크립트다. findMany 외의 DB 접근 경로를 두지 않으며,
 * contentStatus 를 승격시키는 write 플래그도 두지 않는다(쓸 대상이 이번 범위에 없다).
 *
 * 사용법
 *   node scripts/publish-gate-report.js                표 출력 (기본)
 *   node scripts/publish-gate-report.js --json         JSON 출력
 *   node scripts/publish-gate-report.js --out <경로>   같은 내용을 파일로도 저장
 *   node scripts/publish-gate-report.js --fail-only    탈락 행 목록만 상세 출력
 *
 * DATABASE_URL 이 환경에 없으면 다음처럼 실행한다.
 *   node --env-file=.env.local scripts/publish-gate-report.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const { judgeAll, GATE_CODES } = require('./publish-gate');

const ROOT = path.join(__dirname, '..');

/** 사용자 입력·연결 오류용. 스택 없이 메시지만 내고 종료 코드 1. */
class FatalError extends Error {}

/** 교차표 행 순서. 여기 없는 값은 뒤에 사전순으로 붙인다. */
const CONTENT_STATUS_ORDER = ['raw', 'draft', 'review', 'published'];

/** 성숙도 표기가 데이터보다 앞선 쪽 / 뒤처진 쪽 (드리프트 판정용) */
const MATURE_LABELS = ['review', 'published'];
const IMMATURE_LABELS = ['raw', 'draft'];

const RULE = '──────────────────────────────────────────────';

// ────────────────────────────────────────────────────────────
// 인자 파싱
// ────────────────────────────────────────────────────────────

const USAGE = [
  '사용법: node scripts/publish-gate-report.js [옵션]',
  '',
  '  (옵션 없음)     표 형태로 stdout 출력',
  '  --json          JSON 으로 출력',
  '  --out <경로>    같은 내용을 파일로도 저장 (기본 경로 없음)',
  '  --fail-only     탈락 행 목록만 상세 출력',
  '  --help          이 도움말',
].join('\n');

function parseArgs(argv) {
  const opts = { json: false, out: null, failOnly: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--fail-only') {
      opts.failOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--out' || arg.startsWith('--out=')) {
      const raw = arg === '--out' ? argv[(i += 1)] : arg.slice('--out='.length);
      if (!raw) throw new FatalError('--out 뒤에 경로를 지정하세요.');
      opts.out = raw;
    } else {
      throw new FatalError(`알 수 없는 인자: ${arg}\n\n${USAGE}`);
    }
  }

  return opts;
}

/** 출력 경로는 저장소(ROOT) 안으로 제한한다. */
function resolveOutPath(input) {
  const resolved = path.resolve(ROOT, input);
  if (!resolved.startsWith(ROOT + path.sep)) {
    throw new FatalError(`저장소(ROOT) 밖 경로에는 쓸 수 없습니다: ${input}`);
  }
  return resolved;
}

// ────────────────────────────────────────────────────────────
// 집계
// ────────────────────────────────────────────────────────────

function truncate(text, max) {
  const str = String(text);
  return str.length <= max ? str : `${str.slice(0, max)}…`;
}

/** 코드별 건수 (행 하나가 여러 코드에 걸릴 수 있어 합계 ≠ FAIL 행 수) */
function countByCode(results, key) {
  const counts = new Map();
  results.forEach((r) => {
    r[key].forEach((item) => {
      counts.set(item.code, (counts.get(item.code) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** G1 detail 항목별 분해 (name/images/price/categoryId 각각 몇 건인가) */
function countBasicDetail(results) {
  const counts = new Map();
  results.forEach((r) => {
    const basic = r.failures.find((f) => f.code === 'MISSING_BASIC');
    if (!basic || !Array.isArray(basic.detail)) return;
    basic.detail.forEach((field) => counts.set(field, (counts.get(field) || 0) + 1));
  });
  return [...counts.entries()]
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field));
}

/** contentStatus × PASS/FAIL 교차표 */
function buildCrossTab(results) {
  const table = new Map();
  results.forEach((r) => {
    const label = typeof r.contentStatus === 'string' && r.contentStatus !== '' ? r.contentStatus : '(없음)';
    if (!table.has(label)) table.set(label, { contentStatus: label, pass: 0, fail: 0 });
    const cell = table.get(label);
    if (r.pass) cell.pass += 1;
    else cell.fail += 1;
  });

  return [...table.values()].sort((a, b) => {
    const ia = CONTENT_STATUS_ORDER.indexOf(a.contentStatus);
    const ib = CONTENT_STATUS_ORDER.indexOf(b.contentStatus);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.contentStatus.localeCompare(b.contentStatus);
  });
}

/**
 * 드리프트 — contentStatus 표기와 판정이 어긋난 행.
 * 지시서가 명시한 두 군(review·FAIL / draft·PASS)을 먼저 두고,
 * 같은 방향이지만 지시서에 열거되지 않은 값(published·FAIL / raw·PASS)은
 * 숨기면 "검사 안 함"과 구별되지 않으므로 별도 참고 군으로 남긴다.
 */
function buildDrift(results) {
  const has = (list, label) => list.indexOf(label) !== -1;

  return {
    reviewFail: results.filter((r) => r.contentStatus === 'review' && !r.pass),
    draftPass: results.filter((r) => r.contentStatus === 'draft' && r.pass),
    otherMatureFail: results.filter(
      (r) => has(MATURE_LABELS, r.contentStatus) && r.contentStatus !== 'review' && !r.pass
    ),
    otherImmaturePass: results.filter(
      (r) => has(IMMATURE_LABELS, r.contentStatus) && r.contentStatus !== 'draft' && r.pass
    ),
  };
}

function summarize(results) {
  return {
    total: results.length,
    pass: results.filter((r) => r.pass).length,
    fail: results.filter((r) => !r.pass).length,
    warn: results.filter((r) => r.warnings.length > 0).length,
  };
}

// ────────────────────────────────────────────────────────────
// 출력 조립 (표 모드)
// ────────────────────────────────────────────────────────────

/** 판정 사유 한 줄 요약 — "MISSING_BASIC[images, price] · MISSING_SEO_DESC" */
function fmtReasons(failures) {
  return failures
    .map((f) => (Array.isArray(f.detail) && f.detail.length > 0 ? `${f.code}[${f.detail.join(', ')}]` : f.code))
    .join(' · ');
}

function pushFailList(lines, rows, nameById) {
  rows.forEach((r) => {
    lines.push(`  ${r.id}  ${truncate(nameById.get(r.id) || '', 34).padEnd(34)}  ${fmtReasons(r.failures)}`);
  });
}

function pushRowList(lines, rows, nameById) {
  rows.forEach((r) => {
    const reasons = r.failures.length > 0 ? fmtReasons(r.failures) : 'PASS';
    lines.push(`  ${r.id}  ${truncate(nameById.get(r.id) || '', 34).padEnd(34)}  ${reasons}`);
  });
}

function buildTableLines(report, nameById, opts) {
  const lines = [];
  const { summary, failByCode, basicDetail, warnByCode, crossTab, drift, duplicateSeoTitles } = report;

  // ── --fail-only : 탈락 행 상세만 ──
  if (opts.failOnly) {
    const failed = report.results.filter((r) => !r.pass);
    lines.push('');
    lines.push(`=== 게시 게이트 · 탈락 행 상세 (${failed.length} / ${summary.total}) ===`);
    lines.push('');
    if (failed.length === 0) lines.push('  탈락 행 없음');
    else pushFailList(lines, failed, nameById);
    lines.push('');
    return lines;
  }

  lines.push('');
  lines.push('=== 게시 게이트 리포트 (콘텐츠 축 전용 · 읽기 전용) ===');

  // ── ① 요약 ──
  lines.push('');
  lines.push('① 요약');
  lines.push(RULE);
  lines.push(`총 ${summary.total} / PASS ${summary.pass} / FAIL ${summary.fail} / WARN 보유 ${summary.warn}`);

  // ── ② FAIL 사유별 집계 ──
  lines.push('');
  lines.push('② FAIL 사유별 집계');
  lines.push(RULE);
  if (failByCode.length === 0) {
    lines.push('  탈락 사유 없음');
  } else {
    failByCode.forEach(({ code, count }) => {
      lines.push(`  ${String(count).padStart(4)}  ${code.padEnd(21)}  ${GATE_CODES[code] || ''}`);
    });
    if (basicDetail.length > 0) {
      lines.push('');
      lines.push('  MISSING_BASIC 항목별 분해');
      basicDetail.forEach(({ field, count }) => {
        lines.push(`  ${String(count).padStart(4)}    · ${field}`);
      });
    }
    lines.push('');
    lines.push(`  ※ 한 행이 여러 사유로 탈락할 수 있어 위 합계(${failByCode.reduce((s, f) => s + f.count, 0)})는`);
    lines.push(`     FAIL 행 수(${summary.fail})와 일치하지 않는다. MISSING_BASIC 분해도 같은 이유로 중복 계수된다.`);
  }

  // WARN 은 별도 한 줄 집계로만 낸다 (PASS 여부·드리프트 판정에 넣지 않는다).
  lines.push('');
  const warnLine = warnByCode.map(({ code, count }) => `${code} ${count}`).join(' / ');
  lines.push(`  WARN(참고, PASS에 영향 없음): ${warnLine || '없음'}`);

  // 중복 SEO 제목 목록 (G5 근거)
  if (duplicateSeoTitles.length > 0) {
    lines.push('');
    lines.push(`  중복 seoTitle ${duplicateSeoTitles.length}종`);
    duplicateSeoTitles.forEach(({ seoTitle, ids }) => {
      lines.push(`    ${String(ids.length).padStart(3)}건  "${truncate(seoTitle, 46)}"  ${ids.join(', ')}`);
    });
  }

  // ── ③ contentStatus × 판정 교차표 ──
  lines.push('');
  lines.push('③ contentStatus × 판정');
  lines.push(RULE);
  lines.push('contentStatus | PASS | FAIL');
  crossTab.forEach(({ contentStatus, pass, fail }) => {
    lines.push(`${contentStatus.padEnd(13)} | ${String(pass).padStart(4)} | ${String(fail).padStart(4)}`);
  });

  // ── ④ 드리프트 ──
  lines.push('');
  lines.push('④ 🔴 드리프트 (contentStatus 표기와 판정 불일치)');
  lines.push(RULE);

  lines.push(`[review 인데 FAIL] ${drift.reviewFail.length}건 — 성숙도 표기보다 데이터가 뒤처짐`);
  if (drift.reviewFail.length === 0) lines.push('  드리프트 없음');
  else pushFailList(lines, drift.reviewFail, nameById);

  lines.push('');
  lines.push(`[draft 인데 PASS] ${drift.draftPass.length}건 — 승격 후보`);
  if (drift.draftPass.length === 0) lines.push('  드리프트 없음');
  else pushRowList(lines, drift.draftPass, nameById);

  const extra = drift.otherMatureFail.length + drift.otherImmaturePass.length;
  lines.push('');
  lines.push(`[참고 · 지시서 열거 밖 contentStatus 값] ${extra}건`);
  if (extra === 0) {
    lines.push('  드리프트 없음');
  } else {
    if (drift.otherMatureFail.length > 0) {
      lines.push(`  published 인데 FAIL ${drift.otherMatureFail.length}건`);
      pushFailList(lines, drift.otherMatureFail, nameById);
    }
    if (drift.otherImmaturePass.length > 0) {
      lines.push(`  raw 인데 PASS ${drift.otherImmaturePass.length}건`);
      pushRowList(lines, drift.otherImmaturePass, nameById);
    }
  }

  lines.push('');
  lines.push('※ 이 게이트는 콘텐츠 축(contentStatus)만 본다. 사이트 노출·구매 가능 여부와 무관하다.');
  lines.push('');

  return lines;
}

// ────────────────────────────────────────────────────────────
// 실행
// ────────────────────────────────────────────────────────────

/**
 * node 직접 실행에서는 .env.local 이 자동 로드되지 않는다.
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
    console.warn('  node --env-file=.env.local scripts/publish-gate-report.js');
    console.warn('');
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  ensureDatabaseUrl();

  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();

  let rows;
  try {
    // 전체 계측이 목적이므로 where 필터 없이 전 행을 읽는다.
    // detailHtml·description 은 크므로 select 하지 않는다.
    rows = await db.product.findMany({
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
        contentMeta: true,
        contentStatus: true,
      },
      orderBy: { id: 'asc' },
    });
  } catch (err) {
    throw new FatalError(`DB 조회에 실패했습니다: ${err.message}`);
  } finally {
    await db.$disconnect();
  }

  const { results, duplicateSeoTitles } = judgeAll(rows);
  const nameById = new Map(rows.map((row) => [row.id, row.name]));

  const report = {
    summary: summarize(results),
    failByCode: countByCode(results, 'failures'),
    basicDetail: countBasicDetail(results),
    warnByCode: countByCode(results, 'warnings'),
    crossTab: buildCrossTab(results),
    drift: buildDrift(results),
    duplicateSeoTitles,
    results,
  };

  let output;
  if (opts.json) {
    const payload = opts.failOnly
      ? { summary: report.summary, results: results.filter((r) => !r.pass) }
      : report;
    output = JSON.stringify(payload, null, 2);
  } else {
    output = buildTableLines(report, nameById, opts).join('\n');
  }

  console.log(output);

  if (opts.out) {
    const outPath = resolveOutPath(opts.out);
    fs.writeFileSync(outPath, output.endsWith('\n') ? output : `${output}\n`, 'utf8');
    console.log(`저장: ${path.relative(ROOT, outPath)}`);
  }

  // 계측 도구다. 탈락 건수가 많은 것은 현재로선 정상 상태이므로 항상 0으로 끝낸다.
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
