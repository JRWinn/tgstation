---
id: KNA-17
title: A technician sends a janitor one PDA message for every room with a mess, seconds apart, and sends them to a janitor it can see lying on the floor
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1599, tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1622
fix: Put every room that is due a call into one message to the same janitor, and pass over a janitor who is seen to be down
---

## What is wrong

Listed twice in the change log and not built:

- 2026-11-18, 15:00, Not built: "(12) Mess calls still go one message a room."
- 2026-11-18, 16:50 to 17:35, Seen and left alone: "A technician sent one janitor four clean-up requests in 100 seconds, two of them after seeing it lying on the floor."

Each room with a mess is its own task, and each task's step is its own message. Nothing joins them, and nothing looks at whether the janitor chosen is on its feet. In `data/logs/2026/11/19/round-20.00.21`, `game.log`:

    [02:05:33.468] ... (Jaden Prechtl) ... to PDA Collin Archibald: There is a mess in the Mining Office: pool of oil, dust and rubble. Could you come and clean it up, please? Come to its door and knock, and I will let you in.
    [02:05:38.194] ... (Jaden Prechtl) ... to PDA Collin Archibald: There is a mess in the Bitrunning Den: robot debris, dust and cobweb. Could you come and clean it up, please? Come to its door and knock, and I will let you in.

The janitor gets a task for each and is pulled between them. With four rooms that is four messages and, as the 12:23 round showed for two technicians, the PDA fills with the same asks.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1599`, in `tidyStep`: the janitor is chosen for this one room. Someone in view is taken whatever state they are in.

    const janitor =
      (within && willing.includes(within) ? within : undefined) ??
      brain.peopleInView.find(
        (person) => isJanitor(person.job) && willing.includes(person.name),
      )?.name ??
      willing[calls % willing.length];

`cargo.ts:1622`: the message names one room.

    text: !tried
      ? `There is a mess in the ${place}${what ? `: ${what}` : ''}. Could you come and clean it up, please?${wayIn}`

The server sends whether each person in view is down (`"down" = crew_npc_person_down(person)` in `code/modules/llm_crew/crew_npc_senses.dm:191`). `tidyStep` does not read it.

## How it was found

Read from the code, with the two lines above from the round log.

## How to fix it

1. In `tidyStep`, before building the message, collect the other open TIDY tasks of this technician whose own `tidyStep` would be ready now and would pick the same janitor, with the same kind of way in. Write one message: "There are messes in the Mining Office (pool of oil, dust and rubble) and the Bitrunning Den (robot debris, dust and cobweb). Could you come and clean them up, please? Come to the door of the Mining Office and knock, and I will let you in."
2. When that message is sent (in the after-acting hook that records `brain.janitorCalls[place]`), record the call for every room named, so that none of them is sent again on its own.
3. The janitor's reader of a call (`readsMessage` in `jobs/janitor.ts`, and `kindsCalled`) must take more than one room from one message. Check `beyondRoom` in `cargo.ts` and the janitor's "I have done what I can in the X" still pair up room by room.
4. In the choice of janitor, skip anyone in `brain.peopleInView` with `down` set, and skip a janitor the technician saw down in the last few minutes. If every janitor is down, the step is not ready: "no janitor is fit to call".
5. Keep the limit that already holds a mess back after two janitors have declined.

Keeps the rules: one honest PDA message in fixed words; who is down is what the body sees.

## How to test the fix

- `tools/llm_crew/sim.ts`: a cargo scenario with messes in two locked rooms at once. Pass when one message goes out naming both and the janitor cleans both. The existing `nested` scenario must still pass.
- Type check.
- Next round, `pda.log`: no two "There is a mess in the" messages from one technician to one janitor inside a minute.
