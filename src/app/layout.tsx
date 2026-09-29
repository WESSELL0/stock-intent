import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "条件研究室 · 自然语言选股",
  description: "将选股意图转化为可检查、可修改、可追溯的数据条件。",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><AppShell>{children}</AppShell></body></html>;
}
