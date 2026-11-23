---
id: DESK-05
title: With no Head of Security and two officers, the officer who keeps the list hands every warrant to the other, who does not read it, so nobody serves any
kind: bug
severity: medium
effort: small
confidence: sure
status: fixed
fixed_in: dda72a3ff3a
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:152, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:949, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:441, tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:466, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:334
fix: With no Head of Security, have each officer keep and serve its own list (serving returns null for an officer keeping the desk, and strike and try-again use serving too), or have officers read a fellow officer's give, seen and let-go lines with takeWord
---

## What is wrong

With no Head of Security aboard, "an officer keeps the list itself" (desk.ts header). Every officer runs `syncDesk` then (officer.ts:141). `syncDesk` sends each warrant to `serving(brain)`, which is `officerAboard(brain)`: any security officer in view or on the PDA other than itself. With two officers, each one's "officer to send" is the other.

The other officer does not take it. An officer only reads warrants given in `giveLine` words through `takeWord`, and `takeWord` is only called when the sender's job is Head of Security (officer.ts:441 for PDA, officer.ts:466 for speech). From a fellow officer the line goes to `deskTakes` instead, which for security staff only looks for the "I have the warrant" words and for an outcome (desk.ts:334 to 351), and returns FALSE. Then `deskUnread` drops it, because a security officer is not a head.

Meanwhile the officer that keeps the list hands its own copy back (`handBack`, desk.ts:952), because there is an officer to send. So nobody serves it.

Concrete case. No Head of Security. Officers Hale Stone and Dana Reyes. The Captain sends Hale "Warrant for Pun Pun, for wrecking the Custodial Closet."

1. Hale's `deskTakes`: a warrant from the Captain, put on Hale's list, answered word for word.
2. Hale's `syncDesk`: `officerAboard` is Dana. `handBack` empties Hale's own beat. A GIVE task opens for Pun Pun.
3. Dana is not in sight. Hale sends Dana "Dana, warrant: Pun Pun, for wrecking the Custodial Closet. Bring them in, 5 minutes." It sends, so `deskAfterActing` marks it `taken`.
4. Dana's `readsMessage`: the sender's job is Security Officer, not Head of Security, and there is no head aboard, so `deskTakes(Dana, Hale, 'Security Officer', ...)`. No ack words, no outcome: FALSE. `deskUnread`: `isHead('Security Officer')` is FALSE: dropped.
5. Pun Pun stays on Hale's list for the round. Sightings are passed to Dana (`seenLine`) and dropped the same way. The heads are sent the notice and read Pun Pun out at every meeting.

The same holds said aloud: Dana's `overhears` sends Hale's line to `deskHears`, then `deskTakes`, with the same result. And it holds both ways: a warrant the Captain gives Dana goes to Hale and is lost.

