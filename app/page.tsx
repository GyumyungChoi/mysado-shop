import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProductCard from "@/components/products/ProductCard";
import categoriesData from "@/data/categories.json";
import productsData from "@/data/products.json";
import type { Category, Product } from "@/types/product";

const categories = categoriesData as Category[];
const products = productsData as Product[];

/** 카테고리 슬러그별 아이콘 이모지 */
const CATEGORY_ICONS: Record<string, string> = {
  cases: "📱",
  chargers: "🔌",
  earphones: "🎧",
  watch: "⌚",
  films: "🛡️",
  others: "✨",
};

/** 활성 상품 중 베스트 상품 6개를 정렬 순서대로 가져옵니다 */
function getBestProducts(): Product[] {
  return products
    .filter((product) => product.is_active)
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 6);
}

/** 메인 페이지 */
export default function Home() {
  const sortedCategories = [...categories].sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const bestProducts = getBestProducts();

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        {/* 히어로 배너 */}
        <section className="bg-gradient-to-b from-blue-50 to-white px-4 py-16 text-center sm:px-6 sm:py-24">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            삼성 휴대폰을 더 특별하게,
            <br />
            마이사도
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-gray-500 sm:text-lg">
            갤럭시 케이스부터 충전기, 워치 액세서리까지
            <br />
            믿을 수 있는 정품 액세서리를 만나보세요.
          </p>
          <Link
            href="/products"
            className="mt-8 inline-block rounded-full bg-gray-900 px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-700 sm:text-base"
          >
            상품 둘러보기
          </Link>
        </section>

        {/* 카테고리 바로가기 */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="mb-6 text-xl font-bold text-gray-900 sm:text-2xl">
            카테고리
          </h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6 sm:gap-4">
            {sortedCategories.map((category) => (
              <Link
                key={category.id}
                href={`/products?category=${category.slug}`}
                className="flex flex-col items-center gap-2 rounded-xl border border-gray-100 py-6 transition-colors hover:border-gray-300 hover:bg-gray-50"
              >
                <span className="text-3xl">
                  {CATEGORY_ICONS[category.slug] ?? "🛍️"}
                </span>
                <span className="text-sm font-medium text-gray-700">
                  {category.name}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* 베스트 상품 */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 sm:text-2xl">
              베스트 상품
            </h2>
            <Link
              href="/products"
              className="text-sm font-medium text-gray-500 hover:text-gray-900"
            >
              전체보기 →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
            {bestProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
