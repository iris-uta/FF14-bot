import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import * as contentCommand from "./content";
import * as setupStaticCommand from "./setup-static";
import * as postPhaseCommand from "./post-phase";
import * as recruitTemplateCommand from "./recruit-template";
import * as helpCommand from "./help";
import * as scheduleCommand from "./schedule";
import * as schedulesCommand from "./schedules";
import * as unscheduleCommand from "./unschedule";
import * as macroCommand from "./macro";
import * as tipsCommand from "./tips";
import * as staticInitCommand from "./static-init";

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
  [postPhaseCommand.data.name]: postPhaseCommand,
  [recruitTemplateCommand.data.name]: recruitTemplateCommand,
  [helpCommand.data.name]: helpCommand,
  [scheduleCommand.data.name]: scheduleCommand,
  [schedulesCommand.data.name]: schedulesCommand,
  [unscheduleCommand.data.name]: unscheduleCommand,
  [macroCommand.data.name]: macroCommand,
  [tipsCommand.data.name]: tipsCommand,
  [staticInitCommand.data.name]: staticInitCommand,
};

export function getCommand(name: string): Command | undefined {
  return commands[name];
}

export function allCommandData() {
  return Object.values(commands).map((c) => c.data.toJSON());
}
