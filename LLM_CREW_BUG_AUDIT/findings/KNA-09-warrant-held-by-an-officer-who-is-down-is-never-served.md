---
id: KNA-09
title: A warrant given to an officer who then goes down or falls silent is never served by anyone
kind: bug
severity: medium
effort: medium
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:152, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:802
fix: Have whoever keeps the list take the warrants back when it sees its officer lying on the floor, or when the officer does not answer a fixed "any word on X" sent after some minutes of silence
---

## What is wrong

See also: HOLE-08 (the dead and the silent counted on in every job; its fix step 3 is this one, in syncDesk), QM-02 and ENG-03 (the same blind spot in the Quartermaster and the Chief Engineer).

The Head of Security serves warrants with its own hands in two cases only: there is no officer on its PDA, or its officer has sent the words "I am hurt". An officer that is knocked down before it can write, or whose PDA is gone, or who is in a cell, or simply stuck, still counts as the one the warrants go to. Every warrant handed to it waits for good, and the Captain is told nothing.

Listed in the change log entry of 2026-11-18, 20:53 to 21:05: "The Captain's second warrant, on the Head of Personnel, was given to the officer 40 seconds before the fight and was never acted on." And: "Nothing more of it in any log by 20:55. No word was sent to the Head of Security, who went on believing the warrant was being served."

The word that it is hurt is now sent before it walks off (`sayingHurt`), which mends the round that showed this. The hole is still there for an officer that goes down in fewer than five seconds, or is hit from full health to the floor, or loses its PDA somewhere on the station. (A PDA destroyed, or taken off the station level, drops the officer from `people_on_pda`, crew_npc_cargo.dm:671 to 679, and the Head of Security then serves the warrants itself, unless the officer is in its view. A PDA lying on the floor or in a locker on the station keeps it listed.) A dead officer whose PDA is still on its body stays listed too: `people_on_pda` does not look at who holds the PDA or whether they live.

