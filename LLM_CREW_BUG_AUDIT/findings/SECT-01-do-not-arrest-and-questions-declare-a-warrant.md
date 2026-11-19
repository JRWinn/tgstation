---
id: SECT-01
title: Do not arrest X, and a question such as Is there a warrant for X, each declare a warrant on X
kind: bug
severity: high
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:257, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:302, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:463
fix: In readWarrant return null when the few words just before the match in the same clause hold a negation, or the line is a question that is not a polite order, and let the LLM reader take it from there
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
2. Keep only the clause the match is in: the text after the last `,.;:!?` before the match. Return null if the last three words of that clause hold a negation: `not`, `don't`, `dont`, `never`, `no` (as in "no warrant for"), `hold off`. Do not use `stop` or `leave` as negations: "Leave the bar and arrest Pun Pun" is an order. With the test kept to the clause, "Don't wait, arrest Pun Pun now." still reads (it does today).
3. Return null if the line is a question about a warrant, not an order: it ends in `?` (after trimming) or begins with `is|are|was|were|did|does|has|have|had|why|who|when|where|how`. Do not refuse "Can you / Could you / Would you / Will you (please) arrest X?": that is how many players give an order, and today it reads as one (checked: "Could you arrest Pun Pun, please?" gives a warrant on Pun Pun). Refusing it would push a real order onto the model.
4. Do not refuse a line only because "no" appears somewhere else in it: keep the test to the words in front of the match, so "Warrant for Pun Pun, no time off" still reads.
5. A line refused this way returns false from `deskTakes` and goes on to `deskUnread`, so the LLM reader sees it. The LLM reading can only come back as a warrant if the model says so, and then the Captain gets the "I have that" line and can see it was wrong. Consider also teaching `buildReading` that a line saying not to arrest someone is "neither".
6. The fixed words a head uses (`warrantLine`) and the reading put back into words (`readingAsOrder`) both start "Warrant for", with nothing before, so neither is touched.

## How to test the fix

Add to `tools/llm_crew/security.ts`: `readWarrant` is null for "Do not arrest Pun Pun.", "Joan, don't arrest Dana Reyes, she is with me.", "Is there a warrant for Dana Reyes?", "Why did you arrest Pun Pun?", "Did your officer arrest Pun Pun yet?" and "No warrant for Dana Reyes, she is fine."; and still reads every line already in the table, plus "Could you arrest Pun Pun, please?", "Don't wait, arrest Pun Pun now." and "Leave the bar and arrest Pun Pun" (each a warrant on Pun Pun). Through `deskTakes` from the Captain by PDA, each refused line returns false and the Head of Security's `readsMessage` puts it in `desk.unread`. In a round, have the Captain send "Joan, do not arrest <someone>" and check in `pda.log` that no "I have that: a warrant" comes back.

## Check

Read `readWarrant`, `WARRANT_WORDS`, `NOT_A_NAME` (`jobs/security.ts:257` to `398`), `deskTakes` (`jobs/desk.ts:311` to `560`) and its callers (`headofsecurity.ts:219`, `officer.ts:448`, `deskHears`, `deskRead`). The quotes are what the code says today. Nothing before `readWarrant` in `deskTakes` looks for a negation or a question: the notice, staff, cancel, pardon and try-again tests all fall through for these lines, and `mendWords` leaves "Don't" and "dont" alone. `NOT_A_NAME` tests only the words after the match.

Ran a throwaway bun script in the scratchpad, using `tools/llm_crew/fixtures` and a Head of Security brain set up as `tools/llm_crew/security.ts` does. From the Captain by PDA, every line in the write-up came back true from `deskTakes` with a warrant pushed and "I have that: a warrant for ..." sent, for example "Joan, do not arrest Dana Reyes, she is with me." gave `["Dana Reyes","she is with me",5]` and "Did your officer arrest Pun Pun yet?" gave `["Pun Pun yet","",5]`. No unread entry was made, so the LLM reader never saw any of them.

Nothing in `LLM_CREW_CHANGELOG.md` or the plans chose this or fixed it. The 18:05 entry's "Three wordings" and the 16:50 entry's M5 (the LLM reader) touch `readWarrant` but not negations or questions.

Kept high: someone the Captain said to leave alone is hunted and jailed. Kept small: one function. Changed the fix so that a polite "Could you arrest X?" and a negation in an earlier clause ("Don't wait, arrest X") still read as orders, and dropped `stop` and `leave`, which would refuse real orders.
