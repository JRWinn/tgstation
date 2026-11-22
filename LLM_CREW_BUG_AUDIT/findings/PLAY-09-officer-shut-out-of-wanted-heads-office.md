---
id: PLAY-09
title: With a head on a warrant shut in their own office, the officer asks nobody to let it in, since the head is the only keeper and the Captain is never tried
kind: bug
severity: medium
effort: small
confidence: likely
status: fixed
fixed_in: 88daabe4623
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:555, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:581, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:446, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1160, code/modules/llm_crew/crew_npc_security.dm:826
fix: In keepersOf strike itself and the wanted from the list first, and fall back to the Captain when nobody is left, unless the Captain is the one wanted
---

## What is wrong

See also: ARR-07, ARR-15, ARR-06, KNA-26. ARR-07 covers what happens after `noteShutOut` returns FALSE (the arrest is tried again and again, and the FALSE is ignored). ARR-15 covers an empty list from the server. KNA-26 covers asking only by PDA. This finding is the new part: a list that is not empty, but holds only the person wanted.

When an officer is shut out of a room with someone wanted inside, it asks someone whose ID opens the door to let it in. `keepersOf` gives it the names. It takes the server's list, and only if that list is empty does it fall back to the Captain. Then it strikes out itself and anyone it has a warrant on.

The order is wrong. If the only person on the server's list is the one wanted, the list is not empty, so the Captain is not added. Then the wanted person is struck out, and nobody is left. The Captain, whose card opens every door, is never asked.

A head of staff in their own office is the case that comes up. The Head of Personnel's Office opens to the Head of Personnel. With her on a warrant and inside, the server lists her, and the window strikes her. `noteShutOut` gets an empty list and returns FALSE, so no `shutOut` is opened and `letInStep` never runs. The officer does not go to the door, does not ask anyone, and after a while `syncBeat` sends "no way into the Head of Personnel's Office" to the Head of Security. That is what the design means for a room nobody can open. Here someone could: the Captain.

