---
id: HOLE-08
title: Whoever a PDA lists first with the job is "the officer" or "the head" for ever, whether they are dead, a player who does not answer, or a PDA in a locker
kind: gap
severity: high
effort: large
confidence: sure
status: found
found_by: Fable 5.2
area: design
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:959, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:152, code/modules/llm_crew/crew_npc_cargo.dm:666, tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:109, tgui/packages/tgui/interfaces/CrewBrain/jobs/supply.ts:27, code/modules/llm_crew/crew_npc_danger.dm:8
fix: Keep, for each person a crew member relies on, a count of words sent and not answered and whether they were last seen down, pass over anyone who fails it when picking who holds a job, and tell its own head or the Captain once when someone has stopped answering
---

## What is wrong

See also: KNA-09 (the warrant case, in syncDesk and serving), QM-02 (the Quartermaster giving an order again for good, in giveStep), ENG-03 (the Chief Engineer's engineer(), in chiefengineer.ts). Each job has its own copy of the picker, so each of those is its own cause with a fix that stands alone; this file is the general rule across all of them.

Every chain of work in the crew runs through "the" holder of a job: the officer a warrant is given to, the head a need is taken to, the Quartermaster an order is sent to, the janitor a mess is reported to. Who that is, is worked out the same way everywhere: the first person in view with the job, and failing that the first on the PDA's list.

The PDA's list is every PDA on a station level that has a name on it (`people_on_pda`). It does not matter whether its owner is alive, awake, at the keyboard, or even carrying it. So:

- **A dead or unconscious crew member stays on the list.** Its PDA is on its body, on the station.
- **A human player with the job is on the list**, and may be picked ahead of an NPC. A player does not answer in the set words the crew listen for ("I have that", "noted", "On my way to the").
- **A PDA left in a locker, or carried by someone who took it, is on the list.**

Then, in each chain, a lack of answer is read as an answer, or waited on for ever:

- **Warrants.** The Head of Security gives a warrant to `officerAboard`. With no word back in a minute it gives it again, three times, and then `warrant.given = 'taken'`: "after that taken as heard". From then on it believes the warrant is being served. It serves a warrant itself only when `serving(brain)` is null, which needs there to be no officer on the list at all, or the officer to have said "I am hurt". An officer killed outright, spaced, cuffed and left in a locker, or a human officer who never reads the PDA, holds every warrant for the rest of the round. The Captain is told nothing. The top entry of the change log is this very thing seen in a round ("No word was sent to the Head of Security, who went on believing the warrant was being served"); the fix there made a hurt officer send word first, which helps only an officer that lives long enough to send it.
- **Needs.** A janitor short of supplies tells `headName`. If the Head of Personnel is dead, the janitor sends a PDA message, waits `TELL_AGAIN_DS` (8 minutes), sends it again, and so on to the end of the round. It never goes to the Captain or to cargo: `headName` puts "its own head before the Captain", and the dead head's PDA is still listed.
- **Meetings.** A head calls every one of its staff on the list, dead or not, to every meeting, counts them as not there ("2 of 3 there"), and sends each the "send me your report by PDA" word after. Nothing ever makes it wonder where the third is.
- **A mess reported to a janitor.** `janitors_on_pda` is the same list. The change log has "a technician calling one janitor six times in five minutes".
- **The Quartermaster and a big purchase.** With a Captain listed who never answers, the order is asked about twice and then "held: the Captain has not answered". That one is at least told to whoever ordered. It is the right shape, and the others lack it.

**And nobody notices anyone go down.** The one piece of code that would tell a crew member that someone has collapsed or died in front of it, `watch_for_harm` in `crew_npc_danger.dm`, is marked "NOT SWITCHED ON. Nothing calls watch_for_harm()". The `down` flag the server sends for each person in view is used only so that security do not hit someone on the floor. A janitor mops round a dead officer. There are no medical staff, and the change log says so ("Nobody goes to an officer who is down"), but nobody is told either: not the Head of Security, not the Captain.

One concrete case. Pun Pun beats the officer unconscious in a hallway (it has happened in two rounds). The Captain declares a warrant on Pun Pun. The Head of Security sends "Warrant on Pun Pun..." to the officer's PDA three times over three minutes, marks it taken, and goes back to its office. Nothing more happens. With the officer's body in plain sight of two janitors.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:959`, `syncDesk`:

        } else if (
          warrant.given === 'said' &&
          warrant.givenAt !== null &&
          brain.now - warrant.givenAt > TAKEN_WAIT_DS
        ) {
          // Given, and no word back. It is given again, and after that taken as heard.
          warrant.gives += 1;
          warrant.given = warrant.gives >= GIVE_TRIES ? 'taken' : 'no';

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:152`, `officerAboard` (the same shape as `headName` in `jobs/meetings.ts:109`, `quartermasterAboard` in `jobs/supply.ts:27`, `captainName` and `staff` in `jobs/head.ts:176` and `:208`):

      return (
        brain.peopleInView.find(isOther)?.name ??
        brain.pdaPeople.find(isOther)?.name ??
        null
      );

`code/modules/llm_crew/crew_npc_cargo.dm:666`, `people_on_pda`:

    		if(candidate == own_messenger || isnull(candidate.computer) || !candidate.computer.saved_identification)
    			continue
    		// Only people aboard. ...
    		var/turf/where = get_turf(candidate.computer)
    		if(isnull(where) || !is_station_level(where.z))
    			continue
    		people += list(list("name" = candidate.computer.saved_identification, "job" = candidate.computer.saved_job))

`tgui/packages/tgui/interfaces/CrewBrain/jobs/meetings.ts:204`, `needStep`:

      if (
        brain.toldHeadAt !== null &&
        brain.now - brain.toldHeadAt < TELL_AGAIN_DS
      ) {
        return {
          ready: false,
          step: `You need ${need}. You have told ${head}, and are waiting to hear that it has come.`,
        };
      }

`code/modules/llm_crew/crew_npc_danger.dm:8`:

     * NOT SWITCHED ON. Nothing calls watch_for_harm(), and the flee tool is not one the brain can call.

## How it was found

Read from the code. The officer case is in the change log's top entry (`data/logs/2026/11/19/round-20.43.32`), which I did not open again. The human-player cases have not been seen: no round has had a second human.

## How to fix it

The rule to build is general: nobody is counted on who has given reason not to be. It is one small piece of memory, used by every lookup.

1. In the window, add `brain.reliance: Map<name, { unanswered: number, lastAnswerAt: number, downAt: number | null }>` and a helper file `reliance.ts` with:
   - `sentWordTo(brain, name)`: called where a PDA message or a spoken line that expects an answer is sent (the driver knows: a `message` act, or a `say` with `needs`). Adds one to `unanswered`.
   - `heardFrom(brain, name)`: called in `ingest` for any `speech_heard` or `pda_message` from that name. Sets `unanswered` to 0.
   - `sawDown(brain, name)`: called in `ingest` when `people_in_view` has them with `down` for more than, say, 30 seconds.
   - `countsOn(brain, name)`: false if `downAt` is recent, or `unanswered >= 3` with nothing heard since.
2. Change the lookups (`officerAboard`, `headName`, `quartermasterAboard`, `captainName`, `staff`, the janitor list in `jobs/cargo.ts`) to take the first match that `countsOn`. With none left, each already has a "nobody aboard" branch and falls into it: the Head of Security serves the warrant itself, the Head of Personnel walks to the cargo counter, a janitor's need goes to the Captain (`headName` falls through to the Captain when its own head is passed over).
3. In `syncDesk`, replace "after that taken as heard" with: after `GIVE_TRIES`, the officer is not counted on, the warrant comes back to the Head of Security's own hands, and the Captain is told once ("Captain, <officer> is not answering. I am serving the warrants myself."). That line already exists for the hurt case at `desk.ts:816`.
4. One word up the chain, once per person: when someone stops being counted on, tell its own head, or the Captain if it is the head ("<name> is not answering me"). Use `brain.toTell` with `byPda: true`.
5. Reset is by `heardFrom`: someone who speaks or writes again is counted on again.
6. Switch on the smallest useful part of `watch_for_harm`: only `CREW_HARM_BODY`, `CREW_HARM_DOWN`, `CREW_HARM_DIED` and `CREW_HARM_COLLAPSED` for other people, not `CREW_HARM_HURT` and not the body itself. The file's own header says how to switch it on. In the window, a `danger` event calls `sawDown` and queues one word to security's head and its own head ("<name> is down in the <room>"). No fleeing, no first aid.

This keeps the rules: all of it is from what the body sees, hears and is sent, the model is not asked anything, and it is not tied to one job.

Questions for the owner:
- With no medical staff, what should be done for someone who is down: only word sent, or dragged somewhere (to Medbay's door, to the Security Office)?
- How many unanswered words before someone is given up on, and should it differ for a player? A player may simply be slow.
- When a player and an NPC hold the same job, which is "the" one? (See HOLE-03.)

## How to test the fix

- `tools/llm_crew/security.ts`: a case where the officer never answers: after three gives the Head of Security's own beat has the warrant and one line to the Captain is queued.
- Simulator: in `warrant`, remove the officer's brain after the warrant is given (the body stays, its PDA stays). The check is that the arrest still happens. In `crew`, do the same to the Head of Personnel and check that the janitor's need reaches the Captain or the cargo counter.
- Type check and server compile (step 6 is server code).
- In a round: kill the officer with admin tools, declare a warrant, and read `pda.log` for the "is not answering" line and `game.log` for the Head of Security's own arrest.
