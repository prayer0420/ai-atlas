import type { Metadata } from "next";
import "./globals.css";
import "./brain.css";
export const metadata: Metadata = {
  title: "AI Atlas · 나만의 AI 지식 지도",
  description:
    "흩어진 AI 정보를 모아, 연결하고, 이해하는 개인 학습 라이브러리.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
