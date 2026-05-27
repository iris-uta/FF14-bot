import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type InteractionReplyOptions,
} from "discord.js";
import { getCommand } from "./commands";
import { getAllContents } from "./lib/contents";
import { getDb } from "./lib/db";
import { startAlertWorker, stopAlertWorker } from "./services/alert-worker";
import { startVoteCloserWorker, stopVoteCloserWorker } from "./services/vote-closer";
import { startVoteReminderWorker, stopVoteReminderWorker } from "./services/vote-reminder";
import { startRecurringScheduler, stopRecurringScheduler } from "./services/recurring-scheduler";
import { handleVoteButton } from "./services/vote-interaction";
import { handleVoteModalSubmit, MODAL_PREFIX as VOTE_MODAL_PREFIX } from "./services/vote-modal-submit";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is required (see .env.example)");
  process.exit(1);
}

const contents = getAllContents();
console.log(`Loaded ${contents.length} content(s): ${contents.map((c) => c.id).join(", ")}`);

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
    if (!command?.autocomplete) return;
    try {
      await command.autocomplete(interaction);
    } catch (err) {
      console.error(`Error in autocomplete /${interaction.commandName}:`, err);
    }
  }
});

client.login(token);
