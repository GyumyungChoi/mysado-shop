import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { STATUS_LABEL, STATUS_COLOR } from "@/lib/order-status";
import { formatDate, formatDateTime } from "@/lib/format-date";

// 주문 요약은 항상 최신이어야 함 (취소 직후 등) — 캐싱 차단
export const dynamic = "force-dynamic";

// 허브 카드 목록 — 기능 추가 시 여기에 1줄 추가 (24차 확정 구조)
// 예정: 배송지 관리(25차) / 나의 리뷰(Phase 8) / 수신 설정(Phase 10)
const CARDS = [
  { href: "/mypage/orders", title: "주문 내역", desc: "주문·배송 조회 및 취소" },
  { href: "/mypage/profile", title: "내 정보 수정", desc: "전화번호 · 마케팅 수신 설정" },
  { href: "/contact", title: "문의하기", desc: "1:1 문의" },
];

export default async function MyPage() {
  // 2차 검증: DB에서 실제 세션 유효성 확인 (middleware는 쿠키 존재만 봄)
  const session = await auth.api.getSession({
    headers: headers(),
  });

  if (!session) {
    redirect("/login");
  }

  // 최근 주문 1건 — @@index([userId, createdAt]) 활용
  const recentOrder = await prisma.order.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold">마이페이지</h1>

      {/* 프로필 헤더 */}
      <p className="mb-6 text-sm text-gray-500">
        안녕하세요, <span className="font-medium text-gray-900">{session.user.name}</span>님
        {" · "}{session.user.email}
        {" · "}가입 {formatDate(session.user.createdAt)}
      </p>

      {/* 최근 주문 요약 */}
      <section className="mb-4 rounded-lg border border-gray-200 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">최근 주문</h2>
          {recentOrder && (
            <Link href="/mypage/orders" className="shrink-0 whitespace-nowrap text-xs text-blue-600 hover:underline">
              전체 보기 &rarr;
            </Link>
          )}
        </div>
        {recentOrder ? (
          <div className="text-sm">
            <div className="mb-1 flex items-center gap-2">
              <span className={"rounded-full px-2.5 py-0.5 text-xs font-medium " + STATUS_COLOR[recentOrder.status]}>
                {STATUS_LABEL[recentOrder.status]}
              </span>
              <span className="text-xs text-gray-400">
                {recentOrder.orderNumber ?? "주문번호 없음"}
              </span>
            </div>
            <p className="text-gray-700">
              {recentOrder.items[0]?.productName ?? "주문 상품"}
              {recentOrder.items.length > 1 && ` 외 ${recentOrder.items.length - 1}건`}
              {" · "}{recentOrder.totalAmount.toLocaleString("ko-KR")}원
              {" · "}{formatDateTime(recentOrder.createdAt)}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-400">주문 내역이 없습니다.</p>
        )}
      </section>

      {/* 카드 그리드 (모바일 1열 / sm 이상 2열) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
          >
            <p className="text-sm font-semibold">{card.title}</p>
            <p className="mt-1 text-xs text-gray-500">{card.desc}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
