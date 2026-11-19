---
id: GAP-06
title: Workmates share lists in code that no body saw, heard or was sent (the brief's decision 4 has quietly stopped being true)
kind: gap
severity: medium
effort: large
confidence: sure
status: found
area: design
files: tgui/packages/tgui/interfaces/CrewBrain/expected.ts:32, tgui/packages/tgui/interfaces/CrewBrain/jobs/rounds.ts:46, code/modules/llm_crew/crew_npc_guarding.dm:235, code/modules/llm_crew/crew_npc_freight.dm:138, code/modules/llm_crew/crew_npc_held.dm:43
fix: Ask the owner whether a department's shared list is allowed, then either write the exception into the brief or carry each list by speech, PDA or something the body can read
---

## What is wrong

`LLM_CREW_BRIEF.md` decision 4: "Senses only, no mind reading... **No hidden shared data channel between NPCs.** Station-wide awareness arrives through in-game means (radio, alarms, PDA)." The audit's rules repeat it: "No hidden channel between them. Hand-offs between workmates are said aloud or sent by PDA." The brief's section 7 adds: "Keep their contexts separate in the window."

No plan or change log entry reverses this. But the code now has at least seven channels by which one crew member knows what another did without seeing, hearing or being sent it:

In the window (module state shared by every NPC in one window):

| Where | What is shared |
| --- | --- |
| `expected.ts:32` `list` | Who a post has sent for, to which room, who let them in, who is still inside |
| `expected.ts:142` `taken` | Which technician has taken an asking, so the other does not order too |
| `jobs/rounds.ts:46` `turns`, `:47` `looked` | Whose turn it is to look round, and when each room was last looked in on |

On the server (globals and direct calls between controllers):

| Where | What is shared |
| --- | --- |
| `crew_npc_guarding.dm:235` `workmate_called_janitor`, `GLOB.crew_npc_janitor_calls` | That a workmate has sent a janitor a PDA message |
| `crew_npc_freight.dm:138` `GLOB.crew_npc_crate_claims`, `crew_npc_held.dm:69` `crew_npc_held_claims` | Which crate a workmate has set off for |
| `crew_npc_held.dm:43` `GLOB.crew_npc_held_crates` (sent as `held_crates`) | Every crate held for collection, its number and who it is for, to every cargo body |
| `crew_npc_doors.dm:605` `their_controller.door_opened_for(...)` | A body is told a door was opened for it, and which, whether or not it can see the door |

The first three are described in their own comments as a fiction ("the clipboard by the counter that everyone who works there can read", "the way a word said across the counter would be"), but there is no clipboard and no word: the write is a function call.

Why it matters, one concrete case. The brief's vision is that each player runs their own NPCs in their own window (decisions 5 and 7). Player A owns technician Sam, player B owns technician Maria. Sam sends for a janitor to the Cargo Bay: `expectSomeone` writes to A's window only. The janitor knocks while Sam is on the shuttle. Maria's brain in B's window has no call on its list (`expectedCall` returns undefined, `jobs/guarding.ts:152`), so the janitor is a stranger with no business there: Maria questions it, and may walk it out by the arm. Meanwhile the server-side globals *are* shared across owners, so Maria does know (by `workmate_called`) that a janitor was called and does not call another. The crew behaves one way with one owner and another way with two, which is the sign that these are not senses.

The same lists are lost when the window reloads (the known memory wipe), while the server-side ones are not, so after a reload a technician evicts the janitor its workmate let in.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/expected.ts:10`:

    * It is kept per department, under the name of the department's post, and shared by every NPC in
    * this window that works there.
    ...
    let list: Expected[] = [];

`tgui/packages/tgui/interfaces/CrewBrain/jobs/rounds.ts:157`:

    // Its turn from this moment, before it has so much as opened its mouth: two who decide in
    // the same second would otherwise both go.
    turns[brain.post] = { by: brain.name, at: brain.now };

`code/modules/llm_crew/crew_npc_guarding.dm:235`:

    /datum/ai_controller/crew_npc/proc/workmate_called_janitor()
        var/list/last_call = post_place ? GLOB.crew_npc_janitor_calls[post_place] : null
        ...
        return last_call[1] != body.real_name && world.time - last_call[2] < CREW_NPC_CALL_STANDS

`LLM_CREW_PLAN_SECURE_AREAS.md:108` is where the first of these was proposed ("kept on the department's shared list of who is expected") and the owner said go ahead to that plan as a whole. `LLM_CREW_PLAN_NO_CHEATS.md` 4.3 proposes widening the server one ("the server sends who called whom").

The owner's own words on this, from the design notes of 2026-11-17: hand-offs between workmates are to be "said out loud, not settled silently", and, of two technicians, "the second must know who the first sent for". The answer given then was "the department keeps one shared list of who is expected and for which room, **and the caller also says it aloud to a workmate in view**". The owner said "build it". The shared list was built. The saying aloud was not, and the notes record that: "Not built: the caller saying it aloud to a workmate, which I had told the user would happen."

## How it was found

Read from the code against the brief. The two-owner case is reasoned, not run: spawning is admin-only today and there has only ever been one owner.

## How to fix it

This is the owner's to decide first. The question: **is a department allowed a shared list that is not a thing in the game?**

If yes: write it into `LLM_CREW_BRIEF.md` under decision 4 as the one exception, and move the window lists to the server (one datum per post, sent to each body that works there) so that two owners and a reloaded window see the same thing. That is a medium change: `expected.ts` and the two records in `rounds.ts` become fields of `ui_data`, and their writers become two small tool calls.

If no (what the brief says), each channel has an honest carrier already built for something else:

1. **Who was sent for.** The technician who calls a janitor says so aloud at the post, word for word ("I have sent for Ysabel to the Cargo Bay."), as `rounds.ts` already has it say "I am going to look in on the...". Workmates in earshot note it from `overhears`. Out of earshot they do not know, and ask: `guarding.ts` already has the question "did you send for X?" and its answer (`vouchAsked`, `verifyHeard`). The Quartermaster plan's order book shows the other way: write it on paper at the post.
2. **Who took the order.** "Order N, right away." is already said aloud and read by code (`jobs/supply.ts`). Use hearing it in place of `takeOrder`.
3. **Rounds.** `turns` is already backed by the spoken line. Set it from hearing the line (and from saying it), not before. Drop `looked`, or fill it from hearing "I have looked in on the X."
4. **Janitor called** (`workmate_called`): same as 1.
5. **Crate claims.** A body can see a workmate walking at or pulling a crate: `people_in_view` could carry "is hauling crate #N", and the claim becomes what is seen. Keep the global only as the tie-break for the same tick.
6. **Held crates.** A held crate has a label stuck on it with its number and who it is for (`label_crate`). A cargo body knows the held crates it has seen the labels of. Today every cargo body knows all of them from the moment the order docks.
7. **Door opened for you.** Send it only if the body can see the door or the opener (`can_see`), or hears the opener say so.

Each of these adds speech, which the prompt budget and the two-NPCs-chatting rule have to carry, so it is not free. I would take the first option (allow it, make it the server's, write it down) unless the owner wants the stricter rule.

## How to test the fix

- Whichever way: a simulator scenario with two technicians where the second was out of the bay when the first called the janitor, and the janitor then knocks. Today it passes only because both brains share one module.
- If the lists move to the server: `tools/llm_crew/sim.ts` must play that datum, and a scenario that reloads the window mid-visit should show the visitor still let out.
- Type check and the existing door scenarios.
