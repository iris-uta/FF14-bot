import type { Metadata } from "next";
import { renderMarkdownFile } from "@/lib/markdown";

export const metadata: Metadata = {
  title: "プライバシーポリシー — 固定支援Bot",
};

export default function PrivacyPage() {
  const html = renderMarkdownFile("docs/legal/privacy-policy.md");
  return <div className="prose-md mx-auto" dangerouslySetInnerHTML={{ __html: html }} />;
}
