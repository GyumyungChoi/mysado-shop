import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const disallowedPaths = [
    "/api/",
    "/mypage",
    "/cart",
    "/checkout",
    "/login",
    "/signup",
    "/search",
  ];

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: disallowedPaths,
      },
      // 네이버 검색 로봇 — 서치어드바이저 수집의 주체
      {
        userAgent: "Yeti",
        allow: "/",
        disallow: disallowedPaths,
      },
      // ChatGPT "검색" 노출용 (학습용 GPTBot과 별개)
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
        disallow: disallowedPaths,
      },
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: disallowedPaths,
      },
      {
        userAgent: "ClaudeBot",
        allow: "/",
        disallow: disallowedPaths,
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: disallowedPaths,
      },
      {
        userAgent: "Google-Extended",
        allow: "/",
        disallow: disallowedPaths,
      },
    ],
    sitemap: "https://mysado.net/sitemap.xml",
    host: "https://mysado.net",
  };
}
