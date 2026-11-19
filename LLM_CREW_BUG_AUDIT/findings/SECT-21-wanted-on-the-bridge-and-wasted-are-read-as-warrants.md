---
id: SECT-21
title: Walker is wanted on the bridge, Dana is wasted and put Dana up for the night shift are each read as a warrant, the spelling mender making wanted out of wasted and waited
kind: bug
severity: medium
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:269, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:178, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:260
fix: Take is wanted as a warrant only when nothing but a reason follows it, never with a place after it, keep the mender off words that are real words, and drop up from the lock-around pattern unless the verb is lock
---

## What is wrong

Three of the ways `readWarrant` reads a warrant also catch ordinary talk.

1. "X is wanted ..." (`WANTED_AFTER`) is taken as a warrant whatever follows. In speech "wanted" often means "needed somewhere". The Captain tells the Head of Security "Joan, Walker is wanted on the bridge." This is read as a warrant on Walker Wolfe for "on the bridge". From the Captain a warrant on a head is allowed, so it is taken: the Head of Personnel goes on the list, the other heads are sent the notice, and the officer goes to arrest him. "Dana is wanted in the kitchen" gives a warrant on Dana Reyes for "in the kitchen".
2. `mendWords` changes any word a letter off one of its key words, if it begins with the same letter and is about as long. "wasted" and "waited" are one letter from "wanted", so they become it. "Pun Pun is wasted again" is read as "Pun Pun is wanted again": a warrant on Pun Pun. "Dana is waited on in the bar" is a warrant on Dana. The mender also makes "detain" out of "detail" and "withdraw" out of "withdrawn" (see SECT-04).
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

1. In `WANTED_AFTER`, take it as a warrant only when what follows "wanted" is nothing, or "for" and a reason, or "by security": `wanted\b(?:\s*(?:,|for\s+.+|by\s+security.*))?\s*[.!]?$`. Refuse when a place word follows ("on", "in", "at", "to", "upstairs", a room name).
2. In `mendWords`, leave alone a word that is itself an ordinary English word. A short list will do for the near misses that matter: "wasted", "waited", "wanted", "warned", "detail", "detained", "withdrawn", "arrive", "release", "relapse", "cancels", "minute". Better, mend only words that are not in a small dictionary of common words, if the owner accepts the size.
3. In `LOCK_AROUND`, allow `up\b` only after "lock" ("lock X up"), not after put, throw, toss, stick or chuck, which need "in the brig/cell/jail".
4. These lines then go to the LLM reader, which should answer "neither".

## How to test the fix

Add the five lines above to the `readWarrant` cases in `tools/llm_crew/security.ts`, each null; keep "Pun Pun is wanted", "Joan, Dana Reyes is wanted for theft", "lock Pun Pun up for 10 minutes" and "warrent for pun pun" reading as now.
