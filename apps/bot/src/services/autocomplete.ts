import type { AutocompleteInteraction } from "discord.js";
import { getAllContents, getContentById } from "../lib/contents";

/**
 * Shared autocomplete for content-then-phase command patterns
 * (used by /post-phase, /macro, /tips, /schedule).
 *
 * Call from autocomplete handler:
 *   await respondContentOrPhase(interaction);
 *
 * It auto-detects whether the focused option is `content` or `phase`.
 * Phase options are filtered by the value selected in `content`, so
 * the dropdown reflects only valid phases for that content.
 */
export async function respondContentOrPhase(
  interaction: AutocompleteInteraction
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const lower = focused.value.toLowerCase();

  if (focused.name === "content") {
    const matches = getAllContents()
      .filter(
        (c) =>
          c.id.toLowerCase().includes(lower) ||
          c.displayName.toLowerCase().includes(lower) ||
          c.shortName.toLowerCase().includes(lower)
      )
      .slice(0, 25)
      .map((c) => ({ name: `${c.displayName} (${c.shortName})`, value: c.id }));
    await interaction.respond(matches);
    return;
  }

  if (focused.name === "phase") {
    const contentId = interaction.options.getString("content");
    const content = contentId ? getContentById(contentId) : null;
    if (!content) {
      await interaction.respond([]);
      return;
    }
    await interaction.respond(
      content.phases
        .filter(
          (p) => p.id.toLowerCase().includes(lower) || p.name.toLowerCase().includes(lower)
        )
        .slice(0, 25)
        .map((p) => ({ name: `${p.id} — ${p.name}`, value: p.id }))
    );
    return;
  }

  await interaction.respond([]);
}
