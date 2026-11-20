---
id: ASYNC-08
title: An order or word of work is lost if whoever gave it has walked out of sight by the time the NPC's turn with the model comes
kind: bug
severity: high
effort: medium
confidence: sure
status: fixed
fixed_in: cc2ccaf69df
found_by: Opus 5.5
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/talk.ts:122, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:145, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1308, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1517, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1603, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1146
fix: Keep who each speaker was (name, superior or not) when the line is heard, and have buildTalk and think go by that, not by who is in view when the model is asked
---

## What is wrong

An order from the Captain or the NPC's head ("Ann, go and check the Bar"), and word of work from anyone ("Ann, there is vomit in the Kitchen"), is made out by code in `buildTalk`, and by the model's `work` answer and the `workInWords` fall-backs in `think`. All of them decide who spoke, and whether that person is over the NPC, by looking the speaker's handle up in `brain.peopleInView` **as it is when the NPC's turn with the model starts**, not as it was when the line was heard.

If the speaker has walked out of sight in between:

- `superior` is null, so `ordered` is null: no order is made out.
- `toldBy` is undefined.
- `feelAbout` is empty, so `told` is null: the model is not asked for `work` at all, and the net in `think` (`if (told && !tookWork)`) does not run.
- With the model down, the `catch` runs `workInWords(brain, report, toldBy, !!superior)` with `superior` false, so an order is not read as an order; only the job's own kinds of work are caught, as "asked".

The line still wakes the model. `alone` in `think` is `peopleInView.length === 0 && speakers.length === 0`, and `speakers` is not empty, so whatever the model answers is said aloud, to an empty room or to whoever else is there. The model has read the order in the report, so the answer is often "On my way, Captain" while nothing is put on the list: the NPC says yes and does not go.

The wait is not rare. A line wakes the NPC at once only if the model is free **and** the NPC has neither just finished a call (1.5 s) nor spoken in the last 4.2 s (`SAY_COOLDOWN_MS`). The usual way the Captain gives an order breaks the second condition: the Captain walks up, the NPC greets him ("Morning, Captain"), and the Captain gives the order and walks on. The order arrives under 4.2 s after the greeting, so the NPC waits out the cooldown; by then a walking Captain is 10 tiles on, round a corner. Any other NPC's call in progress (with eight crew, a remark or a choice is being asked most of the time) adds its seconds too.

Concrete case:

1. The Captain walks into the Kitchen. The janitor sees him for the first time and greets him: `lastSayAt` is t = 0.
2. At t = 2 s the Captain says "Ann, go and check the Bar, I heard something", and walks out through the far door.
3. `ingest`: `said_to` is `me`; `shouldWake` is TRUE; the janitor is queued; `startTalk` finds `wait` = 2.2 s and sets the retry timer.
4. At t = 4.2 s `think` runs. The Captain left view at t = 3.5 s. In `buildTalk`, `brain.peopleInView.find((seen) => speakers.includes(seen.handle) && seen.superior)` finds nobody. `ordered` is null and `told` is null.
5. The model is asked to answer the line with nobody there. `alone` is FALSE (there was a speaker), so its answer is said to the empty Kitchen. No `look Bar` task. The Captain's order has vanished.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/talk.ts:122`, in `buildTalk`:

    const superior =
      brain.peopleInView.find(
        (seen) => speakers.includes(seen.handle) && seen.superior,
      )?.name ?? null;
    // Whoever spoke is who told it of any work, and who will want to hear when it is done.
    const toldBy =
      superior ??
      brain.peopleInView.find((seen) => speakers.includes(seen.handle))?.name;
    // An order from someone it answers to is made out by code before the LLM is asked anything.
    const ordered = superior ? workInWords(brain, report, toldBy, true) : null;

