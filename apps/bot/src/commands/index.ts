import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import * as contentCommand from "./content";
import * as setupStaticCommand from "./setup-static";

export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}

export const commands: Record<string, Command> = {
  [contentCommand.data.name]: contentCommand,
  [setupStaticCommand.data.name]: setupStaticCommand,
};

export function getCommand(name: string): Command | undefined {
  return commands[name];
}

export function allCommandData() {
  return Object.values(commands).map((c) => c.data.toJSON());
}
