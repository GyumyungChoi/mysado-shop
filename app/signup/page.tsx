"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { getAuthErrorMessage } from "@/lib/auth-errors";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");                     // 26.07.11 추가
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState(""); // 26.07.11 추가
  const [showPassword, setShowPassword] = useState(false);    // 26.07.11 추가
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

    // 휴대폰: 하이픈/공백 제거 후 010 + 8자리 숫자 형식 검증 (26.07.11)
    const phoneDigits = phone.replace(/[-\s]/g, "");
    if (!/^010\d{8}$/.test(phoneDigits)) {
      setError("휴대폰 번호를 확인해주세요. (예: 010-1234-5678)");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.");
      return;
    }
    setLoading(true);

    const { error: signUpError } = await signUp.email({
      name,
      email,
      password,
      phoneNumber: phoneDigits, // 하이픈 제거된 숫자만 저장 (01012345678)
    });

    setLoading(false);

    if (signUpError) {      
      setError(getAuthErrorMessage(signUpError.code));
      return;
    }

    // 가입 성공 → 홈으로 이동
    router.push("/");
    router.refresh();
  };

  const inputStyle = {
    padding: 10,
    border: "1px solid #ccc",
    borderRadius: 6,
  } as const;

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
          style={inputStyle}
        />
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="tel"
          placeholder="휴대폰 번호 (010-1234-5678)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={inputStyle}
        />
        {/* 비밀번호 + 👁 토글 */}
        <div style={{ position: "relative" }}>
          <input
            type={showPassword ? "text" : "password"}
            placeholder="비밀번호 (8자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 16,
              padding: 0,
            }}
          >
            {showPassword ? "🙈" : "👁"}
          </button>
        </div>
        <input
          type={showPassword ? "text" : "password"}
          placeholder="비밀번호 확인"
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          style={inputStyle}
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
