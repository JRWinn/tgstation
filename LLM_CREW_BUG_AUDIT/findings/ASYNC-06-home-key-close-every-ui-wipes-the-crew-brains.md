---
id: ASYNC-06
title: The Home key, the game's own close-all-windows key, closes the Crew Brain window and wipes every crew member's memory
kind: bug
severity: critical
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: brain
files: code/datums/keybinding/client.dm:94, code/controllers/subsystem/tgui.dm:297, code/datums/cinematics/_cinematic.dm:81, tgui/packages/tgui/interfaces/CrewBrain/index.tsx:93, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:198
fix: Have the brain link catch the close-all key signal on its owner's mob and close every other window itself, leaving the Crew Brain open
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

1. **The Home key, with no base-game edit (take this one).** The keybinding's own `down()` stops before `close_user_uis` if anything answers its signal: `/datum/keybinding/proc/down` returns `SEND_SIGNAL(user.mob, keybind_signal, target) & COMSIG_KB_ACTIVATED` (`code/datums/keybinding/_keybindings.dm`), and `close_every_ui/down` returns at `if(.)`. Its signal is `COMSIG_KB_CLIENT_CLOSEUI_DOWN`. So, in `crew_brain_link.dm`:
   - Keep `var/mob/watched_mob`. In `ui_status(mob/user, ...)` (called with the window's current user on every tgui process, and `SStgui.on_transfer` moves `ui.user` to the new mob when the owner ghosts, joins or is moved to another body), when `user != watched_mob`: unregister the signal from the old mob, `RegisterSignal(user, COMSIG_KB_CLIENT_CLOSEUI_DOWN, PROC_REF(on_close_all_key))`, and keep `user`. Unregister in `ui_close` and `Destroy`.
   - `on_close_all_key(mob/source)`: `SIGNAL_HANDLER`; `for(var/datum/tgui/ui in source.tgui_open_uis)` close every `ui` whose `src_object != src`; return `COMSIG_KB_ACTIVATED`. Home then still clears every other window, as the player expects.
2. **The cinematic** cannot be caught this way: `_cinematic.dm:81` calls `close_user_uis` directly. It plays when the station is destroyed, so the round is over or nearly so; leave it, unless the owner agrees to a base-game edit. If so, do **not** skip the window whenever `src_object` is null, as this finding first proposed: `on_logout` (`code/controllers/subsystem/tgui.dm:370`) also calls `close_user_uis(user)` with no window named, and must still close the Crew Brain when the client goes, or a stale `/datum/tgui` is left on a mob with no client. Give `close_user_uis` a new argument instead (`keep_pinned = FALSE`), passed TRUE only by the cinematic.
3. Override `ui_close(mob/user)` on the link (`/datum/tgui/close` calls `src_object.ui_close(user)`) and `log_game` that the Crew Brain window closed and every brain was wiped. Today nothing in the round logs says so (HOLE-02 asks for the same).

The real cure for every way the window can close is HOLE-02's: keep the lasting part of each brain on the server.

## How to test the fix

- Server compile check (the `-DCBT` copy in README).
- In a test round: open the Crew Brain and a vending machine window, press Home. The vending window closes and the Crew Brain stays open, its cards still showing tasks.
- Ghost (or aghost) and press Home again: the Crew Brain still stays open, so the signal followed the owner to the new mob.
- The window's own close button still closes it, and `game.log` has the new line.
- Disconnect and reconnect: the window is closed as before (the logout path is not changed).

## Check

Confirmed, by Opus 5.5. Read every quoted place; all say what the finding quotes.

- `client.dm:87-99`: `close_every_ui` is bound to `"Northwest"` (Home) by default and calls `SStgui.close_user_uis(user.mob)` with no window named. `tgui.dm:297`: with `src_object` null every `ui` in `user.tgui_open_uis` is closed. The Crew Brain is one of them: it is opened as an ordinary `new(user, src, "CrewBrain", ...)` in `crew_brain_link.dm:58`, which has no `ui_close` or anything else that stops this.
- What a close does in the window: `/datum/tgui/close` calls `window.close(can_be_suspended)`. A pooled window is sent `suspend`; `events/handlers/suspense.ts` sets `suspendedAtom`, and `routes.tsx` then renders `SuspendedWindow` in place of the interface, so `CrewBrain` unmounts and its `useEffect(() => stopSession, [])` runs. A window that cannot be suspended is closed with `browse(null)`, which ends the page. Either way `stopSession` (`brain.ts:198`) clears `brains`.
- Not a duplicate: HOLE-02 names the X button, logout, a reload and a thrown error, not the Home key or the cinematic, and its fix is large; this has a small fix of its own.
- Mended: the first fix proposed skipping the window in `close_user_uis` whenever no window is named, which would also have stopped `on_logout` (`tgui.dm:370`) from closing it. Replaced by the keybinding signal (`_keybindings.dm`, `down`), which needs no base-game edit. Effort stays small (one file).
- Searched `LLM_CREW_CHANGELOG.md` and the plans for Home, `close_every_ui`, `close_user_uis` and cinematic: nothing. Not run in a round; whether the owner presses Home was not checked. Severity stays critical by FORMAT.md (the window loses its memory).
