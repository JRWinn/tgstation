---
id: ARR-15
title: A room with no door locked to security, that it could not walk into for fire doors or a breach, is asked of the Captain and then forced open by engineering
kind: bug
severity: medium
effort: large
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:514, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:850, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1113, code/modules/llm_crew/crew_npc_security.dm:784, code/modules/llm_crew/crew_npc_security.dm:1628
fix: Have security_state send empty keepers lists too, treat an empty list as no locked door in keepersOf so no shutOut is opened, and tell the list once what is in the way
---

## What is wrong

See also: ARR-06 and ARR-07. ARR-06 notes that `keepersOf` falls back to the Captain; ARR-07 covers a person in the officer's own room. This is the case in between: the room is not locked to security at all.

The server's `room_keepers` answers "who can open this room for you". Its own comment: "Empty if the room has no door that is locked to it." `security_state` sends only the rooms whose answer is not empty, and `security_details` sends the answer as it is, empty or not.

The window reads an empty answer the other way. `keepersOf` takes "nobody listed" to mean "nobody known", and falls back to the Captain:

    const names = listed.length > 0 ? listed : captain ? [captain] : [];

So a room security could walk into if the way were clear becomes a room it is "shut out of". The way can be blocked for reasons no ID opens:

- Fire doors shut across a hallway after a fire alarm or a breach. Pun Pun pulls fire alarms.
- A breach or no air: the path avoids unsafe floor.
- The walk timing out, or the body held (CORE-11).

What follows is the whole let-in sequence for a door nobody needs to open: it walks to "the door" of the room (`go_to_door`), and, failing that twice, sends from where it stands. It messages the Captain: "Captain, I have a warrant for Pun Pun, who is in the Fore Primary Hallway. I cannot get to its door. Could you let me in, please?" It waits 90 seconds. Nobody comes, because nothing needs opening, and there is nobody else on the list. `shut.gaveUp` is set, the outcome "I cannot bring in Pun Pun: nobody has opened the Fore Primary Hallway for security" goes to the Head of Security, and `deskOutcome` reads "nobody has opened the X for security" and asks engineering to force a door of the Fore Primary Hallway (`askEngineering`).

Three ways in (the third was added by the checker):

1. **A sighting.** `serveStep`'s sighting branch: the sighting is fresh, the room is in `brain.blockedPlaces` (its walk there failed), so it calls `noteShutOut(brain, warrant, sighting.place)` with no keepers given. `brain.security.keepers[place]` is missing because the server left the empty answer out, so the Captain is used.
2. **In sight, and the arrest's walk failed.** `security_details` answers `reason: 'no_way'`, the room, and `keepers: []`. `beatAfterActing` calls `noteShutOut(... details.keepers)`, `keepersOf` gets an empty array, and the Captain is used.
3. **In sight, and the walk up to them failed.** `beatAfterActing`'s `approach` branch calls `noteShutOut(brain, warrant, seen.place)` with no keepers given, for anyone in sight further than `NEAR` in another room. `security_state` lists keepers for rooms it sees someone in only when the answer is not empty, so the Captain is used again. A person across a shut fire door in a hallway is in sight: fire doors can be seen through.

One concrete case: the Captain sends "Pun Pun is in the Fore Primary Hallway". Pun Pun pulled the fire alarm there and the fire doors are shut. The officer's `go_to('Fore Primary Hallway')` fails with "there is no way through" and the server marks it blocked. Next plan: the sighting is fresh and blocked, `noteShutOut` makes a `shutOut` with keepers `['Zim Fire']` (the Captain). The officer goes to the door and asks the Captain to let it into a public hallway. Ninety seconds later the Head of Security has an engineer sent to pry open a door of the Fore Primary Hallway.

The same holds for any room security can open whose way is cut off: the Brig behind its own fire doors, the Security Office.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:514`, `keepersOf`:

    function keepersOf(brain: NpcBrain, place: string, given?: unknown): string[] {
      const listed = Array.isArray(given)
        ? given.map(String)
        : (brain.security?.keepers?.[place] ?? []);
      const captain = captainName(brain);
      const names = listed.length > 0 ? listed : captain ? [captain] : [];

`jobs/arrests.ts:850`, in `serveStep`, the sighting in a blocked room:

    if (
      sighting &&
      brain.now - sighting.at < SIGHTING_STALE_DS &&
      brain.blockedPlaces.includes(sighting.place) &&
      (warrant.shutOut?.place === sighting.place
        ? !warrant.shutOut.gaveUp
        : noteShutOut(brain, warrant, sighting.place))
    ) {
      return letInStep(brain, warrant);
    }

`jobs/arrests.ts:1113`, in `beatAfterActing`:

    if (reason === 'no_way') {
      warrant.toldAt = null;
      noteShutOut(
        brain,
        warrant,
        String(details.place ?? target(brain, warrant)?.place ?? ''),
        details.keepers,
      );
      return;
    }

`code/modules/llm_crew/crew_npc_security.dm:794`, in `room_keepers`, the empty answer:

    for(var/obj/machinery/door/airlock/door as anything in crew_npc_doors_of(room, body.z))
    	if(!door.allowed(body))
    		doors += door
    if(!length(doors))
    	return names

`crew_npc_security.dm:1628`, in `security_state`, only non-empty answers are sent:

    var/list/names = keepers_known(places[place], place)
    if(length(names))
    	keepers[place] = names

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:850`, the door forced on "nobody has opened":

    const shutRoom = outcome.why?.match(
      /^nobody has opened the (.+) for security$/,
    )?.[1];
    if (shutRoom) {
      askEngineering(brain, shutRoom, outcome.name);
    }

