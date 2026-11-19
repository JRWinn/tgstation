---
id: ARR-02
title: An officer walked out of a locked room by its keeper takes that for an attack, and batons them or adds five minutes for resisting
kind: bug
severity: high
effort: medium
confidence: sure
status: confirmed
found_by: Fable 5.2
checked_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1530, tgui/packages/tgui/interfaces/CrewBrain/jobs/arrests.ts:1253, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:370, code/modules/llm_crew/crew_npc_guarding.dm:173
fix: In on_grabbed, a tick later, tell nothing of a hold by whoever is walking the body out or arresting it, and do not see security out of a room while it has a warrant to serve there
---

## What is wrong

See also: ARR-03 (the baton on a head of staff with no warrant, a separate cause in `tool_arrest` and the `STOP` step). SEC-02 is this same fault written from the server side and is marked a duplicate of this file.

Two things the crew were built to do collide.

1. Whoever keeps a locked room walks out a visitor whose welcome is over, by the arm (`throw_out`, `take_hold_of`). A security officer is not a head, so it can be walked out like anyone.
2. Security staff are told of anyone who "takes hold" of them (`on_grabbed`), and the window treats that exactly like a blow (`securityFeels`): if there is a warrant on whoever did it, they "fought back" and get the baton and five more minutes. If there is not, they are "someone to stop" and get the baton.

So a cargo technician doing its own job, walking the officer to the door, is hit twice with a stun baton, and the Captain is told "X attacked Nova. There is no warrant on them." If the technician is the person the warrant is on, their time goes up by five minutes "for resisting arrest" and they get the baton before the cuffs.

The same fault is written up from the server's side as SEC-02. This file adds how soon the walk out comes (a minute), and that the person the warrant is on gets five minutes more for it.

Who can be walked out: an officer whose ID does not open the room. An officer posted to that department carries its access (`/datum/id_trim/job/security_officer/supply` has `ACCESS_CARGO`), so `belongs_in_post` is TRUE and it is never put out of cargo. The Head of Security is command and is spared by `settle` and `why_not_put_out`. So it is an officer with no department, or posted elsewhere, inside someone else's locked room.

The same hole, from SEC-02: the Head of Security taking an arrested officer by the arm (`hold_arrested`) is felt as a grab too, and its baton hits during a forced arrest as hits. Under arrest every tool but `say` is refused (`in_hand_until`, `crew_npc_tools.dm:22`) for far longer than the 20 seconds an attacker is kept, so this does no harm today unless the arrest falls through within 20 seconds of the grab. The fix below covers it anyway. A plain pull by a player, or by anyone not walking the officer out or arresting it, is meant to count: the change log's "Fighting back" entry says security staff are told who "takes hold of them". The plan (`LLM_CREW_PLAN_SECURITY.md`, 3.7) said "A crew NPC cannot" fight back, which is why this collision with the crew's own walk out was not foreseen.

The officer's own arrest is also dropped without a word: `taken_hold_of` calls `cancel_errand()`, which leaves a `make_arrest` already under way running on (SEC-03).

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

Two changes. The first stops the baton and is the one to build first; the second stops the walk out itself.

1. The server, in `crew_npc_security.dm`. In `on_grabbed`, do not call `tell_struck` at once: `addtimer(CALLBACK(src, PROC_REF(grab_felt), WEAKREF(puller)), 0)`, as `on_kit_gone` already defers `kit_taken`. The wait is needed because `start_pulling` raises `COMSIG_LIVING_GET_PULLED` (`living.dm:457`) inside `take_hold_of` before `taken_hold_of` runs on this body. In the new `grab_felt`, resolve the puller and return without telling when `world.time < in_hand_until && in_hand_of == puller.name` (set by `taken_hold_of`, which has already told the body in words "X takes you by the arm and starts walking you out") or when `in_custody() && arrested_by?.resolve() == puller` (set by `being_arrested`, which `make_arrest` calls before any hand is laid on). Otherwise call `tell_struck(puller, "grab")` as now. This keeps to the body's own senses: it was told both things already.
   Do not instead have the window match the `in_hand` event to the grab: the grab event comes first, and `securityFeels` has already set `attacker` by the time `in_hand` arrives.
   Do not call `taken_hold_of` before `start_pulling` in `take_hold_of`: a pull that fails would leave the body held still for 40 seconds by nobody.
   Optional, for the same arrest case: `on_struck` may skip hits from `arrested_by` while in custody. Not needed for the baton, since tools are refused in custody.
   A grab by anyone else stays what it is now.
