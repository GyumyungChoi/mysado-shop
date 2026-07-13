import type { Metadata } from "next";
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
  title: "마이사도 | 삼성 휴대폰 액세서리",
  description: "삼성 갤럭시 케이스, 충전기, 워치 액세서리를 만나보는 마이사도 쇼핑몰",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <CartCountProvider>{children}</CartCountProvider>
      </body>
    </html>
  );
}
