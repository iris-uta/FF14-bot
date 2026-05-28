import "dotenv/config";

// B1 (audit BLOCKER): install process-level error handlers BEFORE any other code
// so a synchronous throw during imports or top-level execution still gets logged.
// Without these, a single unhandled error crashes the bot with no context.
process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException:", err);
  // Don't exit — discord.js often recovers from transient errors. Genuine fatals
  // (OOM, EACCES on startup) will exit Node anyway.
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] unhandledRejection:", reason);
});

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
import { waitForAllWithTimeout } from "./lib/safe-tick";
import { startAlertWorker, stopAlertWorker, waitForAlertWorker } from "./services/alert-worker";
import { startVoteCloserWorker, stopVoteCloserWorker, waitForVoteCloser } from "./services/vote-closer";
import { startVoteReminderWorker, stopVoteReminderWorker, waitForVoteReminder } from "./services/vote-reminder";
import { startRecurringScheduler, stopRecurringScheduler, waitForRecurringScheduler } from "./services/recurring-scheduler";
import { handleVoteButton } from "./services/vote-interaction";
import { handleVoteModalSubmit, MODAL_PREFIX as VOTE_MODAL_PREFIX } from "./services/vote-modal-submit";
import { handleChouseisanPick, SELECT_PREFIX as CHOUSEISAN_SELECT_PREFIX } from "./services/chouseisan-interaction";
import { postWelcomeToGuild } from "./services/welcome";
import { startHealthServer, stopHealthServer, type HealthState } from "./health-server";

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

// Guard: GuildCreate fires for ALL guilds during bot startup (initial sync),
// not just real new joins. We only want to welcome on actual new joins, so
// flip this flag once ClientReady fires.
let isReadyForNewGuilds = false;

// Shared state object the health endpoint can read without coupling.
const healthState: HealthState = { ready: false };

// Health endpoint starts immediately so Fly's checks see "starting" (503) until ready.
startHealthServer(client, healthState);

// When bot is added to a NEW guild post-startup, post the welcome / 3-step
// quickstart embed to the system channel (or first sendable text channel).
client.on(Events.GuildCreate, async (guild) => {
  if (!isReadyForNewGuilds) {
    // Startup sync — skip welcome (we're already in this guild)
    return;
  }
  console.log(`Joined guild: ${guild.name} (${guild.id}) — ${guild.memberCount} members`);
  try {
    const result = await postWelcomeToGuild(guild);
    if (result.posted) {
      console.log(`  Welcome posted to channel ${result.channelId}`);
    } else {
      console.warn(`  No sendable channel found in ${guild.name} — welcome skipped`);
    }
  } catch (err) {
    console.error(`Failed to post welcome to ${guild.name}:`, err);
  }
});

client.once(Events.ClientReady, (c) => {
  isReadyForNewGuilds = true;
  healthState.ready = true;
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

// B3 (audit BLOCKER): graceful shutdown.
//
//   1. stop the interval timers so no new ticks start
//   2. await any in-flight tick (10s timeout) so partial DB writes commit
//   3. destroy Discord client + close health server
//   4. exit
//
// If a tick is stuck, the 10s timeout prevents hanging forever — Fly will
// SIGKILL after its own grace period anyway.
let shuttingDown = false;
async function gracefulShutdown(sig: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${sig}, shutting down...`);

  // 1. Stop scheduling new ticks
  stopAlertWorker();
  stopVoteCloserWorker();
  stopVoteReminderWorker();
  stopRecurringScheduler();

  // 2. Wait for in-flight ticks (max 10s)
  const drain = await waitForAllWithTimeout(
    [
      { run: async () => {}, waitForCurrentTick: waitForAlertWorker },
      { run: async () => {}, waitForCurrentTick: waitForVoteCloser },
      { run: async () => {}, waitForCurrentTick: waitForVoteReminder },
      { run: async () => {}, waitForCurrentTick: waitForRecurringScheduler },
    ],
    10_000
  );
  console.log(
    `  workers drained: ${drain.drained ? "yes" : "TIMEOUT — exiting anyway"}`
  );

  // 3. Tear down Discord + health server
  try {
    await Promise.all([client.destroy(), stopHealthServer()]);
  } catch (err) {
    console.error("  error during teardown:", err);
  }

  // 4. Bye
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    void gracefulShutdown(sig);
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
