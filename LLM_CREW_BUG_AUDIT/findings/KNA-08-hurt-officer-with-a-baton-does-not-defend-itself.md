---
id: KNA-08
title: A hurt officer with a working baton walks away from someone who follows and keeps hitting it
kind: gap
severity: medium
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:481, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:496
fix: Let a hurt officer that is struck again while getting away stop its attacker with the baton, in self-defence only, if the owner agrees
---

## What is wrong

Under half its health an officer breaks off and "uses no more force" until the Captain says "try again". Struck after that, it gets away at a walk to its post. Against something that follows it, that is being hit all the way there.

Listed in the change log entry of 2026-11-18, 20:53 to 21:05, Known and not fixed: "A hurt officer still walks away from someone who is hitting it, and does not defend itself. 'Hurt, it breaks off and uses no more force' is the rule as built. Against something that follows, that is ten seconds of being hit. Whether a hurt officer with a working baton should stop whoever is on it is the owner's to say." Also there: "Saying it is hurt costs a few seconds of standing there. In this fight that would have been two or three more hits."

The case, from that entry (`data/logs/2026/11/19/round-20.43.32`): 20:52:06, under half its health, the officer breaks off and sets out for the Security Office. Pun Pun follows, hitting it with a toolbox about every 1.3 seconds. 20:52:16, the officer goes down in the Courtroom after 12 hits. In that round the baton never came out for another reason (since mended by `drop_for_weapon`), but with the baton in its belt and charged the code would have done the same: walked.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:481`, in `syncBeat`: hurt and struck, it gets away.

    const away =
      !!security &&
      beat.struckAt !== undefined &&
      brain.now - beat.struckAt < AWAY_DS &&
      (!security.has_baton || beat.hurt) &&
      !security.holding &&
      !sayingHurt;
    keep(brain, AWAY, away, 'emergency');

`jobs/arrests.ts:496`: stopping an attacker is ruled out for a hurt officer whatever it carries.

    keep(
      brain,
      STOP,
      !!attacker &&
        !attacker.stopped &&
        !beat.hurt &&
        !!security?.has_baton &&
        brain.peopleInView.some((person) => person.name === attacker.name),
      'emergency',
    );

`beat.hurt` is set once (`:359`) and cleared only by "try again" (`:255`). It does not clear when the officer is healed: the 15:40 entry notes a Medibot took the officer from 70 to 90.

On the server, `how == CREW_ARREST_STOP` in `make_arrest` (`code/modules/llm_crew/crew_npc_security.dm:895` to `:910`) is already what is wanted: two hits at most, no cuffs, baton put away.

## How it was found

Read from the code, against the change log's account of the round.

## How to fix it

The owner has to say yes first. **The question:** may a hurt officer use its baton on someone who is hitting it, to stop them and nothing more? The rule "nobody lays a hand on the Captain or a head of staff" would still hold: `tool_arrest` refuses the Captain on the server, and a head who attacks security is already stopped by the unhurt path.

If yes:

1. In `syncBeat`, allow `STOP` for a hurt officer when it has been struck again after it broke off: `beat.struckAt > beat.hurtAt` and the attacker is in sight within two tiles (`person.distance <= 2`) and `security.has_baton`. Keep `!beat.hurt` for every other case, so it still starts no fights.
2. Give `STOP` the higher place when both `STOP` and `AWAY` are wanted: in `planBeat` the `AWAY` step should return not ready while a `STOP` task is open and its target is beside it. Once `attacker.stopped` is set (after the two hits) `AWAY` takes over and it leaves.
3. The word that it is hurt is still sent first (`sayingHurt`), since that is five seconds and the Head of Security needs it. If the owner would rather it swing first and write after, swap the order: let `STOP` through while `sayingHurt`.
4. Separately, and small: clear `beat.hurt` when `security.health` is back above, say, 80, and tell whoever keeps the list ("I am fit again"). Today a healed officer makes no arrests by force for the rest of the round unless the Captain happens to say "try again". **Second question for the owner:** should it go back to work by itself when healed?

## How to test the fix

- `tools/llm_crew/sim.ts`, scenario `hurt`: it has an attacker that keeps hitting. Check that the officer sends "I am hurt", then one `arrest(..., how: 'stop')`, then gets away. With no baton it must still only get away.
- `tools/llm_crew/security.ts` for any wording.
- Next round, `game.log`: after "I am hurt" in `pda.log`, look for "hit X with its baton N times ... (stop)".
