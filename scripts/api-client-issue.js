/**
 * API 클라이언트 키 발급 (Phase 7 50차) — /api/v1 자격증명 생성
 *
 * 사용법:
 *   node scripts/api-client-issue.js --name <이름> --scopes orders:read,inventory:write   # dry-run
 *   node scripts/api-client-issue.js --name <이름> --scopes orders:read --apply           # 실제 발급
 *
 * 안전장치:
 *   - 기본 DRY-RUN. --apply 없이는 어떤 write도 하지 않는다.
 *   - --name 필수. 없으면 usage 출력 후 exit 1.
 *   - --scopes 는 화이트리스트(ALLOWED_SCOPES) 밖 값이 오면 오탈자로 보고 exit 1.
 *   - 평문 키는 --apply 성공 시 stdout에 1회만 출력하고 파일로 저장하지 않는다.
 *     dry-run에서는 평문을 생성하되 출력하지 않는다(접두 12자만 표시).
 *
 * 해시 로직은 lib/api-v1/keys.ts 와 문자 단위로 동일해야 한다.
 * 스크립트는 `@/` 별칭을 해석할 수 없어 import 대신 복제해 둔 것이므로,
 * 한쪽만 바꾸면 발급한 키로 인증이 되지 않는다.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createHash, randomBytes } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');

/** 34차 §5-2 — 허용 스코프 화이트리스트 */
const ALLOWED_SCOPES = [
  'orders:read',
  'inventory:read',
  'inventory:write',
  'invoices:write',
  'audit:read',
];

const USAGE = [
  '사용법: node scripts/api-client-issue.js --name <이름> [옵션]',
  '',
  '  --name <이름>     클라이언트 이름 (필수, 예: hub-jusung)',
  '  --scopes <목록>   콤마 구분 스코프 (생략 시 빈 배열)',
  '  --apply           실제 발급 (없으면 DRY-RUN — 아무것도 쓰지 않는다)',
  '  --help            이 도움말',
  '',
  `  허용 스코프: ${ALLOWED_SCOPES.join(', ')}`,
].join('\n');

function fail(message) {
  console.error('');
  console.error(`✖ ${message}`);
  console.error('');
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { name: null, scopes: [], apply: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--apply') {
      opts.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (arg === '--name' || arg.startsWith('--name=')) {
      const raw = arg === '--name' ? argv[(i += 1)] : arg.slice('--name='.length);
      if (!raw || !raw.trim()) fail(`--name 뒤에 이름을 지정하세요.\n\n${USAGE}`);
      opts.name = raw.trim();
    } else if (arg === '--scopes' || arg.startsWith('--scopes=')) {
      const raw = arg === '--scopes' ? argv[(i += 1)] : arg.slice('--scopes='.length);
      if (!raw) fail(`--scopes 뒤에 스코프를 지정하세요.\n\n${USAGE}`);
      opts.scopes = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      fail(`알 수 없는 인자: ${arg}\n\n${USAGE}`);
    }
  }

  if (!opts.name) fail(`--name 은 필수입니다.\n\n${USAGE}`);

  const outside = opts.scopes.filter((s) => !ALLOWED_SCOPES.includes(s));
  if (outside.length > 0) {
    fail(
      `허용 목록에 없는 스코프입니다(오탈자 의심): ${outside.join(', ')}\n` +
        `  허용 스코프: ${ALLOWED_SCOPES.join(', ')}`
    );
  }

  return opts;
}

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
    console.warn('  node --env-file=.env.local scripts/api-client-issue.js --name <이름> --apply');
    console.warn('');
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  console.log('');
  console.log(
    opts.apply
      ? '=== API 클라이언트 발급 — APPLY (실제 DB 반영) ==='
      : '=== API 클라이언트 발급 — DRY-RUN (변경 없음) ==='
  );
  console.log('');
  console.log(`이름:   ${opts.name}`);
  console.log(`스코프: ${opts.scopes.length > 0 ? opts.scopes.join(', ') : '(없음)'}`);

  // lib/api-v1/keys.ts 와 문자 단위로 동일해야 하는 구간
  const plain = 'msd_' + randomBytes(24).toString('base64url');
  const keyHash = createHash('sha256').update(plain, 'utf8').digest('hex');
  const keyPrefix = plain.slice(0, 12);

  console.log(`접두:   ${keyPrefix}...`);
  console.log('');

  if (!opts.apply) {
    console.log('DRY-RUN 이므로 DB에 쓰지 않았고 평문 키도 출력하지 않습니다.');
    console.log('실제 발급하려면 위 명령에 --apply 를 붙이세요.');
    console.log('');
    return;
  }

  ensureDatabaseUrl();

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    const created = await prisma.apiClient.create({
      data: { name: opts.name, keyHash, keyPrefix, scopes: opts.scopes },
    });

    console.log(`생성 완료 — id: ${created.id}`);
    console.log('');
    console.log('────────────────────────────────────────────────────────────');
    console.log('  ⚠ 이 값은 다시 볼 수 없습니다. 지금 안전한 곳에 옮기세요.');
    console.log('');
    console.log(`  ${plain}`);
    console.log('');
    console.log('  DB에는 SHA-256 해시만 저장됩니다(평문 복구 불가).');
    console.log('────────────────────────────────────────────────────────────');
    console.log('');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('');
  console.error('✖ 실패:', err && err.message ? err.message : err);
  console.error('');
  process.exit(1);
});