2. Guarding. Security let in on a warrant should not be seen out while the warrant is being served. The keeper cannot know the officer's list, but it does know why it opened the door: the let-in message says "with a warrant for X". In `jobs/cargo.ts` where `noteSentFor` is called for someone let in (`:2046`), and in the same place for any other keeper, note that they came on a warrant (`brain.sentFor` could carry a reason). In `syncGuarding` (`jobs/guarding.ts`), for security let in on a warrant, give the welcome a longer life, say five minutes, or until X is seen in cuffs or gone from the room. This must be a general rule for whoever keeps a locked room, not for cargo alone.
3. The owner's question: should an officer who has a warrant to serve in a room be walked out of it at all? And when the person the warrant is on is the keeper who walks it out (the Quartermaster in its own office), is that "fighting back" worth five more minutes? With step 1 as written it is not counted, since it is a walk out; say so if it should be. Whether a head of department may be stopped with the baton is ARR-03.

What must keep working: Pun Pun grabbing or tackling the officer is still an attack. A player who pulls the officer is still told of. A hit or shove from the keeper during the walk out still counts (only the grab is skipped).

## How to test the fix

- Type check, lint, server compile to a side copy.
- Step 1 is server code, which the simulator does not run. The simulator plays the server: if a scenario walks an officer out, its fake server must stop sending the "takes hold of you" event for that grab, as the real one now will.
- `tools/llm_crew/security.ts`: keep the case that a grab told to the window still makes an attacker (a player's pull), and add one for step 2's welcome if it is built (security let in on a warrant is not settled `go` after a minute).
- In a round: have a warrant on someone in the Cargo Bay with an officer that has no cargo access, let the officer be let in, and wait two minutes. If it is walked out, `game.log` has "took hold of ... to walk them out" and then no "was laid hands on by <keeper> ...: grab" and no "hit <keeper> with its baton ... (stop)". A control-click pull on the officer from your own body must still give "was laid hands on by ...: grab".

## Check

Checked by Opus 5.5. Confirmed.

- The quotes are what the code says today: `on_grabbed` and `tell_struck` (`crew_npc_security.dm:1530`, `:1552`, which sends `"how" = how` that nothing in the window reads), `take_hold_of` and `taken_hold_of` (`crew_npc_guarding.dm:163`, `:208`), `securityFeels` (`arrests.ts:1253`), the `STOP` keep in `syncBeat` (`arrests.ts:496`) and the `STOP` plan (`arrests.ts:975`), and the welcome in `syncGuarding` (`guarding.ts:370`).
- Base game: `start_pulling` in `living.dm` sends `COMSIG_LIVING_GET_PULLED` to the pulled mob before it returns, so `on_grabbed` runs, and `tell_struck` emits, before `take_hold_of` reaches `taken_hold_of`. A test made inside `on_grabbed` cannot see the walk out yet: hence the zero-delay timer in step 1.
- Guards looked for and not found: `jobs/guarding.ts` has no exemption for security (only `command` is spared, `guarding.ts:279`, `:364`); `why_not_put_out` spares only those who belong and command; `securityFeels` reads only `struck_name`; nothing clears `beat.attacker` on `put_out_of` (`brain.ts:702`); the driver is held only while `brain.inHand`, and the server refuses tools only until `let_go_of` zeroes `in_hand_until`.
- Ran a throwaway script with bun outside the repo (`tools/llm_crew/fixtures` and `jobs/arrests` by absolute path): an officer with a baton, `securityFeels` with `how: 'grab'` from a cargo technician, and 15 seconds later with the technician in view, `syncBeat` gives an `emergency` `stop_attacker` task and `planBeat` gives `{"tool":"arrest","person":"p3","how":"stop"}`. At 25 seconds the attacker is forgotten, so the walk must take under 20 seconds, as the write-up says.
- Change log and plans: the "Fighting back" entry counts "takes hold of" on purpose, and `LLM_CREW_PLAN_SECURITY.md` 3.7 says a crew NPC cannot fight back. Neither foresaw the crew's own walk out. No later entry changes `on_grabbed` or `securityFeels`.
- Merged in from SEC-02 (now its duplicate): the Head of Security's `hold_arrested` case, the player-pull case, the server-side skip on `in_hand_of` and `arrested_by` in a deferred check. Corrected: the window-side match on `in_hand` proposed in step 1 would not work, as the grab event comes first. Added who can be walked out at all (an officer posted to the department has its access).
- Severity stays high: the wrong person is hit with a stun baton. Effort stays medium for both steps; step 1 alone is small (one file, about 15 lines). Confidence raised to sure for the fault; how often it comes up still depends on an officer being inside someone else's locked room for a minute, which no round has shown.
