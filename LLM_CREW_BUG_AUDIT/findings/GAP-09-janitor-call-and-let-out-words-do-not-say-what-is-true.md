---
id: GAP-09
title: A technician still does not know its workmate called a janitor, and a janitor leaving for water still says "I am done" (no-cheats plan 4.3, approved, not built)
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: janitor
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1550, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:381, code/modules/llm_crew/crew_npc_guarding.dm:235, LLM_CREW_PLAN_NO_CHEATS.md:116
fix: Send who called whom in place of the yes or no, word the waiting step with it, and give the let-out message its true reason (done, dry mop, cannot shift it)
---

## What is wrong

`LLM_CREW_PLAN_NO_CHEATS.md` section 4.3 (one of the three round faults the owner said to fix as suggested) has four parts. None is built. The change log's 13:30 entry says so for two of them ("The 'my mop has run dry, I will be back' line and the door reopened without a second call (plan 4.3) are not built either").

1. **The second technician's work list.** When a workmate has sent for a janitor, the plan wants: "There is a mess in the Cargo Bay. Maria Williams has sent for Ysabel Harrold. If nobody has come in a while, you will call one." Today the step reads as if nobody had been called, which is why Sam told the Captain "not yet" in `round-00.56.30` after Maria had called four times.
2. **The server sends who called whom**, not a yes or no. `workmate_called` is still a boolean, though the server holds the caller's name (and could hold the janitor's).
3. **A janitor asking to be let out says why.** Mess gone: "I am done in the Cargo Bay...". Out of water: "My mop has run dry. Could you let me out of the Cargo Bay to the Fore Port Maintenance, please? I will be back." Cannot shift it: as today. Today the PDA message to whoever let it in always begins "I am done in the", whatever the reason.
4. **A janitor who left for water is still expected**, and the door is opened for it again without a second call.

One case for part 3: a janitor with a mop and no bucket is let into the Cargo Bay for five oil pools. After two the mop is dry (`mop_needs_water`, no water in sight). It wants out, nobody is in sight, it knocks and then sends the technician "I am done in the Cargo Bay and am at the Cargo Lobby door. Could you let me out to the Cargo Lobby, please?" The technician's brain takes that at its word. The mess is still there, the janitor is now off the list of people inside, and when it comes back with a wet mop it has to be vouched for again.

Part 4 is partly covered since: `noteLetOut` (`expected.ts:106`) now strikes only the note that the janitor is inside and lets the call stand for its twenty minutes (15:00 change log entry, item 4), so the janitor is let back in while the call is fresh. What is still missing is the words, and the technician knowing the janitor means to come back.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/cargo.ts:1550`, in `tidyStep`:

    if (
      brain.workmateCalled ||
      brain.now - task.createdAt < NOTICE_DS + stagger(brain, CALL_STAGGER_DS)
    ) {
      return {
        ready: false,
        step: `There is a mess in the ${place}. If no janitor comes by soon, you will call one.`,
      };
    }

`code/modules/llm_crew/crew_npc_guarding.dm:235`:

    /datum/ai_controller/crew_npc/proc/workmate_called_janitor()
        var/list/last_call = post_place ? GLOB.crew_npc_janitor_calls[post_place] : null
        if(isnull(last_call))
            return FALSE
        var/mob/living/carbon/human/body = pawn
        return last_call[1] != body.real_name && world.time - last_call[2] < CREW_NPC_CALL_STANDS

and `note_janitor_called` stores only `list(body.real_name, world.time)`: the janitor's name is not kept.

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:381`:

    text: `I am done in the ${brain.location} and am at the ${doorCalled(brain, brain.location)}door. Could you let me out${outTo}, please?`,

The spoken ask at `driver.ts:351` gives no reason at all, which is true but tells the host nothing.

## How it was found

Read from the code against the plan. The round's lines are quoted from the plan, not reread in the log.

## How to fix it

1. Server: `note_janitor_called(to_name)` takes the janitor's name (its one caller in `tool_message`, `crew_npc_cargo.dm:737`, has `to_name`; the resend path at `:780` has it too). Store `list(body.real_name, world.time, to_name)`. `workmate_called_janitor()` returns `null` or `list("by" = ..., "to" = ...)`. Send it as `workmate_called` in `crew_brain_link.dm:169`. (GAP-06 asks whether this global is allowed at all. If the owner says no, the same two names come from hearing the workmate say "I have sent for Ysabel", and this step changes to that.)
2. Window: `types.ts` `workmate_called?: { by: string; to: string } | null`, `brain.workmateCalled` the same. In `tidyStep` split the two reasons: with a workmate's call, the step is `There is a mess in the ${place}. ${by} has sent for ${to}. If nobody has come in a while, you will call one.`
3. Window, `driver.ts` near line 340: work out why it wants out, from what the brain already holds: `brain.mopNeedsWater && !brain.waterFrom` is "dry"; a clean result with `beyond` for this room is "cannot shift it"; else "done". Use it in the spoken ask and in the PDA message:
   - dry: `My mop has run dry. Could you let me out of the ${brain.location}${outTo}, please? I will be back.`
   - done: as today.
4. Window, `jobs/cargo.ts` `readsMessage` and the spoken-ask reader: on "I will be back" call `noteLetOut(post, name, room)` as now and nothing more, so the call stands. On "I am done" or "beyond me" the existing paths apply. Add the case to the door cue (`doorCue`) so the technician's LLM is told "Ysabel has gone for water and is coming back".

## How to test the fix

- Simulator, from the plan's list: "the second technician says who was called" (ask the second technician "have you called anyone?" and check the step text holds both names) and "a janitor runs dry in a locked room, leaves, comes back and is let in" with one call in `pda.log`, not two.
- `tools/llm_crew/voice.ts`: the plan's case "have you called anyone?" against the real model, when the graphics card is free.
- Type check and server compile.
