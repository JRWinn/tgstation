---
id: KNA-27
title: The first go at anyone, a monkey included, is "Stand still" and the cuffs alone, which a monkey never stands for, so one of the three tries is spent for nothing
kind: gap
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:753, tgui/packages/tgui/interfaces/CrewBrain/types.ts:43, code/modules/llm_crew/crew_npc_senses.dm:1
fix: Send in each person in view whether they are a person or an animal, as the body sees it, and go straight to the baton for one that cannot be told to stand still, if the owner agrees
---

## What is wrong

Listed in the change log entry of 2026-11-18, 19:38 to 20:00, "Seen and left alone": "The first try at anyone is still the cuffs alone, after 'you are under arrest. Stand still.' On a monkey that is eight seconds spent for nothing. It is right for crew, who stand for it." The two later entries show it in both rounds played since: 20:16:09 "cuffs alone at 20:16:09 (the monkey walked off)", and 20:51:53 "the cuffs alone. Pun Pun stepped off 0.2 seconds in."

The officer uses the baton only once a warrant has `force` set, which happens after a quiet try has failed. It has no way to tell a monkey from a crew member before it tries: the window's `PersonInView` carries a name, a job, a room, a distance and a few flags, and nothing of what kind of creature it is. So the first of `ARREST_TRIES` (three) tries on Pun Pun is always the telling and the cuffs alone. In the 20:43 round that was the try during which the monkey picked up the toolbox and the fight began.

The monkey is the reason security was built (change log 14:15: "The bar's monkey was the reason"), so this comes up in most rounds that use security.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:753`, `serveStep`:

    // The baton, once they have shown they will not stand still. Not when it is hurt, and not without one.
    const force = warrant.force && !beat.hurt;

and the step it gives when `force` is not set:

    step: force
      ? `${seen.name} will not stand still to be arrested. You are using your baton, and then the cuffs.`
      : `You have told ${seen.name} they are under arrest. You are putting the cuffs on them.`,
    act: {
      tool: 'arrest',
      person: seen.handle,
      how: force ? 'force' : 'quiet',
    },

`tgui/packages/tgui/interfaces/CrewBrain/types.ts:43`, `PersonInView`: `handle`, `name`, `job`, `place`, `distance`, `in_post`, `belongs`, `command`, `superior`, `cuffed`, `down`. Nothing says monkey.

## How it was found

Read from the code; the cases are the change log's, from `data/logs/2026/11/19/round-19.33.50`, `round-20.00.21` and `round-20.43.32`.

## How to fix it

The question for the owner: **may an officer take the baton to an animal on a warrant at the first go, since it cannot be told to stand still?** A player officer would.

If yes:

1. On the server, where each person in view is put into the senses, add a field a player can see: `kind`, "monkey" for `ismonkey(person)` and "person" otherwise (or the species name a player sees on examine). That is sight, not a hidden channel.
2. Add `kind?: string` to `PersonInView` in `types.ts`.
3. In `serveStep`, take `force` as set when `seen.kind === 'monkey'` (and not hurt, and with a baton). Skip the arrest line for it as well: `arrestLine` to a monkey costs a talk pause (`CREW_NPC_TALK_PAUSE`) while it wanders off. Keep the arrest line in the log: say it, but without waiting, or leave it out; the owner may want it said for the look of it.
4. Leave crew as they are: the quiet first try is right for them.

## How to test the fix

Cases in `tools/llm_crew/security.ts`: a warrant on a person in view with `kind: 'monkey'` gives `arrest` with `how: 'force'` at once; the same with `kind: 'person'` gives the arrest line, then `quiet`. Simulator: `fight` and `hurt` have a monkey; it should take two tries fewer. Next round, `game.log`: the first "with its baton" line for Pun Pun should come before any "attempted to handcuff".
