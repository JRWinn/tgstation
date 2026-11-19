# Questions for the owner

Findings whose fix needs your decision. Each has the finding, the question and the options. Nothing here was built.

## API-01: should "cannot get a hold of" count as refusing to go?

The fix narrowed what counts as a stranger refusing to be walked out, so that a body that never reached them no longer gets them a trespass warrant. It kept "You cannot get a hold of [name]." as refusing. That line also comes when the person cannot be pulled for reasons that are not theirs (buckled, anchored, too heavy, the body itself unable to pull).

- A. Keep it as refusing (as built now).
- B. Drop it: only a broken hold ("they got away from you") earns a warrant.

## ENG-01: once its engineer cannot get the emitters off, should the Chief Engineer go itself?

Built: the engineer tries a stuck emitter twice, switches off the rest, and tells the Chief Engineer why; the Chief Engineer tells the Captain once ("The emitters will not go off: ... The engine is still firing.") and gives the order again every five minutes in place of every ninety seconds. Decision 2 of the engine plan says the Chief Engineer never works the engine room while an engineer is aboard.

- A. Leave it so: the Captain is told and decides.
- B. The Chief Engineer goes to the engine room itself and tries, once the engineer has said it cannot.

## HAND-12: should anyone pry open large wooden crates?

Built: crew no longer search or open a large wooden crate by hand; it is left alone, and a fetch says it is nailed shut. A player opens one only with a crowbar, which breaks the crate apart.

- A. Leave them alone (as built).
- B. Have cargo, or an engineer, pry them open with a crowbar from its locker when what is inside is wanted.

## QM-08: with two orders waiting on the Captain, how is a bare yes or no read?

Built: it is taken as the answer to the order asked about last (the message in front of the Captain), and a number counts as naming an order only after "order" or "#".

- A. Keep that.
- B. With two or more waiting and none named, ask "Captain, is that order 2 (...) or order 1 (...)?" and act on neither until told.

## SECT-03: should a name nobody knows be cut down to its capitalised words?

Built: such a name now stops at the first word that cannot be part of one (in, at, who, is, because...), so "Arrest Pun Pun in the bar" is a warrant on Pun Pun. Step 2 of the finding was not built.

- A. Yes, when the line has capitals, read only the run of capitalised words: "Warrant for Bob the clown, for theft" becomes a warrant on "Bob".
- B. No, keep only the cut-word rule (as built): it stays "Bob the clown".

## SECT-07: should technicians back up a head who says "Get out of here" to a stranger without naming anyone?

Built: a keeper puts someone out only when the head's line names them, or says him, her or that one.

- A. No (as built): the stranger heard it, and a head who wants help names them.
- B. Yes, but only when there is exactly one stranger in the post and the line has no other object.

## MULTI-08: is one failed walk out enough for a trespass warrant?

Built: someone only being seen to the door after their work is never reported, and a walk out lost to the body's own fall is not blamed on them.

- A. Yes, as now, for anyone not just being seen to the door.
- B. No: it takes the person being told to leave, refusing, and breaking the hold.

## ARR-02: may a room's keeper walk out an officer who has a warrant to serve in it?

ARR-02 steps 1 and 2 are built (second round). Its step 3 is yours:

- Should an officer with a warrant to serve in a room be walked out of it by the room's keeper at all?
- When the keeper is the person the warrant is on, does walking the officer out count as fighting back (five more minutes)?

## QM-10: should a cancel call back an order already handed to a technician?

Built: the head is told the order is already with the technician and cannot be called off.

- A. Yes: the Quartermaster tells the technician face to face and the technician drops it (needs jobs/cargo.ts).
- B. No, as built.
- Also: the console can remove an unplaced order from its list. May a placed order be cancelled at the console?

## KNB-06 (galoshes): may a janitor remember the tiles it mopped as slippery, so the spawn galoshes can go?

The unpacking part of KNB-06 is fixed (no forceMove). The galoshes at spawn are still there.

- A. Remove the galoshes, and have the janitor remember tiles it has just mopped (turf to time, read in knows_slippery, dropped after a minute).
- B. Remove the galoshes and let it slip on its own work for now.
- C. Keep the galoshes for now.

## CARGO-02: how does a technician's word reach a Quartermaster it cannot find?

When a technician cannot find the Quartermaster to say an order has come in, the book never hears it: the order stays "given" for good, that technician is never given another order, and its cost stays counted. The plan says nothing goes by PDA between them. Nothing built.

- A. Allow a PDA message to the Quartermaster ("Ada, order N has come in: ...") as the last resort for every order; the "lost" word the same.
- B. Keep it face to face: the technician keeps the word owed with no time limit and says it when it next sees the Quartermaster.
- C. Both: face to face when seen, PDA only after a long wait.

## KNB-08: should a janitor's call close when what is left will not come off?

Built: a door held open into an outer room is gone through, and work that failed underfoot is not tried again for it. Step 5 is yours.

- A. Yes, close the call until the janitor holds a different tool, as "I cannot shift it" already does.
- B. No, keep the call open while the mess is there (as now).

## TRUST-11: two choices

Built: a line the model wrote that other crew would act on (a warrant, a pardon, an order) is not said.

1. Should a head NPC be able to declare a warrant by its own code? Today none does, and with this fix none can be talked into one.
   - A. No, warrants come only from players.
   - B. Yes, plan a coded way for heads to declare one.
2. The finding's shared prompt rule ("You never declare a warrant, pardon anyone, order supplies, or call a meeting in your own words...") was not added: the prompt is a fixed budget.
   - A. Add it and trim something else.
   - B. Leave it out, since the code filter does the work.

## CHEAT-01: may crew NPCs pass through each other?

Built: crew bodies no longer walk through people; they swap places as a player does, or are stopped.

- A. No, as built: everyone swaps or is stopped.
- B. Yes, through crew NPCs only (never players), when can_mobswap_with says yes.

## CHEAT-14: may the engine reading switch an engineer's PDA on by itself?

Built in the second round: the engine monitor is read only on a PDA that is whole, readable and switched on. The reading runs at every window update, so an engineer's PDA that is off is switched on by its power button at the first update, and drains its cell from then on, as a player who keeps the monitor open would.

- A. Keep it so (as built).
- B. Read the engine only when the PDA is already on, and leave switching it on to when the body means to look.