The case: the officer has two warrants. It is tackled and beaten down in the Courtroom without getting below half health while still able to act (a toolbox does 8 a hit; two thrown hits and a tackle can take it from 55 to under 0 inside the five seconds it stands sending). Or the message is lost to a "PDA glitch" trait and is being resent every 20 seconds while it lies there. The Head of Security's `desk.officerOut` stays null, `serving(brain)` goes on returning the officer's name, and both warrants sit.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:152`:

    export function officerAboard(brain: NpcBrain): string | null {
      const isOther = (person: { name: string; job: string }) =>
        isOfficer(person.job) && person.name !== brain.name;
      return (
        brain.peopleInView.find(isOther)?.name ??
        brain.pdaPeople.find(isOther)?.name ??
        null
      );
    }

    /** The officer its warrants go to, or null if it serves them itself: there is none, or the one there is has broken off. */
    function serving(brain: NpcBrain): string | null {
      return deskOf(brain).officerOut ? null : officerAboard(brain);
    }

`jobs/desk.ts:802`, in `deskOutcome`: the only place `officerOut` is set.

    case 'hurt':
      ...
        desk.officerOut = 'hurt';

The body does see when someone is down: `people_in_view` carries `"down" = crew_npc_person_down(person)` (`code/modules/llm_crew/crew_npc_senses.dm:191`). Nothing on the desk reads it for its own officer.

## How it was found

Read from the code, against the change log's account of `data/logs/2026/11/19/round-20.43.32`.

## How to fix it

1. Keep, on each warrant the desk has handed out, when it was given and when the officer last sent any word about it (an outcome, "in cuffs", "cannot bring in", a sighting acknowledged). Each desk warrant already has `givenAt` (used by the give-again rule in `syncDesk`): add `heardAt`.
2. In the desk's sync (where `serving` is used to decide who gets a warrant), treat the officer as out when either:
   - it is in view and `down` is set on it; or
   - a warrant has been with it for longer than a limit with no word (five minutes is a fair first value: an arrest takes under one, a room nobody opens is reported after about three), **and** the officer has not answered a check. Silence alone is not enough: an officer with no sighting walks the hallways, waits 90 seconds between rounds (`BETWEEN_WALKS_DS`) and sends nothing for as long as the person is not found, so a bare five-minute limit would take warrants off a working officer in an ordinary round, and two would be after the same person. So after the limit the desk sends one fixed line, "Nova, any word on X?", and the officer answers it in fixed words from its beat (still looking, last seen where). The officer side is new code in `officer.ts` (`takeWord` reading the question, a WORD task for the answer). No answer in two minutes, then out.
   Set `desk.officerOut = 'silent'` (or `'down'` for the first case) and tell the Captain once, in fixed words: "Captain, I have had no word from Nova on the warrant for X. I am serving the warrants myself." The existing path after `officerOut` (the Head of Security fetches a baton and goes) then runs unchanged.
3. Clear `officerOut` when the officer next sends any word, as "try again" clears it now (`desk.ts:443`), and hand back what is not yet served: `syncDesk` already calls `handBack` once `serving` names an officer again. Do not clear it on the officer merely being on the PDA list, which it never left.
4. With no Head of Security aboard the officer keeps the list itself, so there is nobody to take over. Then the Captain should at least be told nothing is happening: out of reach of this fix, since the one who would say so is the one who is down. Leave it.
5. The owner ruled on 2026-11-18 that nothing is built for crew who are down until there is a medical department ("We have no medical yet so not important"). This fix does not go to the officer or help it. It only stops the warrants being lost. **Check with the owner** that taking the warrants back falls outside that ruling.
6. The "seen down" case alone is about 10 lines in `serving`/`syncDesk` (`peopleInView` already carries `down`) and could go in first; the asked-and-silent case is the rest.

Keeps the rules: the Head of Security acts on what it sees and on the absence of PDA messages it would have received. No hidden channel.

## How to test the fix

- `tools/llm_crew/sim.ts`: a variant of `hurt` where the officer is taken straight to the floor with its PDA taken (the simulator can drop its messages). Pass when the Head of Security tells the Captain and goes for the suspect itself within the limit.
- `tools/llm_crew/security.ts`: a case for the new line to the Captain.
- Next round, `pda.log`: "I have had no word from".

## Check

Checked by Opus 5.5, read from the code.

- The quotes hold: `officerAboard` and `serving` (desk.ts:152 to 165) and the one place `officerOut` is set, the `hurt` case of `deskOutcome` (desk.ts:810). The only other writes are the initial null (desk.ts:125) and the Captain's "try again" (desk.ts:443).
- Traced the case: once given, a warrant goes to `taken` (by PDA in `deskAfterActing`, or after three gives with no word, `GIVE_TRIES`, desk.ts:966), and from then on `syncDesk` does nothing with it while `serving` names the officer. `serving` names it as long as it is in view or on `pdaPeople`. `people_on_pda` (crew_npc_cargo.dm:666) lists every messenger on the station level with an ID saved, whoever holds it and whether they are alive, so an officer down, dead or with its PDA dropped on the station is still "the officer". `down` is sent for people in view (crew_npc_senses.dm:191, types.ts:63) and nothing in desk.ts reads it. Nothing in the change log after the 20:53 entry touches it; that entry lists the lost second warrant as known and not fixed.
- Not a duplicate: HOLE-08 is the general rule and says itself that this is its own cause with a fix that stands alone.
- Corrected in the write-up: a PDA destroyed or taken off the station does drop the officer from the list, so "loses its PDA" is only the case of a PDA left on the station; and the desk already keeps `givenAt`.
- The fix as written would misfire: five minutes with no word is normal for an officer walking the hallways with no sighting, so the Head of Security would take the warrants off a working officer. Changed step 2 to ask first and treat only a failed answer as out, which needs officer-side code too; effort stays medium (window only). The "seen down" case should want the officer down for some seconds, not one look: `crew_npc_person_down` is also true during a short knockdown from a tackle.
- Severity medium: it happened in a round (change log 20:53 entry) but needs the officer to go down.
