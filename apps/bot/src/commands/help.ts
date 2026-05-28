import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type AutocompleteInteraction,
  type APIApplicationCommandOption,
} from "discord.js";

// Lazy-loaded to avoid circular import with ./index (which registers this command).
async function getCommands() {
  const { commands } = await import("./index");
  return commands;
}

export const data = new SlashCommandBuilder()
  .setName("help")
  .setNameLocalizations({ ja: "ヘルプ" })
  .setDescription("利用可能なコマンド一覧を表示")
  .setDescriptionLocalizations({ ja: "利用可能なコマンド一覧と使い方を表示" })
  .addStringOption((opt) =>
    opt
      .setName("command")
      .setNameLocalizations({ ja: "コマンド名" })
      .setDescription("詳細を見たいコマンド名（省略時は全コマンド一覧）")
      .setDescriptionLocalizations({ ja: "詳細を見たいコマンド名 (省略時は全コマンド一覧)" })
      .setAutocomplete(true)
  );

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
  const commands = await getCommands();
  const focused = interaction.options.getFocused().toLowerCase();
  const matches = Object.keys(commands)
    .filter((name) => name !== "help" && name.toLowerCase().includes(focused))
    .slice(0, 25)
    .map((name) => ({ name: `/${name}`, value: name }));
  await interaction.respond(matches);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const commands = await getCommands();
  const queriedName = interaction.options.getString("command");

  if (queriedName) {
    const cmd = commands[queriedName];
    if (!cmd) {
      await interaction.reply({
        content: `コマンドが見つかりません: \`/${queriedName}\``,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const json = cmd.data.toJSON();
    const embed = new EmbedBuilder()
      .setTitle(`/${json.name}`)
      .setDescription(json.description ?? "(説明なし)")
      .setColor(0x6e85b7);

    if (json.options && json.options.length > 0) {
      embed.addFields({
        name: "オプション",
        value: json.options
          .map((o: APIApplicationCommandOption) => formatOption(o))
          .join("\n")
          .slice(0, 1024),
      });
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    return;
  }

  const commandList = Object.values(commands)
    .map((c) => {
      const json = c.data.toJSON();
      return `**\`/${json.name}\`** — ${json.description}`;
    })
    .join("\n");

  const embed = new EmbedBuilder()
    .setTitle("固定支援Bot — コマンド一覧")
    .setDescription(commandList || "(コマンドなし)")
    .setColor(0x6e85b7)
    .setFooter({ text: "詳細: /help command:<コマンド名>" });

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

function formatOption(opt: APIApplicationCommandOption): string {
  const required = "required" in opt && opt.required ? " **(必須)**" : "";
  const autocomplete = "autocomplete" in opt && opt.autocomplete ? " [autocomplete対応]" : "";
  return `**\`${opt.name}\`**${required}${autocomplete} — ${opt.description}`;
}
