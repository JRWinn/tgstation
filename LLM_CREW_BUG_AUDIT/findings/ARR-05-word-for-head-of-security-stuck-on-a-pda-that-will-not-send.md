---
id: ARR-05
title: Word for the Head of Security that has gone to the PDA once is never said to its face, so with PDAs down it is never told
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: 96d395895f1
found_by: Fable 5.2
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:206, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:156, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:504
fix: In tellHead say the word face to face whenever the Head of Security is in sight, after a PDA send fails go to the post to find them, and have the desk take the same outcome only once
---

## What is wrong

How a warrant went is told to the Head of Security face to face, or by PDA when that cannot be done. Once a word is marked `byPda` it stays so: `tellHead` returns the PDA step before it even looks whether the Head of Security is in sight. A send that fails keeps the word "to be tried again later", and the driver tries the same `message` step again after 20 seconds, then 40, up to every two minutes, for the rest of the round.

So when PDA messages stop going out (a communications blackout, or the station's power gone, which the owner's notes say happens about 26 minutes into test rounds), nothing the officer has to report ever reaches the Head of Security, though the two share the Security Office and may be standing a tile apart. The Head of Security does the opposite for the same trouble: a warrant that will not send is taken to the officer on foot (`warrant.unsent` in `giveStep`, `jobs/desk.ts`).

It also means that with PDAs working, an officer whose head walks into the room goes on sending it a PDA message.

One concrete case: PDAs are down. The officer cuffs someone out in the hallway. The word "Joan, I have Dana Reyes in cuffs." has no head in sight and the officer is not at its post, so `tellHead` sets `word.byPda = true` and sends. The send fails ("Your PDA would not send the message"). The officer walks its prisoner to the brig and jails them: a second word, "Dana Reyes is in Cell 1 for 5 minutes", goes the same way. The Head of Security comes into the Brig. Both words stay on the PDA, retried at longer and longer gaps. The list still reads "Dana Reyes: still wanted", the Captain is told nothing, and the cell's timer runs out with nobody having heard of the arrest.

A word that is hurt, attacked or baton is marked `byPda` in `syncTasks` whenever the Head of Security is out of sight at that moment, with the same result.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:195`, in `tellHead`:

    const byPda = (): Plan =>
      brain.hasPda
        ? {
            ready: true,
            step: `You have word for ${head.name}, the Head of Security, and cannot tell them to their face. You are sending it by PDA: "${word.line}"`,
            act: { tool: 'message', person: head.name, text: word.line },
          }
        : {
            ready: false,
            step: `You have word for ${head.name}, the Head of Security, and no way to get it to them.`,
          };
    if (word.byPda) {
      return byPda();
    }

`officer.ts:156`, in `syncTasks`:

    const urgent = ['hurt', 'attacked', 'baton'].includes(word.outcome.what);
    if (
      urgent &&
      !brain.peopleInView.some((person) => person.name === head?.name)
    ) {
      word.byPda = true;
    }

`officer.ts:504`, in `afterActing`:

    // Sent by PDA, it is passed on. One that will not send is kept, and tried again later.
    if (word && act.tool === 'message' && ok) {
      beat.words = beat.words.filter((it) => it !== word);
    }

`code/modules/llm_crew/crew_npc_cargo.dm:719`, `tool_message`: a send that fails answers `ok: false`, "Your PDA would not send the message." The server also keeps the text and sends it again itself (`resend_unsent`), so when PDAs come back the word can arrive twice: once from the server's kept copy and once from the window's next try.

## How it was found

Read from the code. Not seen in a round.

## How to fix it

1. In `tellHead`, look for the Head of Security in view first. If `seen`, take the face-to-face path whatever `word.byPda` says, and clear `word.byPda`. Keep the rule that a word said and not answered twice goes to the PDA (`TELL_TRIES`), but let that be undone the next time they are in sight and the PDA has failed.
2. In `afterActing`, when the `message` for a word comes back not ok, set `word.unsent = true` (new field on `BeatWord`). In `tellHead`, for a word that is `unsent` and with nobody in sight: if `brain.post` is set and the officer is not there and has nobody by the arm and no one in sight on a warrant (`!onLead(brain)`), the step is `go_to` the post. At the post it waits (`wait: true`) for the head to come into sight, and tries the PDA again every few minutes. This is the same shape as `giveStep` in `jobs/desk.ts`.
3. With no PDA at all (`!brain.hasPda`) take the same on-foot path, not "no way to get it to them".
4. Because the server sends a kept message again by itself, do not send the same line again from the window while `unsent` is set and less than a few minutes old. Otherwise the Head of Security hears one arrest twice and counts it twice (`desk.arrests += 1` in `deskOutcome` has no guard against the same word coming twice). That is not enough on its own: once the word has been said face to face and heard, the server still holds its kept copy and sends it when the PDAs come back (it keeps one for up to eight minutes, `CREW_NPC_UNSENT_KEPT`), and the window has no way to call it back. So also, in `deskOutcome` in `jobs/desk.ts`, take an outcome only once: keep the last few as `what|name|from` with the time, and pass over the same one within ten minutes, with no second "jailed" for the Captain and no second count. That guards every other word that goes both ways as well.
5. A dead LLM changes nothing here: the line is fixed and said word for word.

What must keep working: "I am hurt" still goes at once by PDA when the head is not in sight and the PDA works. Out on the station with a working PDA the officer does not walk back to tell.

## How to test the fix

- Type check and lint.
- `tools/llm_crew/security.ts`: a case for `tellHead` with `word.byPda` set and the Head of Security in view: the plan is `say`, not `message`. A case for `deskOutcome` given the same "jailed" outcome twice: `desk.arrests` goes up by one and the Captain is told once.
- Simulator: `warrant` with the server side answering every `message` with `ok: false`. Check that after the jail the officer goes to its post and, with the Head of Security put in view, says the line and gets "I have that" back, and that the head's list drops the warrant.
- In a round after power has failed: `game.log` "was told by its brain to say:" with the outcome line, said in the Security Office, and no long run of "its PDA would not send it" for the same text.

## Check

Checked by Opus 5.5. Confirmed. Effort raised to medium: the fix touches `officer.ts` and `desk.ts`.

Read `tellHead` (`officer.ts:187-261`): `if (word.byPda) return byPda();` comes before the look for the head in view, and nothing in the file ever sets `byPda` back to false. `syncTasks` (`:154`) sets it for an urgent word whenever the head is out of sight. `afterActing` (`:521`) drops a word only on a `message` that went; a failed one stays, and the driver's `fail` (`driver.ts:931`) holds the step back for `RETRY_MS * count`, up to `RETRY_MAX_MS`, then sends it again. Read `tool_message` (`crew_npc_cargo.dm:692-738`): a send that fails answers `ok: false` and keeps the text; `resend_unsent` (`:755`) sends it later by itself, and the window is never told that it went. So with PDAs down the word never reaches a head standing in the same room. With PDAs back, the server's copy and the window's next try can both arrive. Read `deskOutcome` (`desk.ts:729`): a second "jailed" counts a second arrest (`desk.arrests += 1`) and tells the Captain again; nothing guards it.

The Head of Security's own `giveStep` (`desk.ts:1039-1050`) does go on foot after a failed send (`warrant.unsent`), so the shape to copy is there. Nothing in the change log fixes this or chose it. Added to step 4 that the window cannot recall the server's kept copy, and a guard in `deskOutcome` for it.
