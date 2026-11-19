---
id: BRAIN-01
title: After six replies to a player an NPC stops hearing them until they keep quiet for 30 seconds
kind: bug
severity: high
effort: small
confidence: sure
status: found
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1008, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:96
fix: Keep the six-reply cap for talk between NPCs only, or count replies over a rolling minute, and never drop a line from someone the NPC answers to
---

## What is wrong

An NPC answers the same person six times and then is not woken by them again. The count is only wiped when that person has said nothing to the NPC for 30 seconds of server time. Every line they say to it, answered or not, starts the 30 seconds again.

The cap was written to stop two NPCs talking in circles (the comment at `MAX_REPLIES_PER_TALK`). For a fellow NPC the cap is already 1. The cap of 6 is what a human player gets, and the Captain is the human player. A player who is talking with one crew member, or giving it one order after another, gets six answers and then silence. The natural thing to do then is to say it again, and each repeat keeps the NPC deaf.

Nothing is done with the dropped line beyond `overhears`. It does not wake the LLM, so `buildTalk` never runs for it, so an order in it is never made out (`workInWords` is only called from `buildTalk` and `think`). The Captain's seventh line, "Ann, go and clean the Kitchen", is neither answered nor taken on.

One concrete case, run with the real window code (see "How it was found"):

1. Ann Bee, Janitor. Zim Fire, Captain, one tile away, in view as `p1`, `superior: true`.
2. Zim says six things to Ann, 12 seconds apart. Ann answers each. `talk.replies` is now 6.
3. Zim says "Ann, go and clean up the mess in the Kitchen." four times, 20 seconds apart. `hearSpeaker` returns FALSE each time, and sets `talk.lastHeardAt` each time. No LLM call, no `say`, no task.
4. Zim says nothing for 35 seconds, then says it a fifth time. Ann answers.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1008`, in `hearSpeaker`:

    const speaker = event.details.handle ?? event.details.speaker ?? 'someone';
    let talk = brain.talks.get(speaker);
    if (!talk || event.at - talk.lastHeardAt > TALK_RESET_DS) {
      talk = { replies: 0, lastHeardAt: event.at, repliedAt: talk?.repliedAt };
      brain.talks.set(speaker, talk);
    }
    talk.lastHeardAt = event.at;
    ...
    if (talk.replies >= (fellow ? 1 : MAX_REPLIES_PER_TALK)) {
      return false;
    }

`brain.ts:96` and `brain.ts:98`:

    const MAX_REPLIES_PER_TALK = 6;
    /** A speaker who has been quiet this long (deciseconds of server time) starts a fresh conversation. */
    const TALK_RESET_DS = 300;

`talk.lastHeardAt = event.at` is set before the cap is tested, so a line that is dropped still pushes the reset further off.

The count goes up in `think`, `brain.ts:1564`:

    for (const speaker of speakers) {
      const talk = brain.talks.get(speaker);
      if (talk) {
        talk.replies++;
        talk.repliedAt = brain.now;
      }
    }

`hearSpeaker` is the last word in `shouldWake` for speech (`brain.ts:974`, `return hearSpeaker(brain, event);`), so FALSE means the brain is not woken.

## How it was found

Read from the code, then run. A throwaway script outside the repo imported `brain.ts` by absolute path with `fetch` replaced by a stand-in that always answers "Right you are." (no model was called), fed `ingest` one janitor with the Captain in view, and counted `say` tool calls:

    line 6: LLM calls so far 6, answered: "Right you are."
    line 7: LLM calls so far 6, answered: NOTHING
    line 8: LLM calls so far 7, answered: NOTHING
    ...
    order, try 1: answered false
    order, try 2: answered false
    order, try 3: answered false
    order, try 4: answered false
    the Captain now says nothing for 35 seconds
    order after the pause: answered true

(The seventh LLM call is a remark of its own, not an answer.) Not seen in a round log: the brain log does not record lines that did not wake the LLM, so it cannot show this.

Not listed in `LLM_CREW_CHANGELOG.md` or any plan (searched for `MAX_REPLIES`, "deaf", "stops being woken").

## How to fix it

1. In `hearSpeaker`, keep the hard cap for fellow NPCs only (`fellow ? 1 : ...`). That is the loop the cap was written for, and `FELLOW_REPLY_EVERY_DS` already covers the slow version of it.
2. For anyone who is not one of this window's NPCs, replace the count that never runs down with a rolling one: keep the times of its last replies to that speaker (`talk.replyTimes: number[]`, trimmed to the last minute of server time) and refuse only when there are six or more in that minute. A player cannot type that fast, so a player is never cut off. Another owner's NPC or a silicon that answers every line still is.
3. Whatever the count, do not drop a line from someone the NPC answers to. `brain.peopleInView.find((seen) => seen.handle === event.details.handle)?.superior` is the server's own word on that (`answers_to` in `crew_npc_senses.dm`). An order from the Captain must always reach `buildTalk`.
4. Move `talk.lastHeardAt = event.at` below the cap test, so that a line that was refused does not put off the reset. With step 2 this matters less, but it is the reason repeating oneself made it worse.
5. Keep the two fellow rules as they are. `tools/llm_crew/sim.ts quiet crew` leans on them to keep a room of NPCs quiet.

The owner does not need to decide anything here unless a cap on players is wanted on purpose.

## How to test the fix

- Add a case to the simulator (`tools/llm_crew/sim.ts`), or a small table like `tools/llm_crew/addressing.ts`: the Captain says eight lines to one janitor ten seconds apart with the chatty stand-in, and all eight are answered. Then two NPCs side by side still stop after one reply each.
- Type check from `tgui/`.
- In the next round: talk to one crew member for a minute without a pause. In `game.log` there should be a "was told by its brain to say" line after each of yours.
