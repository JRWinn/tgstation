---
id: KNB-13
title: A hauler never asks whoever its crate caught on to step aside - the ask waits until every regrip is used up, and then the model's own line is said in its place
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: driver
files: tgui/packages/tgui/interfaces/CrewBrain/driver.ts:470, tgui/packages/tgui/interfaces/CrewBrain/driver.ts:726, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1400, code/modules/llm_crew/crew_npc_grip.dm:118, code/modules/llm_crew/crew_brain_link.dm:195
fix: Say the step-aside ask word for word and while the body is busy taking the crate up again, and have wait_for_way wait until the person has moved
---

## What is wrong

The change log lists this three times and never gives the cause:

- 13:30 entry (2026-11-18), "Known and not fixed", (18): "A crate was dropped five times at the Cargo Lobby shutters with someone standing beside it. Not looked into."
- 15:00 entry, "Not built", (8): "The crate dropped at the lobby door ... Nothing asks it to move until the haul has been given up."
- 18:05 entry, "Seen and left alone": six lost grips on the stairs at (77,148), "each time with Monte Mcmullen is standing in the way ... and did not move".

`GAP-18` row 4 names it as not built. It is built. It does not work, for two reasons, both in the window code.

**1. The ask cannot be made while the crate is being taken up again.** When a grip is lost with someone in the way the server sends `in_the_way` and at once sets the body to take the crate up again (`go_back_for`). From that instant the server reports the body as `walking` (`seeing_to_crate`, then the errand to the crate, then the haul's walk). The ask is a step in `nextStep`, and `drive` does not call `nextStep` for a busy body. So through all three regrips nothing is said. The three seconds the server waits "to give whoever it caught on a moment to get out of the way" (`wait_for_way`) are spent waiting on someone who has not been asked. The ask is first possible when the haul has been given up.

**2. When it is at last made, it is not what is said.** The step carries `say` with no `exact` and no `needs`. Such a line is only a fallback: if the model's reply has a `say` in it, the model's line goes out and the coded one is thrown away. The model is at that moment answering whatever else is pending, so the line that goes out is about something else and is said to someone else. `asideOverhears` on the other body needs the words ("step aside", "let me past" and so on), so nobody moves.

One concrete case, from `data/logs/2026/11/18/round-17.48.05` (line times are log times):

- 23:59:46.0, 23:59:49.7, 23:59:53.7: Joi Seelig, hauling crate #7740 out to the lobby, loses its grip three times at (77,148) with "Next to the crate: Monte Mcmullen at (77,147)". Monte is at the counter, its post. Nothing is said to Monte in those eight seconds.
- 23:59:53.7: "has given up hauling ... and is putting it clear of the doors". 23:59:55.5: "could not get the ... crate clear of the doors. It lies at Cargo Bay (77,148,2)". The crate is left on the stairs, where the owner saw it.
- 00:00:00.147, `crew_brain.log`: the routine step is taken at last: `say("Excuse me, Monte, could you step aside, please? I need to get this past you.")`.
- 00:00:01.466, `game.log`, what Joi actually said: "Good day to you, Mr. Briner. Please be advised that crate #7740 is already being released into the care of Mr. Monte Mcmullen at the counter for Miss Corrine Raub."
- Monte never steps aside. The next go at the haul loses its grip on Monte three more times (00:00:19 to 00:00:28).

Across the ten rounds from 12:23 on 2026-11-18 the routine step "ask X politely to step aside" was taken 26 times (`crew_brain.log`), and the words "Excuse me" are in `game.log` not once.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/driver.ts:470`, in `nextStep`. No `exact`, no `needs`:

      if (blocker && !inBackoff(brain, ASIDE_KEY)) {
        return {
          key: ASIDE_KEY,
          text: `${blocker.name} is standing in the way, and you could not get past them with what you were hauling. In "say", ask ${blocker.name} politely to step aside.`,
          say: `Excuse me, ${blocker.name.split(' ')[0]}, could you step aside, please? I need to get this past you.`,
        };
      }

`driver.ts:726`, in `drive`. A busy body does not reach `nextStep`:

      const busy = brain.walking || !!brain.doing || !!brain.lastAct;
      ...
      if (
        !brain.awake ||
        (busy && !dropFor && !dropToLeave && !dropToMove) ||

`code/modules/llm_crew/crew_brain_link.dm:195`, why it is busy all through a regrip:

    "walking" = (npc.blackboard_key_exists(BB_CREW_NPC_WALK_TARGET) && npc.walk_tool != CREW_TOOL_RETURN) || npc.blackboard_key_exists(BB_CREW_NPC_ERRAND_TARGET) || npc.blackboard_key_exists(BB_CREW_NPC_STORAGE_TARGET) || npc.seeing_to_crate,

`code/modules/llm_crew/crew_npc_grip.dm:70`, `crate_got_away`: the body sets off before the brain is told, on purpose:

    		// Set off first, then say so: the brain hears of it with the body already busy.
    		go_back_for(crate, tool)
    		emit_sense(CREW_SENSE_KNOWLEDGE, "You lost your grip on the [hauled_name][person ? ": [person.name] is standing in the way" : ""]. You are going back to take hold of it again.", details)

`crew_npc_grip.dm:118`, the wait that nobody was asked to use:

    /datum/ai_controller/crew_npc/proc/wait_for_way(obj/structure/closet/crate/crate)
    	if(haul_tries && !isnull(who_is_in_the_way(crate)))
    		stand_still(CREW_NPC_REGRIP_WAIT)

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1400`, in `think`: the coded line is used only when the model gave none.

        } else if (
          mustSay &&
          !alone &&
          !actions.some((action) => action.tool === 'say')
        ) {
          actions.unshift({ tool: 'say', text: mustSay });
        }

