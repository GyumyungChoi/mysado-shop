import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import "./globals.css";
import { CartCountProvider } from "@/components/CartCountProvider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://mysado.net"),
  title: {
    default: "마이사도(mysado) | 삼성 휴대폰 액세서리 쇼핑몰",
    template: "%s | 마이사도(mysado)",
  },
  description:
    "마이사도(mysado)는 삼성 갤럭시 케이스, 충전기, 워치 액세서리 등 휴대폰 액세서리를 판매하는 온라인 쇼핑몰입니다. 공식 사이트: mysado.net",
  alternates: {
    canonical: "./",
  },
  openGraph: {
    type: "website",
    url: "https://mysado.net",
    siteName: "마이사도(mysado)",
    title: "마이사도(mysado) | 삼성 휴대폰 액세서리 쇼핑몰",
    description:
      "삼성 갤럭시 케이스, 충전기, 워치 액세서리 등 휴대폰 액세서리 온라인 쇼핑몰",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "마이사도(mysado) - 삼성 휴대폰 액세서리 쇼핑몰",
      },
    ],
    locale: "ko_KR",
  },
  verification: {
    other: {
      "naver-site-verification": "7641068d83c968daf7bff70dd421c2b9dad3d9d4",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <CartCountProvider>{children}</CartCountProvider>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-0QNFXP7MWJ"
          strategy="afterInteractive" // 페이지 하이드레이션 후 로드하여 초기 렌더 성능에 영향을 안 주는 방식. Next.js 공식 권장 패턴
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-0QNFXP7MWJ');
          `}
        </Script>
      </body>
    </html>
  );
}