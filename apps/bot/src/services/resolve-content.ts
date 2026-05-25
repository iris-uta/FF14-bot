import type { ChatInputCommandInteraction, AutocompleteInteraction } from "discord.js";
import type { Content } from "@ff14kotei/schema";
import { getContentById } from "../lib/contents";
import { findStaticForChannel } from "./static-manager";

export interface ResolvedContent {
  content: Content;
  /** True if the content was auto-detected from the current static channel. */
  autoDetected: boolean;
  /** The static id, if auto-detected. */
  staticId?: string;
}

/**
 * Resolve which content the user is targeting:
 * 1. If `content` option is explicitly provided → use that
 * 2. Else, if current channel belongs to a static → use the static's contentId
 * 3. Else → null (caller should error out)
 *
 * Works for both ChatInputCommandInteraction (execute) and AutocompleteInteraction.
 */
export function resolveContent(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction
): ResolvedContent | null {
  // Explicit content option takes priority
  const explicitId = interaction.options.getString("content");
  if (explicitId) {
    const content = getContentById(explicitId);
    if (!content) return null;
    return { content, autoDetected: false };
  }

  // Auto-detect from current channel's static
  if (!interaction.guildId || !interaction.channel) return null;
  const channelId = interaction.channel.id;
  // `parentId` exists on guild channels (text, voice, thread, etc.)
  const parentId =
    "parentId" in interaction.channel ? interaction.channel.parentId : null;

  const owningStatic = findStaticForChannel(interaction.guildId, channelId, parentId);
  if (!owningStatic) return null;

  const content = getContentById(owningStatic.contentId);
  if (!content) return null;

  return { content, autoDetected: true, staticId: owningStatic.id };
}

export interface ResolveError {
  ok: false;
  message: string;
}

export interface ResolveOk {
  ok: true;
  content: Content;
  autoDetected: boolean;
  staticId?: string;
}

/**
 * Try-style resolver returning either content or a user-facing error message.
 * Includes type-match verification when both `type` and `content` are explicitly provided.
 */
export function resolveContentOrError(
  interaction: ChatInputCommandInteraction
): ResolveOk | ResolveError {
  const resolved = resolveContent(interaction);
  if (!resolved) {
    const explicitId = interaction.options.getString("content");
    if (explicitId) {
      return {
        ok: false,
        message: `コンテンツが見つかりません: \`${explicitId}\``,
      };
    }
    return {
      ok: false,
      message:
        "content が指定されていません。type と content を指定するか、固定 channel (`/static-init` で作成したカテゴリ配下) で実行してください。",
    };
  }

  // Verify type match if explicit content + type given
  const typeFilter = interaction.options.getString("type");
  if (!resolved.autoDetected && typeFilter && resolved.content.type !== typeFilter) {
    return {
      ok: false,
      message: `type と content が一致しません。\n選択した type: \`${typeFilter}\` / content (${resolved.content.id}) の type: \`${resolved.content.type}\``,
    };
  }

  return {
    ok: true,
    content: resolved.content,
    autoDetected: resolved.autoDetected,
    staticId: resolved.staticId,
  };
}
