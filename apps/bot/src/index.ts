import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type InteractionReplyOptions,
} from "discord.js";
import { commands, getCommand } from "./commands";
import { getAllContents } from "./lib/contents";
import { getDb } from "./lib/db";
import { startAlertWorker, stopAlertWorker } from "./services/alert-worker";
import { startVoteCloserWorker, stopVoteCloserWorker } from "./services/vote-closer";
import { startVoteReminderWorker, stopVoteReminderWorker } from "./services/vote-reminder";
import { startRecurringScheduler, stopRecurringScheduler } from "./services/recurring-scheduler";
import { handleVoteButton } from "./services/vote-interaction";
import { handleVoteModalSubmit, MODAL_PREFIX as VOTE_MODAL_PREFIX } from "./services/vote-modal-submit";
import { handleChouseisanPick, SELECT_PREFIX as CHOUSEISAN_SELECT_PREFIX } from "./services/chouseisan-interaction";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is required (see .env.example)");
  process.exit(1);
}

const contents = getAllContents();
console.log(`Loaded ${contents.length} content(s): ${contents.map((c) => c.id).join(", ")}`);

const commandNames = Object.keys(commands).sort();
console.log(`Registered ${commandNames.length} command(s): ${commandNames.join(", ")}`);

getDb();
console.log("DB initialized (migrations applied)");

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
  startAlertWorker(client);
  console.log("Alert worker started (30s tick)");
  startVoteCloserWorker(client);
  console.log("Vote-closer worker started (30s tick)");
  startVoteReminderWorker(client);
  console.log("Vote-reminder worker started (30s tick)");
  startRecurringScheduler();
  console.log("Recurring-scheduler worker started (1h tick)");
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`Received ${sig}, shutting down`);
    stopAlertWorker();
    stopVoteCloserWorker();
    stopVoteReminderWorker();
    stopRecurringScheduler();
    void client.destroy().finally(() => process.exit(0));
  });
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = getCommand(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Error executing /${interaction.commandName}:`, err);
      const errorReply: InteractionReplyOptions = {
        content: "コマンド実行中にエラーが発生しました。",
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorReply);
      } else {
        await interaction.reply(errorReply);
      }
    }
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith("vote:")) {
      try {
        await handleVoteButton(interaction);
      } catch (err) {
        console.error("Error handling vote button:", err);
        const reply: InteractionReplyOptions = {
          content: "投票の更新中にエラーが発生しました。",
          flags: MessageFlags.Ephemeral,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    }
    return;
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith(CHOUSEISAN_SELECT_PREFIX)) {
      try {
        await handleChouseisanPick(interaction);
      } catch (err) {
        console.error("Error handling chouseisan select:", err);
        const reply: InteractionReplyOptions = {
          content: "選択処理中にエラーが発生しました。",
          flags: MessageFlags.Ephemeral,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    }
    return;
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith(VOTE_MODAL_PREFIX)) {
      try {
        await handleVoteModalSubmit(interaction);
      } catch (err) {
        console.error("Error handling vote modal:", err);
        const reply: InteractionReplyOptions = {
          content: "投票作成中にエラーが発生しました。",
          flags: MessageFlags.Ephemeral,
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
    }
    return;
  }

  if (interaction.isAutocomplete()) {
    const command = getCommand(interaction.commandName);
    const focusedOption = (() => {
      try { return interaction.options.getFocused(true); } catch { return null; }
    })();
    if (!command?.autocomplete) {
      // Unknown command — still respond so Discord doesn't show "loading options failed"
      try { await interaction.respond([]); } catch { /* ignore */ }
      return;
    }
    try {
      await command.autocomplete(interaction);
    } catch (err) {
      console.error(
        `[autocomplete] /${interaction.commandName} (focused=${focusedOption?.name}="${focusedOption?.value}", user=${interaction.user.id}, guild=${interaction.guildId}):`,
        err instanceof Error ? `${err.message}\n${err.stack}` : err
      );
      // Fallback: ensure Discord gets a response so the UI doesn't hang on
      // "loading options failed". If our handler already responded (then threw),
      // this no-ops safely via the responded guard.
      if (!interaction.responded) {
        try {
          await interaction.respond([]);
        } catch (respondErr) {
          console.error("[autocomplete] failed to send fallback empty response:", respondErr);
        }
      }
    }
  }
});

client.login(token);
