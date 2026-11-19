---
id: HOLE-07
title: The crew hear no station announcement, so nobody goes to the emergency shuttle or takes note of an alert level
kind: gap
severity: medium
effort: large
confidence: sure
status: found
area: design
files: code/modules/llm_crew/crew_npc_senses.dm:380, code/__HELPERS/priority_announce.dm:40, code/__HELPERS/priority_announce.dm:202
fix: Give every conscious body on the station a sense event for each station announcement, and build one shared duty on top of it, going to the shuttle when it is called
---

## What is wrong

A station announcement is the game's loudest sense: the emergency shuttle being called, recalled and docked, the alert level going to red, a meteor warning, a communications blackout, the engine coming apart, a nuclear device armed. Every player aboard hears and reads it. No crew NPC does.

- `priority_announce` and `minor_announce` hand their text to `dispatch_announcement_to_players`, whose list is `GLOB.player_list`: mobs with a client. A crew body has no client and is not on it. Nothing is sent through `Hear`, so `on_pre_hear` never runs for an announcement.
- Nothing in `code/modules/llm_crew/` looks at `SSshuttle.emergency`, at `SSsecurity_level`, or registers for any signal about either. A grep for "emergency", "evac", "announce", "alert" and "security_level" in the crew's server code finds nothing but the supply shuttle. In the window code "emergency" is only the name of a task's urgency.

What that means in a round:

- **The Captain calls the shuttle and the crew carry on mopping.** The shuttle docks, waits and leaves. Eleven bodies stay aboard. A player Captain who says "everyone to the shuttle" to one crew member in earshot is answered by the model in words, and nothing is done: there is no work of that kind for `takeToldWork` to take on.
- **Alert level changes mean nothing.** On red alert a human officer draws a weapon and heads to the trouble. The crew's security staff act on warrants and nothing else.
- **The engine's own warnings are not heard.** The engineering plan notes that the supermatter's warnings "go out on the Engineering radio channel" and that a body does not hear its radio. The Chief Engineer reads the engine from its PDA once a minute instead. The station-wide announcement at the end ("delamination imminent") is not heard either.
- **The model is asked to talk with no idea of any of it.** A player says "why are you still cleaning, the shuttle is here" and the crew member has nothing in its prompt that says there is a shuttle.

At round end nothing breaks: the bodies are simply left. On the next round everything on the server starts fresh (`GLOB.crew_brain_links` and `GLOB.crew_npc_station_places` are remade with the world), and the window is reloaded with the client, so there is no stale state to carry over.

## Where

`code/__HELPERS/priority_announce.dm:40` and `:202` (base game):

    /proc/priority_announce(text, title = "", sound, type, sender_override, has_important_message = FALSE, list/mob/players = GLOB.player_list, encode_title = TRUE, encode_text = TRUE, color_override)

    /proc/dispatch_announcement_to_players(announcement, list/players = GLOB.player_list, sound_override = null, should_play_sound = TRUE)

`code/modules/llm_crew/crew_npc_senses.dm:380`, `on_pre_hear`, is the crew's only ear. It is reached only through `Hear`, which announcements do not use.

## How it was found

Read from the code, with greps of `code/modules/llm_crew/` and the window code for any mention of the emergency shuttle or an alert. None of the plans or the change log speaks of evacuation, the shuttle, or an alert level.

## How to fix it

Two parts: the sense, which is small, and what is done with it, which is the owner's to decide.

**The sense.**

1. Add a sense kind, `CREW_SENSE_ANNOUNCEMENT "announcement"`, in `_defines.dm`.
2. Feed it without asking the base game for more than one line. Either:
   - (a) add `SEND_GLOBAL_SIGNAL(COMSIG_GLOB_STATION_ANNOUNCEMENT, announcement_text, title)` at the top of `priority_announce` and `minor_announce` (a new define, and a fourth base-game file edited), and have the `crew_npc` subsystem register for it; or
   - (b) with no base edit, have the subsystem register for `COMSIG_SECURITY_LEVEL_CHANGED` on `SSsecurity_level`, and check `SSshuttle.emergency.mode` once every few seconds from a timer on the subsystem, emitting when it changes (called, recalled, docked, about to leave).
   I would take (a): it also carries meteor warnings, blackouts and the engine's last warning, and it is the same text a player reads.
3. On each announcement, for every crew controller whose body `can_sense()`, is on a station level and is not deaf, call `emit_sense(CREW_SENSE_ANNOUNCEMENT, "The station's speakers announce: \"[title]. [text]\"", list("title" = title, "message" = text, "shuttle" = the shuttle's state if it is about that, "alert" = the new level if it is about that))`. Strip the markup and cut the text to a few hundred characters.
4. In the window, `describeEvent` already writes any event as a line for the model. Add nothing to `shouldWake` for it: an announcement is context, not something to answer. That keeps the prompt budget: it is one line among the events, pushed out by newer ones.

**What is done with it.** A shared duty, in the layer the owner's notes call "shared duty", not in any one job:

5. In `ingest`, keep `brain.evacuation = { state: 'called' | 'docked' | 'leaving', at }` from the event's `shuttle` detail, and clear it on a recall.
6. In `tasks.ts`, a task kind `evacuate`, urgency `emergency`, source `own`, added while `brain.evacuation` stands. Its plan: while the shuttle is on its way, carry on working until a set time before it docks (the announcement gives the time); then `go_to` the departures room; once it has docked, walk aboard. Boarding is walking into the shuttle's area, which is a room like any other once docked: `crew_npc_station_places()` would need the docked shuttle's area added for the walk, and that is the one new piece of server code.
7. Things only the owner can settle are below. Build none of them without an answer.

Questions for the owner:
- Does everyone go, or do some stay at their posts until the end (engineering with the engine, security with prisoners)?
- What do security do with people in the cells: bring them, or leave them?
- Does a head see its staff aboard before it boards?
- On a recall, does everyone walk back to work?
- Should the alert level change anything yet, or is it only to be known and spoken of?

## How to test the fix

- Server compile.
- Simulator: add an `announcement` event to `sim.ts` and a scenario where the shuttle is called three minutes in. Checks: each brain's prompt has the line, nobody answers it aloud, and (once the duty is built) every body ends in the departures room.
- In a round: call the shuttle as Captain. `game.log` should show each body's walk to departures, and `crew_brain.log` the `ROUTINE` step that says why.
