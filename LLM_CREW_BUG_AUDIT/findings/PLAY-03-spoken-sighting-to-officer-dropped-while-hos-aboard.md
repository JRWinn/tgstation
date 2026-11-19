---
id: PLAY-03
title: With a Head of Security aboard, word said to the officer's face of where a wanted person is goes nowhere, and the officer walks the hallways
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:467, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:376, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:443, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:221, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:934, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:354
fix: In the officer's overhears and readsMessage, when a Head of Security is aboard, take a sighting of someone it holds a warrant on with noteSeen and read it back in fixed words, before sendOn, and let deskTakes take a sighting from its own staff so the Head of Security's list stays true
---

## What is wrong

The officer holds a warrant on someone. A Head of Security is aboard. The Captain, or anyone, tells the officer to its face where that person is. The officer's body does nothing with it. It does not note the sighting, so it does not go there. It does not pass it to the Head of Security either. It goes on walking the main hallways with "no fresh word".

The officer only takes word about a warrant from the Head of Security while one is aboard. From anyone else, `overhears` calls `sendOn`, and `sendOn` only knows warrants and pardons. A sighting is neither, so `sendOn` returns at its first test and nothing happens. The same is true of a sighting sent to the officer by PDA (`readsMessage` ends in `sendOn` too).

The voice is then left to answer on its own. Its prompt says "You have no fresh word of where they are". So it either brushes the speaker off or promises to go, and the body does not go.

The case from the round. Archie Sandford is Head of Security. At 21:50:27 it gives the officer Casey Cooper a warrant on Pun Pun. At 21:55:53 the Captain, six tiles away, says to Casey "Pun Pun is in the bar". The voice answers that it is a joke and to go to Archie. At 22:09:42 the Captain, one tile away, says "He is in the Bar". The voice says "The Bar. I'll be there shortly." At 22:10:04 the Captain says "Go get him". The voice says "The Bar it is." The body's next step, with no LLM, is "You are walking the main hallways to look for them: the Aft Primary Hallway next." It never goes to the Bar. Pun Pun was not arrested by the end of the round (22:14:51).

A second, smaller part: "He is in the Bar" names nobody. Even with the fix below, a sighting by pronoun needs a rule. With one warrant in hand, a "he", "she" or "they" said to its face can only mean that one.

KNA-21 is the same hole for a pardon said to the officer's face. This one is about sightings, which KNA-21 does not cover.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:467`, in `overhears`. Anything said to it by someone who is not the Head of Security, with one aboard, goes to `sendOn`:

    const job = jobOf(brain, speaker);
    if (isHeadOfSecurity(job)) {
      takeWord(brain, speaker, heard, true);
      return;
    }
    if (!headAboard(brain)) {
      deskHears(brain, event);
      return;
    }
    if (event.details.said_to === 'me') {
      sendOn(brain, speaker, job, heard, true);
    }

`officer.ts:376`, `sendOn`. A sighting matches none of these tests, so it returns with nothing done and nothing said:

    const head = headAboard(brain);
    if (
      !head ||
      !isHead(fromJob) ||
      !(
        readWarrant(text, []) ||
        CANCEL_WORDS.test(text) ||
        /\bpardon\b/i.test(text) ||
        (PARDON_WORDS.test(text) &&
          beatOf(brain).warrants.some((it) =>
            text.toLowerCase().includes(it.name.toLowerCase()),
          ))
      )
    ) {
      return;
    }

`officer.ts:443`, `readsMessage`, the PDA path, ends the same way:

    if (!headAboard(brain)) {
      ...
      return;
    }
    sendOn(brain, from, job, text, false);

The only place an officer with a Head of Security aboard notes a sighting from word is `takeWord` (`officer.ts:351`), and that reads only the Head of Security's own line "Casey, Pun Pun was seen in the Bar." (`SEEN_WORDS`):

    const seen = text.match(SEEN_WORDS);
    if (seen) {
      const place = placeNamedIn(brain, text.toLowerCase());
      if (place) {
        noteSeen(brain, seen[1], place, brain.now);
      }
      return;
    }