`talk.ts:145`:

    const feelAbout = brain.peopleInView
      .map((person) => person.handle)
      .filter((handle) => speakers.includes(handle));
    ...
    const told =
      feelAbout.length > 0 && !ordered ? workTold(brain, !!superior) : null;

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1308`, `buildTalk` is called when the turn comes, not when the line is heard:

    const call = buildTalk(brain, { report, speakers, mustSay, remark, exact });

`brain.ts:1517` and `brain.ts:1603`, the two nets, both gated on what `buildTalk` found:

    if (told && !tookWork) {
      const caught = workInWords(brain, report, toldBy, !!superior);

    if (speakers.length > 0 && !ordered) {
      const caught = workInWords(brain, report, toldBy, !!superior);

`brain.ts:1146`, the waits before the turn: `lastThinkEnd + MIN_THINK_GAP_MS` and `lastSayAt + SAY_COOLDOWN_MS`.

## How it was found

Read from the code: `ingest` (`hearSpeaker` keeps only the handle in `pendingSpeakers`), `startTalk`, `think` and `buildTalk`. Not seen in a round. How often the Captain is out of view by the time the turn comes was not measured; the mechanism is certain, the frequency is my estimate.

## How to fix it

1. Keep what is known of a speaker at the moment they are heard. In `hearSpeaker` (`brain.ts:1008`), besides `brain.pendingSpeakers.add(speaker)`, look the handle up in `brain.peopleInView` and, if found, store `brain.speakerInfo.set(speaker, { name, superior: !!seen.superior })`. `ingest` sets `brain.peopleInView` from the same update (`brain.ts:425`) before it reads that update's events (`brain.ts:730`), so the list is the one the line came with. A new `Map` on `NpcBrain` (`types.ts`, the new-brain block in `ingest`, and `makeBrain` in `tools/llm_crew/fixtures.ts`), cleared in `think` where `pendingSpeakers` is cleared.
   - The server gives a line a `handle` when the body saw the speaker in the last 15 seconds (`recently_saw`, `crew_npc_senses.dm:439`), so someone already round the corner when they speak is not in `peopleInView` even then. To cover that too, the server can put `"superior" = answers_to(speaker)` beside `"handle"` on the speech event (the same proc `people_in_view` uses, `crew_npc_senses.dm:191`), and `hearSpeaker` can take it from `event.details` when the person is not in view. That makes it a server and window change; the window-only step is enough for the case above.
2. Put the map on the `Moment` passed to `buildTalk` from `think`. In `buildTalk`, work out `superior` and `toldBy` from it first, falling back to `peopleInView` as now. `feelAbout` stays limited to those still in view (the `feel` tool looks the person up in `peopleInView` and drops anyone else), but `told` must not depend on it: ask for `work` whenever `speakers` is not empty.
3. The answer still goes out as now. If the speaker has gone, the body takes the order on and carries it out; the report back goes by name (`task.askedBy`) when they are next seen, or by PDA.
4. The `catch` path already uses `superior` and `toldBy` from the call, so it follows once `buildTalk` does.

Nothing here lets anything be taken from someone the server did not mark as `superior` at the moment they spoke.

## How to test the fix

- Simulator: the Captain greets a janitor, then 2 s later gives it an order and steps out of its view on the next update, with the model's answer held back 3 s. The janitor must end up with a `look` task for the room and go there.
- Same with the model down (`dead` mode): the order is still taken on.
- A quick table case, as in the Check below: `janitor()` from `fixtures.ts`, the Captain (`superior: 1`) heard saying "Tolly, go and check the Bar", then `peopleInView` emptied before `buildTalk`. With the fix `call.ordered` is a `look` task for the Bar and `call.superior` is the Captain; with him still in view the result is the same as today.
- Type check from `tgui/`.
- Next round: give orders in passing, walking on at once. Each should show as a `work(...) [an order, made out from what was said]` call in `crew_brain.log` and a walk in `game.log`.

## Check

Confirmed, by Opus 5.5. Every quoted line is what the code says today (`talk.ts:122-151`, `brain.ts:1146-1150`, `1297`, `1308`, `1517`, `1603`).

- Traced: `ingest` sets `peopleInView` from each update (`brain.ts:425`); `hearSpeaker` keeps only the handle (`brain.ts:1036`); `startTalk` holds the turn until `lastThinkEnd + 1.5 s` and `lastSayAt + 4.2 s` and until no other call is running; `think` calls `buildTalk` with the `peopleInView` of the latest update. Server side, `people_in_view` is `oview(7)` of this tick (`crew_npc_senses.dm:160`, `189`). `stopToTalk` holds only the NPC's own body, not the speaker.
- Ran a throwaway script (bun, outside the repo) that builds a janitor with `fixtures.ts` and calls `buildTalk` on the Captain's line "Tolly, go and check the Bar, I heard something". Captain in view: `superior= Cap Tain`, `ordered= look Bar`, task taken. Captain gone from `peopleInView`: `superior= null toldBy= undefined ordered= null workTold= false`, no task.
- Mended: the write-up said the answer is dropped as `alone`. It is not: `alone` needs `speakers` empty (`brain.ts:1359`), so the answer is said, often a yes to an order that is never taken. Effort raised to medium: the window fix touches `brain.ts`, `talk.ts`, `types.ts` and `fixtures.ts`.
- Not a duplicate of ASYNC-05 (a line the NPC means to say struck off too soon); this is the order coming in. Searched the change log and plans for `pendingSpeakers`, `buildTalk` and out-of-sight orders: nothing fixes or chooses this.
- How often a speaker is out of view by the turn was not measured; that it happens whenever they are is certain.

## Fix notes, second round

Server half (`on_pre_hear` in `crew_npc_senses.dm`, branch `r2-server`): every speech event's details now carry `"superior"`, 1 or 0. It is `answers_to(speaker)` only when the line also gets a `handle`, that is when the body saw the speaker in the last 15 seconds (`recently_saw`), and 0 otherwise. `answers_to` goes by the ID the speaker carries, which a body knows only by looking, so a voice from someone it has not just seen is not marked superior (no cheat). That covers the case here: the speaker was in view and walked out before the NPC's turn. The window half, `hearSpeaker` reading `event.details.superior`, was done by another worker in the same round. Compile-checked only.

## Fix, second round (window half)

The window now reads the server's `superior` (1 or 0) on a heard line for a speaker who is not in view as they speak: `speakerHeard` in `talk.ts`, called from `hearSpeaker` in `brain.ts`. Who is in view still comes first; with neither the view nor the detail, nothing is kept, as before. The server half (putting `"superior" = answers_to(speaker)` on the speech event in `crew_npc_senses.dm`) is another worker's, in the same round. Eight new cases in `tools/llm_crew/brain-heard.ts`. Type check, the table, and the simulator scenarios `orders`, `captain` and `crew` twice each passed. Not played: until the server sends the key, the new path is never taken.
