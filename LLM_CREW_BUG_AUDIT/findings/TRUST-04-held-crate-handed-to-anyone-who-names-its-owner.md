---
id: TRUST-04
title: A crate held for a head is put out for anyone who says they have come for it, by number or just by the head's name or job
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:423, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:2219, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:540, code/modules/llm_crew/crew_npc_held.dm:295
fix: Release a held crate only to whoever it is for, to their own staff, or to someone they have named by PDA, and ask anyone else who sent them
---

## What is wrong

Cargo holds a crate in the bay "until someone comes to the counter with the number" (the PDA message the technician sends, `arrived` in `cargo.ts`). The idea is that the number is the proof. In the code it is not even that:

- With no number, the crate is picked by who it is for. `crateMeant` matches the crate's `for` name, that person's first name, **or that person's job**, anywhere in what was said. "I'm here to collect the Head of Personnel's crate" picks the Head of Personnel's crate.
- The number itself is said aloud. When a technician looks over the waiting crates it says, standing by one of them in the bay, "Still waiting: crate 1779 for Gratian Stone. I will send word." (`look_over_held` in `crew_npc_held.dm`, `speak_plainly`). Anyone within seven tiles hears the number and the name, and the bay is next to the counter on most maps. Not checked: how far the held crates stand from the lobby on MetaStation.
- Neither the window nor the server compares who asked with who the crate is for. The window's step even says so and goes on: "Bob has come to the counter for crate #1779, which Gratian Stone ordered. You are fetching it out to the Cargo Lobby for them." `tool_release` takes whatever handle it is given (`release_for = person.name`), drags the crate into the lobby and labels it "#1779 for Gratian Stone".

So any player at the counter gets any head's supplies. The head then sends a janitor or a technician for it and is told "crate 1779 is out in the lobby already", and the crate is gone.

One concrete case:

1. The Head of Personnel orders Janitorial Supplies. The crate docks and is held as #1779 for "Gratian Stone".
2. Five minutes on, a technician says by the crate "Still waiting: crate 1779 for Gratian Stone. I will send word."
3. An assistant at the counter says "Hi, I'm here to pick up crate 1779."
4. `overhears` in `cargo.ts`: `COLLECT_WORDS` matches "pick up", `crateNumberIn` gives 1779, the assistant is not cargo, so `pickupAsked = { name: <assistant>, number: 1779 }`.
5. `syncHeld` adds a HANDOVER task; `planHeld` sends `release` with the assistant's handle. The server's `tool_release` checks only that a crate by that number is held and not out. It is put out for the assistant.

Step 3 works as well with "I've come for the Head of Personnel's crate", with no number at all.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:441` (the function starts at 423), in `crateMeant`:

    return brain.heldCrates.find((crate) => {
      if (!crate.for || crate.out || crate.takenBy) {
        return false;
      }
      const job =
        brain.pdaPeople.find((person) => person.name === crate.for)?.job ?? '';
      return says(crate.for) || says(firstName(crate.for)) || says(job);
    });

`cargo.ts:550`, in `planHeld`:

    step: `${who} has come to the counter for crate #${crate.number}${crate.for && crate.for !== who ? `, which ${crate.for} ordered` : ''}. You are fetching it out to the Cargo Lobby for them.`,
    act: {
      tool: 'release',

`code/modules/llm_crew/crew_npc_held.dm:295`, `tool_release`: "Whether they gave the right one is settled here, whoever asks", and nothing after it looks at who asks.

## How it was found

Read from the code. Not seen in a round: in the rounds so far only crew NPCs and the Captain came for crates.

## How to fix it

The hard part is that the owner of a crate is usually not who comes for it: a head sends one of its staff (`readPickup` in `pickups.ts`). So the rule cannot be "only the person it is for".

1. Window, where `pickupAsked` is set (`cargo.ts:2236`): find the asker among `peopleInView` by name. Note whether they are the crate's `for`, or someone who answers to them (`answersTo(asker.job, ownerJob)` from `hierarchy.ts`, with `ownerJob` looked up in `brain.pdaPeople` as `crateMeant` already does; there is no `jobOf` helper), or the Captain. `answersTo` is true for anyone at all when the owner is the Captain, which is right: anyone may be sent for the Captain's crate. An NPC collector always passes this test, since `readPickup` only takes the errand from someone it answers to.
2. If none of those, do not add HANDOVER. Say instead, in fixed words: "Sorry, <first>, crate <n> is for <owner>. I can only hand it to them or to someone they send." and send the owner a PDA message, "<asker> is at the counter asking for crate <n>. Did you send them?" A "yes" back from the owner by PDA (read the way `readAnswer` reads the Captain's) lets it go to that asker for a few minutes. An NPC head has to be able to answer that message: add a reader in `head.ts` that answers yes when the name is the `to` of one of its `brain.pickups` for that number, and no otherwise. Without it every player sent by an NPC head is refused.
3. In `crateMeant`, drop `says(job)`: a job is not a name on a label, and it is the part that needs no knowledge at all.
4. Server, `tool_release`: no change is strictly needed, but as a backstop `release_for` should be logged against `entry.for_name` in `game.log` when they differ, so a round log shows it.

Question for the owner: is this worth the extra PDA round trip, or is "anyone with the number" the rule wanted, as at a real post-office counter? If it is, then at least the spoken reminder should not read out the numbers in the lobby, and step 3 still applies.

## How to test the fix

- A table test of the counter: a technician brain holding #1779 for "Gratian Stone" (Head of Personnel on the PDA list); heard "I'm here to pick up crate 1779" from an assistant in view: no HANDOVER task, a refusal line, and a PDA message to Gratian Stone owed. The same from a janitor in view whose head is the Head of Personnel: HANDOVER.
- Simulator: `quiet waiting` already has a crate handed over when asked for by number. Add a stranger who asks for it first, and check the crate is not released to them.
- Type check.

## Check

Opus 5.5, 2026-11-19. Confirmed, as a gap with a design question in it.

- `crateMeant` (`cargo.ts:423-448`), the pickup branch of `overhears` (`cargo.ts:2219-2240`), `planHeld`'s HANDOVER step (`cargo.ts:540-556`), `look_over_held`'s `speak_plainly("Still waiting: ...")` (`crew_npc_held.dm:286`) and `tool_release` (`crew_npc_held.dm:295-315`) are as quoted. `tool_release` checks only that the number is held, not out and not being taken; `release_for` is the handle's name or the last speaker. Nothing on either side compares the asker with `entry.for_name`.
- The job match is real: for "I've come for the Head of Personnel's crate", `/\bcrates?\b/` and `COLLECT_WORDS` pass, and `says("Head of Personnel")` matches.
- Searched the change log and plans: "with the number to collect it" is the wording of cargo's PDA message (`LLM_CREW_PLAN_ROUND_0912.md:110`), and "Whoever the head sends collects the crate at the counter" (`LLM_CREW_PLAN_ENGINEERING.md:14`). Neither says that anyone at all may collect, nor that they may not. So it is not a chosen behaviour, but the rule wanted is the owner's call; the finding already asks it.
- Severity medium stands: it needs a player who tries it, and the head's supplies are then lost to it. Effort medium: the refusal, the PDA question, and a head-side answer (which the fix left out; added to step 2).
- Not checked: how far the held crates stand from the lobby on MetaStation, so whether the spoken reminder is heard at the counter.
