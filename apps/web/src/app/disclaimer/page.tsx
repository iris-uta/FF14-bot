import type { Metadata } from "next";
import { renderMarkdownFile } from "@/lib/markdown";

export const metadata: Metadata = {
  title: "免責事項 — FF14 固定支援 Bot",
  description: "FF14 固定支援 Bot の免責事項。Square Enix 非公式宣言、情報の正確性等。",
};

export default function DisclaimerPage() {
  const html = renderMarkdownFile("docs/legal/disclaimer.md");
  return <div className="prose-md mx-auto" dangerouslySetInnerHTML={{ __html: html }} />;
}
