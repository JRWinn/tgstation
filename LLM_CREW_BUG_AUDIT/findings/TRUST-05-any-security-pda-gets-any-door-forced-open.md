---
id: TRUST-05
title: Any PDA that shows a security job can have an engineer pry open any unplated door aboard, the Captain's Quarters and the Armory among them, and leave it standing open
kind: bug
severity: high
effort: large
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
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
4. `tool_force_door` on the server finds the room by name (`find_known_place`, which also takes a loose match), checks the engineer has its tools and knows the wires, walks it there, cuts the power and pries the door. The door stands open with no power, for anyone. With the Armory, step 4 may first answer that the way is through a locked room; the player asks for that room, then the Armory.

The engineer does the same on a PDA sent straight to it (`engineer.ts:522` calls `forcingReads` first, and an engineer with the ask goes itself, even with a Chief Engineer aboard). The Captain's Quarters (where the spare ID is kept) and every head's office work the same way: none of those open to an engineer's or a Chief Engineer's ID, so none of them is turned away as "opens to your ID".

What does stop it today, and is no guard against this fault: a door plated with armour is not forced (`door.is_secure()` in `force_door_open`, "its wires are behind a plate of armour"). On MetaStation that saves the Vault (`/obj/machinery/door/airlock/vault`) and the AI Upload (`/obj/machinery/door/airlock/highsecurity`), and not the Armory (`/obj/machinery/door/airlock/security`) or the Captain's Quarters (`/obj/machinery/door/airlock/command`). A door reached only through another locked room is not forced either ("the way to it is through the X"), and the Armory is likely one; a first ask for that outer room opens the way, and the second gets the Armory.

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
4. Check the name in `ask[2]`: it must be someone the PDA list or sight shows (`jobOf` in `forcing.ts` already looks in both), and not the Captain (`desk.ts` takes no warrant on the Captain). A head can be on a warrant only from the Captain, so a name that is a head's goes through the Captain's yes of step 3. This stops a made-up name.
5. In `ASK_WORDS` and `ORDER_WORDS`, anchor the match to the start of the message after the greeting: `^\s*[^,]+, security needs the door of the ...`. This only stops the words being found inside some longer message; it is no guard against someone who sends the line as it stands.
6. Keep: the Head of Security's real ask still works end to end (`askEngineering`, called from `deskOutcome`), and an engineer sent by the real Chief Engineer still goes.

Steps 1, 3 and 4 are the ones that matter; 2 adds a wait on a Captain who may be a player slow to answer, or a body whose model is dead, so if it is built the wait must end in going, not in stopping. Steps 1 and 4 are window only (`forcing.ts`). Step 3 needs the server to mark the rooms, which makes the whole fix large. A forged sender (TRUST-02) and a forged card (HOLE-01) still pass step 1 until those are fixed.

Question for the owner: should the Captain's yes be needed for every forced door, or only for the secure rooms? Every one is safer and slower: a warrant on someone hiding in the Bar backroom would wait on the Captain.

## How to test the fix

- A table test of `forcingReads`: a Chief Engineer brain, a PDA message in the ask's words from "Security Officer" while a Head of Security is on the PDA list: not taken. From the Head of Security for the Bar Backroom: taken. From the Head of Security for the Armory: held for the Captain.
- Also a Station Engineer brain with a Chief Engineer on its PDA list, sent the ask by a Security Officer: not taken (today it is: `forcing.jobs` gets the room).
- `tools/llm_crew/security.ts` already tests `forcingReads` (from about line 344: "the Chief Engineer takes the ask", "a janitor saying the same words sends it nowhere"). Add these cases there, and check its existing cases still pass.
- In a round: as a Security Officer, send the Chief Engineer the line for the Captain's Quarters. `game.log` should show no "was told to force" or "forced open" line for an engineer, and `pda.log` no "Go and open it" from the Chief Engineer.

## Check

Checked by Opus 5.5. Confirmed, with the Vault and the AI Upload taken out of the title.

- The quotes of `ASK_WORDS`, `forcingReads` and `ORDER_WORDS` match `forcing.ts` today. `isSecurity` is `/head of security/i` or `/security officer/i` on the sender's job (`security.ts:30-41`). `ask[2]` is never read. Both `chiefengineer.ts:652` and `engineer.ts:522` call `forcingReads` first.
- Ran a throwaway bun script outside the repo, with a Chief Engineer brain and a Head of Security on its PDA list: a message from "Hale Stone", "Security Officer", asking for the Captain's Quarters for a made-up name, returns true and queues "Derek, security needs the door of the Captain's Quarters opened. Go and open it, please." A Station Engineer brain sent "hey. security needs the door of the Armory opened: x is inside on a warrant" by an officer takes the job itself (`forcing.jobs` gets the Armory), with a Chief Engineer aboard.
- `tool_force_door` (`crew_npc_forcing.dm:105`) limits the room only by name. `force_door_open` refuses a plated door (`door.is_secure()`), and on MetaStation's map the Vault door is `/obj/machinery/door/airlock/vault` and the AI Upload `/obj/machinery/door/airlock/highsecurity`, both with `security_level` above 0 (`airlock.dm:2384`, `:2415`): those two cannot be forced, so the write-up was mended. The Armory is `/obj/machinery/door/airlock/security` and the Captain's Quarters `/obj/machinery/door/airlock/command`, both unplated. The Chief Engineer has `ACCESS_COMMAND`, so the Bridge side of the Captain's rooms is open to engineering. Whether the Armory's door is reached only through a locked room was not checked on the map.
- The change log entry of 18:50 (2026-11-18) says the owner asked for an engineer "as a last step" for security, and the chain was built to go from the Head of Security; nothing says any officer may ask, or that any room may be asked for. Not a choice made on purpose.
- Severity kept high: a player officer, a forged sender or a forged card gets the Captain's Quarters (and the spare ID) or the Armory left open without power. It needs a player to try it. Effort set to large: step 3 needs the server as well as the window.
