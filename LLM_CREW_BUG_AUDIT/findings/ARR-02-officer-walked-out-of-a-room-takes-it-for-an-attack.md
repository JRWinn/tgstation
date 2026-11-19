---
id: ARR-02
title: An officer walked out of a locked room by its keeper takes that for an attack, and batons them or adds five minutes for resisting
kind: bug
severity: high
effort: medium
confidence: likely
status: found
found_by: Fable 5.2
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1253, code/modules/llm_crew/crew_npc_security.dm:1530, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:370, code/modules/llm_crew/crew_npc_guarding.dm:173
fix: Do not treat being taken by the arm to be walked out as an attack, and do not see security out of a room while it has a warrant to serve there
---

## What is wrong

Two things the crew were built to do collide.

1. Whoever keeps a locked room walks out a visitor whose welcome is over, by the arm (`throw_out`, `take_hold_of`). A security officer is not a head, so it can be walked out like anyone.
2. Security staff are told of anyone who "takes hold" of them (`on_grabbed`), and the window treats that exactly like a blow (`securityFeels`): if there is a warrant on whoever did it, they "fought back" and get the baton and five more minutes. If there is not, they are "someone to stop" and get the baton.

So a cargo technician doing its own job, walking the officer to the door, is hit twice with a stun baton, and the Captain is told "X attacked Nova. There is no warrant on them." If the technician is the person the warrant is on, their time goes up by five minutes "for resisting arrest" and they get the baton before the cuffs.

The same fault is written up from the server's side as SEC-02. This file adds how soon the walk out comes (a minute), and that the person the warrant is on gets five minutes more for it.

One concrete case. The Captain declares a warrant on the Quartermaster, who is in the Quartermaster's Office, inside the Cargo Bay. The officer asks a cargo technician to let it into the bay, and is let in (`mayPass` in `jobs/cargo.ts` lets security in on the asking. Today the server's `open_door` then refuses, which is CARGO-04. Once that is mended this case is as written. Until then the officer gets in when the Captain opens the door, as in round-15.52.18, and is then a plain stranger: asked its business twice, 30 seconds apart, and walked out when its answer, "security business", names nobody who sent for it). The technician notes it as let in (`noteSentFor`), so in `syncGuarding` its verdict is "stay" with `sent` true. There is no mess the officer was called to, so `welcomeStands` is false at once, and 60 seconds later (`WELCOME_GRACE_DS = 600`) the verdict is "go" with `seenOut`. The officer is still there: it is standing at the office door waiting on its let-in message (90 seconds for each person asked). The technician says "Thank you, Nova, that is all that was wanted in here", takes it by the arm (`body.start_pulling(person)`), and walks it out. The base game sends `COMSIG_LIVING_GET_PULLED`, `on_grabbed` calls `tell_struck(puller, "grab")`, and the officer's brain gets `struck_name`. `securityFeels` finds no warrant on the technician and sets `beat.attacker`. While it is held the driver does nothing (`brain.inHand`). The moment it is let go the technician is in view. If the walk to the door took under 20 seconds (`ATTACK_FRESH_DS = 200`, counted from the grab) the attack is still fresh, `syncBeat` opens the `stop_attacker` task as an emergency, and the officer sends `arrest(handle, 'stop')`: two hits with the baton. A longer walk is forgotten before it ends, which is luck, not a guard. The warrant case has no such limit: `resisted` is set the instant the hold is felt.

