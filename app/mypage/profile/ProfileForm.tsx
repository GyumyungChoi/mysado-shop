"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ProfileFormProps {
  initialName: string;
  initialPhoneNumber: string | null;
  initialMarketingAgreed: boolean;
}

// 표시용 하이픈 포맷 (저장은 숫자만 — 서버가 재검증)
function formatPhone(digits: string): string {
  if (digits.length !== 11) return digits;
  return digits.slice(0, 3) + "-" + digits.slice(3, 7) + "-" + digits.slice(7);
}

export default function ProfileForm({ initialName, initialPhoneNumber, initialMarketingAgreed }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhoneNumber ? formatPhone(initialPhoneNumber) : "");
  const [marketingAgreed, setMarketingAgreed] = useState(initialMarketingAgreed);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleSubmit() {
    // 클라이언트 1차 검증 (가입 폼과 동일 규칙 — 최종 검증은 서버)
    const trimmedName = name.trim();
    if (trimmedName.length < 1) {
      setIsError(true);
      setMessage("이름을 입력해주세요.");
      return;
    }
    const phoneDigits = phone.replace(/[-\s]/g, "");
    if (!/^010\d{8}$/.test(phoneDigits)) {
      setIsError(true);
      setMessage("휴대폰 번호 형식이 올바르지 않습니다. (예: 010-1234-5678)");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/mypage/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, phoneNumber: phoneDigits, marketingAgreed }),
      });
      const data = await res.json().catch(() => ({ message: "응답을 처리하지 못했습니다." }));
      if (!res.ok) {
        setIsError(true);
        setMessage(data.message ?? "저장에 실패했습니다.");
        return;
      }
      setIsError(false);
      setMessage(data.message ?? "저장되었습니다.");
      router.refresh(); // 서버 컴포넌트 재조회 — 최신값 반영
    } catch {
      setIsError(true);
      setMessage("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 text-sm">
      {/* 이름 */}
      <label className="mb-4 block">
        <span className="mb-1 block font-medium">이름</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
        />
      </label>

      {/* 휴대폰 번호 — 계정 연락처 (배송 연락처와 구분) */}
      <label className="mb-1 block">
        <span className="mb-1 block font-medium">휴대폰 번호</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="010-1234-5678"
          className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
        />
      </label>
      <p className="mb-4 text-xs text-gray-400">
        주문·배송 안내를 받는 계정 연락처입니다. 받는 분 연락처는 주문할 때 따로 입력합니다.
      </p>

      {/* 마케팅 수신 동의 */}
      <label className="mb-4 flex items-start gap-2">
        <input
          type="checkbox"
          checked={marketingAgreed}
          onChange={(e) => setMarketingAgreed(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="block font-medium">마케팅 정보 수신 동의 (선택)</span>
          <span className="block text-xs text-gray-400">할인·이벤트 소식을 이메일로 받습니다. 언제든지 변경할 수 있습니다.</span>
        </span>
      </label>

      {/* 결과 메시지 */}
      {message && (
        <p className={"mb-3 text-xs " + (isError ? "text-red-600" : "text-green-700")}>{message}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="w-full rounded-md bg-gray-900 py-2.5 font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {saving ? "저장 중..." : "저장"}
      </button>
    </div>
  );
}
