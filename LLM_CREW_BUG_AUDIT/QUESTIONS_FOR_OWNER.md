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

## Round M1: the medium bugs marked "Medium fix"

Each is answered "ID: letter". "As built" is what the code does now.

- **SUP-11:** the shuttle loads without an order for want of money. A. the technician takes it out of the cart at the console and tells the asker to ask again; B. leave it in the cart, to be bought when money comes in (as built); C. leave it, but keep its numbers so a later crate is held for the asker (needs CARGO-01).
- **CHEAT-12:** torn-off manifests. A. kept and handed to the Quartermaster; B. bagged or binned. (Also larger than its label: it moves the arrival word from the dock to the unload. Nothing built.)
- **SUP-17 (1):** a held crate that leaves cargo's rooms in someone else's hands. A. taken, not lost; B. lost, as the secure-areas plan's table says (as built).
- **SUP-17 (2):** the taker is not whoever ordered it. A. tell the orderer; B. say nothing.
- **CORE-03:** a body walking up to someone who goes out of sight. A. walk to where they were last seen, look, then be told "You lost sight of X near ROOM"; B. stop where it lost sight of them; C. keep after them about 3 seconds, then A.
- **KNB-01:** should cargo staff open the Warehouse shutters with the wall button? A. open and shut them again after; B. open only; C. no.
- **DOOR-14:** a door with no power or stuck. A. the technician fetches a crowbar and pries it; B. send for engineering.
- **DOOR-12:** should an engineer hold a fire door open with its crowbar while the other person walks through? A. yes; B. no, report it (as built).
- **KNA-09:** may the Head of Security take warrants back from an officer it sees down, or that does not answer a fixed "any word on X?" (the 2026-11-18 ruling was that nothing is built for crew who are down)? A. both; B. only the officer seen down; C. leave it until there is medical.
- **SECT-10:** should security's voice answer PDA talk that is no order (one model call a message)? A. no, nothing is sent (as built); B. the voice answers by PDA; C. a fixed "Captain, noted."
- **TRB-06:** someone out of their cell early, seen by the officer. A. only tell the Captain (as built); B. arrest them again for the rest of their time.
- **ARR-04:** how long does an officer hold a prisoner it has no cell for? A. let them go once the warrant's minutes are up in the Brig, and report "X is free"; B. hold them until told; C. hold them for good (as built).
- **CHEAT-04:** should anyone who stood for a quiet arrest have the cuffs taken off in the cell? A. yes, players too; B. only crew (as built).
- **SEC-07:** a crew member still in cuffs after its tries. A. it asks whoever stands next to it, who takes them off; B. only security takes them off; C. nobody: it keeps trying, as a player would (as built).
- **CHEAT-02:** when an officer asks to be let in, should it leave out people no longer aboard? A. check the crew manifest; B. ask anyone on the PDA list (as built).
- **CARGO-05:** more than four of one kind asked for. A. say "four is the most I can order at once"; B. quietly order four (as built).
- **TRUST-04:** who may collect a held crate? A. anyone with the number (as built); B. only the owner or someone they sent, checked by PDA with the owner.
- **QM-02:** a human technician never says an order came in. A. the Quartermaster asks "Has order N come in?"; B. it tells the head who it was given to; C. nothing.
- **DRV-07:** should a shut-in body that nobody has come for ask and knock again? A. yes, after 2 minutes; B. yes, after another wait (say how long); C. no, once only (as built).
- **DRV-12:** while its work is only held back, the body still explores. A. it stands still until the hold ends; B. it searches storage in view, otherwise stands still; C. it keeps exploring (as built).
- **HEAD-10:** no meeting room found for the Head of Personnel. A. hold no meetings and tell the Captain (as built); B. meet in its own office; C. meet at its staff's post.
- **TRC-04:** after a stop that is not the machine's fault (could not get to it, hands full), should the engineer A. wait for the Captain's word (as built), or B. try again by itself after a few minutes?
- **ENG-03:** should a player engineer be given orders? A. yes, until it leaves two unanswered (as built); B. only engineers that have spoken the set words.
- Still open from earlier and touched again in this round: CARGO-02 (with KNB-15: may word to a Quartermaster that cannot be found go by PDA?), CHEAT-15 step 5 (a PDA's flashlight), HAND-08 step 5, DOOR-15 steps 4 and 5 (insulated gloves), KNB-06, MEM-07 step 3.

## Round M2: the held parts of round M1

- **SENSE-08 / CHEAT-15:** a Captain with no card on, known by face and the PDA list. A. refuse to arrest them, with a new reason and words; B. no, the arrest stands; C. refuse with the existing `captain` reason, worded "carries a Captain's ID".
- **CARGO-04:** should a cargo technician let a security officer in just for asking? A. yes (as built); B. only when it has heard of a warrant.
- **HEAD-10:** should crew walk between decks? A. turn on multi-deck walking for crew and go through every same-deck test (large); B. keep crew to one deck (as built: no meeting room on its deck means no meeting, and the Captain is told once); C. meet in the head's own office when no room is on its deck.
- PLAY-10's question 3 (a janitor called on a superior's order is turned away at the door when no technician has seen a mess) was seen in the new `callme` scenario. It still waits on the answer.


