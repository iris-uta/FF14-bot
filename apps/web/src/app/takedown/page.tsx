import type { Metadata } from "next";
import { renderMarkdownFile } from "@/lib/markdown";

export const metadata: Metadata = {
  title: "削除要請窓口 — FF14 固定支援 Bot",
  description: "著作権・知的財産権・プライバシーに関する削除要請手順。24時間以内対応。",
};

export default function TakedownPage() {
  const html = renderMarkdownFile("docs/legal/takedown.md");
  return <div className="prose-md mx-auto" dangerouslySetInnerHTML={{ __html: html }} />;
}
