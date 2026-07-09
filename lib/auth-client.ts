import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // 같은 도메인에서 서비스하므로 baseURL 생략 가능하지만,
  // dev(3001)/prod(mysado.net) 환경 차이를 고려해 명시적으로 둔다.
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
});

// 컴포넌트에서 자주 쓸 것들을 바로 꺼내 쓸 수 있게 내보내기
export const { signUp, signIn, signOut, useSession } = authClient;
