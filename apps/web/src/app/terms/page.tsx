import type { Metadata } from "next";
import { renderMarkdownFile } from "@/lib/markdown";

export const metadata: Metadata = {
  title: "利用規約 — FF14 固定支援 Bot",
};

export default function TermsPage() {
  const html = renderMarkdownFile("docs/legal/terms-of-service.md");
  return <div className="prose-md mx-auto" dangerouslySetInnerHTML={{ __html: html }} />;
}
