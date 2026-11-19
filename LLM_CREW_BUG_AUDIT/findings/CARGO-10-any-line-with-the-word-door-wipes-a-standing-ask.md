---
id: CARGO-10
title: Anyone saying the word door in a technician's hearing, a workmate included, replaces the ask for a door it was about to answer
kind: bug
severity: medium
effort: small
confidence: likely
status: duplicate
duplicate_of: KNA-01
found_by: Fable 5.2
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2275, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2316, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1754
fix: Keep a standing ask that may be let through unless the new one may be too, and do not take the word door from cargo staff as an ask
---

## What is wrong

A technician keeps one ask for a door at a time, in `brain.doorAsked`. `overhears` writes it for every line it hears that has "door", "let me in", "let us out", "open up" and the like, from anyone, unless the line was said to someone else by name. `readsMessage` does the same for every PDA message with those words. Neither looks at what is already there, and neither looks at who is speaking. So a line that is not an ask at all, from someone who could never be let through, throws away the ask of someone who is waiting at the door.

The crew's own talk does this to each other. While a door is wanted, `cues` tells the model "You are opening the door for them now: say so if you speak of it", and tells the technician who does not have the rooms "If you answer, say that Maria is seeing to it". Both lines come out with the word "door" in them more often than not.

One concrete case, two technicians, the Quartermaster has given Maria the rooms:

1. The janitor Jan, sent for to a mess in the Cargo Bay, says at the counter "Could you let me in, please?" Both technicians hear it. Both set `doorAsked = { name: 'Jan Mopp', ... }`. The door is Maria's (`doorIsMine`). Maria is hauling a crate and will get to it when the haul ends.
2. Sam is the one spoken to. Its model answers, as the cue tells it to: "Maria is seeing to the door, Jan."
3. Maria hears Sam. The line is not said to someone else as far as `said_to` can tell (it has Maria's own name in it), and `DOOR_WORDS` matches. Maria's `doorAsked` becomes `{ name: 'Sam Tech', room: undefined, out: false }`.
4. `mayPass` for Sam is null. `doorWanted` is null. In `syncTasks` Maria's `door` task for Jan is closed. Jan is left at the door until it asks again.

If Maria had already set off, the door still opens, but the task is gone when the answer comes back, so `afterActing` finds no task: Jan is not noted as let in (`noteLetIn`), is not on the list of people to let out, and `lastOpened` is not set.

The same happens when a head at a staff meeting in the bay says anything about a door, when the Captain says "mind the door", and when a second person asks who may not be let in: the refusal goes to them and the first person's ask is gone.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2275`, in `overhears`:

    if (
      speaker &&
      event.details.said_to !== 'other' &&
      DOOR_WORDS.test(heard) &&
      !idleWord
    ) {
      brain.doorAsked = {
        name: speaker,
        at: brain.now,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2316`, in `readsMessage`:

    if (!from || !DOOR_WORDS.test(text)) {
      return;
    }
    brain.doorAsked = {
      name: from,
      at,

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:156`:

    const DOOR_WORDS = /\bdoor\b|let (me|us) (in|out|through)|open up/i;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:873`, in `syncTasks`, where the task goes:

    for (const task of brain.tasks) {
      if (
        task.kind === DOOR &&
        task.state !== 'done' &&
        (task.item !== wants?.name || task.place !== wants?.room)
      ) {
        finishTask(brain, task);
      }
    }

## How it was found

Read from the code, not seen in a round. What `said_to` comes out as for Sam's line was not run: if `saidTo` in `addressing.ts` takes the line as said to Jan, Maria skips it, and the fault then needs a line with no name in it ("I am getting the door."), which the model also says. Not listed in the change log or the plans.

## How to fix it

1. In `overhears`, work out the new ask first and decide whether it replaces the old one:
   - `const standing = brain.doorAsked` is live if `brain.now - standing.at` is inside its time (`LET_OUT_ASK_DS` or `DOOR_ASK_DS`) and `mayPass(brain, standing.name, standing.room, standing.out)` is not null;
   - the new ask replaces a live one only if `mayPass` for the new speaker is not null too, or it is the same person asking again.
   Otherwise leave `doorAsked` alone. The refusal by PDA in `syncTasks` only reads `doorAsked`, so a refused second asker who wrote by PDA needs their own small note (who, room, when) to be told no: keep a second field, `brain.doorRefusedAsk`, for that.
2. Do not take a line from cargo staff as an ask unless they are asking to be let out: `isCargo(speakerJob) && !LET_OUT_WORDS.test(heard)` returns early. A technician that is shut in sends "I am shut in the ..." (`SHUT_IN_WORDS`), which has neither "door" nor "let me".
3. Same test in `readsMessage`.
4. Longer term this wants to be a short list of asks, oldest first, the way `expected.ts` keeps calls: `doorSought` would take the first that may pass. That also mends two people asking at once. It is a bigger change, and the two steps above stop the common case.

## How to test the fix

- Simulator with a chatty model (`chatty` as the last argument): the `crew` and `nested` scenarios with two technicians. Check that one ask from the janitor leads to one `open_door` and a let-in note, with the other technician talking.
- A unit case: build a brain with a standing ask from an expected janitor, feed `overhears` a line from a workmate with "door" in it, and check `brain.doorAsked.name` is still the janitor.
- Type check.