---

# The owner's answers (2026-11-22)

Answered in one message. "Build" means branch `crew-answers` builds what the answer unblocks; "as built" means the code already does it and nothing changes. Where an answer turned out larger than expected, or needed a further decision, the new question is at the end.

| Question | Answer | What it means |
| --- | --- | --- |
| API-01 | B | Build: only a broken hold earns a trespass warrant; "cannot get a hold of" does not. |
| ENG-01 | B | Build: once its engineer says it cannot get the emitters off, the Chief Engineer goes to the engine room and tries itself. |
| HAND-12 | A | As built: large wooden crates are left alone. |
| QM-08 | B | Build: with two or more orders waiting on the Captain and none named, it asks which and acts on neither until told. |
| SECT-03 | B | As built: only the cut-word rule. |
| SECT-07 | A | As built: a keeper puts out only someone the head names. |
| MULTI-08 | B | Build: a trespass warrant takes being told to leave, refusing, and breaking the hold. |
| ARR-02 | (words) | Build: an officer with a warrant to serve in a room is not walked out of it; a wanted keeper who walks the officer out is fighting back. |
| QM-10 | B | As built: a cancel does not call back an order already with a technician. A placed order cannot be cancelled at the console. |
| KNB-06 | A | Build: the galoshes at spawn go, and a janitor remembers the tiles it has just mopped as slippery. |
| CARGO-02 | C | Build: face to face when the Quartermaster is seen; by PDA only after a long wait (KNB-15's word too). |
| KNB-08 | A | Build: a janitor's call closes when what is left will not come off, until it holds a different tool. |
| TRUST-11 | 1 A, 2 B | As built: warrants come only from players; the prompt rule stays out. |
| CHEAT-01 | A | As built: crew NPCs do not pass through each other. |
| CHEAT-14 | B | Build: the engine is read only when the PDA is already on. |
| DESK-05 | A | Build: with no Head of Security, each officer keeping the list serves the warrants declared to it. |
| DESK-03 | B | Build: a janitor with a dry mop walks to a sink it knows of to wet it first. |
| SECT-08 | B | Build: a stranger who says a head sent them is asked about, face to face or by PDA, and waits for a yes; heads note whom they send. |
| ARR-10 | B | As built: it stays and calls. |
| ARR-09 | A | As built: 15 and 20. |
| ARR-08 | A | Build: stopping an attacker breaks in on an arrest. |
| ARR-03 | B | Build: an officer gets away from a head of staff who keeps hitting it. |
| MAP-04 | A | As built: checkpoint cells are used. |
| QM-05 | A | Build: with no other technician about, the Quartermaster goes to let its shut-in technician out itself. |
| CARGO-08 | A | Build: a head with several crates waiting and no number gets them all, one after another. |
| JOBS-04 | C | As built. |
| ASYNC-07 | B | As built: remarks are offered while walking, and never stop the walk. |
| BRAIN-09 | A | As built: the second call. |
| KNA-06 | B | As built: no greeting after an arrest. |
| MEM-11 | A | Build: whoever asked is sent word when blocked work is given up; the same for open work given up past its time (JOBS-02, CARGO-13). |
| MULTI-03 | A | As built. |
| TRC-03 | A | As built: only the head's set words call a meeting. |
| ENG-06 | B | As built. |
| SENSE-11 | A | As built: MULTI-03 kept. |
| HAND-07 step 4 | no | As built: no alarm for someone out cold in a locker, until there is medical. |
| KNA-05 | yes | Build: an officer puts down what it holds for the cuffs too. |
| CHEAT-10 | as now | As built. |
| MAP-06 | yes | Build: a cargo post is the room with the counter window to the lobby, whatever console stands there. |
| DESK-10 step 3 | yes | Build: with a mop and soap in hand and a bucket known, the janitor puts the soap in its bag to carry the bucket. |
| PLAY-10 | 1 A, 2 B, 3 A | 1 as built (silence). Build 2: a call-a-janitor order is taken only from an imperative or a line with the NPC's name. Build 3: a janitor called on such an order is let in, the call noted in the department's list. |
| SUP-11 | B | As built: the unpaid order stays in the cart. |
| CHEAT-12 | A | Manifests kept and handed to the Quartermaster, but left unbuilt until the large fixes. |
| SUP-17 | 1 A, 2 A | Build: a held crate leaving cargo in someone else's hands is taken, not lost; the orderer is told. |
| CORE-03 | A | Build: a body that loses sight of someone walks to where they were last seen, looks, then is told "You lost sight of X near ROOM". |
| KNB-01 | A | Build: cargo staff open the Warehouse shutters with the wall button, and shut them again after. |
| DOOR-14 | B | Build: a dead door is sent to engineering. |
| DOOR-12 | B | As built: fire doors are reported, not held. |
| KNA-09 | C | As built: left until there is medical. |
| SECT-10 | C | Build: a fixed "Captain, noted." when nothing else answers PDA talk to security. |
| TRB-06 | A | As built: only the Captain is told. |
| ARR-04 | A | Build: a prisoner with no cell is let go once the warrant's minutes are up in the Brig, and "X is free" is reported. |
| CHEAT-04 | A | Build: anyone who stood for a quiet arrest, player or crew, has the cuffs taken off in the cell. |
| SEC-07 | B | Build: only security takes cuffs off a crew member stuck in them. |
| CHEAT-02 | A | Build: people no longer aboard are left out by the crew manifest. |
| CARGO-05 | A | Build: asked for more than four of a kind, it says "four is the most I can order at once". |
| TRUST-04 | A | As built: anyone with the number. |
| QM-02 | A | Build: the Quartermaster asks a silent human technician "Has order N come in?". |
| DRV-07 | A | Build: a shut-in body nobody has come for asks and knocks again after 2 minutes. |
| DRV-12 | A | Build: while its work is only held back, the body stands still. |
| HEAD-10 | (words) | Build: with no meeting room on its deck, the head meets in its own office. No multi-deck walking. |
| TRC-04 | B | Build: after a stop that is not the machine's fault, the engineer tries again by itself after a few minutes. |
| ENG-03 | A | As built. |
| SENSE-08 / CHEAT-15 | A | Build: a Captain known by face and the PDA list is refused like one with the card, with its own reason and words. |
| CARGO-04 | A | As built: an officer is let in on asking. |

## Still open: no answer yet

- **CHEAT-15 step 5:** should a body in the dark use its PDA's flashlight (a click on the PDA, `toggle_flashlight`)? A. yes, switched on whenever it stands in the dark; B. yes, only for work that needs sight (cleaning, an arrest); C. no.
- **HAND-08 step 5:** walking up to someone to talk across a window. A. walk round to their side; B. in earshot is enough (as built).
- **DOOR-15 steps 4 and 5:** A. before going into the wires of a door that has shocked it once, the body checks its own gloves and refuses without insulated ones (getting gloves goes through cargo); B. that, and the Chief Engineer is told at spawn whether its gloves are insulated; C. neither (as built).
- **MEM-07 step 3:** should "where" carry a hint inside a big room ("by the Bridge")? A. yes, the window is told roughly where in the room; B. no, the room name is enough (as built).
