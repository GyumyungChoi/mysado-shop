"use client";

import { useState } from "react";

export default function WithdrawForm() {
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetch("/api/mypage/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({ message: "응답을 처리하지 못했습니다." }));
      if (!res.ok) {
        // 서버가 내려준 message 그대로 표시 (400 비밀번호 오류, 403 admin 등)
        setError(data.message ?? "탈퇴 처리에 실패했습니다.");
        setLoading(false);
        return;
      }
      // 성공 — 세션이 이미 끊겼으므로 잠시 메시지를 보여준 뒤 홈으로 이동
      setSuccess(data.message ?? "탈퇴가 완료되었습니다.");
      // hard navigation — 세션 쿠키가 이미 제거된 상태라 로그인 UI 캐시가 남지 않도록 전체 리로드
      setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p className="font-medium">탈퇴 전 꼭 확인해주세요</p>
        <p className="mt-1">
          탈퇴하면 계정 정보가 파기되며 되돌릴 수 없습니다. 주문 내역이 있는 경우 관련 법령에
          따라 거래기록은 분리 보존됩니다.
        </p>
      </div>

      <div>
        <label htmlFor="withdraw-password" className="mb-1 block text-sm font-medium">
          비밀번호
        </label>
        <input
          id="withdraw-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5"
        />
        <span>정말로 탈퇴하시겠습니까?</span>
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}

      <button
        type="submit"
        disabled={!confirmed || !password || loading}
        className="w-full rounded-lg bg-red-600 py-3 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        {loading ? "처리 중..." : "탈퇴하기"}
      </button>
    </form>
  );
}
