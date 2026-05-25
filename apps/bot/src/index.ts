import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import { loadAllContents } from "@ff14kotei/schema";
import { resolve } from "node:path";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is required (see .env.example)");
  process.exit(1);
}

const contentsDir = resolve(process.cwd(), "../../data/contents");
const contents = loadAllContents(contentsDir);
console.log(`Loaded ${contents.length} content(s):`, contents.map((c) => c.id).join(", "));

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("ready", (c) => {
  console.log(`Logged in as ${c.user.tag}`);
});

client.login(token);