The concrete case, from round-15.44.36. Sunshine Langston, Head of Personnel, is on a warrant the Captain declared. She is in her office, both doors locked to the officer Casey Cooper. Casey sees her through the window from the Central Primary Hallway. `approach` fails, the arrest fails with no route, and the arrest line is said through the window. This happens three times. Nobody is asked to open a door. At 22:01 Casey sends "no way into the Head of Personnel's Office", and the Head of Security passes that to the Captain as a report, not as a request to open a door. She was arrested only later, when she walked out to the Bar Lounge for a staff meeting.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:555`, in `keepersOf`:

    function keepersOf(brain: NpcBrain, place: string, given?: unknown): string[] {
      const listed = Array.isArray(given)
        ? given.map(String)
        : (brain.security?.keepers?.[place] ?? []);
      const captain = captainName(brain);
      const names = listed.length > 0 ? listed : captain ? [captain] : [];
      const wanted = beatOf(brain).warrants.map((warrant) => warrant.name);
      return names.filter(
        (name) =>
          name !== brain.name && !wanted.some((other) => sameName(other, name)),
      );
    }

The fall-back to the Captain is decided on `listed.length` before the filter. Its own comment says the Captain comes "failing them", and "never anyone it has a warrant on". Once the wanted are struck, nobody is left to fail over from.

`arrests.ts:581`, in `noteShutOut`: an empty answer means no shut-out is opened.

    const keepers = keepersOf(brain, place, given);
    if (keepers.length === 0) {
      return false;
    }

`arrests.ts:446`, in `syncBeat`: the same empty answer is what sends "no way into the X".

    if (
      last &&
      brain.now - last.at < SIGHTING_STALE_DS &&
      brain.blockedPlaces.includes(last.place) &&
      keepersOf(brain, last.place).length === 0
    ) {
      cannot(warrant.name, `no way into the ${last.place}`);
    }

`arrests.ts:1160`, the arrest's `no_way` answer, which calls `noteShutOut` with the server's list and drops the FALSE (see ARR-07):

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

`code/modules/llm_crew/crew_npc_security.dm:826`, `room_keepers`: whoever holds a card that opens a locked door of the room, staff first, then heads, then Captains. The wanted person is not left out here, which is right; the window strikes them.

    return names + heads + captains

## How it was found

Seen in a round log, round-15.44.36, then read from the code.

`game.log`:

    [2026-11-19 21:52:24.789] ... (Archie Sandford) ... was told by its brain to PDA Casey Cooper: Casey, warrant: Sunshine Langston. Bring them in, 5 minutes. The Captain declared it.
    [2026-11-19 21:58:04.407] GAME: Crew NPC *no key*/(Casey Cooper) found no route to Sunshine Langston from Central Primary Hallway (89,136,2). The game's other pathfinder finds none either. Doors of Head of Personnel's Office: Head of Personnel at (90,132): locked to it; Head of Personnel at (99,132): locked to it. ...
    [2026-11-19 21:58:05.293] ... (Casey Cooper) ... was told by its brain to say: Sunshine Langston, you are under arrest. Stand still.
    [2026-11-19 21:58:41.896] ... (Casey Cooper) found no route to Sunshine Langston ... Head of Personnel at (90,132): locked to it; Head of Personnel at (99,132): locked to it. ...
    [2026-11-19 21:58:42.468] ... was told by its brain to say: Sunshine Langston, you are under arrest. Stand still.
    [2026-11-19 21:59:13.956] ... was told by its brain to PDA Archie Sandford: Archie, I lost Sunshine Langston in the Central Primary Hallway.
    [2026-11-19 21:59:49.240] ... (Casey Cooper) found no route to Sunshine Langston ... Head of Personnel at (90,132): locked to it; ...
    [2026-11-19 21:59:50.145] ... was told by its brain to say: Sunshine Langston, you are under arrest. Stand still.
    [2026-11-19 22:01:00.420] ... was told by its brain to PDA Archie Sandford: Archie, I cannot bring in Sunshine Langston: no way into the Head of Personnel's Office.
    [2026-11-19 22:04:06.448] GAME: Crew NPC *no key*/(Casey Cooper) (owner: zimfire) arrested *no key*/(Sunshine Langston) at Bar Lounge (131,134,2).

`pda.log` has no message from Casey Cooper asking anyone to be let in. Its only messages about her are the "lost" one and the "no way into" one, both to Archie Sandford. `crew_brain.log` shows the same steps, all ROUTINE (no LLM): "Sunshine Langston is in sight. You are walking up to them", "Your body is telling them", "You are putting the cuffs on them", three times over. No step says "which is locked to you" or "asking to be let in", which are `letInStep`'s words. The prompt events read "[15:58:04] You cannot get any closer to Sunshine Langston, but you are near enough to talk." and "[15:58:25] You could not get to it."

What the log proves: at 22:01 `keepersOf(brain, 'Head of Personnel's Office')` was empty, since that is the only way `syncBeat` sends "no way into". The Captain, Zim Fire, was aboard (`manifest.log`, Captain, latejoin) and sending PDA messages, and `pda.log` shows him as "Zim Fire (Captain)" all round. So the server's list held nobody but people it strikes: Sunshine, and perhaps Pun Pun, who was also on a warrant. (Corrected by the checker: the first write-up also offered "it held the Captain and `captainName` did not know the Captain". That cannot be: a Captain on the server's list is not struck, so `keepersOf` would have returned him whatever `captainName` says. And a missing list cannot be it either: `captainName` reads `pdaPeople`, which `people_on_pda` fills from the same PDA list, so the fall-back would have found Zim Fire.)

What was not seen: the server's `keepers` list itself is not logged, so why the Captain was not on it is not known. Read from the code, `room_keepers` should have listed him: his PDA is on the station level, and with no card in it, `get(candidate.computer, /mob/living)` and `get_idcard(TRUE)` find the card he wears, which opens every door. Nothing in `game.log` shows him take off his ID. That is a second, unexplained fault on the server side; see step 5 of the fix. Whatever the reason, with the fix the window still falls back to the Captain by name.

Also not covered here: the "I lost Sunshine Langston" message at 21:59:13, sent while she sat behind the window. That came from an arrest answer with reason `lost`, which the server gives when the wanted person is not in `view()` at that moment. It may be a separate fault and was not traced.

## How to fix it

1. In `keepersOf` (arrests.ts:555), strike first and fall back after. Work out `listed` as now. Filter it: drop `brain.name` and anyone matching a warrant by `sameName`. If what is left is not empty, return it.
2. If nothing is left, and the server did send a list that was not empty (so some door of the room really is locked to it), return the Captain from `captainName(brain)`, as long as the Captain is not itself the officer and not on a warrant. Otherwise return an empty list.
3. Keep ARR-15's rule, if that is built first: an empty list from the server means no door is locked, and gives no fall-back. Step 2 only applies to a list that had names in it before the filter. The two fixes fit together: "nobody listed" gives nobody, "only the wanted listed" gives the Captain.
4. Nothing else needs to change in the window. `noteShutOut` then opens a `shutOut` with the Captain, `letInStep` sends the officer to the door and the Captain a let-in message, and if the Captain does not open it in time, `gaveUp` sends "nobody has opened the Head of Personnel's Office for security", which is the wording that leads the desk to ask engineering.
5. Separately, find out why `room_keepers` left the Captain out in this round. Add one `log_game` line in `security_details` (`crew_npc_security.dm`, the `no_way` branch) with the keepers list it sends, and read it next round. If the Captain is missing again, trace `room_keepers` for a player Captain (the card found, `check_access` on each locked door). If CHEAT-02's fix is built first (go by the job's trim, not the card), the Captain is listed by his job and this round's case goes away on the server side. The window fix in steps 1 and 2 is still worth having: it is a few lines, and it keeps the Captain as the last one to ask whatever the server sends.

## How to test the fix

- Cases in `tools/llm_crew/security.ts`: a warrant on the Head of Personnel, `security.keepers` for the Head of Personnel's Office set to `['<her name>']`, the Captain on `pdaPeople`. `keepersOf` should give `['<Captain>']` and the next step should be `go_to_door` for the office. With the list `[]` (after ARR-15), nobody. With a warrant on the Captain and the list `['<Captain>']`, nobody.
- The window's type check.
- Next round, `game.log`: with a head on a warrant shut in their own office, look for a PDA from the officer to the Captain with "let me" in it, before any "no way into the ..." line. `crew_brain.log` should show a step with "which is locked to you".

## Check

Checked by Opus 5.5 against the code at 99f4d33dd0e and the round-15.44.36 logs.

- The quotes are still what the code says: `keepersOf` at `arrests.ts:555` decides the Captain fall-back on `listed.length` before it strikes the officer and the wanted. `noteShutOut` at `:581` returns FALSE on an empty answer. The only place "no way into the" is made is `syncBeat` at `:452`, behind `keepersOf(brain, last.place).length === 0`. The let-in branch of `serveStep` at `:897` needs `noteShutOut` to be TRUE.
- The log matches. Casey's three `no_way` arrests at 21:58:04, 21:58:41 and 21:59:49, each with both Head of Personnel doors "locked to it". No let-in PDA in `pda.log`. "No way into the Head of Personnel's Office" at 22:01:00, relayed to the Captain at 22:01:00.470. The arrest only at 22:04:06, in the Bar Lounge.
- I looked for what would make it impossible and found none. `captainName` (`head.ts:208`) reads `peopleInView` and `pdaPeople`, and `pdaPeople` comes from `people_on_pda` (`crew_npc_cargo.dm:701`), which lists Zim Fire as Captain. So an absent list would have given the Captain. A list holding the Captain would have kept him. The only way to an empty answer is a list that held only Sunshine (and perhaps Pun Pun). That is the fault this finding names. I corrected the write-up, which offered a second cause that cannot happen.
- Not settled: why `room_keepers` (`crew_npc_security.dm:826`) left out a Captain whose worn card opens every door. The code says it should have found him. I added step 5 for this. It was not traced further.
- Not a duplicate. ARR-07 is about the FALSE being ignored. ARR-15 is about an empty server list. KNA-26 is about asking only by PDA. ARR-19 is about the let-in branch being skipped for someone who fought back or is within two tiles (Sunshine stood still, three tiles off, so it did not apply). CHEAT-02 would change how the server builds the list, which bears on step 5 but not on the window's order.
- The fix is right and small. Striking first and then falling back to the Captain, unless the Captain is the officer or wanted, fits with ARR-15 as step 3 says. It asks the Captain by name even when the server did not list him. The code already does that today for an empty list, and if his card does not open the door, `gaveUp` after the wait says so. Severity medium and effort small stand.