Also: the server's `taken_hold_of` cancels the officer's errand without a result, and `let_go_of` marks the bay as a room it found no way into (`blocked_places[place]`), so the warrant then reads "no way into the Cargo Bay".

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1253`, `securityFeels`. It never looks at `event.details.how`:

    export function securityFeels(brain: NpcBrain, event: SenseEvent): void {
      const by = event.details.struck_name;
      if (typeof by !== 'string' || !brain.beat) {
        return;
      }
      const beat = brain.beat;
      beat.struckBy = by;
      beat.struckAt = brain.now;
      const warrant = beat.warrants.find((it) => sameName(it.name, by));
      if (warrant) {
        warrant.resisted = true;
        warrant.force = true;
        warrant.restUntil = 0;
        return;
      }
      if (beat.attacker?.name !== by || beat.attacker.stopped) {
        beat.attacker = { name: by, handle: String(event.details.struck_by ?? ''), at: brain.now };

`code/modules/llm_crew/crew_npc_security.dm:1530`:

    /datum/ai_controller/crew_npc/proc/on_grabbed(datum/source, mob/living/puller)
    	SIGNAL_HANDLER
    	if(isliving(puller))
    		tell_struck(puller, "grab")

and in `tell_struck` the event carries `"how" = how`, which nothing in the window reads.

`code/modules/llm_crew/crew_npc_guarding.dm:173`, `take_hold_of`, the walk out:

    	body.start_pulling(person)
    	...
    	var/datum/ai_controller/crew_npc/their_controller = person.ai_controller
    	if(istype(their_controller))
    		their_controller.taken_hold_of(body, post_place)

`code/modules/mob/living/living.dm:457` (base game): `SEND_SIGNAL(M, COMSIG_LIVING_GET_PULLED, src)`.

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:370`, the welcome that ends after a minute for anyone not called to a mess:

    if (stranger.verdict === 'stay' && stranger.sent) {
      if (welcomeStands(brain, name)) {
        stranger.overAt = undefined;
      } else {
        stranger.overAt ??= brain.now;
        const leaving = brain.doorAsked?.name === name && !!brain.doorAsked.out;
        if (!leaving && brain.now - stranger.overAt > WELCOME_GRACE_DS) {
          stranger.seenOut = true;
          settle(brain, name, stranger, 'go');
        }
      }
    }

`settle` spares only `person?.command`. `why_not_put_out` in `crew_npc_guarding.dm` spares only those who belong and command.

`arrests.ts:495`, in `syncBeat`, the task that sends the baton:

    keep(brain, STOP,
      !!attacker && !attacker.stopped && !beat.hurt && !!security?.has_baton &&
        brain.peopleInView.some((person) => person.name === attacker.name),
      'emergency');

## How it was found

Read from the code, both sides, and the base-game signal. Not seen in a round: no round has had an officer inside a locked department for more than a minute. The one arrest in the Cargo Bay (round-15.52.18) was over quickly. Not checked: whether the officer's own answer to "why are you in here?" would change the verdict before the minute is up. It is told to say only "security business".

## How to fix it

Two changes, either of which stops the baton. Do both.

1. The window. In `securityFeels`, read `event.details.how`. When it is `'grab'` and the same events carry the walk out (`details.in_hand === true`, sent by `taken_hold_of` in the same tick as "takes you by the arm and starts walking you out"), it is not an attack: return without setting `struckBy`, `attacker` or `resisted`. Simplest sure way: have the server say so. In `taken_hold_of` (`crew_npc_guarding.dm`) set a var, `walked_out_by = WEAKREF(by)`, and in `on_grabbed` skip `tell_struck` when `puller` is that person and `world.time < in_hand_until`. The order matters: `start_pulling` (which raises the signal) runs before `taken_hold_of`, so set the var before `start_pulling` in `take_hold_of`, or have `tell_struck` for a grab wait a tick (`addtimer(..., 0)`) and check then.
   A grab by anyone else stays what it is now.
2. Guarding. Security let in on a warrant should not be seen out while the warrant is being served. The keeper cannot know the officer's list, but it does know why it opened the door: the let-in message says "with a warrant for X". In `jobs/cargo.ts` where `noteSentFor` is called for someone let in (`:2046`), and in the same place for any other keeper, note that they came on a warrant (`brain.sentFor` could carry a reason). In `syncGuarding` (`jobs/guarding.ts`), for security let in on a warrant, give the welcome a longer life, say five minutes, or until X is seen in cuffs or gone from the room. This must be a general rule for whoever keeps a locked room, not for cargo alone.
3. The owner's question: should an officer who has a warrant to serve in a room be walked out of it at all? And should a head of department who takes hold of an officer (the Quartermaster in its own office) be stopped with the baton? The rule is "nobody lays a hand on the Captain or a head of staff, other than a lawful arrest", and `tool_arrest` refuses only the Captain. See ARR-03.

What must keep working: Pun Pun grabbing or tackling the officer is still an attack. Someone the warrant is on who takes hold of the officer has still fought back.

## How to test the fix

- Type check, lint, server compile to a side copy.
- `tools/llm_crew/security.ts` or a new simulator scenario: an officer with a baton gets a `knowledge` event with `struck_name` of a technician and `how: 'grab'` together with `in_hand: true`. Check that no `stop_attacker` task opens and no `attacked` outcome is noted. The same event with `how: 'hit'` must still open it.
- In a round: have a warrant on the Quartermaster while it is in its office, let the officer be let into the bay, and wait two minutes. `game.log` should have no "took hold of ... to walk them out" for the officer, and no "hit ... with its baton ... (stop)" on a technician.
