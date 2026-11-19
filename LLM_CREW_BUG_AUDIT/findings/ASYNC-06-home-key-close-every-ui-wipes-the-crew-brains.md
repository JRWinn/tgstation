---
id: ASYNC-06
title: The Home key, the game's own close-all-windows key, closes the Crew Brain window and wipes every crew member's memory
kind: bug
severity: critical
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: code/datums/keybinding/client.dm:94, code/controllers/subsystem/tgui.dm:297, code/datums/cinematics/_cinematic.dm:81, tgui/packages/tgui/interfaces/CrewBrain/index.tsx:93, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:198
fix: Leave the Crew Brain window out of close-every-window (the Home key and the cinematic), so that only its own close button or the owner leaving shuts it
---

## What is wrong

See also: HOLE-02 and GAP-12, which say that closing the window wipes every brain and propose keeping memory on the server. They name a disconnect, a crash and closing the window by hand. This finding adds the commonest way it will happen, which those do not name, and a small fix that stops it without waiting for the larger one.

/tg/station binds the Home key to "Close Open UIs" by default. It calls `SStgui.close_user_uis(user.mob)` with no window named, which closes every tgui window the player has open. The Crew Brain is a tgui window like any other, so it closes too. The window's `useEffect` cleanup runs `stopSession`, which clears every brain: tasks, warrants, who is shut in where, meetings, feelings, what each was told. The crew do nothing more until the owner reopens the window with the admin verb, and then they start the shift again from nothing (a second first meeting, reports of the whole shift, warrants gone: see HOLE-02).

The owner plays the Captain in the game window, with the Crew Brain window open beside it. Players press Home to clear away the vending machine, PDA and console windows that pile up, many times a round, without thinking of it as "closing the Crew Brain".

The same call is made when a cinematic plays (the station blowing up, or a nuke), for everyone watching it.

Concrete case: ten minutes into a round the Captain has opened a few consoles and presses Home to tidy the screen. The Crew Brain window goes with them. The Head of Security's warrant on Pun Pun and the janitor shut in the Bitrunning Den are forgotten; the officer stops mid-arrest; no NPC moves again until the owner notices and runs the verb.

## Where

`code/datums/keybinding/client.dm:94`:

    /datum/keybinding/client/close_every_ui/down(client/user, turf/target, mousepos_x, mousepos_y)
    	. = ..()
    	if(.)
    		return
    	SStgui.close_user_uis(user.mob)
    	return TRUE

with `hotkey_keys = list("Northwest") // HOME key` a few lines above.

`code/controllers/subsystem/tgui.dm:297`:

    /datum/controller/subsystem/tgui/proc/close_user_uis(mob/user, datum/src_object)
    	...
    	for(var/datum/tgui/ui in user.tgui_open_uis)
    		if(isnull(src_object) || ui.src_object == src_object)
    			ui.close()

`code/datums/cinematics/_cinematic.dm:81`:

    		SStgui.close_user_uis(watching_mob)

`tgui/packages/tgui/interfaces/CrewBrain/index.tsx:93`:

    // Closing the window stops all thinking; the NPCs carry on with default behavior.
    useEffect(() => stopSession, []);

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:198`, `stopSession`: `brains.clear()`, `clearExpected()`, `clearRounds()`.

## How it was found

Read from the code: the keybinding, `close_user_uis`, `/datum/tgui/close`, and the window's cleanup. Not tried in a round. Whether this owner presses Home was not checked.

## How to fix it

These keep to the rules: nothing here acts in the world, it only keeps the brain alive.

1. Give `close_user_uis` a way to leave a window open when no window is named. The smallest change: a proc on `/datum` that the subsystem asks, `ui_closes_with_others()`, returning TRUE by default; in `close_user_uis`, when `src_object` is null, skip any `ui` whose `src_object.ui_closes_with_others()` is FALSE. `/datum/crew_brain_link` returns FALSE. This is an edit to a base-game file (`code/controllers/subsystem/tgui.dm`), the fourth: **the owner has to agree to it.**
2. If the owner would rather not touch the subsystem: in `crew_brain_link.dm`, override `ui_close(mob/user)`. When the owner is still connected (`user.client`), owns NPCs, and the close did not come from the window's own close button, reopen it a tick later (`addtimer(CALLBACK(src, PROC_REF(ui_interact), user), 1)`) and `log_game` that it was closed and reopened. The brains are still wiped by this route, so it only shortens the stop. To tell the close button from the Home key, the window can send `act('closing')` from its close handler first. Weaker than step 1; I would take step 1.
3. Either way, write a line to `game.log` whenever the Crew Brain window closes, with the reason if known. Today nothing in the round logs says the brains were wiped (HOLE-02 asks for the same).

The real cure for every way the window can close is HOLE-02's: keep the lasting part of each brain on the server.

## How to test the fix

- Server compile check.
- In a test round: open the Crew Brain and a vending machine window, press Home. The vending window closes and the Crew Brain stays open, its cards still showing tasks.
- The window's own close button still closes it.
