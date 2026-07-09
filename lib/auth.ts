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

  // 4) 플러그인 — nextCookies()는 항상 마지막
  plugins: [nextCookies()],
});
