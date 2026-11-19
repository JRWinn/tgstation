---
id: SECT-21
title: Walker is wanted on the bridge, Dana is wasted and put Dana up for the night shift are each read as a warrant, the spelling mender making wanted out of wasted and waited
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:269, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:178, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:260
fix: Refuse is wanted when a place word follows it, keep the mender off the ordinary words it turns into key words, and allow up in the lock-around pattern only after lock
---

## What is wrong

Three of the ways `readWarrant` reads a warrant also catch ordinary talk.

1. "X is wanted ..." (`WANTED_AFTER`) is taken as a warrant whatever follows. In speech "wanted" often means "needed somewhere". The Captain tells the Head of Security "Joan, Walker is wanted on the bridge." This is read as a warrant on Walker Wolfe for "on the bridge". From the Captain a warrant on a head is allowed, so it is taken: the Head of Personnel goes on the list, the other heads are sent the notice, and the officer goes to arrest him. "Dana is wanted in the kitchen" gives a warrant on Dana Reyes for "in the kitchen".
2. `mendWords` changes any word a letter off one of its key words, if it begins with the same letter and is about as long. "wasted" and "waited" are one letter from "wanted", so they become it. "Pun Pun is wasted again" is read as "Pun Pun is wanted again": a warrant on Pun Pun. "Dana is waited on in the bar" is a warrant on Dana. The mender also makes "wanted" out of "wonted" and "wanter", "detain" out of "detail" and "withdraw" out of "withdrawn" (see SECT-04).
3. `LOCK_AROUND` takes "put X up" as "lock X up". "Put Dana up for the night shift" is a warrant on Dana Reyes for "the night shift".

Each is answered "Captain, I have that: a warrant for ...", so the Captain can see it and take it back, if he knows the words that do (SECT-04).

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:269`:

    const WANTED_AFTER =
      /^(?:[A-Za-z'-]+,\s*)?(.+?)\s+(?:is|are)\s+wanted\b[\s,]*(.*)$/is;

`security.ts:178`, `mendWords`:

    const meant = KEY_WORDS.find(
      (key) =>
        key[0] === lower[0] &&
        Math.abs(key.length - lower.length) <= 1 &&
        lettersApart(lower, key) <= slack(key.length),
    );
    return meant ?? word;

`security.ts:260`:

    const LOCK_AROUND =
      /\b(?:lock|throw|put|toss|stick|chuck)\s+(.+?)\s+(?:up\b|in(?:to|side)?\s+(?:the\s+|a\s+)?(?:brig|cells?|jail|lock-?up)\b)(.*)$/is;

## How it was found

A bun script in the system temp folder importing `jobs/security.ts` called `readWarrant(line, ['Walker Wolfe', 'Dana Reyes', 'Pun Pun'])`:

    "Joan, Walker is wanted on the bridge." => {"name":"Walker Wolfe","reason":"on the bridge","minutes":null}
    "Dana is wanted in the kitchen" => {"name":"Dana Reyes","reason":"in the kitchen","minutes":null}
    "Pun Pun is wasted again" => {"name":"Pun Pun","reason":"again","minutes":null} | Pun Pun is wanted again
    "Put Dana up for the night shift" => {"name":"Dana Reyes","reason":"the night shift","minutes":null}
    "Dana is waited on in the bar" => {"name":"Dana Reyes","reason":"on in the bar","minutes":null}

Not seen in a round.

## How to fix it

1. In `readWarrant`, when the match is `WANTED_AFTER`, return null if the first word of `turned[2]` (what follows "wanted") is a place or errand word: `on|in|at|to|up|down|upstairs|downstairs|over|back|here|there|outside|inside|again`, or "by" followed by anything but security. Do it as a blacklist, not by allowing only "for ...": "Dana Reyes is wanted, she took the ID" reads today as a warrant for "she took the ID", and a regex that allows only nothing, "for ..." or "by security" after "wanted" would lose it.
2. In `mendWords`, leave alone the ordinary words it now turns into key words. Run every word through it to find them; a run of likely words gave `wasted`, `waited`, `wonted`, `wanter` (to wanted), `detail` (to detain), `withdrawn` (to withdraw). Keep a small `NOT_MISSPELT` set of those beside `KEY_WORDS` and return the word unchanged when it is in it. Do not put plurals in it: `arrests`, `warrants`, `pardons`, `cancels`, `minute` and `apprehends` are mended to their key word today and must stay so. (`warned`, `arrive`, `relapse`, `release` are not changed today and need no entry.)
3. In `LOCK_AROUND`, allow `up\b` only after "lock" ("lock X up"), not after put, throw, toss, stick or chuck, which need "in the brig/cell/jail". Split it into two alternatives so the name group stays group 1 and the rest group 2, or `readWarrant`'s `${around[1]}${around[2]}` breaks.
4. A line refused this way by PDA from a head goes to the LLM reader (`desk.unread`), which should answer "neither". Said aloud, it goes to no reader and is answered by the voice (see PARSE-05); that is fine for these lines.

## How to test the fix

Add the five lines above to the `readWarrant` cases in `tools/llm_crew/security.ts`, each null; keep "Pun Pun is wanted", "Joan, Dana Reyes is wanted for theft", "Dana Reyes is wanted, she took the ID", "Pun Pun is wanted for theft. 10 minutes", "throw Dana in the brig", "lock Pun Pun up for 10 minutes" and "warrent for pun pun" reading as now. Add `mendWords` cases: "wasted" and "detail" unchanged, "warrents" and "arests" still mended.

## Check

Checked by Opus 5.5. The three quotes are what `jobs/security.ts` says today (`LOCK_AROUND` at 260, `WANTED_AFTER` at 269, `mendWords` at 178, with `slack` at 130 giving one letter of slack to a six- or seven-letter key word). A throwaway bun script in the scratchpad imported `jobs/security.ts` by absolute path and ran `readWarrant` with `['Walker Wolfe', 'Dana Reyes', 'Pun Pun']`: all five lines in "How it was found" gave the same warrants, and "Dana is wanted at the meeting" and "Walker is wanted by the Captain on the bridge" did too. Running single words through `mendWords` found `wonted`, `wanter` and `detail` mended as well, and showed `warned`, `arrive`, `relapse` are not, so the word list in the fix was corrected (it also named plurals that must keep being mended). The line reaches `readWarrant` through `deskTakes` (`desk.ts:463`) when sent by PDA or said to the Head of Security (`deskHears` needs `said_to === 'me'`); `deskTakes` mends the words again first, so the mender fault applies there too. From the Captain a warrant on a head passes `REFUSALS.onHead`, so the Head of Personnel case does go on the list. Nothing in `LLM_CREW_CHANGELOG.md` (entries M1 and M5 added these forms) chose this behaviour. Not a duplicate: PARSE-13 names it as a separate case, SECT-01 is negation and questions. Severity left at medium: an innocent person can be arrested, but the wordings are uncommon in lines put to security, and the reply "I have that: a warrant for ..." shows the Captain at once. Step 1 of the fix was changed from an allow-list to a blacklist because the allow-list would have broken a reading that works now.
