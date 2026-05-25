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

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is required (see .env.example)");
  process.exit(1);
}

const contents = getAllContents();
console.log(`Loaded ${contents.length} content(s): ${contents.map((c) => c.id).join(", ")}`);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

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
