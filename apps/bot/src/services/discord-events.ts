/**
 * Thin wrapper around `guild.scheduledEvents.create()`.
 *
 * Used by the /book wizard to surface registered schedules on the server's
 * native "Events" panel (in addition to the bot's own alert-worker pings).
 *
 * All events are External (entityType=3) — we don't tie them to a voice/stage
 * channel because固定 activity happens in-game, not in a Discord call.
 */
import {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  PermissionFlagsBits,
  type Guild,
  type GuildScheduledEvent,
} from "discord.js";

export interface CreateScheduledEventInput {
  guild: Guild;
  name: string;
  startsAt: number;            // Unix ms (UTC)
  /** Optional. Defaults to start + 2h (typical raid session length). */
  endsAt?: number;
  description?: string;
  /** Display location. Defaults to "FF14 ゲーム内 / Discord". */
  location?: string;
}

export interface CreateScheduledEventResult {
  ok: boolean;
  event?: GuildScheduledEvent;
  error?: string;
}

const DEFAULT_DURATION_MS = 2 * 60 * 60_000;
const DEFAULT_LOCATION = "FF14 ゲーム内 / Discord";
const MAX_NAME_LENGTH = 100;       // Discord hard limit
const MAX_DESC_LENGTH = 1000;      // Discord hard limit
const MAX_LOCATION_LENGTH = 100;   // Discord hard limit

/**
 * Create one Discord scheduled event. Returns ok=false (with .error) instead of
 * throwing — the wizard treats DB insert as the source of truth and the
 * Discord event as best-effort UX polish.
 */
export async function createScheduledEvent(
  input: CreateScheduledEventInput
): Promise<CreateScheduledEventResult> {
  const { guild, name, startsAt } = input;
  const endsAt = input.endsAt ?? startsAt + DEFAULT_DURATION_MS;

  // Sanity: Discord rejects events scheduled in the past or whose end is
  // before start. Catch it locally for a cleaner error message.
  if (startsAt <= Date.now()) {
    return { ok: false, error: "scheduledStartTime is in the past" };
  }
  if (endsAt <= startsAt) {
    return { ok: false, error: "scheduledEndTime must be after startTime" };
  }

  // Permission check — surfacing this before the API call lets us tell the
  // user exactly what's missing instead of a cryptic 403.
  const me = guild.members.me;
  if (me && !me.permissions.has(PermissionFlagsBits.ManageEvents)) {
    return { ok: false, error: "Bot lacks ManageEvents permission" };
  }

  try {
    const event = await guild.scheduledEvents.create({
      name: name.slice(0, MAX_NAME_LENGTH),
      scheduledStartTime: new Date(startsAt),
      scheduledEndTime: new Date(endsAt),
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityType: GuildScheduledEventEntityType.External,
      entityMetadata: {
        location: (input.location ?? DEFAULT_LOCATION).slice(0, MAX_LOCATION_LENGTH),
      },
      description: input.description?.slice(0, MAX_DESC_LENGTH),
      reason: "固定支援Bot: created via /book wizard",
    });
    return { ok: true, event };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Create N scheduled events in parallel. Returns one result per input,
 * preserving order — caller can render a per-row success/failure summary.
 */
export async function createScheduledEvents(
  guild: Guild,
  events: Omit<CreateScheduledEventInput, "guild">[]
): Promise<CreateScheduledEventResult[]> {
  return Promise.all(
    events.map((ev) => createScheduledEvent({ guild, ...ev }))
  );
}
