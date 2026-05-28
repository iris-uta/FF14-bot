import type {
  ChatInputCommandInteraction,
  AutocompleteInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import * as contentCommand from "./content";
import * as postPhaseCommand from "./post-phase";
import * as recruitTemplateCommand from "./recruit-template";
import * as helpCommand from "./help";
import * as scheduleCommand from "./schedule";
import * as schedulesCommand from "./schedules";
import * as unscheduleCommand from "./unschedule";
import * as macroCommand from "./macro";
import * as tipsCommand from "./tips";
import * as fromChouseisanCommand from "./from-chouseisan";
import * as progressCommand from "./progress";
import * as quickstartCommand from "./quickstart";
import * as recurringCommand from "./recurring";
import * as staticInitCommand from "./static-init";
import * as staticInfoCommand from "./static-info";
import * as voteCommand from "./vote";

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
  [postPhaseCommand.data.name]: postPhaseCommand,
  [recruitTemplateCommand.data.name]: recruitTemplateCommand,
  [helpCommand.data.name]: helpCommand,
  [scheduleCommand.data.name]: scheduleCommand,
  [schedulesCommand.data.name]: schedulesCommand,
  [unscheduleCommand.data.name]: unscheduleCommand,
  [macroCommand.data.name]: macroCommand,
  [tipsCommand.data.name]: tipsCommand,
  [staticInitCommand.data.name]: staticInitCommand,
  [staticInfoCommand.data.name]: staticInfoCommand,
  [progressCommand.data.name]: progressCommand,
  [quickstartCommand.data.name]: quickstartCommand,
  [recurringCommand.data.name]: recurringCommand,
  [fromChouseisanCommand.data.name]: fromChouseisanCommand,
  [voteCommand.data.name]: voteCommand,
};

export function getCommand(name: string): Command | undefined {
  return commands[name];
}

export function allCommandData() {
  return Object.values(commands).map((c) => c.data.toJSON());
}
