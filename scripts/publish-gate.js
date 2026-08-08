/**
 * 게시 게이트 판정기 (Phase 7 46차) — 순수 판정 규칙 모듈
 *
 * 이 파일은 I/O를 하지 않는다. DB·파일·표준출력·환경변수에 접근하지 않으며,
 * 외부 모듈도 가져오지 않는다. 향후 런타임(TypeScript)으로 이식할 때
 * 옮길 대상이 이 파일 하나가 되도록 부수효과를 전부 리포트 쪽에 가둔다.
 *
 * 다루는 축은 **콘텐츠 축(contentStatus)뿐**이다.
 * 판매 축(노출·구매 결정 필드)은 읽지 않으며 이 파일에 등장하지도 않는다.
 *
 * 입력은 product 행 객체이고, 필드명은 DB 컬럼명이 아니라 ORM 필드명을 쓴다.
 *   id, name, images, price, categoryId,
 *   compatibleModels, specs, seoTitle, seoDescription,
 *   contentMeta, contentStatus
 */

'use strict';

// ────────────────────────────────────────────────────────────
// 코드 정의
// ────────────────────────────────────────────────────────────

/** 판정 코드 → 사람이 읽는 문구 */
const GATE_CODES = {
  MISSING_BASIC: '기본 정보 누락 (name·images·price·categoryId)',
  MISSING_MODELS: '호환 모델 없음 (compatibleModels 비어 있음)',
  MISSING_SEO_TITLE: 'SEO 제목 없음 (seoTitle 비어 있음)',
  MISSING_SEO_DESC: 'SEO 설명 없음 (seoDescription 비어 있음)',
  DUPLICATE_SEO_TITLE: 'SEO 제목 중복 (전체 집합에서 유일하지 않음)',
  MISSING_COLOR: '색상 없음 (specs.color 부재 — 경고, PASS에 영향 없음)',
};

/** contentMeta 는 점이 포함된 평평한 문자열 키를 쓴다(중첩 객체 아님). */
const META_KEY_MODELS = 'compatibleModels';

/** G1이 묶어서 보는 네 항목. 실패 시 detail 에 이 이름들이 담긴다. */
const BASIC_FIELDS = ['name', 'images', 'price', 'categoryId'];

// ────────────────────────────────────────────────────────────
// 값 판정 유틸 (전부 방어적 — 입력 행의 형태를 신뢰하지 않는다)
// ────────────────────────────────────────────────────────────

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** null/undefined/비문자열/공백만 → false */
function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** 공백 제거한 문자열. 텍스트가 아니면 빈 문자열. */
function normText(value) {
  return hasText(value) ? value.trim() : '';
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * 값이 "채워져 있는가" — 문자열이면 공백 아님, 배열이면 비어 있지 않음.
 * specs.color 는 문자열 또는 문자열 배열 두 형태가 모두 실재하므로 둘 다 받는다.
 */
function isFilledValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '';
  return value !== null && value !== undefined;
}

// ────────────────────────────────────────────────────────────
// 개별 규칙
// ────────────────────────────────────────────────────────────

/** G1 — 네 항목을 한 코드로 묶되, 빈 항목 이름을 detail 로 남긴다. */
function checkBasic(row) {
  const missing = [];
  if (!hasText(row.name)) missing.push('name');
  if (!isNonEmptyArray(row.images)) missing.push('images');
  if (!(typeof row.price === 'number' && row.price > 0)) missing.push('price');
  if (!hasText(row.categoryId)) missing.push('categoryId');
  return missing;
}

/**
 * G2 면제 — contentMeta['compatibleModels'].source === 'none'.
 * "호환 모델이 없는 상품"임을 사람이 확정한 마커이므로 통과시킨다.
 * contentMeta 가 null이거나 해당 키가 없으면 면제가 아니다.
 */
function isModelsExempt(row) {
  const meta = row.contentMeta;
  if (!isPlainObject(meta)) return false;
  const entry = meta[META_KEY_MODELS];
  if (!isPlainObject(entry)) return false;
  return entry.source === 'none';
}

/** G6 — specs.color 존재 여부. specs 는 nullable jsonb. */
function hasColor(row) {
  const specs = row.specs;
  if (!isPlainObject(specs)) return false;
  if (!Object.prototype.hasOwnProperty.call(specs, 'color')) return false;
  return isFilledValue(specs.color);
}

