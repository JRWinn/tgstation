---
id: HOLE-10
title: Crew owned by two players do not know each other for crew, and nobody can take over a crew whose owner has left
kind: gap
severity: medium
effort: medium
confidence: sure
status: found
area: design
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:938, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1018, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:981, tgui/packages/tgui/interfaces/CrewBrain/expected.ts:32, code/modules/llm_crew/crew_brain_link.dm:67, code/modules/llm_crew/crew_npc_spawn.dm:29
fix: Have the server say of each person seen and heard whether they are a crew NPC, use that in place of "is in my window", and add an admin verb that hands a crew to another owner
---

## What is wrong

The brief's aim is that "each player can spawn their own NPCs", each player's on their own machine. The server side allows it today: any admin who uses "Spawn Crew NPC" or "Spawn Test Crew" gets a link and a window of their own. The window side does not allow for it. Everything that depends on telling a fellow NPC from a player asks one question: is there a brain with that name in **this window**.

What goes by that test:

- **How much two NPCs talk.** `hearSpeaker` lets an NPC answer a fellow NPC once, and then not again for three minutes unless asked a question; a player gets up to six replies (`MAX_REPLIES_PER_TALK`). Another owner's NPC is not in the window, so it is a player: the two answer each other six times each, fall quiet, and start again thirty seconds after one of them next speaks (`TALK_RESET_DS`). The comment there says what that is: "Two NPCs will answer each other for as long as they are let."
- **Quiet at staff meetings.** `shouldWake` returns false for talk from a fellow at a meeting. A head and staff from two windows greet and answer each other through the reports.
- **Who answers a line put to several.** `nearestToSpeaker` compares only the bodies in this window. Two owners' technicians at one counter both answer "can either of you...".
- **Who a line was said to.** `saidTo` is given "the other NPCs aboard" as `[...brains.values()].map((other) => other.name)`: this window's only.
- **What workmates know between them.** The department's list of who has been sent for and let in, who has taken an order, and whose turn it is to look round (`expected.ts`, `takeOrder`, `turns` and `looked` in `jobs/rounds.ts`) are variables in the window's code, "shared by every NPC in this window". GAP-06 writes these up as a break of the senses rule. Here the point is narrower: a technician in a second window, or a human technician, shares none of it. It turns away the janitor the first one sent for, places the same order again, and goes off on rounds at the same moment.

Two more things on the server:

- **Nobody else can see or take over a crew.** `ui_status` closes the window for anyone but `owner_ckey`. If the owner leaves, their crew have no brain for the rest of the round (HOLE-02), and no other admin can open the window, look at what the crew were doing, or become their owner. `add_npc` can move a body to another link, but no verb calls it for a body that already exists.
- **The same test would let a player pass for crew.** Because "fellow" is a name match, a player who happens to have, or takes, the name of an NPC in the window is treated as a fellow NPC: answered once and then mostly ignored, and silenced at meetings. It is a small thing beside HOLE-01, and the same fix closes it.

One concrete case. Two admins each spawn a janitor. The janitors meet in a hallway. Each greets the other as someone "you have not seen before", each is `said_to: 'me'` for the other, and each replies up to six times before `hearSpeaker` stops it. With one owner, the same meeting is one greeting and one reply.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1018`, `hearSpeaker` (the same test is at `:938` in `shouldWake`):

      const fellow = [...brains.values()].some(
        (other) => other !== brain && other.name === event.details.speaker,
      );
      if (talk.replies >= (fellow ? 1 : MAX_REPLIES_PER_TALK)) {
        return false;
      }

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:981`, `nearestToSpeaker`: `for (const other of npcs)`, where `npcs` is this link's list.

`tgui/packages/tgui/interfaces/CrewBrain/expected.ts:32`: `let list: Expected[] = [];` at module level.

`code/modules/llm_crew/crew_brain_link.dm:67`:

    /datum/crew_brain_link/ui_status(mob/user, datum/ui_state/state)
    	return user.ckey == owner_ckey ? UI_INTERACTIVE : UI_CLOSE

## How it was found

Read from the code. Not seen: there has only ever been one owner.

## How to fix it

1. **The server says who is crew.** In `look_around`, add `"npc" = istype(person.ai_controller, /datum/ai_controller/crew_npc)` to each entry of `people_in_view`, and in `on_pre_hear` add the same as `details["npc"]` for the speaker. This is a fact about the world the code already leans on; it is not put in any prompt.
2. **The window goes by it.** Replace both `fellow` tests with the event's `npc` detail (for speech) or the person's `npc` field. Give `saidTo` the names of people in view as it has now; it does not need to know who is an NPC.
3. **Who answers a line put to several, across windows.** Without a shared list, each window can still decide alone if the server helps: add `details["nearest_npc"]` to a heard line, TRUE for the crew NPC nearest the speaker among all that heard it. That needs the hearers of one line gathered for a tick on the server. A cheaper rule that needs nothing shared: each NPC waits a time in proportion to its distance from the speaker before answering, and does not answer if it hears someone else answer first.
4. **Workmates' lists.** Follow GAP-06: say them aloud or send them by PDA, and have each NPC keep its own copy from what it hears. Then a second window, and a human at the counter, are covered by the same change.
5. **Handing a crew over.** An admin verb "Take Over Crew NPCs" that lists links whose owner has no client, and moves every NPC of the chosen link to the caller's link with `add_npc`. `add_npc` gives each a new id, which is what is wanted: the new window makes new brains. With HOLE-02's saved memory, key the saved copy by the body, not by the id, so that it comes across.
6. **Looking without owning.** Let any admin with `R_ADMIN` open another owner's window read-only: `ui_status` returns `UI_UPDATE` for them, and the window, told it is read-only in `ui_data`, shows the cards and runs no brain (no `ingest`, no `act`). Today a second window on the same link would run a second set of brains against the same bodies, which is why it is closed to all but the owner.

Question for the owner: is more than one owner wanted soon? If the next step is one owner with more bodies (HOLE-09), only steps 1, 2 and 5 are worth doing now.

## How to test the fix

- `tools/llm_crew/addressing.ts`: cases where the speaker is marked `npc` and is not in the brain map.
- Simulator: `sim.ts` builds one window. A cheap test of steps 1 and 2 is a scenario with one body in the window and a second "NPC" played by the simulator as a plain speaker marked `npc`: the check is one reply, not six.
- Type check and server compile.
- In a round with two admins, each spawning a janitor: `game.log` should show one greeting and one reply when they meet.
