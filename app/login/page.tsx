"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { getAuthErrorMessage } from "@/lib/auth-errors";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");

    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);

    const { error: signInError } = await signIn.email({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      // setError(signInError.message ?? "로그인에 실패했습니다.");
      // 2026.07.09 목 17:18 수정
      setError(getAuthErrorMessage(signInError.code));
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <main style={{ maxWidth: 400, margin: "80px auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>
        로그인
      </h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
        />

        {error && <p style={{ color: "crimson", fontSize: 14 }}>{error}</p>}

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
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </div>
    </main>
  );
}