import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AddressList from "./AddressList";

// 등록/수정/삭제 직후 refresh가 낡은 목록을 받으면 안 됨 — 캐싱 차단
export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  // 2차 검증: DB에서 실제 세션 유효성 확인 (middleware는 쿠키 존재만 봄)
  const session = await auth.api.getSession({
    headers: headers(),
  });

  if (!session) {
    redirect("/login");
  }

  // 기본 배송지 우선, 그다음 최신순 — API GET과 동일한 정렬
  const addresses = await prisma.address.findMany({
    where: { userId: session.user.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });

  const initialAddresses = addresses.map((a) => ({
    id: a.id,
    label: a.label,
    recipientName: a.recipientName,
    recipientPhone: a.recipientPhone,
    zipCode: a.zipCode,
    address1: a.address1,
    address2: a.address2,
    deliveryMemo: a.deliveryMemo,
    isDefault: a.isDefault,
  }));

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-2 text-2xl font-bold">배송지 관리</h1>
      <p className="mb-8 text-sm text-gray-500">
        자주 쓰는 배송지를 저장해두면 주문할 때 자동으로 입력됩니다.
      </p>

      <AddressList initialAddresses={initialAddresses} />

      <div className="mt-10 border-t border-gray-200 pt-6">
        <Link href="/mypage" className="text-sm text-gray-500 hover:text-gray-900">
          &larr; 마이페이지로
        </Link>
      </div>
    </main>
  );
}
