import { headers } from "next/headers";
import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import ProductCard from "@/components/products/ProductCard";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { searchProducts } from "@/lib/products";

/** 검색 결과는 색인 대상 아님 (noindex — SEO 요건) */
export const metadata: Metadata = {
  title: "상품 검색 | 마이사도",
  robots: { index: false, follow: false },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const keyword = (searchParams.q ?? "").trim();
  const products = keyword ? await searchProducts(keyword) : [];

  // 검색어 로그 기록 — 실패해도 검색 결과 표시에는 영향 없어야 함
  if (keyword) {
    try {
      const session = await auth.api.getSession({ headers: headers() });
      await prisma.searchLog.create({
        data: {
          keyword,
          resultCount: products.length,
          userId: session?.user.id ?? null,
        },
      });
    } catch (e) {
      console.error("SearchLog 기록 실패:", e);
    }
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">상품 검색</h1>

        {/* 상설 검색폼 — 순수 GET 폼 (JS 불필요, useSearchParams 회피) */}
        <form action="/search" method="get" className="mb-6 flex max-w-md gap-2">
          <input
            type="search"
            name="q"
            defaultValue={keyword}
            placeholder="상품명 검색"
            className="h-10 flex-1 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-gray-400"
          />
          <button
            type="submit"
            className="h-10 rounded-md bg-gray-900 px-4 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            검색
          </button>
        </form>

        {keyword ? (
          <p className="mb-8 text-sm text-gray-500">
            &lsquo;{keyword}&rsquo; 검색 결과 {products.length}건
          </p>
        ) : (
          <p className="mb-8 text-sm text-gray-500">
            상단 돋보기 아이콘으로 검색어를 입력해주세요.
          </p>
        )}

        {keyword && products.length === 0 && (
          <div className="rounded-lg border border-gray-100 bg-gray-50 px-6 py-16 text-center">
            <p className="text-gray-600">
              &lsquo;{keyword}&rsquo;에 해당하는 상품이 없습니다.
            </p>
            <p className="mt-1 text-sm text-gray-400">
              다른 검색어로 시도해보세요.
            </p>
          </div>
        )}

        {products.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
