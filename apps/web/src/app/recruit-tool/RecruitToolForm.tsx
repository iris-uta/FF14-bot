"use client";

import { useMemo, useState } from "react";
import { extractPlaceholders, renderTemplate } from "@/lib/recruit-template";

export interface ContentSummary {
  id: string;
  displayName: string;
  shortName: string;
  type: string;
  templates: { source?: string; body: string; variables: string[] }[];
}

const VARIABLE_LABELS: Record<string, { label: string; placeholder: string }> = {
  date:            { label: "日時",         placeholder: "6/1 (土) 21:00 JST" },
  progress:        { label: "現在の進行度",  placeholder: "P2終わり" },
  recruitingRoles: { label: "募集ロール",   placeholder: "H1 (SCH) / D2" },
  datacenter:      { label: "DC",          placeholder: "Mana" },
  language:        { label: "言語",        placeholder: "JP" },
  goal:            { label: "目標",        placeholder: "クリア" },
  chouseisanUrl:   { label: "調整さんURL",  placeholder: "https://chouseisan.com/s?h=..." },
};

export function RecruitToolForm({ contents }: { contents: ContentSummary[] }) {
  const [contentId, setContentId] = useState(contents[0]?.id ?? "");
  const [templateIdx, setTemplateIdx] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const content = contents.find((c) => c.id === contentId) ?? contents[0];
  const template = content?.templates[templateIdx] ?? content?.templates[0];

  // All placeholders used in this template (union of declared + auto-extracted)
  const placeholders = useMemo(() => {
    if (!template) return [];
    const fromBody = extractPlaceholders(template.body);
    const declared = template.variables ?? [];
    const seen = new Set<string>();
    return [...declared, ...fromBody].filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
  }, [template]);

  const rendered = useMemo(() => {
    if (!template) return { text: "", unfilledVariables: [] };
    return renderTemplate(template.body, values);
  }, [template, values]);

  function handleSetVar(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  function handleSetContent(id: string) {
    setContentId(id);
    setTemplateIdx(0);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(rendered.text);
      setCopyMessage("コピーしました");
      setTimeout(() => setCopyMessage(null), 2000);
    } catch {
      setCopyMessage("コピー失敗 (ブラウザの権限を確認)");
      setTimeout(() => setCopyMessage(null), 3000);
    }
  }

  if (!content || !template) {
    return <p className="text-sm">テンプレがロードできません。</p>;
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* LEFT: inputs */}
      <div className="space-y-4">
        <FieldGroup label="コンテンツ">
          <select
            value={contentId}
            onChange={(e) => handleSetContent(e.target.value)}
            className="w-full rounded-md border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
          >
            {contents.map((c) => (
              <option key={c.id} value={c.id}>
                [{c.shortName}] {c.displayName} ({c.templates.length} テンプレ)
              </option>
            ))}
          </select>
        </FieldGroup>

        {content.templates.length > 1 && (
          <FieldGroup label={`テンプレ (${content.templates.length} 件)`}>
            <select
              value={templateIdx}
              onChange={(e) => setTemplateIdx(Number(e.target.value))}
              className="w-full rounded-md border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
            >
              {content.templates.map((t, i) => (
                <option key={i} value={i}>
                  #{i} {t.source ? `— ${t.source}` : ""}
                </option>
              ))}
            </select>
          </FieldGroup>
        )}

        {placeholders.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            このテンプレに変数はありません。右側にそのまま出力されます。
          </p>
        ) : (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-black/70 dark:text-white/70">
              変数 ({placeholders.length} 件)
            </h3>
            {placeholders.map((name) => {
              const meta = VARIABLE_LABELS[name];
              const isUnfilled = rendered.unfilledVariables.includes(name);
              return (
                <FieldGroup
                  key={name}
                  label={
                    <span className="flex items-center gap-2">
                      {meta?.label ?? name}
                      <code className="text-xs text-black/40 dark:text-white/40">
                        {`{{${name}}}`}
                      </code>
                      {isUnfilled && (
                        <span className="text-xs text-amber-600 dark:text-amber-400">未入力</span>
                      )}
                    </span>
                  }
                >
                  <input
                    type="text"
                    value={values[name] ?? ""}
                    onChange={(e) => handleSetVar(name, e.target.value)}
                    placeholder={meta?.placeholder ?? ""}
                    className="w-full rounded-md border border-black/15 dark:border-white/15 bg-transparent px-3 py-2 text-sm"
                  />
                </FieldGroup>
              );
            })}
          </div>
        )}
      </div>

      {/* RIGHT: preview + copy */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-black/70 dark:text-white/70">プレビュー</h3>
          <button
            type="button"
            onClick={handleCopy}
            className="text-xs rounded bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 font-medium transition-colors"
          >
            📋 コピー
          </button>
        </div>
        <pre className="rounded-md border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 p-4 text-sm whitespace-pre-wrap break-words font-mono min-h-[200px] overflow-x-auto">
          {rendered.text || "(空)"}
        </pre>
        {copyMessage && (
          <p className="text-xs text-green-600 dark:text-green-400">{copyMessage}</p>
        )}
        {rendered.unfilledVariables.length > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {rendered.unfilledVariables.length} 件の変数が未入力です: {" "}
            {rendered.unfilledVariables.join(", ")}
          </p>
        )}
        <p className="text-xs text-black/50 dark:text-white/50">
          📊 文字数: {rendered.text.length} (Twitter は 280 字以内推奨)
        </p>
      </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-black/70 dark:text-white/70">
        {label}
      </span>
      {children}
    </label>
  );
}
