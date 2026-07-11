import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProductCard from "@/components/products/ProductCard";
import categoriesData from "@/data/categories.json";
// import productsData from "@/data/products.json";
import type { Category } from "@/types/product";
import { getProductById, getRelatedProducts } from "@/lib/products";
import AddToCartButton from "@/components/products/AddToCartButton";

const categories = categoriesData as Category[];
// const products = productsData as Product[];

/** id로 활성 상품을 조회합니다 */
// function getProduct(id: string): Product | undefined {
//   return products.find((product) => product.id === id && product.is_active);
// }

/** 카테고리 id로 카테고리 정보를 조회합니다 */
function getCategory(categoryId: string): Category | undefined {
  return categories.find((category) => category.id === categoryId);
}

/** 같은 카테고리의 관련 상품을 최대 4개 반환합니다 */
// function getRelatedProducts(product: Product, limit = 4): Product[] {
//   return products
//     .filter(
//       (item) =>
//         item.is_active &&
//         item.category_id === product.category_id &&
//         item.id !== product.id
//     )
//     .sort((a, b) => a.sort_order - b.sort_order)
//     .slice(0, limit);
// }


/** 상품 상세 페이지 */
export const revalidate = 60;

export default async function ProductDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const product = await getProductById(params.id);

  if (!product) {
    notFound();
  }

  const category = getCategory(product.category_id);
  const relatedProducts = await getRelatedProducts(product.category_id, product.id);
  const hasDiscount = product.discounted_price !== null;
  const displayPrice = product.discounted_price ?? product.price;

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          {/* 브레드크럼 */}
          <nav className="mb-6 flex flex-wrap items-center gap-1 text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-900">
              홈
            </Link>
            <span>/</span>
            {category ? (
              <Link
                href={`/products?category=${category.id}`}
                className="hover:text-gray-900"
              >
                {category.name}
              </Link>
            ) : (
              <span>{product.category_name}</span>
            )}
            <span>/</span>
            <span className="truncate text-gray-900">{product.name}</span>
          </nav>

          {/* 상품 정보 */}
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
            {/* 상품 이미지 */}
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-gray-50">
              <Image
                src={product.images[0]}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
                className="object-cover"
              />
              {hasDiscount && (
                <span className="absolute left-3 top-3 rounded-full bg-red-500 px-2.5 py-1 text-xs font-semibold text-white">
                  {Math.round(
                    ((product.price - (product.discounted_price as number)) /
                      product.price) *
                      100
                  )}
                  %
                </span>
              )}
            </div>

            {/* 상품 상세 */}
            <div className="flex flex-col">
              <p className="text-sm font-medium text-gray-500">
                {product.brand}
              </p>
              <h1 className="mt-1 text-2xl font-bold text-gray-900 sm:text-3xl">
                {product.name}
              </h1>

              <div className="mt-4 flex items-baseline gap-2">
                {hasDiscount && (
                  <span className="text-base text-gray-400 line-through">
                    {product.price.toLocaleString("ko-KR")}원
                  </span>
                )}
                <span className="text-2xl font-bold text-gray-900 sm:text-3xl">
                  {displayPrice.toLocaleString("ko-KR")}원
                </span>
              </div>

              {product.description && (
                <p className="mt-6 whitespace-pre-line text-gray-700">
                  {product.description}
                </p>
              )}

              {product.tags.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {product.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <AddToCartButton
                productId={product.id}
                stock={product.stock_quantity}
                isPurchasable={product.status === "SALE" && product.stock_quantity > 0}
              />
              <a
                href={product.smartstore_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex w-full items-center justify-center rounded-lg bg-green-600 px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-green-700 sm:mt-auto"
              >
                스마트스토어에서 구매하기
              </a>
            </div>
          </div>

          {/* 관련 상품 */}
          {relatedProducts.length > 0 && (
            <div className="mt-16 sm:mt-20">
              <h2 className="mb-6 text-xl font-bold text-gray-900 sm:text-2xl">
                관련 상품
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
                {relatedProducts.map((relatedProduct) => (
                  <ProductCard key={relatedProduct.id} product={relatedProduct} />
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
