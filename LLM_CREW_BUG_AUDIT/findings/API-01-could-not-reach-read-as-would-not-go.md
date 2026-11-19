---
id: API-01
title: A throw out that could not reach the stranger is read as the stranger refusing to go, and earns them a trespass warrant
kind: bug
severity: high
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: core
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:58, code/modules/llm_crew/crew_npc_hands.dm:425, code/modules/llm_crew/crew_npc_hands.dm:196, tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:332
fix: Narrow WOULD_NOT_GO in wanted.ts to the put_out line ending they got away from you and the cannot-get-a-hold line, or better send a would_not_go details field from the server and test that
---

## What is wrong

The window tells "they would not be walked out" from every other failure of `throw_out` by matching the server's English with a regular expression:

    const WOULD_NOT_GO = /\bcould not get\b|\bcannot get a hold\b/i;

The pattern was meant for two server lines: "You could not get [name] out of [post]: ..." (from `put_out`) and "You cannot get a hold of [name]." (from `take_hold_of`). But the server's generic errand failure, used for every errand whose target the body could not walk up to, is:

    You could not get to it.

which also has "could not get" in it. So when the body simply never reaches the stranger, the window takes it that the stranger would not go. `wantedAfterActing` pushes them onto `known.couldNot`; `syncWanted` then has a head declare a warrant "for trespass" by PDA to security, or has a member of staff tell its head, who declares one. Security then arrests someone who was never even touched.

Concrete case: a cargo technician sees a visitor with no business in the Cargo Office and sends `throw_out`. The visitor is standing where the body cannot path to a tile beside them (behind a counter or windoor, in a side room the body cannot open, past a jam), so `move_to_target/crew_npc_reach` fails or runs out its three minutes (`crew_npc.bt.json`, the errand selector), and the errand leaf gives up (`crew_npc_fail_errand`). (A visitor who simply walks out while the body is on its way does not set it off: the walk follows a moving target, and once beside them `take_hold_of` answers TRUE, "not in [post] any more".) The server answers `action_result(throw_out, FALSE, "You could not get to it.")`. `WOULD_NOT_GO.test` is true. The technician sends its head "could not put X out" and the Quartermaster declares a trespass warrant on X. The same happens in `do_errand` when the body arrives but is not adjacent (line 196).

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:58`:

    const WOULD_NOT_GO = /\bcould not get\b|\bcannot get a hold\b/i;

`tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:332`, in `wantedAfterActing`:

    if (
      act.tool !== 'throw_out' ||
      ok ||
      isSecurity(brain.job) ||
      !WOULD_NOT_GO.test(text)
    ) {
      return;
    }
    ...
    known.couldNot.push({ name, place, at: brain.now, done: false });

`code/modules/llm_crew/crew_npc_hands.dm:425`, in `crew_npc_fail_errand/perform`:

    crew_controller.finish_errand(list(FALSE, "You could not get to it."))

`code/modules/llm_crew/crew_npc_hands.dm:196`, in `do_errand`:

    if(QDELETED(target) || QDELETED(body) || !can_reach_target_now(target))
        return list(FALSE, "You could not get to it.")

`finish_errand` passes this straight to `action_result(tool, outcome[1], outcome[2], ...)` with tool `throw_out`.

The two lines the pattern was meant for, in `code/modules/llm_crew/crew_npc_guarding.dm`:

    return list(FALSE, "You cannot get a hold of [person.name].")
    ...
    action_result(CREW_TOOL_EVICT, FALSE, "You could not get [person.name] out of [post_place]: [reason || "they got away from you"].")

## How it was found

Read from the code, both sides. Not seen in a round log.

## How to fix it

1. In `crew_npc_guarding.dm`, give the real "would not go" answers a details field: in `put_out`, `action_result(CREW_TOOL_EVICT, FALSE, "...", list("would_not_go" = TRUE))`, but only when the hold was broken (the walk leaf's reason is "they got away from you", or `reason` is null). A walk out that failed for "there is no way through" or "it was taking too long" is the body's trouble, not the stranger refusing, and should not carry it either; in `take_hold_of`, return a third element or set a var so `finish_errand` adds `list("would_not_go" = TRUE)` for the cannot-get-a-hold case. The simplest is to have `take_hold_of` return `list(FALSE, "You cannot get a hold of [person.name].", list("would_not_go" = TRUE))` and have `finish_errand` pass `outcome[3]` as extra details when it is a list (it already does this for force_door).
2. Pass `event.details` to `wantedAfterActing` (driver.ts line 972 already has `event`), and test `details.would_not_go` in place of `WOULD_NOT_GO.test(text)`.
3. Delete `WOULD_NOT_GO`.
4. Keep: a failure where the body could not reach them, or they had every right to be there, or they outrank it, must not reach `known.couldNot`.

## How to test the fix

- Add a case to `tools/llm_crew/security.ts` (or a small table) that calls `wantedAfterActing` with `act = { tool: 'throw_out', person: 'p1' }`, `ok = false`, and the text "You could not get to it." with no `would_not_go`: `brain.wanted.couldNot` must stay empty. With `would_not_go: true` it must get one entry.
- Type check the window. Compile the server.
- Next round: grep `game.log` for "walk failed (throw_out" and `pda.log` for "trespass": a trespass warrant should only follow a "took hold of" line for the same person.
