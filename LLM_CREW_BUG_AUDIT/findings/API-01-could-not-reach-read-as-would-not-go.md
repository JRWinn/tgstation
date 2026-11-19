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

Two ways. The first is one line in one file; the second is sturdier and touches both sides.

**A. Window only (small).** In `jobs/wanted.ts`, make the pattern match only the two lines that mean the stranger would not go:

    const WOULD_NOT_GO = /\bcould not get .+ out of .+: they got away from you\b|\bcannot get a hold of\b/i;

`put_out` builds its line as "You could not get [name] out of [post]: [reason || "they got away from you"]." The reason is "they got away from you" only when the hold was broken (`crew_npc_motor.dm:108`, the walk tool is `throw_out` and `pulling` is null) or no reason was given. "it was taking too long" (the walk's time limit, `crew_npc_motor.dm:103`) and the no-way reason are the body's trouble and are left out, as they should be. "You could not get to it." no longer matches.

**B. A details field (medium, both sides).**
1. In `put_out` (`crew_npc_guarding.dm`), when the reason is "they got away from you" or null, call `action_result(CREW_TOOL_EVICT, FALSE, "...", list("would_not_go" = TRUE))`.
2. For the cannot-get-a-hold case, have `take_hold_of` return `list(FALSE, "You cannot get a hold of [person.name].", list("would_not_go" = TRUE))`, and in `finish_errand` (`crew_npc_hands.dm:349`) pass `outcome[3]` as the extra details when the tool is `CREW_TOOL_EVICT` and `outcome[3]` is a list. (`action_result` already takes `extra_details` and adds them to `details`.)
3. In `driver.ts` `noteResult` (line 972, `event` is in hand) pass `event.details` to `wantedAfterActing`, test `details.would_not_go` there in place of `WOULD_NOT_GO.test(text)`, and delete `WOULD_NOT_GO`.

I would take A now: it is one line, and B can follow if the wording of `put_out` is ever changed.

Either way, keep: a failure where the body could not reach them, or they had every right to be there, or they outrank it, must not reach `known.couldNot`.

A question for the owner: whether "cannot get a hold of" should count at all. `start_pulling` (`code/modules/mob/living/living.dm:391`) fails when the person cannot be pulled (anchored, buckled, too heavy for the pull force), when the body is being thrown or has no `MOBILITY_PULL`, or when a signal cancels it. Few of those are the stranger refusing. The trespass design in `LLM_CREW_CHANGELOG.md` ("A body that tries to put someone out of its room and cannot tells its head") does not settle it.

## How to test the fix

- `tools/llm_crew/security.ts` already has the would-not-go case at about line 211 (`wantedAfterActing(tech, ..., 'You could not get Pun Pun out of Cargo Bay: they got away from you.')`, then `syncWanted`). Beside it add, each on a fresh brain: "You could not get to it." must give `said(...)` `[]`; "You could not get Pun Pun out of Cargo Bay: it was taking too long." must give `[]`; "You cannot get a hold of Pun Pun." must give the word to the head (unless the owner says otherwise). With fix B, pass the details instead and test with and without `would_not_go: true`. The existing case must still pass.
- Type check the window. Compile the server if B is taken.
- Next round: grep `pda.log` for "trespass". Each such warrant should follow, in `game.log`, a "took hold of [person] to walk them out of" line for the same person. A failed reach logs no line of its own, so one with no "took hold of" before it is this fault.

## Check

Checked by Opus 5.5, read from the code and one throwaway script; not seen in a round.

- The quotes are what the code says today: `WOULD_NOT_GO` at `wanted.ts:58`, the test in `wantedAfterActing` at `wanted.ts:342`, "You could not get to it." at `crew_npc_hands.dm:196` and `:425`, and the two lines in `crew_npc_guarding.dm` (175, 205).
- The path holds: `tool_throw_out` starts an errand with tool `throw_out` (`CREW_TOOL_EVICT`, `_defines.dm:199`). In `crew_npc.bt.json` the errand selector runs `crew_npc_reach` then `crew_npc_do_errand`, and falls to `crew_npc_fail_errand` when the reach fails or times out. `do_errand` checks `can_reach_target_now` before its switch, so `take_hold_of` is never reached in that case. `finish_errand` calls `action_result(tool, FALSE, "You could not get to it.", null)` with `tool` still `throw_out`. `noteResult` in `driver.ts:972` hands `event.text` to `wantedAfterActing`, and no guard before it looks at the wording.
- Ran a throwaway bun script (scratchpad, imports `tools/llm_crew/fixtures` and `jobs/wanted`): a technician given `ok = false`, "You could not get to it." gets `couldNot: [{name: "Pun Pun", ...}]` and `syncWanted` sends "PDA to Quin Master: Quin, I could not put Pun Pun out of the Cargo Bay."; a Quartermaster given the same sends "PDA to Joan Marsh: Warrant for Pun Pun, for trespass in the Cargo Bay."
- Ran the narrowed pattern of fix A against the six server lines: it matches only the got-away line and the cannot-get-a-hold line.
- Nothing in `LLM_CREW_CHANGELOG.md` or the plans chose this on purpose; the trespass entry says a warrant is for someone the body "tries to put out ... and cannot".
- Mended: the write-up's case of a visitor who walks out on the way does not set it off (the reach follows a moving target and `take_hold_of` then answers TRUE); the real cases are someone the body cannot path beside. Fix rewritten with a one-line window fix first. Severity kept at high: it puts a warrant, and then an arrest, on someone who never refused, which is the wrong person acted on, though it needs a visitor the body cannot reach.
