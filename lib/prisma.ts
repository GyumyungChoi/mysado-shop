import { PrismaClient } from "@prisma/client";

// globalThis에 prisma를 얹기 위한 타입 선언
// (TypeScript는 globalThis에 임의 속성을 허용하지 않으므로 단언이 필요)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // 개발 중에는 실행되는 SQL을 눈으로 보는 편이 학습에 좋습니다
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

// 운영(production)에서는 전역에 담지 않습니다.
// 서버가 한 번만 부팅되므로 hot reload 문제가 없기 때문입니다.
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
