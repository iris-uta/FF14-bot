import "dotenv/config";
import { REST, Routes } from "discord.js";
import { allCommandData } from "./commands";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error("DISCORD_TOKEN and DISCORD_CLIENT_ID are required");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);
const body = allCommandData();

async function main() {
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId!, guildId), { body });
    console.log(`Registered ${body.length} guild command(s) on ${guildId}`);
  } else {
    await rest.put(Routes.applicationCommands(clientId!), { body });
    console.log(`Registered ${body.length} global command(s)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
