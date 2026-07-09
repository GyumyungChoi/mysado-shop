"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { getAuthErrorMessage } from "@/lib/auth-errors";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");

    // 간단한 클라이언트 측 검증
    if (!name.trim()) {
      setError("이름을 입력해주세요.");
      return;
    }
    if (!email.trim()) {
      setError("이메일을 입력해주세요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    setLoading(true);

    const { error: signUpError } = await signUp.email({
      name,
      email,
      password,
    });

    setLoading(false);

    if (signUpError) {
      // 지금은 원문 그대로 표시, 한국어 매핑은 다음 단계에서
      // setError(signUpError.message ?? "가입에 실패했습니다.");
      // 2026.07.09 목 17:18 수정
      // console.log("signup error:", signUpError.code, signUpError.message);
      setError(getAuthErrorMessage(signUpError.code));
      return;
    }

    // 가입 성공 → 홈으로 이동
    router.push("/");
    router.refresh();
  };

  return (
    <main style={{ maxWidth: 400, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
        회원가입
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="text"
          placeholder="이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <input
          type="password"
          placeholder="비밀번호 (8자 이상)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
        />

        {error && (
          <p style={{ color: "crimson", fontSize: 14 }}>{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            padding: 12,
            borderRadius: 6,
            border: "none",
            background: loading ? "#999" : "#111",
            color: "#fff",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "가입 중..." : "가입하기"}
        </button>
      </div>
    </main>
  );
}