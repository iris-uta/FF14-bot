import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDb } from "@ff14kotei/db";
import { setDbForTesting, resetDb } from "../lib/db";
import {
  parseCandidateInput,
  createVote,
  recordResponse,
  getResponses,
  getVote,
  closeVote,
  listOpenVotesInGuild,
  tallyCandidate,
  renderVoteMessage,
  parseVoteButtonCustomId,
  getCandidates,
} from "./vote";

beforeEach(() => {
  setDbForTesting(createDb({ path: ":memory:" }));
});

afterEach(() => {
  resetDb();
});

describe("parseCandidateInput", () => {
  it("parses a JST datetime string into label + startsAt", () => {
    const c = parseCandidateInput("2026-06-01 21:00", 0);
    expect(c.index).toBe(0);
    expect(typeof c.startsAt).toBe("number");
    expect(c.label).toContain("2026");
    expect(c.label).toContain("21:00");
  });

  it("falls back to plain text for non-date inputs", () => {
    const c = parseCandidateInput("金曜の夜", 1);
    expect(c.index).toBe(1);
    expect(c.label).toBe("金曜の夜");
    expect(c.startsAt).toBeNull();
  });

  it("trims whitespace", () => {
    const c = parseCandidateInput("  hello  ", 0);
    expect(c.label).toBe("hello");
  });
});

describe("parseVoteButtonCustomId", () => {
  it("parses well-formed custom ids", () => {
    const parsed = parseVoteButtonCustomId("vote:abc-123:0:yes");
    expect(parsed).toEqual({ voteId: "abc-123", candidateIndex: 0, value: "yes" });
  });

  it("rejects non-vote prefixes", () => {
    expect(parseVoteButtonCustomId("static:abc:0:yes")).toBeNull();
  });

  it("rejects invalid value", () => {
    expect(parseVoteButtonCustomId("vote:abc:0:bogus")).toBeNull();
  });

  it("rejects non-numeric index", () => {
    expect(parseVoteButtonCustomId("vote:abc:foo:yes")).toBeNull();
  });

  it("rejects wrong segment count", () => {
    expect(parseVoteButtonCustomId("vote:abc:0")).toBeNull();
  });
});

describe("createVote + getVote + responses", () => {
  const baseInput = {
    id: "vote-1",
    guildId: "g1",
    channelId: "c1",
    creatorId: "u-creator",
    title: "次回固定日",
    candidates: [
      parseCandidateInput("2026-06-01 21:00", 0),
      parseCandidateInput("2026-06-02 21:00", 1),
    ],
  };

  it("inserts a vote and returns it via getVote", () => {
    createVote(baseInput);
    const v = getVote("vote-1");
    expect(v).not.toBeNull();
    expect(v?.title).toBe("次回固定日");
    expect(v?.closed).toBe(false);
    expect(getCandidates(v!).length).toBe(2);
  });

  it("upserts responses (same user can change vote)", () => {
    createVote(baseInput);
    recordResponse("vote-1", "u-alice", 0, "yes");
    recordResponse("vote-1", "u-alice", 0, "no"); // change mind
    const responses = getResponses("vote-1");
    expect(responses).toHaveLength(1);
    expect(responses[0].value).toBe("no");
  });

  it("supports multiple users voting on multiple candidates", () => {
    createVote(baseInput);
    recordResponse("vote-1", "u-alice", 0, "yes");
    recordResponse("vote-1", "u-alice", 1, "maybe");
    recordResponse("vote-1", "u-bob", 0, "yes");
    recordResponse("vote-1", "u-bob", 1, "no");
    const responses = getResponses("vote-1");
    expect(responses).toHaveLength(4);

    const t0 = tallyCandidate(responses, 0);
    expect(t0.counts).toEqual({ yes: 2, no: 0, maybe: 0 });
    expect(t0.users.yes).toEqual(expect.arrayContaining(["u-alice", "u-bob"]));

    const t1 = tallyCandidate(responses, 1);
    expect(t1.counts).toEqual({ yes: 0, no: 1, maybe: 1 });
  });
});

describe("closeVote", () => {
  it("flips closed to true and excludes from listOpenVotesInGuild", () => {
    createVote({
      id: "vote-open",
      guildId: "g1",
      channelId: "c1",
      creatorId: "u",
      title: "open",
      candidates: [parseCandidateInput("a", 0), parseCandidateInput("b", 1)],
    });
    createVote({
      id: "vote-closed",
      guildId: "g1",
      channelId: "c1",
      creatorId: "u",
      title: "closed",
      candidates: [parseCandidateInput("a", 0), parseCandidateInput("b", 1)],
    });
    closeVote("vote-closed");

    const open = listOpenVotesInGuild("g1");
    expect(open.map((v) => v.id)).toContain("vote-open");
    expect(open.map((v) => v.id)).not.toContain("vote-closed");
  });
});

describe("renderVoteMessage", () => {
  it("returns an embed with one field per candidate", () => {
    createVote({
      id: "v",
      guildId: "g",
      channelId: "c",
      creatorId: "u",
      title: "title",
      candidates: [
        parseCandidateInput("a", 0),
        parseCandidateInput("b", 1),
        parseCandidateInput("c", 2),
      ],
    });
    const v = getVote("v")!;
    const { embeds, components } = renderVoteMessage(v, []);
    const data = embeds[0].toJSON();
    expect(data.fields).toHaveLength(3);
    expect(components).toHaveLength(3); // 1 ActionRow per candidate
  });

  it("disables buttons when closed", () => {
    createVote({
      id: "v",
      guildId: "g",
      channelId: "c",
      creatorId: "u",
      title: "title",
      candidates: [parseCandidateInput("a", 0), parseCandidateInput("b", 1)],
    });
    closeVote("v");
    const v = getVote("v")!;
    const { components } = renderVoteMessage(v, []);
    const firstRow = components[0].toJSON() as { components: { disabled?: boolean }[] };
    for (const btn of firstRow.components) {
      expect(btn.disabled).toBe(true);
    }
  });

  it("shows yes voter mentions in the field value", () => {
    createVote({
      id: "v",
      guildId: "g",
      channelId: "c",
      creatorId: "u",
      title: "title",
      candidates: [parseCandidateInput("a", 0), parseCandidateInput("b", 1)],
    });
    recordResponse("v", "u-alice", 0, "yes");
    recordResponse("v", "u-bob", 0, "yes");
    const v = getVote("v")!;
    const { embeds } = renderVoteMessage(v, getResponses("v"));
    const data = embeds[0].toJSON();
    const field0 = data.fields![0];
    expect(field0.value).toContain("<@u-alice>");
    expect(field0.value).toContain("<@u-bob>");
  });

  it("caps mention list at 10 with overflow indicator", () => {
    createVote({
      id: "v",
      guildId: "g",
      channelId: "c",
      creatorId: "u",
      title: "title",
      candidates: [parseCandidateInput("a", 0), parseCandidateInput("b", 1)],
    });
    for (let i = 0; i < 13; i++) {
      recordResponse("v", `u-${i}`, 0, "yes");
    }
    const v = getVote("v")!;
    const { embeds } = renderVoteMessage(v, getResponses("v"));
    const field0 = embeds[0].toJSON().fields![0];
    expect(field0.value).toContain("+3"); // 13 - 10 = 3 hidden
  });
});
