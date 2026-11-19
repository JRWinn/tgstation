---
id: ARR-13
title: A warrant the Head of Security hands back while its own arrest is under way leaves it holding the prisoner on no warrant, and the officer leaves them to it
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:244, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:951, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1093, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:740
fix: In handBack keep a warrant whose arrest is under way as well as one whose person is held, and in beatAfterActing take back a warrant the desk still lists when an arrest comes back with the cuffs on
---

## What is wrong

See also: TRB-02 (the same end state, reached by a pardon in the middle of an arrest). This is a second way in, by `handBack`, with a warrant that still stands. It matters for TRB-02's fix: that fix lets go of anyone cuffed on no warrant in hand. Applied here it would free someone the desk still lists as wanted.

When the Head of Security has an officer to send again, `syncDesk` calls `handBack` on every pass. `handBack` drops every warrant from the Head of Security's own hands except the one whose person it has by the arm. It does not look at whether an arrest is under way. The hold comes at the very end of `make_arrest` (`hold_arrested`, after the baton and the four seconds of cuffs), so for the whole of an arrest, up to about 20 seconds, the warrant is dropped from under it.

What then happens:

1. The serve task is finished (`syncBeat` closes a serve task whose warrant is gone). Nothing calls the errand off on the server, and it runs on (SEC-03). The cuffs go on, `hold_arrested` takes them by the arm, and the answer is `ok` with `cuffed: true`.
2. `beatAfterActing` finds no warrant for the task and returns at `if (!warrant) return;`. No "cuffed" outcome, no `cuffedByMe`.
3. The Head of Security now has someone cuffed by the arm, on no warrant in its own hands. `syncBeat` returns FALSE (no warrants, nothing to free, no kit wanted since `kitToo` is FALSE for it, not getting away while it holds someone), so its `OFFICE` task opens and it walks back to its office with the prisoner in tow, and stays there.
4. The desk has given the warrant to the officer (`given === 'no'`, then the give task). The officer finds them in cuffs it did not put on, and `serveStep` says "in cuffs already. Someone else from security has made the arrest, and you are leaving them to it."
5. Nobody puts them in a cell. The list goes on reading them as wanted.

When `serving()` turns from null to the officer:

- The Captain says "try again" after the officer broke off hurt (`officerOut` cleared in `deskTakes`). This is the case ARR-09 and SECT-11 walk through. The Head of Security has been serving the warrants itself since the officer was hurt, so it may well be in the middle of one.
- An officer comes aboard, or its PDA shows up on the list, while the Head of Security is serving alone.

One concrete case: Hale is hurt, so Joan serves the warrant on Pun Pun herself. She finds the monkey in the Bar, says the line, and sends `arrest(p2, 'force')`. The baton lands twice. The Captain, reading "Joan is serving the warrants herself", types "try again". `deskTakes` clears `officerOut`, and on Joan's next sync `serving()` is "Hale", `handBack` drops Pun Pun's warrant, and Hale is to be given it. Two seconds later the cuffs click shut and Joan has the monkey by the arm. Her window knows nothing of it. She walks Pun Pun to the Head of Security's Office. Hale, sent "Hale, warrant: Pun Pun, for trespass. Bring them in, 5 minutes.", goes to the last sighting, then the hallways, and when it does see the monkey, in cuffs, leaves it to whoever made the arrest.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:244`, `handBack`:

    export function handBack(brain: NpcBrain): void {
      const beat = beatOf(brain);
      const holding = brain.security?.holding;
      beat.warrants = beat.warrants.filter(
        (it) => !!holding && sameName(it.name, holding),
      );
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:951`, in `syncDesk`, on every pass:

    const officer = serving(brain);
    // With an officer to send, whoever keeps the list does not go after anyone itself.
    if (officer) {
      handBack(brain);
    }

`jobs/arrests.ts:1093`, in `beatAfterActing`:

    if (!warrant) {
      return;
    }

`jobs/arrests.ts:740`, in `serveStep`, the officer:

    if (seen.cuffed && !warrant.cuffedByMe) {
      return {
        ready: false,
        step: `${seen.name} is in cuffs already. Someone else from security has made the arrest, and you are leaving them to it.`,
      };
    }

`code/modules/llm_crew/crew_npc_security.dm:1027`, `hold_arrested`, the hold that comes last.

## How it was found

Read from the code. Not seen in a round. Marked `likely` because it needs the hand-back to land inside the few seconds of an arrest; every step after that was read through.

## How to fix it

1. In `handBack`, keep a warrant whose arrest is under way: the last step sent was an `arrest` for that warrant's serve task and no answer has come (`brain.lastAct?.act.tool === 'arrest'` and `brain.lastAct.task` is that task, or `brain.doing` is "arresting someone"). It is handed back on a later pass, once it is held (and then jailed) or the arrest has failed.
2. In `beatAfterActing`, when an `arrest` comes back `ok` or with `cuffed`, and the task's warrant is gone from `beat.warrants` but the person is now held: if this NPC keeps the list (`deskOf(brain)` lists a warrant whose name fits), put the warrant back in its hands with `giveWarrant` so that it jails them. Only when no list it can see has the warrant (a pardon, as in TRB-02) let go of them.
3. Whoever fixes TRB-02 should do it with step 2, so that the "let go of anyone held on no warrant" rule does not free someone wanted.

## How to test the fix

- `tools/llm_crew/security.ts`: a Head of Security brain with a warrant, `lastAct` an `arrest` for it, and `officerOut` cleared: after `syncDesk`, the warrant is still in `beat.warrants`.
- A simulator scenario: the Head of Security mid-arrest, then "try again" from the Captain. The prisoner should end up in a cell, and the officer should be given only the warrants not in hand.
- In the next round, grep `game.log` for the Head of Security `arrested` someone and check a `put ... in Cell` line follows.
