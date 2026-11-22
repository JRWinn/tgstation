---
id: MULTI-01
title: With a Head of Security and two officers, sightings, let-go orders and repeat gives go to whichever officer is in sight, not to the one holding the warrant
kind: bug
severity: medium
effort: medium
confidence: sure
status: fixed
fixed_in: dbcc4bdabad, db449a1fc76, 485dda6f826
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:152, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:202, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:276, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:959, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:335, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:210
fix: Record on each desk warrant the officer it was given to, and send that warrant's sightings, let-go and re-gives to that officer only, choosing a new one only when the holder is down, hurt or gone
---

## What is wrong

The Head of Security's list (`desk.ts`) does not remember which officer it gave a warrant to. Every time it has something to send about a warrant it asks `officerAboard(brain)` afresh, and that is "one in sight if there is one, and failing that the first its PDA lists". With one officer that is always the same person. With two officers (two NPC officers, or the NPC officer and a player who joined as a Security Officer, which is the usual case in a real round) it is whoever happens to be standing nearest at that moment.

So the pieces of one warrant are spread over two people:

- The give: whoever was in sight when it was given.
- Each later sighting (`seenLine`): whoever is in sight now. The other officer takes the line (it is addressed to it, so `saidTo` passes), and `noteSeen` does nothing because it holds no warrant on that name (`arrests.ts:210`). The sighting is lost.
- The let-go on a pardon or a withdrawn warrant (`letGoLine` in `strike`): whoever is in sight now. The officer who has the person by the arm or in a cell never hears it. `dropWarrant` in the other officer finds nothing to let go.
- A give that was not answered in 60 seconds is given again (`given` goes back to `'no'`, desk.ts:966), and the second give can go to the other officer. Now both hold the warrant.
- `WARRANT_ACK_WORDS` from any security member marks every warrant in `'said'` as taken (desk.ts:335). Officer B saying "The warrant, right away." for one warrant settles the give of another warrant that was said to officer A and never heard.

When both officers hold one warrant, nothing stops both serving it at once. The only guard is in `serveStep` (`seen.cuffed && !warrant.cuffedByMe`), and it only works once the cuffs are on. Before that both walk up, both say the arrest line, and both start `put_cuffs_on`. On the server the second officer's cuff wait ends the moment the first officer's cuffs go on (`!isnull(person.handcuffed)` returns TRUE in `put_cuffs_on`), so the second reports that it cuffed them, sets `cuffedByMe`, and `hold_arrested` calls `start_pulling`, which pulls the prisoner out of the first officer's grip (base `/mob/living/start_pulling`, "pulls [AM] from [AM.pulledby]'s grip"). The first officer's `tool_jail` then takes them back ("Let go of for a moment ... taken by the arm again"), and the two pull one prisoner between them. The desk is told "cuffed" twice and, if both jail attempts run, "jailed" by one and "got away" by the other.

One concrete case, standing test crew plus a player officer:

