import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

/**
 * 마이페이지 공유 레이아웃 (Phase 7, 27차)
 *
 * 하위 4화면(허브·주문·배송지·프로필)에 사이트 공통 Header/Footer를 일괄 적용한다.
 * 각 페이지가 자체 <main> 래퍼(max-w·여백)를 갖고 있으므로 여기는 골격만 담당.
 * flex-1로 본문을 늘려 짧은 페이지에서도 Footer가 바닥에 붙는다.
 */
export default function MypageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  );
}
