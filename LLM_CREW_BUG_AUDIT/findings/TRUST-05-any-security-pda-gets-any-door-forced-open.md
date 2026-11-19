---
id: TRUST-05
title: Any PDA that shows a security job can have an engineer pry open any door aboard, the Armory and the Vault among them, and leave it standing open
kind: bug
severity: high
effort: medium
confidence: sure
status: found
found_by: Opus 5.5
area: engineering
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:209, tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:53, tgui/packages/tgui/interfaces/CrewBrain/jobs/engineer.ts:522, code/modules/llm_crew/crew_npc_forcing.dm:105
fix: Take a forcing request only from whoever keeps security's list, only for a warrant engineering can check and a room that is not a secure store, and have the Captain say yes to anything in command or security
---

## What is wrong

Forcing a door is meant to be "the last step, and only that" (`forcing.ts`, top): an officer shut out of a room with someone wanted inside asks those whose ID opens it, then the Head of Security asks the Chief Engineer, who sends an engineer.

What engineering actually checks, when a PDA message comes in, is two things: the words match security's fixed line, and the sender's PDA shows a job with "head of security" or "security officer" in it. Nothing checks that there is a warrant, that the name in the line is anyone, that the sender is the one who keeps the list, or what the room is. The engineer's body then takes the door's power away, pries it open with a crowbar and leaves it standing open, as it is meant to for an arrest.

So any security officer, which is an ordinary job that players take every round, gets any room aboard opened. So does anyone with a forged sender (TRUST-02) or a card that says "Security Officer" (HOLE-01).

One concrete case:

1. A player who is a Security Officer sends the Chief Engineer, from their own PDA: "Rory, security needs the door of the Armory opened: Bob Hale is inside on a warrant. Could you send an engineer, please?"
2. The Chief Engineer's `readsMessage` calls `forcingReads`. `ASK_WORDS` matches anywhere in the text. `engineering` is true, `isSecurity("Security Officer")` is true. The chief gives it to its engineer by PDA and sends back "I am sending Dana to open the Armory."
3. The engineer's `forcingReads` matches `ORDER_WORDS` from the Chief Engineer and takes the job. `planForcing` sends `force_door` with `place: "Armory"`.
4. `tool_force_door` on the server finds the room by name (`find_known_place`, which also takes a loose match), checks the engineer has its tools and knows the wires, walks it there, cuts the power and pries the door. The Armory's door stands open with no power, for anyone.

The engineer does the same on a PDA sent straight to it (`engineer.ts:522` calls `forcingReads` first, and an engineer with the ask goes itself). The Vault, the Captain's Quarters, the AI Upload and every head's office work the same way: none of those open to an engineer's or a Chief Engineer's ID, so none of them is turned away as "opens to your ID".

The words are fixed and short. A player sees the Head of Security's copy to the Captain, "Captain, I have asked engineering to open the ...", and anyone who has watched one round as a ghost has seen the whole line.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:53`:

    const ASK_WORDS =
      /\bsecurity needs the door of the (.+?) opened: (.+?) is inside on a warrant\b/i;

`forcing.ts:209`, in `forcingReads`:

    // Security asking for a door to be forced.
    const ask = text.match(ASK_WORDS);
    if (ask && engineering && isSecurity(fromJob)) {
      const room = ask[1];

`ask[2]`, the name of whoever is meant to be inside on a warrant, is never looked at.

`forcing.ts:247`, the engineer taking the order from anyone whose PDA shows "chief engineer":

    const order = text.match(ORDER_WORDS)?.[1];
    if (order && isEngineer(brain.job) && isChiefEngineer(fromJob)) {
      takeJob(brain, order, from);

`code/modules/llm_crew/crew_npc_forcing.dm:105`, `tool_force_door`: any room of the station by name, with no limit on which.

## How it was found

Read from the code. The Chief Engineer's access was read from `/datum/id_trim/job/chief_engineer` in `code/datums/id_trim/jobs.dm`: no `ACCESS_ARMORY`, `ACCESS_VAULT`, `ACCESS_CAPTAIN` or `ACCESS_AI_UPLOAD` in its own access (`ACCESS_CAPTAIN` is only in its template list for the ID console). Not seen in a round: no player has played security alongside the crew.

## How to fix it

1. Only whoever keeps the list asks. In `forcingReads`, take the ask only if `fromJob` is the Head of Security, or, when the PDA list shows no Head of Security aboard, an officer (that is the rule the top of the file states). Use exact job names, not `isSecurity`.
2. The ask must be for a warrant that exists. Engineering cannot see security's list, but it can ask: send the Head of Security, or the Captain, "<name> is on a warrant and inside the <room>?" and wait for a yes. Simpler and enough for now: send the Captain a PDA copy before going ("Captain, security has asked me to force the <room>: <name> is inside on a warrant.") and wait a short while for a "no".
3. A short list of rooms is never forced without the Captain's yes by PDA: anything under `/area/station/ai_monitored`, `/area/station/security/armory`, `/area/station/command` (the Vault, the Bridge, head offices) and `/area/station/security`. The server can send this as a flag on the static places list (`secure` for those areas), so the window does not have to know any one map's room names.
4. Check the name in `ask[2]`: it must be someone the PDA list shows, and not the Captain or a head (only the Captain declares on a head, `desk.ts`). This stops a made-up name.
5. In `ASK_WORDS` and `ORDER_WORDS`, anchor the match to the start of the message after the greeting, so that it is not found inside a longer message: `^\s*\w[\w' -]*, security needs the door of the ...`.
6. Keep: the Head of Security's real ask still works end to end, and an engineer sent by the real Chief Engineer still goes.

Question for the owner: should the Captain's yes be needed for every forced door, or only for the secure rooms? Every one is safer and slower: a warrant on someone hiding in the Bar backroom would wait on the Captain.

## How to test the fix

- A table test of `forcingReads`: a Chief Engineer brain, a PDA message in the ask's words from "Security Officer" while a Head of Security is on the PDA list: not taken. From the Head of Security for the Bar Backroom: taken. From the Head of Security for the Armory: held for the Captain.
- `tools/llm_crew/security.ts` already tests `forcingReads` (from line 317: "the Chief Engineer takes the ask", "a janitor saying the same words sends it nowhere"). Add these cases there, and check its existing cases still pass.
- In a round: as a Security Officer, send the Chief Engineer the line for the Armory. `game.log` should show no `force_door` for the engineer, and `pda.log` the refusal or the question to the Captain.
