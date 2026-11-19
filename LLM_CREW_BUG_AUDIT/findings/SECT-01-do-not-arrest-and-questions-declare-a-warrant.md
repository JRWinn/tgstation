---
id: SECT-01
title: Do not arrest X, and a question such as Is there a warrant for X, each declare a warrant on X
kind: bug
severity: high
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:257, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:302, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:463
fix: In readWarrant return null when the words before the match hold a negation or the line is a question, and let the LLM reader take it from there
---

## What is wrong

`readWarrant` looks for the warrant words anywhere in the line and takes whatever follows as the name. It never looks at what comes before them. So a line that says not to arrest someone, or asks whether there is a warrant, declares one.

Concrete case. The Captain sends the Head of Security a PDA message: "Joan, do not arrest Dana Reyes, she is with me." `deskTakes` reaches `readWarrant`, which finds "arrest Dana Reyes, she is with me". Dana Reyes is on the PDA list, so she is taken whole, and "she is with me" becomes the reason. The warrant goes on the list, every head is sent the notice, the officer is given it, and the Captain is told "Captain, I have that: a warrant for Dana Reyes, for she is with me. 5 minutes."

The same with "Is there a warrant for Marisol Burris?": a warrant for Marisol Burris, 5 minutes. "No warrant for Dana Reyes, she is fine", "Why did you arrest Pun Pun?" and "Did your officer arrest Pun Pun yet?" (reason "yet") all declare one too. The last two are what a Captain asks after someone has been put in a cell: by then Pun Pun is off the list, so a fresh warrant is put on someone who is already serving time.

This is the wrong person acted on: someone the Captain said to leave alone is hunted, batoned and jailed.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:257`:

    const WARRANT_WORDS =
      /\b(?:warrant\s+(?:out\s+)?(?:for|on)|apb\s+(?:out\s+)?(?:on|for)|wanted:|arrest|bring\s+in|lock\s+up|jail|detain|apprehend|capture)\s+(.+)/is;

`security.ts:306`, in `readWarrant`:

    const text = mendWords(written, known);
    const found = text.match(WARRANT_WORDS);
    const around = found ? null : text.match(LOCK_AROUND);
    const turned = found || around ? null : text.trim().match(WANTED_AFTER);

Nothing before `found.index` is looked at. `NOT_A_NAME` only tests the words after the match.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:463`, in `deskTakes`, takes it as declared:

    const declared = readWarrant(text, knownNames(brain));
    if (declared) {

The table in `tools/llm_crew/security.ts:27` tests only "Did you arrest him?", which is null because "him" is in `NOT_A_NAME`, not because it is a question.

## How it was found

A script run with bun from the system temp folder, importing `tools/llm_crew/fixtures` and `jobs/desk`, called `deskTakes(b, 'Zim Fire', 'Captain', msg, false)` on a fresh Head of Security brain. It printed:

    Joan, do not arrest Dana Reyes, she is with me. => [["Dana Reyes","she is with me",5]]
      "PDA to Zim Fire: Captain, I have that: a warrant for Dana Reyes, for she is with me. 5 minutes."
    Is there a warrant for Marisol Burris? => [["Marisol Burris","",5]]

`readWarrant` alone gave the same for "Do not arrest Pun Pun.", "Why did you arrest Pun Pun?" and "No warrant for Dana Reyes, she is fine." Not seen in a round.

## How to fix it

1. In `readWarrant`, once a match is found, take the text before it (`text.slice(0, found.index)` or `around.index`).
2. Return null if that text holds a negation as a word: `not`, `don't`, `dont`, `do not`, `never`, `no`, `stop`, `call off`, `hold off`, `leave`.
3. Return null if the line is a question: it ends in `?` (after trimming), or begins with `is|are|was|did|do|does|has|have|why|who|when|where|how|can|could|will|would|should` followed by words up to the match.
4. Do not refuse a line only because "no" appears somewhere else in it: keep the test to the words in front of the match, so "Warrant for Pun Pun, no time off" still reads.
5. A line refused this way returns false from `deskTakes` and goes on to `deskUnread`, so the LLM reader sees it. The LLM reading can only come back as a warrant if the model says so, and then the Captain gets the "I have that" line and can see it was wrong. Consider also teaching `buildReading` that a line saying not to arrest someone is "neither".
6. The fixed words a head uses (`warrantLine`) and the reading put back into words (`readingAsOrder`) both start "Warrant for", with nothing before, so neither is touched.

## How to test the fix

Add to `tools/llm_crew/security.ts`: `readWarrant` is null for "Do not arrest Pun Pun.", "Joan, don't arrest Dana Reyes, she is with me.", "Is there a warrant for Dana Reyes?", "Why did you arrest Pun Pun?", "Did your officer arrest Pun Pun yet?" and "No warrant for Dana Reyes, she is fine."; and still reads every line already in the table. In a round, have the Captain send "Joan, do not arrest <someone>" and check in `pda.log` that no "I have that: a warrant" comes back.