## How it was found

Read from the code on both sides. Not seen in a round. Marked `likely` because I did not follow `go_to_door` to see what it does with a room whose airlocks all open to the body; the rest of the chain does not depend on it.

## How to fix it

1. Have the server say which it is. In `security_state` (crew_npc_security.dm:1628 and the in-sight rooms just after it), send every room's answer, an empty list kept as empty, instead of only the ones with names in. `security_details` already sends `keepers: []`. Then the window can tell "nobody needs to open it" (an empty list) from "not known" (no entry). One thing to keep in mind: `room_keepers` also answers empty when the body has no PDA (`own_messenger` null); that case is already a give-up in `letInStep` (`!brain.hasPda`), and with this change it becomes "not locked", which is wrong. Return a marker for it (or have `room_keepers` look at the doors before the PDA) so that an empty list means only "no door locked to it".
2. In `keepersOf`, fall back to the Captain only when there is no answer at all (`given` not an array and no `keepers[place]` entry). For an empty answer, return an empty list, so `noteShutOut` returns FALSE. Note that `syncBeat` (arrests.ts:414-420) then sends "no way into the X" once, by the existing `cannot` rule; the desk does not ask engineering for that wording, which is right.
3. Where `noteShutOut` returns FALSE, do not leave it at that (ARR-07 says the same for its case): count a try in `beatAfterActing`, and in `serveStep` let the sighting go on to "look" or the hallways after a wait. Tell the list once what is in the way when the server says so: the `go_to` result already carries a fire-door report (`fire_door_report`), and "fire doors are shut between us" is a true reason for the Captain.
4. Do not change `askEngineering`: forcing a door is right for a room that is locked and that nobody opened.

## How to test the fix

- `tools/llm_crew/security.ts`: `beatAfterActing` with an `arrest` result `{ reason: 'no_way', place: 'Fore Primary Hallway', keepers: [] }` should not set `warrant.shutOut`.
- `serveStep` with a fresh sighting in a room in `blockedPlaces` and an empty list for it in `security.keepers`: no `letInStep`, no PDA to the Captain. With no entry at all, the Captain is still asked, as now.
- In the next round, grep `pda.log` for "Could you let me in, please?" naming a hallway, and `game.log` for engineering sent to force a hallway door.

## Check

Checked by Opus 5.5 on 2026-11-19. Read `keepersOf` and `noteShutOut` (arrests.ts:514-546), `serveStep`'s blocked-sighting branch (arrests.ts:849-858), the `approach` and `arrest` branches of `beatAfterActing` (arrests.ts:1039-1046, :1113-1121), `syncBeat`'s `cannot` rules (arrests.ts:404-420), `letInStep`, `deskOutcome`'s "nobody has opened" match (desk.ts:850-857), and on the server `room_keepers` (crew_npc_security.dm:784-832: empty when no door of the room is locked to the body, and also when the body has no PDA), `keepers_known`, `security_details` (:748, sends the empty list as it is), `security_state` (:1625-1640, drops empty answers), and the walk result in crew_npc_tools.dm:470-505, where any failed `go_to` puts its goal in `blocked_places`, whatever the reason, and a "no way through" with a shut fire door in sight carries `fire_doors`. Firelocks have `opacity = FALSE` (code/game/machinery/doors/firedoor.dm:11), so someone beyond one is in sight. The quotes match today's code. Nothing between an empty answer and the Captain fall-back tells the two apart, so a public room that the walk failed to reach becomes a let-in ask, then a give-up, then `askEngineering`. Raised to `sure`: `go_to_door` was not followed to its end, but whatever it does the ask is sent (from the door, or from where it stands after `DOOR_TRIES`). Added a third way in, the failed `approach`. Effort raised to large by FORMAT.md's rule, as the fix needs both the server and the window, though each side is a few lines. Medium stands: a blocked walk to an open room with a fresh sighting is not most rounds, and the cost is a wrong ask and a door forced for nothing. Step 1 now warns that `room_keepers` is also empty for a body with no PDA.