// ────────────────────────────────────────────────────────────
// 행 단위 판정
// ────────────────────────────────────────────────────────────

/**
 * 행 1건 판정. 전역 유일성(G5)은 집합을 봐야 하므로 여기서 판정하지 않는다.
 *
 * 반환: { id, contentStatus, pass, failures, warnings }
 *   failures / warnings 원소는 { code, detail? } 이며 detail 은 문자열 배열이다.
 *   pass 는 FAIL tier 위반이 0건인가만 본다 — WARN 은 pass 에 영향을 주지 않는다.
 */
function judgeRow(row) {
  const failures = [];
  const warnings = [];

  // G1 MISSING_BASIC
  const missingBasic = checkBasic(row);
  if (missingBasic.length > 0) {
    failures.push({ code: 'MISSING_BASIC', detail: missingBasic });
  }

  // G2 MISSING_MODELS (면제 있음)
  if (!isNonEmptyArray(row.compatibleModels) && !isModelsExempt(row)) {
    failures.push({ code: 'MISSING_MODELS' });
  }

  // G3 MISSING_SEO_TITLE
  if (!hasText(row.seoTitle)) {
    failures.push({ code: 'MISSING_SEO_TITLE' });
  }

  // G4 MISSING_SEO_DESC
  if (!hasText(row.seoDescription)) {
    failures.push({ code: 'MISSING_SEO_DESC' });
  }

  // G6 MISSING_COLOR — WARN.
  // 색상이 없는 상품과 규칙이 못 찾은 상품이 데이터상 구별되지 않는다(면제 마커 부재).
  // 판정 불가능한 것을 탈락시키면 리포트가 거짓 수치를 내므로 FAIL 로 올리지 않는다.
  if (!hasColor(row)) {
    warnings.push({ code: 'MISSING_COLOR' });
  }

  return {
    id: row.id,
    contentStatus: row.contentStatus,
    pass: failures.length === 0,
    failures,
    warnings,
  };
}

// ────────────────────────────────────────────────────────────
// 집합 단위 판정
// ────────────────────────────────────────────────────────────

/**
 * 전 행 판정 후 G5(전역 유일성)를 합성한다.
 * 비어 있는 seoTitle 은 G3가 이미 잡으므로 G5 대상에서 제외한다.
 * 비교는 공백 제거값 기준(앞뒤 공백만 다른 제목은 같은 제목으로 본다).
 *
 * 입력 rows 와 judgeRow 결과를 변형하지 않고 새 객체를 만들어 돌려준다.
 *
 * 반환: { results, duplicateSeoTitles }
 */
function judgeAll(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const base = list.map((row) => judgeRow(row));

  // 공백 제거한 seoTitle → 해당 행 인덱스들
  const byTitle = new Map();
  list.forEach((row, index) => {
    const title = normText(row.seoTitle);
    if (title === '') return;
    if (!byTitle.has(title)) byTitle.set(title, []);
    byTitle.get(title).push(index);
  });

  const duplicateIndexes = new Map(); // index → 중복된 제목
  const duplicateSeoTitles = [];

  byTitle.forEach((indexes, title) => {
    if (indexes.length < 2) return;
    duplicateSeoTitles.push({ seoTitle: title, ids: indexes.map((i) => base[i].id) });
    indexes.forEach((i) => duplicateIndexes.set(i, title));
  });

  duplicateSeoTitles.sort((a, b) => b.ids.length - a.ids.length || a.seoTitle.localeCompare(b.seoTitle));

  const results = base.map((result, index) => {
    const dupTitle = duplicateIndexes.get(index);
    const failures = dupTitle === undefined
      ? result.failures.slice()
      : result.failures.concat([{ code: 'DUPLICATE_SEO_TITLE', detail: [dupTitle] }]);

    return {
      id: result.id,
      contentStatus: result.contentStatus,
      pass: failures.length === 0, // G5 반영 후 재계산
      failures,
      warnings: result.warnings.slice(),
    };
  });

  return { results, duplicateSeoTitles };
}

module.exports = { judgeRow, judgeAll, GATE_CODES };