The plan has a second officer as stage 3 (LLM_CREW_PLAN_SECURITY.md:392), so this crew was not designed for. But nothing stops it: two officers on the station, or a second spawned, and no Head of Security, which is also the case once the Head of Security's PDA leaves the station level (crew_npc_cargo.dm:677). The project rule is that a job does not work with only one size of crew.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:152`:

    export function officerAboard(brain: NpcBrain): string | null {
      const isOther = (person: { name: string; job: string }) =>
        isOfficer(person.job) && person.name !== brain.name;

`desk.ts:949`, in `syncDesk`:

    const officer = serving(brain);
    // With an officer to send, whoever keeps the list does not go after anyone itself.
    if (officer) {
      handBack(brain);
    }

`tgui/packages/tgui/interfaces/CrewBrain/jobs/officer.ts:441`, in `readsMessage`:

    if (isHeadOfSecurity(job)) {
      takeWord(brain, from, text, false);
      return;
    }
    if (!headAboard(brain)) {
      ...
      if (!deskTakes(brain, from, job, text, false)) {
        deskUnread(brain, from, job, text);
      }

`desk.ts:334`, what `deskTakes` reads from security staff:

    if (isSecurity(fromJob)) {
      if (WARRANT_ACK_WORDS.test(text)) {
        ...
      }
      const outcome = readOutcome(text);
      ...
      return false;
    }

## How it was found

Read from the code, on both officers' side, then run in a throwaway bun script in the system temp folder: two brains with the job Security Officer and no Head of Security on their PDA lists, the Captain's warrant sent to Hale, Hale's give step taken and its message fed to Dana's `readsMessage`. It printed:

    hale desk [["Pun Pun","no"]] hale beat []
    hale step {"tool":"message","person":"Dana Reyes","text":"Dana, warrant: Pun Pun, for wrecking the Custodial Closet. Bring them in, 5 minutes."}
    after: hale desk [["Pun Pun","taken"]] hale beat [] dana beat [] dana desk []

Not run in the simulator and not seen in a round.

## How to fix it

Two ways. The owner should pick, since it is how two officers share work, which the plan left for later.

1. Simplest, and what I would take now: with no Head of Security aboard, an officer that keeps the list serves its own warrants. In `serving`, return null when the brain itself is a Security Officer (`isOfficer(brain.job)`), so `syncDesk` takes every warrant into its own hands as it does today with one officer. Two officers then each serve what was declared to them, and neither hands anything to the other. Two more places call `officerAboard` directly and would still talk to the other officer: `strike` (desk.ts:276, the let-go line, sent when `warrant.given !== 'no'`, which is every warrant once it serves them itself) and the "try again" branch (desk.ts:444). Make both use `serving(brain)` too, or the other officer is sent let-go and try-again lines it drops. The Head of Security is not an officer by `isOfficer` (security.ts:35), so its path is not touched.
2. Fuller: let an officer read a fellow officer's `giveLine`, `seenLine` and `letGoLine` by calling `takeWord` when the sender is an officer and no Head of Security is aboard, and send the outcome back to the officer that gave it. This needs one officer chosen to keep the list (for example the first by name), or both lists drift apart.

Either way, keep the Head of Security's path as it is.

## How to test the fix

- Add a case to `tools/llm_crew/security.ts`: two officers, no Head of Security on the PDA list, the Captain declares a warrant to one. After one `syncDesk`, that officer (fix 1) or the other (fix 2) has the warrant in its own beat.
- Type check from `tgui/`.
- In a round with two officers and no Head of Security, grep `game.log` for the officer's arrest steps on the declared name.

## Check

Checked by Opus 5.5, read from the code; the finder's bun script was not run again.

- The quotes are what the code says today: `officerAboard` and `serving` (desk.ts:152 to 165), `syncDesk` handing back and opening a GIVE task when `serving` names someone (desk.ts:949 to 1000), `readsMessage` and `overhears` (officer.ts:436 to 470), and `deskTakes` for security senders (desk.ts:333 to 351).
- Traced Dana's side: the sender's job is "Security Officer", so `isHeadOfSecurity` fails and `takeWord` is not called; `headAboard` is null, so `deskTakes`. In `deskTakes`, `isSecurity` is true, the give line has no "I have the warrant" words and `readOutcome` finds nothing, so it returns FALSE. `deskUnread` returns at once for a sender who is not a head or is security (desk.ts:668). Dana's own `syncDesk` names Hale as its officer and hands back too. Nothing else puts the warrant on either beat.
- No guard against it: neither the change log nor the plans speak of two officers with no Head of Security, other than LLM_CREW_PLAN_SECURITY.md:392 saying a second officer is a later stage.
- How often: the standing test crew has one officer and a Head of Security (change log, "The test crew has a Head of Security and one security officer"), so it takes a second officer spawned by hand with the Head of Security gone or its PDA off the station level (`people_on_pda`, crew_npc_cargo.dm:677). Less often than most rounds, so medium is right. With a human officer instead of a second NPC, the NPC's give goes to a human who can read it, which is not this fault.
- The fix: fix 1 works and is small, but it missed that `strike` and the "try again" branch call `officerAboard` directly; added to the fix.

## Fix so far (round one, branch crew-bug-fixes-medium)

Commits: none.

- DESK-05: waits on the owner (QUESTIONS_FOR_OWNER.md).  Left: Option B needs jobs/officer.ts (readsMessage and overhears to call takeWord for a fellow officer when no Head of Security is aboard). Option A is in jobs/desk.ts only.

## Fix so far (owner's answer A)

Built on branch `a-secwin`, `jobs/desk.ts` only: a new `listOfficer` is null when the one keeping the list is a Security Officer itself (no Head of Security aboard), else `officerAboard`. `serving` uses it, so such an officer keeps every warrant declared to it in its own beat and hands none to another officer; the let-go (`strike`), "try again" and served lines, and `tellOfficer`'s default, use it too, so no line goes to the other officer, who would drop it. The Head of Security's path is as before. Table `tools/llm_crew/secwin-answers.ts` (fails on the old code, passes now). Not played; no scenario has two officers and no Head of Security.
