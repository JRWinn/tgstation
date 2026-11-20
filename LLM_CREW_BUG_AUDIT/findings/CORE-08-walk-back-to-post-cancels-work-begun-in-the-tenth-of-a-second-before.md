---
id: CORE-08
title: The walk back to the post starts a tenth of a second after it is decided without looking again, and silently cancels any walk, errand or search the brain began in between
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: core
files: code/modules/llm_crew/crew_npc_cargo.dm:241, code/modules/llm_crew/crew_npc_tools.dm:397, code/modules/llm_crew/crew_npc_motor.dm:13
fix: Start the return walk through a small proc that first checks no walk, errand or search has begun and the body is still off its spot, and does nothing if one has
---

## What is wrong

When a body with a post has strayed from its spot, the idle wander calls `return_to_post`, which does not walk at once but sets a timer:

    	// Started a moment later, so the wandering this is called from has finished before it is replaced.
    	addtimer(CALLBACK(src, PROC_REF(start_walk), post_turf, CREW_TOOL_RETURN, post_place, CREW_NPC_WALK_TIMEOUT), 0.1 SECONDS)

When the timer fires it calls `start_walk` straight away. `start_walk` cancels whatever search and errand are going (`cancel_search()`, `cancel_errand()`, neither of which reports anything) and replaces whatever walk is going. Nothing checks whether the body was given something to do in that tenth of a second.

The window counts the body as free while it is idling (it is), so a tool call can arrive in that gap. If it does:

- a `pick_up`, `clean`, `tidy`, `release` or other errand is cancelled with no result;
- a `go_to` or other walk is replaced by the return walk, and since `walk_finished` returns early for a replaced walk and a return walk reports nothing, the brain hears nothing at all;
- a `search` is dropped.

The window then waits `LOST_ACT_MS` (12 s), counts the step as failed and backs off it. The body walks back to its counter instead.

It is a small window, but a body at a post strays and comes back many times a shift, and the moments it is idle are the moments the window sends it work. It is also a step that would get worse if anything made the timer longer.

## Where

`code/modules/llm_crew/crew_npc_cargo.dm:231`, `return_to_post`:

    	COOLDOWN_START(src, post_return_cooldown, CREW_NPC_POST_RETURN_COOLDOWN)
    	// Started a moment later, so the wandering this is called from has finished before it is replaced.
    	addtimer(CALLBACK(src, PROC_REF(start_walk), post_turf, CREW_TOOL_RETURN, post_place, CREW_NPC_WALK_TIMEOUT), 0.1 SECONDS)
    	return TRUE

`code/modules/llm_crew/crew_npc_tools.dm:397`, `start_walk`:

    	resting = FALSE
    	// Being sent somewhere ends any search or errand the body was on.
    	cancel_search()
    	cancel_errand()
    	set_blackboard_key(BB_CREW_NPC_WALK_TARGET, target)

## How it was found

Read from the code. Not seen in a round; it would show as a step the window logged as sent with no result, followed by the body walking back to its post.

## How to fix it

1. Add `/datum/ai_controller/crew_npc/proc/start_return_walk()`. It returns at once if `blackboard_key_exists(BB_CREW_NPC_WALK_TARGET)`, `BB_CREW_NPC_ERRAND_TARGET` or `BB_CREW_NPC_STORAGE_TARGET`, if `resting`, if `in_custody()`, if `world.time < talk_hold_until`, or if the body is already within `CREW_NPC_POST_LEASH` of `post_turf` or no longer in its post room. Otherwise it calls `start_walk(post_turf, CREW_TOOL_RETURN, post_place, CREW_NPC_WALK_TIMEOUT)`.
2. Point the timer in `return_to_post` at it instead of at `start_walk`.
3. Keep the cooldown as it is.

## How to test the fix

- Server compile.
- Hard to hit by hand. Temporarily raise the timer to 3 seconds in a test build, then send a cargo technician a PDA order in those 3 seconds: without the fix the order's walk is lost, with it the order is carried out.
