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

---

# From the medium small-fix bugs (2026-11-19, branch `crew-bug-fixes-medium`)

These came up while fixing the medium bugs marked "Small fix". Where nothing was built, the finding says "Fix so far" with what is left.

## DESK-05: with no Head of Security and two officers, how do they share warrants?

Nothing built. Today the second officer's warrants are lost to the first.

- A. Each officer that keeps the list serves the warrants declared to it itself (about 10 lines in `jobs/desk.ts`).
- B. Officers pass warrants to each other: one is chosen to keep the list, and each reads the other's give, seen and let-go lines (larger, touches `jobs/officer.ts`).

## DESK-03: a janitor with a dry mop and a rag, no water in sight, and a mess in another room

Nothing built; today it stalls.

- A. It goes to the mess and cleans with the rag, and wets the mop later.
- B. It walks to a sink it knows of to wet the mop first, then goes to the mess (the finding's proposal).

## SECT-08: a stranger in a post says the Captain or a head sent them

Nothing built.

- A. Take the word of anyone known to be the Captain or a head, without asking (as is done for a workmate who is not there to ask).
- B. Ask that person, face to face or by PDA, and wait for a yes. This needs head NPCs to note whom they send, or they would answer "no" and the janitor would be put out.

## ARR-10: short of kit with the person in sight, should the officer leave them to fetch it?

Built: it tells whoever keeps the list at once that it is short. Not built: going for the kit while the person is in sight, which goes against plan H2 ("do not leave them") and the `nobaton` scenario.

- A. It goes for its kit even with them in sight, at most KIT_TRIES times (`nobaton`'s checks change).
- B. It stays and calls, as now.

## ARR-09: how much more must a hurt officer lose before it breaks off again after "try again"?

Built with a margin of 15 health and a floor of 20, which are guesses.

- A. Keep 15 and 20.
- B. Other values, or no floor.

## ARR-08: should stopping an attacker with no warrant break in on an arrest?

Built: a walk after someone getting away breaks in; other emergency work does not drop an arrest under way.

- A. Yes, stopping an attacker breaks in too.
- B. No.

## ARR-03: may an officer get away from a head of staff who keeps hitting it?

Built: no baton on a head of staff with no warrant; it is reported instead. The finding's step 5 is yours.

- A. It stands and reports (as built).
- B. It gets away from them, as it does with no baton (allow `AWAY` when the attacker is command).

## MAP-04: may a crew officer use a department checkpoint's cell?

Built: checkpoint cells are used, ranked after Brig cells.

- A. Yes, as built.
- B. No, Brig cells only. On Tram the officer would then have no cell.

## QM-05: with no other technician about, should the Quartermaster let its shut-in technician out itself?

Built: the Quartermaster sends another technician to let it out (finished in the second round). With none about, nothing happens.

- A. Yes, it goes to the door itself (may need `open_door` changed, CARGO-04).
- B. No, as built.

## CARGO-08: a head comes in person with several crates waiting and gives no number

Built: the technician brings none and asks which number.

- A. Bring them all out, one after another.
- B. Bring one, and ask which next.
- C. As built.

## JOBS-04: mail nobody comes for, once the technician's bag is full

Built: the mail step is put off, not retried for good.

- A. Leave it on the counter or in a locker.
- B. Send the recipient a second PDA message.
- C. As built.

## ASYNC-07: should a body on its way somewhere be offered remarks at all?

Built: a remark no longer stops other work in the window. Step 4 is yours.

- A. Only when it is not walking, or is working on the spot beside its company.
- B. Keep offering them, but never stop the walk for one.

## BRAIN-09: read a speaker's request in the same model call as an exact line?

Built: when an exact line is due and someone else speaks in the same update, a second call answers them.

- A. Keep the second call.
- B. One call with a longer prompt (exact line, then the answer).

## KNA-06: should an officer greet someone after arresting them?

Built: the person is noted as met, and is not greeted.

- A. Greet them later, from a short list of names to greet.
- B. Not at all (as built).

## MEM-11: should whoever asked be told when work is given up after an hour blocked?

Built: work blocked an hour is given up. Nothing is sent.

- A. Send word ("I could not get into the Cargo Bay about the mess").
- B. Nothing, as built.

## MULTI-03: is a face seen to belong enough to know a workmate without a card?

Built: yes, as a person would (someone in their clothes would pass).

- A. Keep it.
- B. Also ask for the card in some cases.

## TRC-03: may the Captain call a meeting by PDA in free words?

Built: only the head's set words call a meeting.

- A. No, as built.
- B. Yes, through a reader of its own (the model as last-resort reader, as GAP-15 proposes).

## ENG-06: should the driver drop any set phrase the model says that the job did not ask for?

Built: each reader matches its set words strictly.

- A. Yes, one general check where the driver takes the model's line, for every job's set words.
- B. No, the stricter readers are enough.

## SENSE-11: a workmate seen with belongs false: stranger again, or still a workmate?

Step 2a of SENSE-11 (drop a name from the workmates whenever that person is seen in the post with belongs false) would undo MULTI-03, fixed in round one, which keeps a workmate whose card was taken or swapped as a workmate so it is not walked out of its own post. The window cannot tell "card taken" from "a belongs true that was wrong". The server half of SENSE-11 (emergency access no longer makes everyone belong) is in, so a wrong belongs true now needs someone wearing a card not theirs.

- A. Keep MULTI-03, drop step 2a (as built).
- B. Take step 2a: a crew member who loses its card is a stranger again.
- C. Drop the name only when the person now shows a card with another job, and keep one with no card. A swapped card is then a stranger.

## Smaller questions noted by the fixers

- **HAND-07, step 4:** should a crew member who finds someone out cold in a locker raise the alarm?
- **KNA-05:** should an officer put down what it holds for the cuffs too, or only for the baton (as now)?
- **CHEAT-10:** a card whose title is no job at all ("Bartender's mate") shows no job. Should such a person count as a stranger to every post (as now), or be asked their business?
- **MAP-06:** should a cargo post be the room with the counter window to the lobby, whatever console stands there? On MetaStation both answers are the Cargo Bay.
- **JOBS-02 / CARGO-13 (round two):** open work that runs past its time limit is now given up and shown only in the window. Should whoever asked be sent word, as asked under MEM-11 for blocked work? One answer could serve both.
- **DESK-10, step 3:** with a mop and soap in hand and a bucket known, should the janitor put the soap in its bag to carry water? As built it goes without the bucket.

---

# From the night fixes (2026-11-19 to 20, branch `crew-bug-fixes-night`)

## PLAY-10: three choices about calling a janitor on an order

Built: any crew member told by a superior to call or ask for a janitor sends one janitor a PDA for the room it stands in (or the room named), and tells whoever asked whom it sent for. A model answer the same as a line the NPC said in the last minute is not said.

1. A model answer the same as one said in the last minute:
   - A. Say nothing (as built).
   - B. Ask the model once more, telling it "You said that just now", then say nothing.
2. A superior's "I'll ask for a janitor myself" is taken as an order:
   - A. Err towards taking it (as built).
   - B. Take it only from an imperative or a line with the NPC's name.
3. A janitor called on an order to a cargo room whose mess no technician has seen is refused at the door (`mayPass` needs `areaMesses`):
   - A. Let that janitor in for a while.
   - B. Keep it as built.
