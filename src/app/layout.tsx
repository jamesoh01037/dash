import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Junior - 나만의 퍼스널 AI 에이전트",
  description: "Google Workspace 연동형 개인 전담 AI 비서 Junior",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#F8FAFD",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="google-theme">
      <body className="antialiased bg-[#F8FAFD] text-[#1F1F1F] selection:bg-[#D3E3FD] selection:text-[#041E49]">
        {children}
      </body>
    </html>
  );
}
