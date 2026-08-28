import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health — 외부 감시용 헬스 체크 (인증·IP 제한 없음).
 *
 * Nginx `/api/v1` 제한 블록과 접두사가 불일치해 `location /` 로 떨어지고(63차 §6-3),
 * 전역 미들웨어 matcher에도 `/api` 가 없어 무인증으로 도달한다.
 * DB 왕복(SELECT 1)이 성공하면 200, 실패하면 503 — 앱만 살고 DB가 죽은 상태를
 * 감시기가 "정상"으로 오인하지 않도록 실제 프로브를 넣는다.
 *
 * 사내 유일 캐시층인 Next.js ISR 이 죽은 DB 응답을 200 으로 덮지 않도록
 * 동적 처리를 강제한다(Nginx proxy_cache 없음 — 63차 §6-2).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", db: "up", checkedAt },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`/api/health DB 프로브 실패: ${reason}`);
    return NextResponse.json(
      { status: "error", db: "down", checkedAt },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
