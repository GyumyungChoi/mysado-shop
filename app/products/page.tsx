import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProductCard from "@/components/products/ProductCard";
import categoriesData from "@/data/categories.json";
import productsData from "@/data/products.json";
import type { Category, Product } from "@/types/product";

const categories = categoriesData as Category[];
const products = productsData as Product[];

/** 카테고리 id로 활성 상품을 필터링하고 정렬 순서대로 반환합니다 */
function getFilteredProducts(categoryId?: string): Product[] {
  return products
    .filter((product) => product.is_active)
    .filter((product) => !categoryId || product.category_id === categoryId)
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** 상품 목록 페이지 (카테고리 탭 필터 포함) */
export default function ProductsPage({
  searchParams,
}: {
  searchParams: { category?: string };
}) {
  const selectedCategory = searchParams.category;
  const sortedCategories = [...categories].sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const filteredProducts = getFilteredProducts(selectedCategory);

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <h1 className="mb-6 text-2xl font-bold text-gray-900 sm:text-3xl">
            전체 상품
          </h1>

          {/* 카테고리 탭 */}
          <div className="mb-8 flex gap-2 overflow-x-auto pb-2">
            <Link
              href="/products"
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                !selectedCategory
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              전체
            </Link>
            {sortedCategories.map((category) => (
              <Link
                key={category.id}
                href={`/products?category=${category.id}`}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  selectedCategory === category.id
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {category.name}
              </Link>
            ))}
          </div>

          {/* 상품 그리드 (모바일 2열 / 데스크톱 3열) */}
          {filteredProducts.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
              {filteredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <p className="py-16 text-center text-gray-500">
              해당 카테고리에 상품이 없습니다.
            </p>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
