---
id: MULTI-03
title: A technician whose ID card has been taken is questioned by its own workmate, answers that nobody sent for it, and is walked out of its own post and locked out for the round
kind: bug
severity: medium
effort: small
confidence: likely
status: found
found_by: Opus 5.5
area: cargo
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:345, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:676, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:469, code/modules/llm_crew/crew_npc_guarding.dm:24, code/modules/llm_crew/crew_npc_guarding.dm:136
fix: Never open a stranger record on someone in brain.workmates, and have explainStep answer that it works here when the room is its own post
---

## What is wrong

See also: TRUST-10, which is the body not noticing its card being taken and losing its job on the server. This is what its workmate then does to it.

Whether someone "belongs" in a post is worked out on the server from the card they carry: `belongs_in_post` asks each door of the post whether it opens for them. Take a technician's card away (a player strips it, or it is left on a table) and from that moment the technician does not belong in its own bay. Its workmate's window keeps a set of the people it has seen belong, `brain.workmates`, but never looks at it when deciding who is a stranger: anyone `in_post` and not `belongs` gets a stranger record. And the technician without its card answers the question truthfully as the code sees it: its room is now locked to it (`out_of_bounds`), nobody sent for it, so it says "Nobody sent for me. I should not be in here, I know." That settles it. The workmate walks it out by the arm, the server's own check agrees (`why_not_put_out`: does not belong, not command), and the door will not open for it again. It is locked out of its own post for the rest of the round, by its own workmate, having confessed to trespass.

One concrete case, the standing test crew:

1. A player opens Sam's strip menu at the cargo counter and takes Sam's ID card. Sam does not notice (TRUST-10).
2. Next look: `people_in_view` for Maria shows Sam with `in_post` TRUE and `belongs` FALSE (`door.allowed(Sam)` is FALSE for every bay door). Sam's own `out_of_bounds` is TRUE.
3. Maria's `syncGuarding`: `person.belongs` is false and `person.in_post` is true, so `recordOf(brain, "Sam ...")` makes a stranger record, though "Sam ..." has been in `brain.workmates` since the round began.
4. After the look-first wait Maria says "Sam, what are you doing in here? This room is locked to the crew."
5. Sam's `guardOverhears`: challenge words, its name, and `brain.outOfBounds` is TRUE, so `brain.challenged` is set. `explainStep`: `reasonToBeHere` finds no task here with an `askedBy` and no `letInBy`, so the line is "Nobody sent for me. I should not be in here, I know."
6. Maria's `guardOverhears`: `NO_REASON_WORDS` matches "nobody" and "should not be": verdict `go`. "You have no business in here, Sam. ..." then `throw_out`.
7. Server `tool_throw_out` and `take_hold_of`: `why_not_put_out(Sam)` returns null. Sam is taken by the arm, walked out to the lobby and let go of, with `blocked_places` set. The bay door is locked to Sam from then on.

The same follows for any crew member whose card no longer opens its own post: a card swapped for another (CORE-09), or an engineer or officer whose card was taken, wherever its department keeps strangers out.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:345`, in `syncGuarding`: the set of workmates is filled but not used here:

    for (const person of brain.peopleInView) {
      if (person.belongs) {
        brain.workmates.add(person.name);
      } else if (person.in_post) {
        recordOf(brain, person.name).lastSeenAt = brain.now;
      }
    }

`guarding.ts:673`, the body takes the question as one it must answer because its own room is locked to it:

    if (
      CHALLENGE_WORDS.test(heard) &&
      namesPerson(heard, brain.name) &&
      (brain.outOfBounds || reasonToBeHere(brain))
    ) {

`guarding.ts:469`, in `explainStep`, the answer, which has no case for "this is my own post":

    if (!why) {
      return {
        ready: true,
        step: `${by} has asked why you are in ${brain.location}. The truth is that nobody sent for you and nobody let you in: you have no business in here. ...`,
        say: 'Nobody sent for me. I should not be in here, I know.',

`code/modules/llm_crew/crew_npc_guarding.dm:24`, `belongs_in_post`, by card only:

    for(var/datum/weakref/door_ref as anything in post_doors())
        ...
        if(door.allowed(person))
            return TRUE

## How it was found

Read from the code. Not seen in a round: no round log has a card taken from a crew member. Not checked: whether a stripped card can be noticed by the window at all today (TRUST-10 says not).

## How to fix it

1. In `syncGuarding`, skip anyone in `brain.workmates` when making stranger records (`else if (person.in_post && !brain.workmates.has(person.name))`). Someone seen to belong earlier in the round is a workmate who has lost their card, not a stranger. If it is wanted, a workmate in that state can be told once, aloud, that their card is not opening the door (a toTell line), which is what a person would say.
2. In `explainStep`, when `brain.location === brain.post` (or the room is in its `work_area`), answer "I work here." and never "Nobody sent for me". Its own post is the one room a crew member always has a reason to be in, card or no card.
3. On the server, `why_not_put_out` may also refuse someone whose job (by `crew_npc_job_of`, or better by the job the body was spawned with, as TRUST-10 proposes) is the post's own. That is the belt-and-braces check; step 1 is the real fix.
4. Owner's question: a person who looks like a workmate but carries no card could be an impostor in their clothes. Is a face the crew has seen at the counter all round enough to know them by? A person would say yes.

## How to test the fix

- Add a simulator scenario: two technicians at the post; after a minute the sim sends one of them with `belongs` false and `out_of_bounds` true. The other must not say "what are you doing in here" to it, and the first must not say "Nobody sent for me".
- Type check. In a round, take a technician's card through its strip menu and watch `game.log` for "took hold of ... to walk them out of Cargo Bay" with a technician on both sides.
