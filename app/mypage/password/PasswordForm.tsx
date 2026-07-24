"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/**
 * 비밀번호 변경 폼 (28차)
 * - authClient.changePassword가 Better Auth 엔드포인트를 직접 호출 — 자체 API 라우트 불필요
 * - revokeOtherSessions: true — 다른 기기 세션 전부 무효화.
 *   구현 실측: 전체 삭제 후 현재 브라우저에 새 세션을 재발급하므로 이 기기는 로그인 유지
 * - 8자 규칙은 가입 폼(app/signup)과 동일 문구 — 서버 기본 minPasswordLength(8)와 일치 확인됨
 */
export default function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false); // 3필드 공통 토글
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    // 클라이언트 선검증 — 최종 판정은 서버 (가입 폼과 동일 문구)
    if (newPassword.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (newPassword !== newPasswordConfirm) {
      setError("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("새 비밀번호가 현재 비밀번호와 같습니다.");
      return;
    }

    setLoading(true);
    try {
      const { error: apiError } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });

      if (apiError) {
        // INVALID_PASSWORD = 현재 비밀번호 불일치 (구현 실측: 400)
        if (apiError.code === "INVALID_PASSWORD") {
          setError("현재 비밀번호가 올바르지 않습니다.");
        } else {
          setError(apiError.message ?? "비밀번호 변경에 실패했습니다.");
        }
        return;
      }

      setSuccess("비밀번호가 변경되었습니다. 다른 기기에서는 로그아웃됩니다.");
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
    } catch {
      setError("요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  };

  const inputType = showPassword ? "text" : "password";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="current-password" className="mb-1 block text-sm font-medium">
          현재 비밀번호
        </label>
        <input
          id="current-password"
          type={inputType}
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="new-password" className="mb-1 block text-sm font-medium">
          새 비밀번호
        </label>
        <input
          id="new-password"
          type={inputType}
          autoComplete="new-password"
          placeholder="8자 이상"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="new-password-confirm" className="mb-1 block text-sm font-medium">
          새 비밀번호 확인
        </label>
        <input
          id="new-password-confirm"
          type={inputType}
          autoComplete="new-password"
          value={newPasswordConfirm}
          onChange={(e) => setNewPasswordConfirm(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      {/* 표시 토글 — 가입 폼 관례(👁/🙈)를 3필드 일괄로 */}
      <button
        type="button"
        onClick={() => setShowPassword((v) => !v)}
        className="text-sm text-gray-500 hover:text-gray-700"
        aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
      >
        {showPassword ? "🙈 비밀번호 숨기기" : "👁 비밀번호 보기"}
      </button>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-gray-900 py-3 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {loading ? "변경 중..." : "비밀번호 변경"}
      </button>
    </form>
  );
}
