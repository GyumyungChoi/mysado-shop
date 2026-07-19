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
      // 동의 관련 필드 — Phase 5 추가 (26.07.19)
      marketingAgreed: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: true,     // 가입 폼 체크박스 값 수신 (선택 동의)
      },
      agreedAt: {
        type: "date",
        required: false,
        input: false,    // ★ 시각은 서버가 기록 — 클라이언트 조작 차단 (role과 동일 원리)
      },
      marketingAgreedAt: {
        type: "date",
        required: false,
        input: false,    // ★ 시각은 서버가 기록 — 클라이언트 조작 차단
      },
    },
  },

  // 3.7) DB 훅 — 가입 시 동의 시각을 서버 시계로 기록 (26.07.19)
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const now = new Date();
          return {
            data: {
              ...user,
              agreedAt: now, // 필수 동의는 가입 성립 = 동의 완료 (폼에서 미체크 시 가입 불가)
              // 선택 동의: 체크한 경우에만 시각 기록
              ...(user.marketingAgreed === true ? { marketingAgreedAt: now } : {}),
            },
          };
        },
      },
    },
  },

  // 4) 플러그인 — nextCookies()는 항상 마지막
  plugins: [nextCookies()],
});
