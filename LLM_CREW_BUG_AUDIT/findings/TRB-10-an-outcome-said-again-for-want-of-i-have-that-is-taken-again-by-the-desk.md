---
id: TRB-10
title: An officer's word on a warrant that it says again, because it did not hear I have that, is taken again by the Head of Security, and the Captain and the declarer are told twice
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:729, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:210, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:765
fix: In deskOutcome keep the last few outcome lines heard from each officer with the time, and on the same line again only answer I have that, doing nothing else
---

## What is wrong

The officer does not count its word to the Head of Security as passed on until it hears "Hale, I have that." back. With no answer in 25 seconds it walks up and says it again, and after a second try it sends it by PDA (`tellHead`). That is right for the officer, but the Head of Security has no memory of what it has already been told: `deskOutcome` acts on every copy.

When the first telling was heard and only the answer was lost (the Head of Security's "I have that" waits while its voice is answering something else, or the officer had walked off out of sight by the time it was said, since a quick word is said only to someone in view), the second telling is acted on a second time:

- `jailed`: the Captain gets "Captain, Dana Reyes is in Cell 1 for 5 minutes." twice, the head that declared it gets it twice, and `desk.held[...].until` is pushed back by the time between the two, so the desk's "In the cells" list keeps her longer than the cell does.
- `cuffed`: "Captain, Hale has Dana Reyes in cuffs." twice.
- `hurt`: if "try again" came between the two (it can: the Captain answers the first quickly), the second copy puts the officer out again and takes the warrants back, with the Captain told again.
- `attacked`, `baton`, `cannot`: the Captain told twice.

The case:

1. The officer jails Dana and walks back to its post to tell the Head of Security, who is talking with the Captain. It says "Joan, Dana Reyes is in Cell 1 for 5 minutes." `deskOutcome` takes it: the Captain and the declarer are sent the PDA, and "Hale, I have that." is queued.
2. The Head of Security's voice is busy answering the Captain (`mustSay` is set), so the quick word waits. The officer, having said its piece, turns to its next task and walks out of sight; the queued word needs the officer in view and is not said.
3. 25 seconds on, `tellHead` counts one unheard, the officer comes back in sight, walks up and says it again. `deskOutcome` takes it again: two more PDA messages, `held` reset.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:210`, in `tellHead`, the word said again:

    if (word.toldAt !== undefined) {
      if (brain.now - word.toldAt < HEARD_WAIT_DS) {
        ...
      }
      word.toldAt = undefined;
      word.unheard += 1;
      word.walkedUp = false;
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:729`, `deskOutcome`, which answers and then acts, every time:

    if (aloud && !own) {
      const line = heardLine(from);
      brain.toTell = brain.toTell.filter((tell) => tell.line !== line);
      brain.toTell.push({ ... });
    }
    const warrant = desk.warrants.find((it) => sameName(it.name, outcome.name));
    ...
    switch (outcome.what) {

`desk.ts:765`, the `jailed` case: nothing in it looks at whether this cell and name were already taken.

    case 'jailed': {
      const minutes = outcome.minutes ?? MINUTES_USUAL;
      desk.held[outcome.name] = {
        cell: outcome.cell ?? 'a cell',
        until: brain.now + minutes * 600,
      };
      ...
      tellCaptain(...)

`driver.ts:701`, why the answer can be lost: a quick word is said only to someone in view.

    const quick = brain.toTell.find(
      (it) =>
        it.whileBusy &&
        !it.byPda &&
        now - it.at < (it.keepMs ?? TELL_KEPT_MS) &&
        brain.peopleInView.some((person) => person.name === it.to),
    );

## How it was found

Read from the code on both sides. Not seen in a round.

## How to fix it

1. On the desk, keep `desk.lastHeard: Record<officer, { line: string; at: number }[]>` with the last few outcome lines and when they came. In `deskTakes`, for an outcome from security staff, if the same line came from the same sender in the last few minutes, queue "I have that" again (so the officer can stop) and return TRUE without calling `deskOutcome`.
2. Do the same for a word that comes once face to face and then by PDA: the PDA copy of the same line is the same word.
3. Keep `deskOutcome` itself as it is.

## How to test the fix

- `tools/llm_crew/security.ts`: call `deskTakes` twice with the same `jailed` line from the officer; the Captain must be sent one message, and `I have that` queued both times.
- Type check.
- In a round, grep `pda.log` for the same "is in Cell" line to the Captain twice.
