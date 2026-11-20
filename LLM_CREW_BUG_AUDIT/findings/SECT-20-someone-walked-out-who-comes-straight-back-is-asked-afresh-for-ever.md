---
id: SECT-20
title: Someone walked out of a post who comes straight back in is a stranger again, is asked why from the start, and is never reported however often they return
kind: gap
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:353, tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:332
fix: Keep a short record of who was put out of the post and when, walk a returner out without asking again, and tell the head the second time they come back
---

## What is wrong

`syncGuarding` forgets a stranger the moment they are seen outside the post, or after a minute out of sight. Being walked out puts them outside, so the record goes at once. If they walk back in, they are new: watched for four to twelve seconds, asked "why are you in here?", waited on 30 seconds, asked again, waited on again, then told to go and walked out. About 70 seconds each time, and it can go on all shift.

Only a failed walk-out (`throw_out` answering "could not get") is word for the head (`wantedAfterActing`). A trespasser who goes quietly each time and comes straight back is never reported, and no warrant for trespass is ever declared on them. The technician spends the shift on them instead of on its work, since the stranger task is `'asked'`, above routine work.

Concrete case. A player, Bob, walks into the Cargo Bay. Donna asks, Bob says nothing, Donna asks again, then walks Bob to the lobby. `syncGuarding` sees Bob in the Cargo Lobby (`!seen.in_post`) and deletes `brain.strangers['Bob']`. Bob walks back in through the open door behind a technician. `recordOf` makes a fresh record with `asks: 0`, and it starts again.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:353`, in `syncGuarding`:

    for (const [name, stranger] of Object.entries(brain.strangers)) {
      const seen = brain.peopleInView.find((person) => person.name === name);
      // Seen outside the room, or not seen for a good while: they are gone, and so is the matter.
      if (
        (seen && (!seen.in_post || seen.belongs)) ||
        brain.now - stranger.lastSeenAt > GONE_DS
      ) {
        delete brain.strangers[name];
        continue;
      }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/wanted.ts:332`, `wantedAfterActing`: only a walk-out that fails is noted for the head:

    if (
      act.tool !== 'throw_out' ||
      ok ||
      isSecurity(brain.job) ||
      !WOULD_NOT_GO.test(text)
    ) {
      return;
    }

## How it was found

Read from the code. Not run and not seen in a round.

## How to fix it

1. Add `brain.putOut: Record<string, { at: number; times: number }>`. In `guardAfterSaying` or in the job's `afterActing` on a `throw_out` that went through, set `putOut[name] = { at: now, times: (old?.times ?? 0) + 1 }`.
2. In `syncGuarding`, when a stranger is seen in the post who is in `putOut` within the last ten minutes, set the new record to `verdict: 'go'` and `toldOutAt` undefined, so they are told once ("You were told to leave, Bob. Out you go.") and walked out, with no asking.
3. On the second return within ten minutes (`times >= 2`), push a `couldNot` entry as `wantedAfterActing` does, so the head is told and declares a warrant for trespass.
4. Trim `putOut` of entries older than ten minutes in `syncGuarding`, so it does not grow.
5. Leave the Captain and heads of staff out of it, as now (`settle`).

## How to test the fix

A simulator scenario with a player-like stranger who walks back into the Cargo Bay each time it is put out: the second time it is walked out with no question, and the third time the Quartermaster gets "I could not put ... out of the Cargo Bay" or the new word, and a warrant for trespass reaches the Head of Security.
