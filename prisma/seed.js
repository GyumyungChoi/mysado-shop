// prisma/seed.js — products.json(v2, 199개) → product 테이블
const { PrismaClient } = require("@prisma/client");
const products = require("../data/products.json");

const prisma = new PrismaClient();

function validate(items) {
  const errors = [];
  const seen = new Set();

  items.forEach((p, i) => {
    const where = `[${i}] ${p.id ?? "(id없음)"}`;

    // 필수 필드
    for (const f of ["id", "name", "price", "category_id", "brand", "sort_order"]) {
      if (p[f] === undefined || p[f] === null || p[f] === "") {
        if (f !== "brand" || p[f] !== "") errors.push(`${where}: 필수 필드 누락 - ${f}`);
      }
    }
    // id 중복
    if (seen.has(p.id)) errors.push(`${where}: id 중복`);
    seen.add(p.id);
    // 가격 검증
    if (typeof p.price !== "number" || p.price <= 0)
      errors.push(`${where}: price 이상 (${p.price})`);
    if (p.discounted_price != null && p.discounted_price > p.price)
      errors.push(`${where}: 할인가(${p.discounted_price}) > 원가(${p.price})`);
    // 재고/이미지
    if (typeof p.stock_quantity !== "number" || p.stock_quantity < 0)
      errors.push(`${where}: stock_quantity 이상 (${p.stock_quantity})`);
    if (!Array.isArray(p.images) || p.images.length === 0)
      errors.push(`${where}: images 비어있음`);
    // 날짜 파싱 가능 여부
    if (isNaN(Date.parse(p.created_at))) errors.push(`${where}: created_at 파싱 불가`);
    if (isNaN(Date.parse(p.modified_at))) errors.push(`${where}: modified_at 파싱 불가`);
  });

  return errors;
}

async function main() {
  console.log(`products.json 로드: ${products.length}개`);

  const errors = validate(products);
  if (errors.length > 0) {
    console.error(`검증 실패 ${errors.length}건:`);
    errors.forEach((e) => console.error("  -", e));
    process.exit(1);
  }
  console.log("검증 통과 ✓");

  const data = products.map((p) => ({
    id: p.id,
    sku: p.sku, // null 허용
    categoryId: p.category_id,
    categoryName: p.category_name,
    name: p.name,
    price: p.price,
    discountedPrice: p.discounted_price,
    stock: p.stock_quantity,
    status: p.status,
    isVisible: p.is_active,
    description: p.description ?? "",
    detailHtml: p.detail_html ?? "",
    images: p.images,
    brand: p.brand,
    manufacturerName: p.manufacturer_name ?? "",
    modelName: p.model_name ?? "",
    tags: p.tags ?? [],
    deliveryFee: p.delivery_fee ?? 0,
    returnFee: p.return_fee ?? 0,
    exchangeFee: p.exchange_fee ?? 0,
    sortOrder: p.sort_order,
    originProductNo: p.origin_product_no,
    channelProductNo: p.channel_product_no,
    naverCategoryId: p.naver_category_id,
    naverWholeCategoryId: p.naver_whole_category_id,
    smartstoreUrl: p.smartstore_url,
    registeredAt: new Date(p.created_at),
    channelModifiedAt: new Date(p.modified_at),
  }));

  const result = await prisma.product.createMany({
    data,
    skipDuplicates: true, // 재실행 시 기존 id 건너뜀
  });
  console.log(`삽입 완료: ${result.count}개 (건너뜀: ${products.length - result.count}개)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());