## How it was found

Read from the code, then checked against the round logs. Commands run, from `data/logs/2026/11`:

- `grep -c 'could not get past them with what you were hauling' <round>/crew_brain.log` gives 1, 1, 2, 5, 4, 1, 6, 2, 0, 4 for the ten rounds from `18/round-12.23.07` to `19/round-20.43.32`.
- `grep -c 'Excuse me' <round>/game.log` gives 0 for every one of them.
- The 17:48 lines quoted above are `game.log` lines 612 to 662 and `crew_brain.log` line 472.

Not seen: a case where the model happened to keep the words. Not run: the simulator. Its `aside` scenario has a quiet model, which gives no line, so the fallback goes out and the scenario passes.

Two things beside this fault that the same logs show, not written up separately:

- `who_is_in_the_way` (`crew_npc_doors.dm:837`) looks only for `/mob/living/carbon/human`. In the 14:28 and 17:48 rounds four grip losses each have "Next to the crate: Citrus" (the cargo sloth, a dense animal that a crate cannot pass) and nobody else. Those regrips have no wait at all: three tries went in three seconds at 00:19:53 to 00:19:56.
- Once asked, the other body stands six seconds or more before it moves. That is `DRV-03`. The fix below leans on that one being done too.

## How to fix it

1. In `driver.ts`, make the ask a line said word for word: add `exact: true` to the `ASIDE_KEY` step. It carries a name and the other body acts on its words, which is what `exact` is for. `withRemark` (`jobs/reports.ts`) still lets the model add a remark after it.
2. In `drive`, say it while busy. Beside the `whileBusy` block (`driver.ts:701`), add: if `brain.inTheWay` is fresh, the blocker is in `peopleInView`, and `ASIDE_KEY` is not in backoff, then `fail(brain, ASIDE_KEY)`, `speak(line, undefined, undefined, true)` and return the step. Move the making of the line into one small function so `nextStep` and `drive` share it. Keep the `nextStep` copy for a haul that has already ended.
3. Clear `brain.inTheWay` when the ask has been made (in `noteDone` for `ASIDE_KEY`), so a stale note from one haul is not said during the next. A new grip loss sets it again.
4. On the server, make the wait worth having. `wait_for_way` (`crew_npc_grip.dm:118`) is called straight after `start_walk` (`crew_npc_cargo.dm:607`, `crew_npc_freight.dm:466`, `crew_npc_held.dm:339` and `:405`) and holds the walk with `stand_still`, which does not sleep: it sets `talk_hold_until` and `keep_still` (`crew_npc_doors.dm:25`) looks at it every half second. Hold for about eight seconds in place of three, and add a check of its own on a half-second timer that sets `talk_hold_until = world.time` as soon as `who_is_in_the_way(crate)` names nobody, so the body sets off the moment the way is clear. The timer must carry `errand_serial` and stop if it has changed, as `take_up` does.
5. Do `DRV-03` with this (step aside left out of the talk hold), or the eight seconds will not be enough.
6. For the animal: in `who_is_in_the_way`, or beside it, note a dense `/mob/living` that is no human standing beside the load. There is nobody to ask. The plain thing a player does is go round, or wait a moment for it to wander. Wait the same few seconds and try again, and say in `log_haul` that an animal was in the way. Whether a body should shove a pet aside is the owner's to say. Do not move it by code.

What must keep working: a dead model still says the plain line (it does: `exact` lines are said whatever the model gives). The ask stays one line, once in the backoff time for `ASIDE_KEY`. Nobody is asked who is not in view.

## How to test the fix

- Type check. Then `tools/llm_crew/sim.ts chatty aside` several times: with a chatty model the hearer must now hear "step aside" every time. Before the fix a chatty run can fail where a quiet run passes.
- Add to the `aside` scenario (or a new one) a check that the ask is said before the haul reports failed, not after: the simulator's haul would have to lose its grip once with a person beside the crate (`details.in_the_way` and `regrip` in the sense event, as `crate_got_away` sends them).
- Server compile to a side copy.
- Next round: `grep -c 'Excuse me' game.log` should be above 0, each one within a second or two of a "lost its grip ... Next to the crate: <a person>" line, and "has given up hauling" lines with a person named beside the crate should be rare.