The helper that would do the work is already there, `tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:221`, `noteSeen`:

    const warrant = beatOf(brain).warrants.find((it) => sameName(name, it.name));
    if (warrant && (!warrant.lastSeen || at > warrant.lastSeen.at)) {
      warrant.lastSeen = { place, at };
    }

With no `lastSeen`, `serveStep` falls to the hallway round, `arrests.ts:934`:

    // No sighting to follow. It walks the main hallways, one after the other, and looks.
    ...
        step: `There is a warrant on ${name}${why}, and you have no fresh word of where they are. You are walking the main hallways to look for them: the ${hall} next.`,

With no Head of Security aboard the same words do work: `deskHears` reaches `deskTakes`, which takes a sighting at `desk.ts:631` ("Word of where someone wanted is."). Only the case with a Head of Security aboard is broken.

## How it was found

Seen in a round log, `data/logs/2026/11/19/round-15.44.36/`.

`game.log`, the warrant:

    [2026-11-19 21:50:27.016] GAME: Crew NPC *no key*/(Archie Sandford) (owner: zimfire) was told by its brain to PDA Casey Cooper: Casey, warrant: Pun Pun. Bring them in, 5 minutes. The Captain declared it.

`game.log`, the two sightings and what was said back:

    [2026-11-19 21:55:53.055] GAME-SAY: zimfire/(Zim Fire) (mob_3015) "Pun Pun is in the bar" (Starboard Primary Hallway (134,137,2))
    [2026-11-19 21:55:56.579] GAME: Crew NPC *no key*/(Casey Cooper) (owner: zimfire) was told by its brain to say: Pun Pun is in the bar? That's a joke. I'm on security business; go ask Archie for a warrant if you think they're there.
    [2026-11-19 22:09:42.573] GAME-SAY: zimfire/(Zim Fire) (mob_3015) "He is in the Bar" (Starboard Primary Hallway (133,138,2))
    [2026-11-19 22:09:44.965] GAME: Crew NPC *no key*/(Casey Cooper) (owner: zimfire) was told by its brain to say: The Bar. I'll be there shortly.
    [2026-11-19 22:10:04.815] GAME-SAY: zimfire/(Zim Fire) (mob_3015) "Go get him" (Starboard Primary Hallway (133,138,2))
    [2026-11-19 22:10:07.748] GAME: Crew NPC *no key*/(Casey Cooper) (owner: zimfire) was told by its brain to say: The Bar it is. Watch your step on that oil if you're coming with me.

`crew_brain.log`, the prompt for the 22:09:42 line (event times inside prompts run 6 hours behind). It was said to Casey, and its work list still had no sighting:

    [16:09:42] Zim Fire says: "He is in the Bar" (person p4, 1 tiles away, speaking to you)
    - cannot go on yet: find and arrest Pun Pun. There is a warrant on Pun Pun. You have no fresh word of where they are, and have walked the hallways lately.

The same line is in the prompt for the 21:55:53 sighting ("speaking to you", 6 tiles away). The reply at 22:09:45 had `"work": {"what": "nothing", "where": "Bar Lounge"}`.

`crew_brain.log` at 22:10:42, the body's own next step after "Go get him":

    ROUTINE (no LLM) in Starboard Primary Hallway, holding nothing: There is a warrant on Pun Pun, and you have no fresh word of where they are. You are walking the main hallways to look for them: the Aft Primary Hallway next.

Every later step of Casey's, from 22:10:42 to 22:14:45 (nine of them), is the same round of the five main hallways, Aft, Central, Fore, Port, Starboard, and round again. No arrest of Pun Pun is in `game.log` up to the window closing at 22:14:51.

