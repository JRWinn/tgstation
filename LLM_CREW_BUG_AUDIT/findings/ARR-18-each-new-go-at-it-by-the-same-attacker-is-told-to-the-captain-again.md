---
id: ARR-18
title: Every fresh go at security by the same person with no warrant, once it has been stopped, is told to the Head of Security and the Captain again
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1268, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1079, tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:828
fix: Keep when each attacker was last reported in beat, by name, and report the same person again only after some minutes or once a warrant on them has come and gone
---

## What is wrong

Someone with no warrant who hits security is stopped with the baton, and whoever keeps the list is told, so that the Captain can declare a warrant: "Joan, Pun Pun attacked me." The Head of Security passes it on: "Captain, Pun Pun attacked Hale. There is no warrant on them."

"Told" is kept on the attacker record (`beat.attacker.told`). But once an attacker has been stopped (`attacker.stopped`), the next blow from the same person makes a new record (`securityFeels`: "`beat.attacker?.name !== by || beat.attacker.stopped`"), with `told` unset. That one is stopped too, and told again. So every round of the same fight is a new PDA message to the Head of Security and a new one from it to the Captain.

Pun Pun is the usual case. The bar's monkey hits back at whoever hits it, as monkeys do. The officer batons it twice and puts the baton away. The monkey gets up and goes for the officer again. The officer stops it again. Each time: "Joan, Pun Pun attacked me." and "Captain, Pun Pun attacked Hale. There is no warrant on them." Until the Captain declares a warrant, the Captain's PDA fills with the same line every minute or so. The "attacked" word sent when it could not stop them and got away (`away && beat.attacker && !beat.attacker.told`) is sent once per record as well, so it too comes again after any stop in between.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1268`, in `securityFeels`:

    if (beat.attacker?.name !== by || beat.attacker.stopped) {
      beat.attacker = {
        name: by,
        handle: String(event.details.struck_by ?? ''),
        at: brain.now,
      };
    } else {
      beat.attacker.at = brain.now;
    }

`jobs/arrests.ts:1076`, in `beatAfterActing`, after a stop:

    if (act.how === 'stop') {
      const attacker = beat.attacker;
      if (attacker) {
        attacker.stopped = true;
        if (ok && !attacker.told) {
          attacker.told = true;
          ...
          beat.outcomes.push({
            what: 'attacked',
            name: attacker.name,
            other: about?.name,
          });

`tgui/packages/tgui/interfaces/CrewBrain/jobs/desk.ts:828`, in `deskOutcome`, each one passed to the Captain:

    case 'attacked':
      tellCaptain(
        brain,
        `Captain, ${outcome.name} attacked ${own ? 'me' : firstName(from)}${outcome.other ? ` during the arrest of ${outcome.other}` : ''}. There is no warrant on them.`,

## How it was found

Read from the code. Not seen in a round. That the monkey goes back for whoever hit it is from the change log's account of Pun Pun beating the officer with a toolbox, not from reading the monkey's AI.

## How to fix it

1. Add `attackTold: Record<string, number>` to the beat (deciseconds, by name). In both places that push `attacked`, push only when there is no entry for the name or it is older than a few minutes (five, say; the owner may want another figure), and set it.
2. Clear the entry for a name when a warrant on them comes into its hands (`giveWarrant`): what they do after that is resisting, not a fresh report.
3. Leave the stopping itself alone: hitting back each time they come at it is the plan.

## How to test the fix

- `tools/llm_crew/security.ts`: two `struck` events from the same name with a successful `stop` between them; `takeOutcomes` should give one `attacked`, not two.
- In the next round with Pun Pun about, count "attacked Hale" lines in `pda.log`.
