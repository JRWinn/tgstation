---
id: KNA-32
title: The officer talks about its warrant out loud to people it meets, because keeping it quiet is only a line in the prompt and no code screens what is said
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1370, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1280, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1296
fix: In the reply filter in brain.ts, drop or replace a remark of a security body that names someone it holds a warrant on, unless it is said to security, the Captain or a head
---

## What is wrong

The owner's rule L6 (plan `LLM_CREW_PLAN_ROUND_1428_SECURITY.md`, built in the change log entry of 2026-11-18, 16:50 to 17:35) is that an officer does not bring up a warrant with people it meets, and never with whoever the warrant is on: said to them before it has a hand on them, it is a warning to run. It was built as one line given to the LLM (`beatCues`). Nothing in code holds to it. The same cue block tells the LLM, in the line before, "You have a warrant to serve on Pun Pun, for ...", so a model asked to greet someone has the name in front of it and uses it.

It is listed in the change log entry of 2026-11-18, 19:38 to 20:00, under "Seen and left alone": "The officer said to the room 'I'm busy with Pun Pun who won't stand still!' and 'I'll sort him out soon', which is the warrant talked about, against what its prompt tells it." The change log gives no cause and no fix.

The round, `data/logs/2026/11/19/round-19.33.50/game.log`, mid-arrest in the Bar Lounge, greeting two people it had not met:

    [2026-11-19 01:37:12.669] ... (Nova Aultman) ... was told by its brain to say: Zim Fire! I'm Nova Aultman, security from the transporter, but right now I'm busy with Pun Pun who won't stand still!
    [2026-11-19 01:37:31.661] ... (Nova Aultman) ... was told by its brain to say: Hi Brick! I'm Nova Aultman, security from the transporter! Welcome aboard! Pun Pun is being a right mess, but don't worry, I'll sort him out soon!

Pun Pun is a monkey and cannot take a warning. The same thing with a warrant on a player, said within their hearing (the officer greets everyone new, KNA-06, and walks up to the suspect to say "you are under arrest"), tells them to run. With the officer looking for someone through the hallways, every new face it meets is a chance for the model to say who it is after.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1280`, `beatCues`: the warrant is put in the prompt, and the rule is a request:

    for (const warrant of beat.warrants) {
      ...
        : `You have a warrant to serve on ${warrant.name}${warrant.reason ? `, for ${warrant.reason}` : ''}.${seen}`,
    ...
    if (beat.warrants.length > 0) {
      lines.push(
        'A warrant is security business. You do not bring it up with people you meet, and never with whoever it is on: said to them before you have a hand on them, it is a warning to run. Asked what you are doing, you are on security business.',
      );
    }

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1370`, where every LLM reply is turned into actions. Code already screens what is said here (handles taken out, filler and repeats dropped), so a screen of this kind has a home, but nothing looks at names on a warrant:

    const replied = parseReply(reply);
    for (const action of replied) {
      if (action.tool === 'say') {
        action.text = withoutHandles(
          String(action.text ?? ''),
          brain.peopleInView,
        );
      }
    }
    const actions = replied.filter(
      (action) =>
        action.tool !== 'say' ||
        !(
          alone ||
          (dropped && speakers.length === 0) ||
          (unprompted &&
            (isFiller(String(action.text ?? '')) ||
              saidBefore(brain, String(action.text ?? ''))))
        ),
    );

The Head of Security's prompt has the same kind of request ("Add nothing of your own about who is wanted", `jobs/headofsecurity.ts:197`), with the same gap.

## How it was found

Seen in a round log (the two lines above). The cause read from the code: grep of `CrewBrain/` for any check of spoken words against `beat.warrants` or `desk.warrants` finds none; the only place the rule appears is the prompt line at `arrests.ts:1296`. No job hook exists that vets a line before it is said (`jobs/job.ts` lists them all).

## How to fix it

1. Add an optional job hook, `vetsSay?: (brain, text, to: string | null) => string | null`, to `jobs/job.ts`: it returns the line to say in place of the model's, or null to say it as it is. Call it in `brain.ts` right after `withoutHandles`, for each `say` action that is not the fixed line (`mustSay` with `exact`: those are code's own words and must go out whole). Who it is said to is in the reply (`saidTo` in `addressing.ts`) or, failing that, the speaker being answered.
2. In `jobs/officer.ts` and `jobs/headofsecurity.ts` set it to a function in `jobs/arrests.ts` that, for every warrant in `beat.warrants` (and `desk.warrants` for whoever keeps the list) not yet held (`holds`), tests the line with `sameName`/`closeIn` against the warrant's name. If it names one, and the line is not said to security staff, the Captain or a head of staff, give back a plain line with no name in it: "I am on security business." Or drop the remark when it was not an answer to anyone (a greeting), keeping only the name part of the greeting: "I am Nova Aultman, security."
3. Keep working: the arrest line itself ("Pun Pun, you are under arrest ...") is a fixed line from code (`exact`) and must not be touched; reports to the Head of Security and the Captain must keep the name.
4. Keep the prompt line as it is: the screen is the backstop, so a dead or wayward model cannot give the game away.

## How to test the fix

- Add cases to `tools/llm_crew/security.ts`: a greeting reply "Hi Brick! Pun Pun is a mess, I'll sort him out soon!" from an officer with a warrant on Pun Pun comes out without "Pun Pun"; the same said to the Captain is said whole; the arrest line is untouched.
- Simulator `warrant` and `fight` with a chatty LLM: grep the spoken lines for the warrant's name outside the arrest line.
- Next round, `game.log`: every "was told by its brain to say" of a security body during a warrant, for the name of whoever it is on.

## Check

Checked by Opus 5.5 on 2026-11-19, from the code, while fixing. Confirmed. The only place the rule lives is the prompt line in `beatCues` ("A warrant is security business. You do not bring it up ..."). The reply filter in `brain.ts` (after `withoutHandles`) screens handles, filler, repeats and, since TRUST-11, lines that sound like an order (`soundsLikeOrder` in `talk.ts`); none of it looks at `beat.warrants` or a desk's warrants. `jobs/job.ts` has no hook that sees a line before it is said. So a model that names the warrant in a greeting is heard as it wrote it, as in round-19.33.50. Severity medium and effort small stand, but the fix spans `jobs/job.ts`, `brain.ts`, `jobs/officer.ts` and `jobs/headofsecurity.ts`.
