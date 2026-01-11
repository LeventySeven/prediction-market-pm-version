import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ClientWalletConnectProvider from "@/components/ClientWalletConnectProvider";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Yalla Market",
  description: "Prediction market demo for Telegram mini app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} bg-[#0a0a0a] text-white`}>
        {/* Telegram Mini App SDK: provides window.Telegram.WebApp + initData parsing */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <ClientWalletConnectProvider>
          {children}
        </ClientWalletConnectProvider>
      </body>
    </html>
  );
}