1. The Captain declares "Warrant for Pun Pun, for trespass." The NPC officer Hale is in the Security Office with the Head of Security, Joan. Joan gives it to Hale aloud; Hale answers; `given = 'taken'`.
2. Hale goes out. The player officer Sam comes into the office for a coffee.
3. The janitor sends Joan "Pun Pun was seen in the Bar". `syncDesk` passes it on: `tellOfficer` uses `officerAboard`, which is Sam (in sight). Joan says "Sam, Pun Pun was seen in the Bar." Sam is a player; Hale never hears it and keeps walking the primary hallways.
4. The Captain says "Pardon Pun Pun." By then Hale has Pun Pun in Cell 1. `strike` sends `letGoLine` to `officerAboard`: Sam again, who is still in the office. Pun Pun stays in the cell for the full term, and Hale's copy of the warrant stays in its hands, so when the cell opens Hale arrests Pun Pun again (TRB-03 describes that last step for the hurt-officer case).

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:152`:

    export function officerAboard(brain: NpcBrain): string | null {
      const isOther = (person: { name: string; job: string }) =>
        isOfficer(person.job) && person.name !== brain.name;
      return (
        brain.peopleInView.find(isOther)?.name ??
        brain.pdaPeople.find(isOther)?.name ??
        null
      );
    }

`desk.ts:202`, `tellOfficer`, used for sightings and let-go:

    function tellOfficer(brain: NpcBrain, line: string, why: string): void {
      const officer = officerAboard(brain);

`desk.ts:276`, in `strike`:

    if (officerAboard(brain) && (held || (warrant && warrant.given !== 'no'))) {
      tellOfficer(
        brain,
        letGoLine(officerAboard(brain) ?? '', who, pardoned),

`desk.ts:335`, any security member's ack settles every warrant given:

    if (WARRANT_ACK_WORDS.test(text)) {
      for (const warrant of desk.warrants) {
        if (warrant.given === 'said') {
          warrant.given = 'taken';

`arrests.ts:210`, a sighting for a warrant the officer does not hold is dropped:

    const warrant = beatOf(brain).warrants.find((it) => sameName(name, it.name));
    if (warrant && (!warrant.lastSeen || at > warrant.lastSeen.at)) {

`code/modules/llm_crew/crew_npc_security.dm:1020`, in `put_cuffs_on`, which counts anyone's cuffs as its own:

    if(!isnull(person.handcuffed))
        return TRUE

## How it was found

Read from the code, not seen in a round. The standing test crew has one NPC officer, so this needs a second officer spawned by an admin or a player in the Security Officer job. `LLM_CREW_PLAN_SECURITY.md:392` lists "a second officer" as later work ("sightings are shared out"), so this is a known unbuilt stage, but nothing stops the case from coming up now and nothing in the plan or change log says what goes wrong when it does. DESK-05 is the no-head-of-security version; TRB-03 is the hurt-officer version of the double hold; HOLE-13 is the general "a player in an NPC's job" gap.

## How to fix it

1. Add `officer?: string` to the desk `Warrant` type (types.ts). Set it in `giveStep` to the officer the give was said or sent to.
2. Give `tellOfficer` an optional `to` and pass `warrant.officer` from the sighting pass in `syncDesk` and from `strike`. Fall back to `officerAboard` only when the warrant has no officer yet.
3. In `syncDesk`, re-give to `warrant.officer` while that officer is on the PDA or in view and not reported hurt. Only clear `warrant.officer` (and choose afresh) when that officer is gone from both, or reports `hurt`.
4. In the `WARRANT_ACK_WORDS` branch of `deskTakes`, only mark taken the warrants whose `officer` is `from`.
5. Server side, in `put_cuffs_on`, return TRUE only if `person.handcuffed == cuffs` (its own pair). Cuffs someone else put on are not its arrest: return FALSE with a reason the window reads as "someone else from security has them".
Steps 1 to 4 are window-only (desk.ts and types.ts) and are the fix; step 5 is a small server guard that can be its own change. `isOfficer` (security.ts:35) matches only the title "Security Officer", so a Warden or Detective is not picked up either way.
6. Owner's question: with two officers, should the Head of Security share warrants out between them (the plan's "sightings are shared out"), or always give them to one? The steps above work either way.

## How to test the fix

- Add a simulator scenario with a Head of Security and two officers: give a warrant to officer A, walk A out, bring B into the office, send a sighting and then a pardon. A must get both; B neither.
- `tools/llm_crew/security.ts` table: an ack from officer B does not mark taken a warrant given to officer A.
- Type check and compile. In a round with two officers, grep `game.log` for "pulls" and "grip" next to an arrest, and `pda.log` for "was seen in the" lines sent to an officer who does not hold that warrant.

## Check

Checked by Opus 5.5, read from the code, nothing run. Every quote matches desk.ts, arrests.ts and crew_npc_security.dm today. `officerAboard` (desk.ts:152) is asked afresh by `serving`, `tellOfficer` (desk.ts:202), `strike` (desk.ts:276) and `giveStep`; no desk warrant carries an officer name, so nothing ties a later line to the one who was given the warrant. In `syncDesk` a `'said'` give with no ack past `TAKEN_WAIT_DS` goes back to `'no'`, and the next `giveStep` uses `serving(brain)` again, so it can go to the other officer. `deskTakes` (desk.ts:335) marks every `'said'` warrant taken on any security member's ack, with no look at `from`. On the officer, `noteSeen` (arrests.ts:204) drops a sighting for a warrant it does not hold, and `giveWarrant` (arrests.ts:132) adds a second copy freely. On the server, `put_cuffs_on` returns TRUE at :1020 when anyone's cuffs are on, and base `/mob/living/start_pulling` (code/modules/mob/living/living.dm:417) pulls from another's grip. LLM_CREW_PLAN_SECURITY.md:392 lists a second officer as later work; nothing in the change log covers this. Severity medium stands: it needs two Security Officers, which test rounds do not have but a real round with a player officer will. Effort medium for the window part; added that step 5 is a separate server change.

## Fix so far

Steps 1 to 4 (the window) were built in dbcc4bdabad. Step 5 (server) is built in round M2: `put_cuffs_on` (`crew_npc_security.dm`) returns TRUE only when `person.handcuffed` is its own pair. When someone else's cuffs went on while it tried, `make_arrest` answers not ok with reason `other_cuffs` ("Someone else from security has put cuffs on X before you could."), puts its cuffs back in its bag and does not take them by the arm; `game.log` says "when someone else put cuffs on them". **Left:** `beatAfterActing` in `jobs/arrests.ts` does not know `other_cuffs`, so it counts it as a failed try (three such and it rests, telling the list "will not stand still"). It should return with no try, as for `down`; the next `serveStep` then sees them cuffed and leaves them to whoever holds them, or takes them by the arm if nobody does.
