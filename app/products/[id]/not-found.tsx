import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

/** 상품을 찾을 수 없을 때 표시되는 404 페이지 */
export default function ProductNotFound() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          상품을 찾을 수 없습니다
        </h1>
        <p className="mt-3 text-gray-500">
          요청하신 상품이 삭제되었거나 존재하지 않습니다.
        </p>
        <Link
          href="/products"
          className="mt-8 rounded-lg bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
        >
          전체 상품 보기
        </Link>
      </main>

      <Footer />
    </div>
  );
}
