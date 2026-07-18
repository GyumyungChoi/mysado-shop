import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";

export const auth = betterAuth({
  // 1) 어떤 DB를 어떤 방식으로 쓸지
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // 2) 이메일 + 비밀번호 로그인 활성화
  emailAndPassword: {
    enabled: true,
    // 지금은 이메일 인증 메일 없이 바로 가입 완료 처리.
    // (SMTP 연동 후 true로 바꾸면 이메일 검증 단계가 생깁니다)
    requireEmailVerification: false,
  },

  // 3) 세션: DB 세션 방식 (Better Auth 기본값)
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7일
    updateAge: 60 * 60 * 24,     // 하루 지나면 만료시간 갱신
  },
  
  // 3.5) 추가 사용자 필드 — 가입 시 휴대폰 번호 수집 (26.07.11)
  user: {
    additionalFields: {
      phoneNumber: {
        type: "string",
        required: false, // DB nullable — 필수 강제는 가입 폼에서
        input: true,     // 클라이언트 signUp 호출에서 값 전달 허용
      },
      // 권한 필드 — Phase 5 추가 (26.07.18)
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,    // ★ 클라이언트 입력 차단 — psql로만 변경 (권한 상승 방지)
      },
    },
  },

  // 4) 플러그인 — nextCookies()는 항상 마지막
  plugins: [nextCookies()],
});
