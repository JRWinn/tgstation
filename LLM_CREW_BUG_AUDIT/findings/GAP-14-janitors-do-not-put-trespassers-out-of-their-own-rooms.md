---
id: GAP-14
title: Janitors do not question or put out a trespasser in the Custodial Closet, the owner asked for it on 2026-11-18 and keeping a room is tied to having a post
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
found_by: Fable 5.2
area: janitor
files: code/modules/llm_crew/crew_npc_guarding.dm:144, code/modules/llm_crew/crew_npc_cargo.dm:41, tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:751, LLM_CREW_PLAN_SECURITY.md:399, code/modules/llm_crew/crew_npc_senses.dm:191, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:343
fix: Give every body a list of rooms it keeps (its department's locked rooms), key the guarding code on that list instead of the post, and add guarding to the janitor job
---

## What is wrong

Also written up as: KNA-16

See also: KNB-12 (the same tie of guarding to a post, as part of a wider gap that also covers a janitor opening its own door for someone)

The owner asked on 2026-11-18, after Pun Pun got into the Custodial Closet, for janitors to put out people with no business there, as cargo staff do. It is written down as not built in three places: `LLM_CREW_PLAN_SECURITY.md:399` ("The janitors' duty to put people out of their own rooms, which the owner asked for on 2026-11-18 and is not built"), its risk list (":484, Trespass warrants start in cargo and engineering only... the monkey in the Custodial Closet still needs the Captain"), and the change log's 14:15 entry ("Janitors do not").

The cause is in how the general rule was built. The header of `crew_npc_guarding.dm` says "Any body with a post behind a locked door keeps it: this is not one job's work", which is the owner's "an example is not the scope" rule. But the whole of it hangs on `post_turf`, and a janitor has no post: `learn_starting_places` gives posts to cargo, engineering and security, and the janitor job is `keepsPost: false` because it roams. So the "general" rule covers exactly the jobs that stand at a counter. The same gap will open for every roaming job with a locked room of its own (a botanist's back room, a chef's freezer).

One case: Pun Pun walks into the Custodial Closet behind a janitor. A janitor standing in the closet sees it. `people_in_view` for a janitor carries no `in_post` flag, `syncGuarding` has no post to guard, and the janitor greets the monkey or ignores it. If the window did send `throw_out`, the server would answer "You have no room of your own to put anyone out of." Nothing is said to the Head of Personnel either, so the trespass warrant (`declareTrespass` in `jobs/wanted.ts`) never starts, and the Captain has to notice and declare one by hand.

## Where

`code/modules/llm_crew/crew_npc_guarding.dm:144`:

    /datum/ai_controller/crew_npc/proc/tool_throw_out(handle)
        if(isnull(post_turf))
            action_result(CREW_TOOL_EVICT, FALSE, "You have no room of your own to put anyone out of.")
            return
        ...
        if(get_area(person) != get_area(post_turf))
            action_result(CREW_TOOL_EVICT, TRUE, "[person.name] is not in [post_place] any more.")

`belongs_in_post`, `spot_outside_post`, `take_hold_of` and `put_out` all read `post_turf` and `post_place` the same way. The secure areas plan's Status lists the same limit from the other side: "Not built: Walking someone out of a room other than the post: the server only does it there."

`tgui/packages/tgui/interfaces/CrewBrain/jobs/janitor.ts:751`:

    keepsPost: false,

`code/modules/llm_crew/crew_npc_senses.dm:191`, where people in view are described: both flags need a post (from KNA-16).

    "in_post" = !isnull(post_turf) && get_area(person) == get_area(post_turf), "belongs" = !isnull(post_turf) && belongs_in_post(person),

`crew_npc_guarding.dm:24`, `belongs_in_post`, goes by `post_doors()`, the doors of the post only. `tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:343`, `syncGuarding`, and `:504`, `planGuarding`, are written against `brain.post`.

The server already knows a wider set for every body: `closed_rooms` ("those of its rooms, its post among them, that every door into is locked to the crew at large", `crew_npc_controller.dm:202`), built from `work_area` and `look_in_rooms`.

## How it was found

Read from the code and the three places it is listed. Not seen in a round log by me: the monkey in the closet is from the owner's report on 2026-11-18.

## How to fix it

Make keeping a room a matter of the rooms, not of the post. This also closes the secure areas plan's "a room other than the post".

1. **Server: the rooms a body keeps.** A new list on the controller, `kept_rooms`: the rooms locked to the crew at large that its own ID opens and that belong to its department. The server already works these out for the brain window (`closed_rooms`, `look_in_rooms`, and `crew_brain_rooms.dm`'s locked-rooms list): reuse that, do not hard-code the Custodial Closet. For a body with a post, `kept_rooms` includes the post.
2. **Server: guarding by room.** In `crew_npc_guarding.dm`, give `belongs_in_post`, `why_not_put_out`, `spot_outside_post`, `tool_throw_out`, `take_hold_of` and `put_out` a room argument (default: the post). `tool_throw_out(handle)` uses the kept room the person is standing in. The `in_post` and `belongs` flags in `people_in_view` (`types.ts:52` to `:54`, set at `crew_npc_senses.dm:191`) become "in a room you keep" and "a door of that room opens for them". For `belongs`, ask whether any door of that room opens to the person (`crew_npc_doors_of(room)` and `door.allowed(person)`, as `locked_out_of` does for the body itself); `tool_throw_out` walks them out by the nearest door of that room to a room that is not locked (from KNA-16).
3. **Window.** `jobs/guarding.ts` is already shared code. Find where it requires `brain.post` (for example `expectedCall(brain.post, ...)` at line 152 and the `syncGuarding` entry) and let it run for a kept room the body is standing in. Add its calls to `jobs/janitor.ts` the way `jobs/cargo.ts` and `jobs/engineer.ts` make them (`syncTasks`, `plan`, `overhears`).
4. **A janitor is not always there.** Unlike a technician it questions only while it is in the room, and does not go back to stand guard.
5. **The rules that must hold:** never the Captain or a head (`why_not_put_out` already refuses anyone with command access); someone a workmate sent for is let be (janitors send for nobody today, so the list is empty); a fellow janitor's ID opens the door, so `belongs` is true for them.
6. **Trespass warrant.** `wantedAfterActing` in `jobs/wanted.ts` already tells the head when a `throw_out` fails, for any job. Check it does not test for a post. Then the Head of Personnel declares the warrant, and "the monkey in the Custodial Closet becomes security's business without the Captain", as the security plan wanted.

Question for the owner: should a janitor put someone out of the closet when a workmate janitor is not there to ask "did you send for them?" Today's cargo rule takes a stranger's word for a voucher who is absent.

Second question for the owner (from KNA-16): a janitor is in the closet only now and then, so this guards it only while someone is there. Is that enough, or should a janitor who sees someone go in, or finds the closet wrecked, send word as well?

## How to test the fix

- Simulator: copy the scenario that has a technician put a stranger out of the bay (`intruder` or the like, listed at the top of `tools/llm_crew/sim.ts`) with a janitor in the Custodial Closet and a monkey that will not leave. Check the questions, the hand on the arm, the word to the Head of Personnel, and the warrant.
- A second run with the Captain as the "stranger": nothing is done.
- Server compile, type check. In a round, `grep -n "took hold of" game.log` for a janitor, and "walk failed (evict" or "put ... out of Custodial Closet" lines with a janitor's name.
