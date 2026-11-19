---
id: ASYNC-08
title: An order or word of work is lost if whoever gave it has walked out of sight by the time the NPC's turn with the model comes
kind: bug
severity: high
effort: small
confidence: likely
status: found
found_by: Opus 5.5
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

The line still wakes the model, and it answers to an empty room (or it is dropped as `alone`). The work is never put on the list.

The wait is not rare. A line wakes the NPC at once only if the model is free **and** the NPC has neither just finished a call (1.5 s) nor spoken in the last 4.2 s (`SAY_COOLDOWN_MS`). The usual way the Captain gives an order breaks the second condition: the Captain walks up, the NPC greets him ("Morning, Captain"), and the Captain gives the order and walks on. The order arrives under 4.2 s after the greeting, so the NPC waits out the cooldown; by then a walking Captain is 10 tiles on, round a corner. Any other NPC's call in progress (with eight crew, a remark or a choice is being asked most of the time) adds its seconds too.

Concrete case:

1. The Captain walks into the Kitchen. The janitor sees him for the first time and greets him: `lastSayAt` is t = 0.
2. At t = 2 s the Captain says "Ann, go and check the Bar, I heard something", and walks out through the far door.
3. `ingest`: `said_to` is `me`; `shouldWake` is TRUE; the janitor is queued; `startTalk` finds `wait` = 2.2 s and sets the retry timer.
4. At t = 4.2 s `think` runs. The Captain left view at t = 3.5 s. In `buildTalk`, `brain.peopleInView.find((seen) => speakers.includes(seen.handle) && seen.superior)` finds nobody. `ordered` is null and `told` is null.
5. The model is asked to answer a line with nobody there; `alone` is TRUE, so nothing is said. No `look Bar` task. The Captain's order has vanished.

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

1. Keep what is known of a speaker at the moment they are heard. In `hearSpeaker` (`brain.ts:1008`), besides `brain.pendingSpeakers.add(speaker)`, store `brain.speakerInfo.set(handle, { name, superior, job })` taken from `brain.peopleInView` at that moment (the speaker is in view then: the server only puts a `handle` on a line from someone the body has just seen). A new `Map` on `NpcBrain`, cleared in `think` where `pendingSpeakers` is cleared.
2. In `think`, pass that map to `buildTalk` with `speakers`. In `buildTalk`, work out `superior`, `toldBy` and `feelAbout` from it, not from `peopleInView`. `feelAbout` may stay limited to those still in view (a feeling is about someone there), but `told` must not depend on it: ask for `work` whenever anyone spoke.
3. The answer still goes only to those in view (`alone` stays as it is). If the speaker has gone, the body still takes the order on and carries it out; the report back already goes by name (`task.askedBy`) when they are next seen, or by PDA.
4. The same in the `catch` path: use the kept `superior` and `toldBy`.

Nothing here lets anything be taken from someone the server did not mark as `superior`.

## How to test the fix

- Simulator: the Captain greets a janitor, then 2 s later gives it an order and steps out of its view on the next update, with the model's answer held back 3 s. The janitor must end up with a `look` task for the room and go there.
- Same with the model down (`dead` mode): the order is still taken on.
- Type check from `tgui/`.
- Next round: give orders in passing, walking on at once. Each should show as a `work(...)` call in `crew_brain.log` and a walk in `game.log`.