Then read from the code: `overhears`, `sendOn`, `readsMessage` and `takeWord` in `officer.ts`, `noteSeen` and `serveStep` in `arrests.ts`, and `deskTakes` in `desk.ts`. That Archie Sandford was the Head of Security is from the log (it gave the warrant in the Head of Security's words and held the security staff meeting), not from the manifest, which lists no NPCs.

Whether `placeNamedIn` finds a room in "the bar": it does (settled by the second reviewer). MetaStation has both a "Bar" (`/area/station/service/bar`, `name = "\improper Bar"` in `code/game/area/areas/station/service.dm`, 34 tiles in the map) and a "Bar Lounge" (`code/game/area/areas/station/common.dm:84`). `crew_npc_station_places` lists every station area by name, so "Bar" is in `allPlaces`, and `placeNamedIn` tries longest names first: "bar lounge" does not match, "bar" does. The words read as the Bar.

Searched `findings/` for `sendOn`, `sighting`, `overhears` and "to the officer's face". KNA-21 (pardon to its face), MULTI-01 (two officers), SECT-15 (first names at the desk), SECT-17 (list not handed over) and GAP-16 (sightings not answered) are near it. None covers a sighting said to the officer with a Head of Security aboard. The change log lists only the pardon case as known (2026-11-18, 14:15).

## How to fix it

1. In `officer.ts`, add a small function `takeSighting(brain, from, text, aloud): boolean`. It returns TRUE if it took the words as a sighting.
   - It needs a place: `placeNamedIn(brain, text.toLowerCase())`, and `SIGHTING_WORDS.test(text)`.
   - It needs a name it holds a warrant on: `nameIn(text, names)`, then `closeIn(text, names)`, where `names` is `beatOf(brain).warrants.map((it) => it.name)`. Use both, so a first name or a run-together name works (the fault SECT-15 describes at the desk).
   - Failing a name, a pronoun: if the words were said to its face, hold `\b(he|she|they|him|her|them)\b`, and it holds exactly one warrant, that warrant is meant.
   - Then call `noteSeen(brain, name, place, brain.now)`. Nothing else is needed for the body to go: `serveStep` follows a sighting while `warrant.lookedAt === null || warrant.lookedAt < sighting.at` (`arrests.ts:910`), and a sighting stamped `brain.now` is always newer than the last look. Do not clear `lookedAt`.
   - A pronoun can be wrong: "He is in the Bar" may be about someone else. The read-back in step 2 is what lets the speaker see and correct it.
2. Read it back in fixed words, so the speaker knows it was taken and the voice cannot promise what the body will not do. Push to `brain.toTell` the way `sendOn` does, with `exact: true` and `whileBusy: aloud`: "Captain, I have that: Pun Pun, the Bar." Use `addressOf(from, fromJob)` for the name. Once per warrant and room every two minutes, so a repeat is not answered every time.
3. Call it in `overhears` before `sendOn` (only when `said_to === 'me'`), and in `readsMessage` before `sendOn`. Keep `sendOn` as it is for warrants and pardons.
4. Tell the Head of Security too, so its list stays true and it passes it on if the officer goes down. Send a PDA message in the words staff already use, `sightLine(name, place)` ("Security: Pun Pun is in the Bar."). Do this only if the place is new for that warrant.
   - This needs a change in `desk.ts` as well. `deskTakes` does **not** read a sighting from its own staff today. For a sender `isSecurity(fromJob)` it reads only `WARRANT_ACK_WORDS` and `readOutcome`, and then returns false at `desk.ts:354`, before the sighting branch at `desk.ts:631` is reached. The Head of Security's `readsMessage` then finds no report in it, and the message is lost.
   - In that security block, before `return false`, take a sighting: `nameIn(text, standing) ?? closeIn(text, standing)`, `placeNamedIn`, `SIGHTING_WORDS`. Set `warrant.lastSeen = { place, at: brain.now, by: from }` and also `warrant.passed = { place, at: brain.now }`, the way the `'lost'` outcome does at `desk.ts:843`. Without `passed`, `syncTasks` (`desk.ts:1023`) sees a new sighting not yet passed and sends "Casey, Pun Pun was seen in the Bar." straight back to the officer who sent it.

The owner's plan says sightings go to the Head of Security. This fix keeps that (step 4), and also lets the officer act on word it was given itself for a warrant it already holds. That does not change who keeps the list. If the owner wants the officer only to pass it on, drop step 1's `noteSeen` and keep steps 2 and 4: the Head of Security then sends `seenLine` back and `takeWord` notes it. That is slower by a PDA round trip and does nothing with PDAs down, so I would take the first way.

## How to test the fix

- In `tools/llm_crew/security.ts`, a case with a Head of Security and an officer holding a warrant on Pun Pun. The Captain says to the officer "Pun Pun is in the bar". The officer's next plan is `go_to` the Bar, it says "Captain, I have that: Pun Pun, the Bar.", and the Head of Security's desk has `lastSeen` in the Bar.
- The same with "He is in the Bar" and one warrant held: taken. With two warrants held: not taken, and nothing is said in fixed words.
- The same by PDA from the Captain: taken.
- Words said to the officer that are not a sighting ("Any warrants right now?") still go nowhere, and a warrant said to it is still sent on by `sendOn`.
- The officer's `sightLine` PDA to the Head of Security: the desk's warrant has `lastSeen` in the Bar, and the Head of Security sends no "Casey, Pun Pun was seen in the Bar." back.
- Type check the window code.
- In the next round's `game.log`, after telling the officer where someone is, look for "I have that:" from the officer, and then its walk to that room. In `crew_brain.log` the step should read "They were last seen in the ..., and you are going there to look." and not "no fresh word".

## Check

Checked by Opus 5.5 against the code at 99f4d33dd0e and the round log. Confirmed.

- The quotes in `officer.ts` (`overhears` at 467, `sendOn` at 376, `readsMessage` at 443, `takeWord` at 351) and `arrests.ts` (`noteSeen` at 221, the hallway walk at 934) are what the code says.
- I looked for any other way an officer with a Head of Security aboard could note a sighting. `noteSeen` has four callers: `officer.ts:355` (only the Head of Security's own `SEEN_WORDS` line) and `desk.ts:1021` and `desk.ts:1038`, both only when no officer is serving. The LLM reply's `"work": {"what": "nothing", "where": "Bar Lounge"}` sends the body nowhere. There is no guard that saves it.
- The round log agrees. `game.log` has the warrant at 21:50:27, both sightings said to Casey at 21:55:53 and 22:09:42, and the replies quoted. `crew_brain.log` has the 22:09:42 prompt with "He is in the Bar" and "You have no fresh word of where they are". Casey's next nine routine steps, 22:10:42 to 22:14:45, are all the hallway walk. No arrest of Pun Pun before the window closed at 22:14:51. The finding's line about "22:11:57 and 22:14:45" undersold it, and is mended.
- Not a duplicate. KNA-21 is the pardon. MULTI-01 is two officers. SECT-15 is first names at the desk. GAP-16 item 2 is the read-back of a sighting the desk takes, not the officer taking one.
- The room name was the open question. "the bar" reads as the Bar, a real station area, so the fix works for this case (see How it was found).
- The fix was wrong in one place. Step 4 said `deskTakes` reads `sightLine` from the officer. It does not: for its own staff it returns false at `desk.ts:354` before the sighting branch. Step 4 now says what to add there, and to set `passed` so the word is not sent straight back. Step 1's "clear `lookedAt`" was not needed and is struck. With the change in `desk.ts` the fix is two files and about 40 lines, so effort is now medium.
- Severity stays medium. The officer still walks the hallways and may come on the person by chance. But the voice says "The Bar it is." and the body never goes, which misleads the player.

Not checked: whether the voice's standing line in `whenAsked` ("ask them to tell the Head of Security where the person you are after is") should change once the officer takes sightings itself. With the fixed read-back it does no harm, but the owner may want it reworded.
