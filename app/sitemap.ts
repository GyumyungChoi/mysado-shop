import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

const BASE_URL = "https://mysado.net";

// 사이트맵은 1시간마다 재생성 (상품 추가/수정 반영)
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // isVisible=true 인 상품만.
  // getProductById()가 !isVisible이면 null(→404)을 반환하므로, 이 기준을 벗어나면
  // 사이트맵에 404 URL이 실리게 됨. 현재 DB: SALE/true=147, OUTOFSTOCK/false=51, SUSPENSION/false=1
  const products = await prisma.product.findMany({
    where: {
      isVisible: true,
    },
    select: {
      id: true,
      updatedAt: true,
    },
  });

  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/products`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];

  // 상품 URL 형식: /products/prod-001 (slug 아님 — Product.id가 곧 URL)
  const productPages: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${BASE_URL}/products/${product.id}`,
    lastModified: product.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticPages, ...productPages];
}
