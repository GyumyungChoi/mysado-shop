import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Better Auth의 핸들러를 Next.js App Router의
// GET/POST 핸들러 형식으로 변환해서 내보낸다.
export const { GET, POST } = toNextJsHandler(auth.handler);
