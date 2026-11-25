# Crew NPC bugs: the summary

**Built by `build-index.mjs` from `findings/`; do not edit by hand.** Every open bug, most severe first, and within each severity the easiest fix first. Duplicates, refuted findings and fixed ones are left out. Each bug links to its finding, which has the code, a concrete case, the steps to fix it and how to test it.

Beside each: **confirmed** means a second reviewer tried to prove it wrong and could not. **not checked** means only its finder has looked at it; "finder sure" or "likely" is how sure that finder was. **unsure** means the second reviewer could not settle it.

153 open bugs (50 confirmed), then 93 gaps. 304 findings are closed (duplicates, refuted or fixed) and not listed.

| Severity | Small fix | Medium fix | Large fix | All | Confirmed |
| --- | --- | --- | --- | --- | --- |
| critical | 0 | 0 | 0 | 0 | 0 |
| high | 1 | 0 | 7 | 8 | 8 |
| medium | 4 | 18 | 14 | 36 | 35 |
| low | 103 | 6 | 0 | 109 | 7 |

Severity: **critical** stops a body, the whole crew or the window for the rest of the round; **high** makes a job fail or loop in a case most rounds will meet, breaks the no-cheats rule, or acts on the wrong person; **medium** is wrong in rarer cases, or noticeable while the work still gets done; **low** is wording, log noise, dead code or a misleading test.

## Bugs: high (8)

### Small fix (a few lines, one file): 1

1. **[SEC-15](findings/SEC-15-attacker-looked-for-by-name-so-the-baton-can-go-to-someone-else.md)** (confirmed, security): Whoever attacked the officer is looked for by name and not by the handle the server gave, so with two masked Unknowns, or two of one name, the baton goes to whichever is first in view
   - Fix: Find the attacker in peopleInView by beat.attacker.handle first and by name only when no handle came, and send the stop to that handle

### Large fix (a design change, or both halves): 7

2. **[CARGO-01](findings/CARGO-01-order-that-fails-after-placing-is-told-to-nobody.md)** (confirmed, cargo): An order that fails after it was placed is told to nobody, and the Quartermaster's book keeps it as given for good
   - Fix: Have the server owe a notice of kind failed when a placed order is given up, and have the technician pass it on like any other word (to the Quartermaster face to face, or to whoever ordered by PDA)
3. **[HOLE-01](findings/HOLE-01-any-card-that-says-captain-is-the-captain.md)** (confirmed, design): Anyone holding or wearing a card whose job text has "captain" in it is obeyed as the Captain
   - Fix: Have the server work out each person's rank from the card they wear and whether its name matches their face, send that as a field, and have the window go by that field and never by words in the job text
4. **[KNA-04](findings/KNA-04-helper-list-of-cheats-confirmed-in-hands-doors-alarm.md)** (confirmed, hands): The list of cheats a helper reported in older code was never checked - all of it is true and still in the code
   - Fix: Replace each direct call with the click a player makes, starting with hand_over, which puts things into a player's hand
5. **[LOGA-03](findings/LOGA-03-a-mop-clicked-on-a-cobweb-or-rubble-removes-it-but-janitors-are-told-it-needs-soap.md)** (confirmed, logs): A mop clicked on a cobweb or rubble takes it up, but the body only ever mops the floor under it, so every cobweb and pile of rubble is called beyond the mop and starts a round-long soap-or-rag loop
   - Fix: For a mop, click the mess itself when it is not is_mopped, judge a mop by its cleaner strength in can_clean_mess, and count a held mop as able to scrub in janitor.ts
6. **[LOGB-01](findings/LOGB-01-janitor-shut-in-the-hops-office-for-the-rest-of-the-round.md)** (confirmed, doors): A janitor shut in the Head of Personnel's Office stays there for the rest of the round, with the head in the room and asked twice
   - Fix: Let anyone whose own ID opens the room open its door to let out someone inside who asks, not only cargo, and send a head the head form of the shut-in line even when its ID opens the door
7. **[TRUST-02](findings/TRUST-02-forged-pda-sender-taken-for-the-captain.md)** (confirmed, senses): A PDA message with a made-up sender, from the message monitor or a virus disk, is taken as from the Captain or any head it names
   - Fix: Have on_pda_message say whether the message can be replied to, as the PDA itself shows, and have the window pass one that cannot to none of its readers
8. **[TRUST-05](findings/TRUST-05-any-security-pda-gets-any-door-forced-open.md)** (confirmed, engineering): Any PDA that shows a security job can have an engineer pry open any unplated door aboard, the Captain's Quarters and the Armory among them, and leave it standing open
   - Fix: Take a forcing request only from whoever keeps security's list, only for a warrant engineering can check and a room that is not a secure store, and have the Captain say yes to anything in command or security

## Bugs: medium (36)

### Small fix (a few lines, one file): 4

9. **[ARR-10](findings/ARR-10-short-of-cuffs-with-them-in-sight-it-neither-fetches-nor-tells.md)** (confirmed, security): Short of cuffs, or of a working baton once force is called for, with the person in sight it neither goes for its kit nor tells anyone
   - Fix: Let wantsKit send it for its kit while on lead when the kit is what stops the arrest, and tell whoever keeps the list at once that it is short
10. **[SENSE-11](findings/SENSE-11-emergency-access-makes-everyone-belong-in-every-post.md)** (confirmed, senses): Once emergency maintenance access is on, or the AI opens a door's emergency access, everyone belongs in every post that has such a door, and no stranger is ever questioned there
   - Fix: In belongs_in_post test the person's access against the door's own requirements (check_access_list on their access) instead of door.allowed, so an emergency-open door is not taken for a right to be there
11. **[DOOR-06](findings/DOOR-06-door-out-chosen-without-testing-the-way-to-it.md)** (confirmed, doors): The door out of a room is chosen without testing that the body can walk to it, so it makes for the same unreachable door every time
   - Fix: Test a route to the inside tile for a door out as is done for a door in, so a door out that cannot be walked to is passed over and the next one tried
12. **[PLAY-27](findings/PLAY-27-warehouse-shutter-button-not-pressed.md)** (not checked, finder likely, cargo): A technician cannot press the Warehouse shutter button and goes round by maintenance
   - Fix: Not known yet, the log now says which check failed and where the body stood

### Medium fix (one part of the code): 18

13. **[CARGO-03](findings/CARGO-03-did-not-go-through-is-said-once-and-not-confirmed.md)** (confirmed, cargo): Word that an order did not go through is said once, only if the Quartermaster is in sight within two minutes, and nothing checks it was heard
   - Fix: Pass the did-not-go-through word through tellQuartermaster as a task of its own, with the same I-have-that answer and PDA fall-back as the other three words
14. **[CHEAT-12](findings/CHEAT-12-crate-order-numbers-read-off-manifests-nobody-tore-off.md)** (confirmed, cargo): When the shuttle docks, the technician knows which crate is which order by reading the number off every attached manifest, aboard and in the bay, without touching one
   - Fix: Learn a crate's number by tearing its manifest off with a click and reading it, one crate at a time as each is unloaded, and only then hold and label it
15. **[CHEAT-15](findings/CHEAT-15-crew-see-everything-in-pitch-darkness.md)** (confirmed, senses): Crew bodies see people, messes and things in pitch darkness, because view() in this codebase ignores light and nothing else checks it
   - Fix: Build a set of lit turfs once per look (turf.check_lumcount_above(LIGHTING_TILE_IS_DARK)) and keep from each sight list only what stands on a lit turf or next to the body, unless the body has night vision
16. **[HOLE-18](findings/HOLE-18-a-hand-that-is-lost-or-disabled-is-counted-as-free.md)** (confirmed, hands): A hand that is lost or disabled is counted as a free hand, so a one-handed body walks to every thing it is sent for and fails to pick it up, for good
   - Fix: Count a hand as free only when has_hand_for_held_index says it works, in one helper used by every free-hand test, put things into that working hand by its index, and tell the brain when a hand stops working
17. **[JAN-03](findings/JAN-03-filthy-rag-still-counted-as-a-tool-and-never-washed.md)** (confirmed, cleaning): A rag grows filthy with blood and then cleans nothing, but is still counted as a tool, so every mess after is written off and the rag is never rinsed at a sink
   - Fix: Count a rag with blood_level 10 or more as a spent tool in can_clean_with, and add a step that rinses it at a sink in sight the way a player does, by a plain click with the rag
18. **[KNA-09](findings/KNA-09-warrant-held-by-an-officer-who-is-down-is-never-served.md)** (confirmed, security): A warrant given to an officer who then goes down or falls silent is never served by anyone
   - Fix: Have whoever keeps the list take the warrants back when it sees its officer lying on the floor, or when the officer does not answer a fixed "any word on X" sent after some minutes of silence
19. **[KNA-19](findings/KNA-19-room-in-parts-one-door-opens-so-whole-room-is-taken-for-open.md)** (confirmed, doors): A room split by inner locked doors counts as open if one outer door opens, so janitors set off for a part of it they cannot reach (the Research Division, no route)
   - Fix: Work out which part of a room the body can get into from the doors that open for it, and pick the spot to walk to, and the messes that are its to clean, from that part only
20. **[KNA-23](findings/KNA-23-officer-looks-for-someone-by-standing-at-the-first-spot-of-the-room.md)** (confirmed, security): The officer looks for someone by standing for 20 seconds at the first spot it reaches in the room, so in a room wider than its sight it does not see them
   - Fix: After the first look from the arrival spot, walk to the middle of the room (go_to with middle, which exists) and look again before the room is counted as looked in, with a far-end leg later if the middle is not enough
21. **[KNA-26](findings/KNA-26-officer-asks-to-be-let-in-only-by-pda-never-to-a-keeper-in-sight.md)** (confirmed, security): Shut out, the officer asks to be let in only by PDA, in a fixed order, never to the face of a keeper it can see, and with no PDA it gives up at once
   - Fix: Ask first whichever keeper is in sight, aloud, and fall back to the PDA list only when none is, and with no PDA wait at the door for a keeper to come by
22. **[LOGB-02](findings/LOGB-02-meeting-call-mid-haul-loses-the-unpacked-crate.md)** (confirmed, driver): A meeting called while a janitor hauls a collected crate makes its brain lose the haul, so it unpacks the crate, then tells its head the crate is lost
   - Fix: Do not let a step that stays put (a PDA reply) take the place of brain.lastAct while a walk or haul is still waiting on its result, keep it aside and match results to either
23. **[LOGB-05](findings/LOGB-05-shut-in-janitor-learns-the-public-cargo-lobby-is-locked-and-keeps-it.md)** (confirmed, doors): A janitor shut in a room learns that the Cargo Lobby and the Cargo Bay each open only from the other, keeps that for good, and makes for the door of the public lobby
   - Fix: Send door_through from go_to_door only when a route to the outer room's own door was found, never from a body that is shut in, and have the brain refuse an entry that makes a loop and forget entries after a while
24. **[PERF-08](findings/PERF-08-ui-data-works-out-the-same-things-many-times-per-body-per-update.md)** (confirmed, core): ui_data works out the same things over and over for every body on every update - four walks of up to 300 remembered messes, two or three of every PDA, a fresh view for security and engineering, about ten ID card lookups
   - Fix: Work out each body's sense-derived fields once per look into a snapshot list on the controller, have ui_data copy the snapshot and add only the cheap live fields, and pass the look's sight list to security_state and engineering_state
25. **[SUP-11](findings/SUP-11-budget-check-ignores-the-cart-and-an-unpaid-order-flies-the-shuttle-in-circles.md)** (confirmed, supply): The budget check before an order leaves out what is already in the cart, and an order the shuttle cannot pay for flies the shuttle to and fro for six minutes and is then called held up
   - Fix: Count the cost of every order already in SSshuttle.shopping_list against the budget in tool_order, and in supply_run_step tell an order that came back unbought for want of money from one held up, and say so
26. **[TRUST-04](findings/TRUST-04-held-crate-handed-to-anyone-who-names-its-owner.md)** (confirmed, cargo): A crate held for a head is put out for anyone who says they have come for it, by number or just by the head's name or job
   - Fix: Release a held crate only to whoever it is for, to their own staff, or to someone they have named by PDA, and ask anyone else who sent them
27. **[API-02](findings/API-02-voice-name-and-seen-name-differ.md)** (confirmed, core): The server names one person three ways, and the window matches a voice to a face by name, so a Captain whose ID shows an honorific is never obeyed
   - Fix: Find the speaker among people_in_view by details.handle, which the server already ties to the voice, and fall back to the name only when there is no handle
28. **[HEAD-04](findings/HEAD-04-any-staff-line-with-out-of-or-i-need-is-an-order.md)** (confirmed, head): Anything a janitor says near the Head of Personnel with "I need", "out of" or "supplies" in it is noted as asking for supplies, and a crate is ordered
   - Fix: Take an ask only from the set asking line or a line that says I need something for my work, and take a report only from the person whose turn it is, or one that begins with the head's first name and reads as a report
29. **[MULTI-07](findings/MULTI-07-crate-sent-to-a-second-collector-is-fought-over-by-both.md)** (confirmed, hands): A crate the head sends a second collector for is gone after by both, and at the crate each pulls it out of the other's hands and wipes the other's claim on it
   - Fix: Refuse haul_collected, haul_released and haul_crate_back when someone else has the crate in hand, clear collected_by on failure only if it is still this body's, and have the window end a COLLECT task the server refuses for that
30. **[PERF-02](findings/PERF-02-each-sense-event-sends-the-whole-crew-at-once.md)** (confirmed, core): Each sense event sends the whole crew's state at once, one update per event even when many come in one tick, about 150 KB each at 11 crew and 600 KB at 40, 90 percent of it old events
   - Fix: Let on_sense_event ask for one update at the end of the tick instead of one at once, and send each body's events newer than its acked_seq only

### Large fix (a design change, or both halves): 14

31. **[ARR-15](findings/ARR-15-room-with-no-door-locked-to-it-is-taken-for-one-to-be-let-into.md)** (confirmed, security): A room with no door locked to security, that it could not walk into for fire doors or a breach, is asked of the Captain and then forced open by engineering
   - Fix: Have security_state send empty keepers lists too, treat an empty list as no locked door in keepersOf so no shutOut is opened, and tell the list once what is in the way
32. **[ASYNC-01](findings/ASYNC-01-nearest-to-speaker-decided-before-the-others-have-heard.md)** (confirmed, brain): Who is nearest a line put to several is decided before the others have heard it, so two NPCs often both answer
   - Fix: Decide nearest on the server for the hearers of one line, or have the window hold a group line a second and decide once every hearer's event is in
33. **[ASYNC-02](findings/ASYNC-02-result-of-the-llms-own-step-taken-for-the-drivers.md)** (confirmed, driver): The answer to a step the LLM took is read as the answer to the driver's step, because answers are matched by tool name only
   - Fix: Send a call number with every tool call, have the server put it on the action_result, and match noteResult on it, or at the least drop lastAct, without failing it, when the LLM sends a walk or errand (never on a say)
34. **[CHEAT-05](findings/CHEAT-05-cargo-sees-inside-shut-crates.md)** (confirmed, cargo): Cargo staff know what is inside every shut crate, which is empty, which holds mail, and what aboard the shuttle bars it, without opening anything
   - Fix: Know a crate's contents only from having opened it or seen it open, keep that on the controller, and treat a shut crate never looked into as full
35. **[CHEAT-06](findings/CHEAT-06-cargo-knows-shuttle-bay-and-held-crates-from-anywhere.md)** (confirmed, cargo): Cargo staff are told whether the shuttle has docked, what is waiting in the bay and the lobby, and where each held crate is, wherever they are standing
   - Fix: Fill freight, tidy and held from what the body last saw, refreshed only while it is in the bay or lobby or can see the place, and keep the last sight with its time
36. **[ENG-02](findings/ENG-02-emitter-switched-on-but-unpowered-is-taken-for-firing.md)** (confirmed, engineering): An emitter that is switched on but has no power is taken for a firing one, so a dead engine is reported lit and sent to be relit every five minutes for ever
   - Fix: Have switch_emitter and the machine state count an emitter as firing only when it is active and powered, and give the relight a reason word back so the Chief Engineer stops sending it and tells the Captain the emitters have no power
37. **[JOBS-01](findings/JOBS-01-security-officer-cargo-and-engineering-taken-for-cargo-staff-and-engineers.md)** (confirmed, cargo): A department security officer, Security Officer (Cargo) or (Engineering), is taken for a cargo technician or a station engineer
   - Fix: Send each person's base job title from the server (crew_npc_job_of(person).title) beside the ID assignment and match jobs on that, or failing that strip a trailing bracketed department before matching
38. **[KNB-07](findings/KNB-07-door-tool-finds-people-through-walls-and-reads-their-mind.md)** (confirmed, doors): The door tool finds the person it is opening for through a shut door, by name or by job, and reads which door they want straight from their controller
   - Fix: Open the door that was named by the knock, the PDA message or the speech, and learn who is there by seeing them once it is open
39. **[SEC-09](findings/SEC-09-every-cuffs-failure-is-told-as-they-would-not-stay-still.md)** (confirmed, security): Every way the cuffs fail is told as they would not stay still, so someone who cannot be cuffed is batoned again every half minute for good
   - Fix: Have put_cuffs_on say why it failed (cannot_cuff, no_hand, moved) and send that reason back, and have the window give up on cannot_cuff and not set force for anything but moved
40. **[SUP-07](findings/SUP-07-any-pda-message-to-a-person-wipes-the-notice-owed-them.md)** (confirmed, supply): Any PDA message to a person strikes off the first crate notice owed to them, so a note about mail cancels the word that their order has come in
   - Fix: Have the window say which notice a message is about and have tool_message strike off only a notice of that kind
41. **[TRB-04](findings/TRB-04-a-wanted-person-found-dead-is-cuffed-dragged-to-a-cell-and-reported-jailed.md)** (confirmed, security): A wanted person found dead is told they are under arrest, cuffed, dragged to a cell and reported to the Captain as jailed, and the cell then counts as empty
   - Fix: Send a dead flag with each person in view, and have serveStep report a wanted person found dead as an outcome to the desk instead of arresting them, the desk then telling the Captain and striking the warrant
42. **[TRUST-03](findings/TRUST-03-speaker-rank-read-from-the-voice-name-alone.md)** (confirmed, senses): Who said something is taken from the voice alone, so a voice made to sound like the Captain is the Captain, whoever is standing there
   - Fix: Have the server send voice_matches with every line from a human (false when a player's chat would add "(as ...)"), and have the window give no rank to a line whose voice does not match, and take rank from the person behind the handle when there is one
43. **[TRUST-08](findings/TRUST-08-pda-word-goes-to-the-first-pda-with-that-name.md)** (confirmed, senses): A PDA message the crew send by name goes to the first PDA with that name, so a second PDA renamed to a head's name takes all the head's word
   - Fix: Have messenger_named collect every visible PDA with that name and, when there is more than one, pick the one whose job the window names (it has it from pda_people), else the one aboard, else refuse as ambiguous
44. **[TRUST-01](findings/TRUST-01-janitor-leads-anyone-into-rooms-locked-to-them.md)** (confirmed, brain): A janitor asked the way leads anyone, by its own ID, into the Custodial Closet or the maintenance tunnels
   - Fix: Have the server work out once per map which rooms the crew at large cannot walk into (maintenance included) and send them with places; leave those out of the lead offer unless the asker is command, a superior or of the NPC's own job

## Bugs: low (109)

### Small fix (a few lines, one file): 103

45. **[CHEAT-13](findings/CHEAT-13-technician-knows-the-cargo-budget-from-anywhere.md)** (confirmed, cargo): A cargo technician with no budget program to hand still refuses an order for want of money, reading a budget it cannot see
   - Fix: In tool_order read the budget through cargo_budget(), which needs the budget program on a carried PDA, and with no program check the money at the console in place_order
46. **[PERF-03](findings/PERF-03-every-body-looks-in-the-same-tick.md)** (confirmed, senses): Every body of a crew spawned together looks round in the same tick each second, so the whole crew's sight work and every sighting it raises land in one tick
   - Fix: Start each body's looping look timer after a random first wait of up to one second, so the crew's looks are spread across the twenty ticks of each second
47. **[SIM-02](findings/SIM-02-crash-in-reply-handling-passes-as-a-dead-model.md)** (confirmed, tools): A crash in the window code after the model answers is caught as a dead model, and the simulator still says all passed
   - Fix: Have the stand-in's fetch keep every error it throws itself, have act() keep every brain_log decision whose error is not one of those (and not the two known no-answer outcomes of a CHOICE or READING record), count unhandled rejections too, print them all and fail the run if there are any
48. **[SUP-08](findings/SUP-08-pda-message-text-is-sent-as-raw-html.md)** (confirmed, supply): A crew NPC's PDA message skips the game's cleaning, so its text reaches the other person's chat as raw HTML
   - Fix: Run the text through the messenger's own sanitize_pda_message before it is sent or kept for resending
49. **[ARR-18](findings/ARR-18-each-new-go-at-it-by-the-same-attacker-is-told-to-the-captain-again.md)** (not checked, finder sure, security): Every fresh go at security by the same person with no warrant, once it has been stopped, is told to the Head of Security and the Captain again
   - Fix: Keep when each attacker was last reported in beat, by name, and report the same person again only after some minutes or once a warrant on them has come and gone
50. **[ASYNC-04](findings/ASYNC-04-talk-waits-behind-a-choice-and-behind-the-first-in-line.md)** (not checked, finder sure, brain): A reply that is sitting out its short cooldown lets a job choice take the model first, and holds up every other NPC's reply behind it
   - Fix: In startTalk take the first queued NPC that is ready, not only the head of the queue, and do not start a choice while a talk is due within a few seconds
51. **[BRAIN-08](findings/BRAIN-08-reasons-cut-off-mid-word-by-the-schema-and-fed-back.md)** (not checked, finder sure, brain): One reason in four for a feeling and one in eight for a job choice is cut off mid-word by the reply schema, and the stump is fed back into later prompts
   - Fix: Ask for a reason in a few words in the prompt, raise the schema maxLength well above the kept length, and cut the kept text back to its last whole word or clause
52. **[BRAIN-10](findings/BRAIN-10-wrong-or-missing-model-shown-as-ready.md)** (not checked, finder sure, brain): With qwen3.5 9b not installed the window takes whichever model Ollama lists first, embedding models too, and with none at all it still says Ollama ready
   - Fix: Choose only a chat model, prefer one whose name starts with the preferred family, and show a warning instead of Ollama ready when the preferred model is missing or nothing usable is installed
53. **[CARGO-16](findings/CARGO-16-whoever-is-knocking-is-booked-as-a-person-inside-the-bay.md)** (not checked, finder sure, cargo): Let out of an inner room after an unnamed knock, the stand-in name whoever is knocking is booked as a person inside the outer room, and stays there for the round
   - Fix: In afterActing never book SOMEONE_INSIDE in the department's list, and better book whoever the server says it opened for
54. **[CHK-01](findings/CHK-01-voice-test-crashes-fixture-brain-out-of-step.md)** (not checked, finder sure, tools): voice.ts crashes part way through because the test brain in fixtures.ts lacks fields the window code now reads
   - Fix: Make the blank brain in one exported function in the window code and have both ingest and fixtures.ts call it
55. **[CHK-04](findings/CHK-04-job-module-loaded-first-crashes-at-import.md)** (not checked, finder sure, brain): Loading any job's file before the rest of the window code throws at import, because jobs/index.ts builds its list while the jobs are still loading
   - Fix: Build the JOBS list the first time jobFor is called, not when jobs/index.ts is loaded
56. **[CHK-06](findings/CHK-06-two-dead-names-in-janitor-the-type-check-would-flag.md)** (not checked, finder sure, janitor): Two names in jobs/janitor.ts are never read - a wait constant left from the first build and the via argument of letInStep
   - Fix: Delete WAIT_AT_COUNTER_DS, and drop the via parameter of letInStep (or use it), so the only wait at a locked door is LET_IN_WAIT_DS
57. **[CHK-08](findings/CHK-08-sim-end-checks-fail-on-work-still-under-way-at-the-cut-off.md)** (not checked, finder sure, tools): Two simulator scenarios fail by chance because their end checks read the crew at a fixed second, with a look round or a reminder still under way
   - Fix: Stop starting new held checks and look rounds in the last minute of a scenario and run the clock on until no body has a walk or a message in hand, before the end checks
58. **[CORE-05](findings/CORE-05-every-ack-rebuilds-and-resends-the-whole-crew.md)** (not checked, finder sure, core): Every ack the window sends makes the server rebuild and resend every body's whole state, though nothing the window shows has changed
   - Fix: Return FALSE from ui_act for ack, as brain_log already does, since the window already knows the number it has just sent
59. **[CORE-08](findings/CORE-08-walk-back-to-post-cancels-work-begun-in-the-tenth-of-a-second-before.md)** (not checked, finder sure, core): The walk back to the post starts a tenth of a second after it is decided without looking again, and silently cancels any walk, errand or search the brain began in between
   - Fix: Start the return walk through a small proc that first checks no walk, errand or search has begun and the body is still off its spot, and does nothing if one has
60. **[DESK-04](findings/DESK-04-putting-back-marks-are-shared-by-every-janitor-by-task-number.md)** (not checked, finder sure, janitor): The note that a janitor is putting its mop and bucket back is kept by task number for every janitor at once, so one janitor's note steers another
   - Fix: Keep the putting-back note on the task itself, as task.puttingBack, instead of in a module-wide Set of task ids
61. **[DESK-12](findings/DESK-12-no-soap-or-rag-reply-is-not-read-by-cargo-as-needing-scrubbing.md)** (not checked, finder sure, janitor): A janitor's I have no soap or rag reply is not read by cargo as the mess wanting scrubbing, so the next janitor is asked plainly to come and try
   - Fix: Word the janitor's reply with NEEDS_SCRUBBING (it needs scrubbing with soap or a rag), or widen cargo's test to soap or (a )?rag
62. **[DOOR-10](findings/DOOR-10-plastic-flaps-rule-turns-back-crawlers-and-riders.md)** (not checked, finder sure, doors): Our plastic flaps rule refuses a route to a mob lying down, riding a mulebot or phasing, all of which the flaps let through
   - Fix: Let the route through when the one asking is lying down or buckled to a mulebot, read from the pass info, and say in the comment what the rule cannot know
63. **[DOOR-13](findings/DOOR-13-go-to-door-of-a-visited-place-off-the-station-is-a-runtime.md)** (not checked, finder sure, doors): Going to the door of a place the body has stood in that is not a station room, a shuttle say, is a runtime and the brain gets no answer
   - Fix: In tool_go_to_door answer FALSE when the named place has no station area, and give crew_npc_doors_of a null guard
64. **[DOOR-17](findings/DOOR-17-door-with-its-id-scanner-off-taken-as-opening-to-the-id.md)** (not checked, finder sure, doors): A door whose ID scanner is cut or switched off opens to nobody, and the door code takes it as opening to everyone whose ID has the access
   - Fix: Add one helper for whether a door will open to a body by hand, requiresID and allowed and power and no bolts or weld, and use it wherever the door code now asks allowed alone
65. **[DOOR-18](findings/DOOR-18-armour-plate-seal-and-no-panel-tried-twice-and-reported-as-would-not-open.md)** (not checked, finder sure, doors): A door with armour plating, a seal or no panel is gone at twice, and security and the Captain are told only that it would not open
   - Fix: Give the lasting causes their own reasons (plated, sealed, no_panel), add them to the final list in forcing.ts and give whyNot words for each
66. **[DRV-02](findings/DRV-02-step-clear-count-never-starts-again.md)** (not checked, finder sure, driver): Having stepped clear twice in a room, a body never steps clear in that room again, on any later visit
   - Fix: Start the count again when the body leaves the room, and clear the map in stopSession
67. **[DRV-04](findings/DRV-04-talk-hold-start-goes-stale.md)** (not checked, finder sure, driver): The start of a talk hold is kept from an earlier conversation, so a body spoken to later walks off at once
   - Fix: Clear heldSince whenever drive returns without reaching the hold, or count the hold from lastSpokenToAt
68. **[DRV-08](findings/DRV-08-after-stepping-aside-nothing-at-all-for-fifteen-seconds.md)** (not checked, finder sure, driver): Having stepped aside, the body takes no step of any kind for 15 seconds, so a second ask to move, an order, being told to leave and a door held for it all wait
   - Fix: Keep the body off its own routine work for ASIDE_HOLD_MS with a hold of its own, not by putting driveAfter forward, so that anything ahead of routine work still goes at once
69. **[DRV-09](findings/DRV-09-shut-in-try-at-leaving-spent-on-a-step-held-for-talk.md)** (not checked, finder sure, driver): Shut in, its next try at leaving is spent on a walk the talk hold then stops, so it waits another 20 seconds, or two minutes if it was let in, before it really tries
   - Fix: Set tryLeavingAt only once the walk is really issued, after the pause after saying and the talk hold, not where the gate is checked
70. **[DRV-10](findings/DRV-10-llm-status-line-is-set-once-and-never-again.md)** (not checked, finder sure, driver): The window's Ollama line is worked out once when it opens and never again, so it shows ready while every call fails, or unreachable while calls work
   - Fix: Keep the outcome of the last few real LLM calls in brain.ts and show that in the status line, and pick a fallback model that can chat
71. **[ENG-07](findings/ENG-07-light-order-sent-by-pda-is-never-answered-and-is-sent-again-every-minute.md)** (not checked, finder sure, engineering): An engineer given the engine by PDA never answers that it has it, so the Chief Engineer sends the order again every minute until the engine is lit
   - Fix: Have the engineer answer a light order that came by PDA with "The engine, right away." by PDA, and let the Chief Engineer give the order at most twice before it waits on the lit or stuck word instead
72. **[ENG-12](findings/ENG-12-captain-told-i-do-not-know-this-engine-by-the-chief-engineer.md)** (not checked, finder sure, engineering): On any map but MetaStation the Captain is told by the Chief Engineer "The engine is not lit - I do not know this engine", the engineer's "I" passed on as the chief's own
   - Fix: Word the unknown-engine reason without I, for example "the engine room is not one engineering has the steps for", as whyNot does for doors
73. **[HAND-09](findings/HAND-09-explore-walk-broken-off-for-any-reason-writes-the-room-off-for-the-round.md)** (not checked, finder sure, tools): An explore walk that ends for any reason, a stun or a queue at a door included, writes the room off as unreachable for the rest of the round
   - Fix: Write a room into unreachable_places from walk_finished only when the reason is CREW_NPC_NO_WAY, and give the other failures a time after which the room may be tried again
74. **[HAND-11](findings/HAND-11-unasked-thing-kept-for-good-after-a-minute-busy-or-a-second-gift.md)** (not checked, finder sure, hands): A thing pushed into its hand is kept for good if the body stays busy for a minute, or if a second thing is pushed into the other hand before the first is put down
   - Fix: Keep a list of unasked things, not one, and when busy keep waiting as long as the thing is still held instead of giving up after ten tries
75. **[HAND-13](findings/HAND-13-fetch-from-a-locker-takes-an-empty-spray-bottle.md)** (not checked, finder sure, hands): A fetch from a locker takes the first thing of that name, an empty spray bottle included, though every other pick up passes empty ones over
   - Fix: Skip is_spent things in take_from_container as tool_pick_up does, and count them in what the locker holds
76. **[HAND-14](findings/HAND-14-crate-behind-a-shut-door-is-known-to-be-there.md)** (not checked, finder sure, hands): A crate on the far side of a shut airlock counts as seen, so the body knows a crate it cannot see is jammed there and sets off to move it
   - Fix: In crate_in_the_way count a crate as seen only if it is in view itself, and when only the door is in view walk to the door first and look again
77. **[HEAD-08](findings/HEAD-08-one-crate-unpacked-tells-everyone-waiting-on-any-order.md)** (not checked, finder sure, head): Word that one crate is unpacked tells everyone the head has ordered for that their things have come, including those whose order has not arrived
   - Fix: Record on each ask the order and crate numbers it is waiting on, and on word that crate N is unpacked tell only the asks whose crate that was
78. **[HEAD-09](findings/HEAD-09-pickup-turn-indexes-a-list-that-is-reordered-each-time.md)** (not checked, finder sure, head): Who is sent for a crate is picked by a round-wide counter into a list that is put in a new order every time, so after the first crate the one who asked is seldom the one sent
   - Fix: Send the askers of an order first in order of asking, counting from zero for each order, and keep the round-wide turn only for the crates beyond the askers
79. **[JAN-07](findings/JAN-07-custodial-locator-read-with-the-network-down.md)** (not checked, finder sure, cleaning): The custodial locator is read with the station network down, though the program needs it, and the closet is named when the locator shows no gear there
   - Fix: In has_custodial_locator check computer.get_ntnet_status() as engine_reading does, and say plainly when the locator shows nothing rather than naming a room it did not show
80. **[JAN-14](findings/JAN-14-dry-sink-still-taken-as-water-and-a-missed-click-reported-as-run-dry.md)** (not checked, finder sure, cleaning): A sink that has run dry is still taken as water to hand, and a wetting whose click never landed is reported as the sink having run dry
   - Fix: Take a sink as water only with 5 units or more in it, as a mop bucket is taken only with water in it, and in wet_mop tell a click that could not be made from a sink with no water
81. **[JOBS-07](findings/JOBS-07-mail-never-handed-to-someone-whose-id-shows-an-honorific.md)** (not checked, finder sure, cargo): Mail is never handed to someone whose ID shows an honorific, such as Captain John, because the mail is listed under the real name and the person in view goes by the shown name
   - Fix: Have freight_state send, for each name in mail_for, the handle of that person when they are in view (matched by mind on the server), and match DELIVER on that handle instead of on the name
82. **[KNA-12](findings/KNA-12-voice-not-told-how-a-forcing-job-ended.md)** (not checked, finder sure, brain): Once a door-forcing job is closed the voice is told nothing of how it ended, and says the door is forced when it is not
   - Fix: Keep the outcome of the last forcing job for a few minutes and give it to the voice as a cue
83. **[KNA-14](findings/KNA-14-warrant-over-fifteen-minutes-cut-without-saying.md)** (not checked, finder sure, security): A warrant declared for more than 15 minutes is cut to 15 and the answer does not say so
   - Fix: Keep the minutes that were asked for beside the minutes given, and add the sentence about the cell timer to the first answer as the later one already has it
84. **[KNA-17](findings/KNA-17-mess-calls-one-message-a-room-and-to-janitors-who-are-down.md)** (not checked, finder sure, cargo): A technician sends a janitor one PDA message for every room with a mess, seconds apart, and sends them to a janitor it can see lying on the floor
   - Fix: Put every room that is due a call into one message to the same janitor, and pass over a janitor who is seen to be down
85. **[KNA-20](findings/KNA-20-kitchen-door-counted-as-a-door-of-the-bar.md)** (not checked, finder sure, doors): Any airlock beside any square of a room is taken for a door of it, so the Kitchen's door is a third door of the Bar, with both its sides on fridges
   - Fix: In crew_npc_doors_of keep a door only when its inside and outside tiles are on its line of passage and neither holds a dense machine or table
86. **[KNA-22](findings/KNA-22-anyone-seen-inside-cargo-is-told-to-the-voice-as-let-in-by-staff.md)** (not checked, finder sure, cargo): Anyone a technician sees inside a cargo room is described to its voice as let in by someone who works here, though nobody let them in
   - Fix: Say let in only of those on record as let in, and give those merely seen inside a cue that says nobody here is known to have let them in
87. **[KNA-24](findings/KNA-24-crate-left-off-the-squares-is-never-put-on-one-once-a-square-frees.md)** (not checked, finder sure, cargo): A crate cargo once left off the marked squares is never put on one, even after a square comes free, and the log never says where a hauled crate ended
   - Fix: Clear crew_npc_left_on when a square comes free that was not free when the crate was left, and name the tile in the log line for every haul
88. **[KNA-33](findings/KNA-33-engineer-forces-and-leaves-open-a-door-into-a-room-with-no-air.md)** (not checked, finder sure, engineering): An engineer forces open, and leaves standing open, a door into a room that has lost its air, because only its own side of the door is looked at
   - Fix: Before taking a door's power, look for a pressure warning on the door's fire door or a hull breach in view, and if there is one stop and say the room has no air instead of forcing it
89. **[KNA-34](findings/KNA-34-told-to-get-someone-else-to-move-aside-the-hauler-steps-aside-itself.md)** (not checked, finder sure, brain): Anyone whose name is anywhere in a line asking someone to move aside steps aside, so the hauler the way was being cleared for walked off as well
   - Fix: In asideOverhears take a line as asking this NPC only when it is said to it, or its name is the one called on at the head of the line, not when the name turns up later in it
90. **[KNA-35](findings/KNA-35-pda-message-with-the-word-now-in-it-is-given-up-after-ninety-seconds.md)** (not checked, finder sure, core): Any PDA message that will not send and happens to have the word now in it is given up after ninety seconds, reports to the Captain included, and the window has already let it go
   - Fix: Have the window mark a message as short-lived when it sends it (meeting calls only) and keep every other unsent message the full eight minutes, whatever words are in it
91. **[KNB-02](findings/KNB-02-no-route-log-asks-the-same-pathfinder-twice.md)** (not checked, finder sure, logs): The no-route log line says the game's other pathfinder finds none either, but it asks the same pathfinder a second time
   - Fix: Drop the second opinion from log_no_route and print what the route search actually met instead, a flood fill from the body that names the furthest tile reached and what stands on the next ones
92. **[KNB-18](findings/KNB-18-simulator-budget-free-without-a-quartermaster-and-twice-the-real-start.md)** (not checked, finder sure, tools): The simulator charges nothing for an order when no Quartermaster is aboard, and starts cargo's budget at 2,000 credits where a real round starts with 500 to 1,000
   - Fix: Charge every order to the simulated budget as the server does, whoever is aboard, and start it at what a real round starts with, raised only in the scenarios that need more
93. **[LIFE-04](findings/LIFE-04-after-the-look-a-container-is-worked-from-wherever-the-body-is.md)** (not checked, finder sure, hands): After the look into a locker or crate the body takes things out and shuts it from wherever it now is, awake or not
   - Fix: After the sleep in take_from_container, look_inside and take_mail, go on only if the errand is the same one and the body can still reach the container and act, else leave it as it is
94. **[LIFE-06](findings/LIFE-06-window-is-sent-a-half-built-list-of-who-is-in-view.md)** (not checked, finder sure, senses): The window is sent, and acts on, a list of who is in view that is only half rebuilt, each time someone new comes into sight
   - Fix: In look_around build people_in_view in a local list, assign it once the loop is done, and emit the comes-into-view events after that
95. **[LIFE-07](findings/LIFE-07-crate-pushed-on-by-a-body-that-is-down.md)** (not checked, finder sure, cargo): A body knocked down or killed while pushing a crate clear goes on stepping and pushing it
   - Fix: Before each body.Move in push_clear, stop unless the body can move as the walk loop would let it, and say why it stopped
96. **[LOGB-07](findings/LOGB-07-could-not-get-the-crate-out-is-told-after-it-got-out.md)** (not checked, finder sure, cargo): A technician tells the Quartermaster it could not get a crate out to the lobby after it has got it out, and the Quartermaster sends another technician to see to it
   - Fix: Clear brain.gaveUp when a later haul of the same crate succeeds, and have the Quartermaster check the held crates before it sends anyone to see to one
97. **[MEM-03](findings/MEM-03-news-about-a-person-is-thrown-away-as-a-sighting.md)** (not checked, finder sure, memory): News about a person is thrown away as a sighting if it says meet, or is and any room name inside any word
   - Fix: In isSighting match room names as whole words, drop meeting from the met words, and call a note a sighting only if it has nothing else in it beyond the name, a verb of being or seeing and the room
98. **[MEM-09](findings/MEM-09-second-person-to-ask-for-the-same-work-is-never-told-it-is-done.md)** (not checked, finder sure, memory): The second person to ask for the same work is never told it is done, and an order merged into an old task reports to the first asker
   - Fix: Keep a list of everyone waiting on a task, not one askedBy, and owe each of them word when it is done, the latest superior first
99. **[MEM-10](findings/MEM-10-someone-seen-through-a-window-is-remembered-as-in-the-npcs-own-room.md)** (not checked, finder sure, memory): Someone seen through a window or an open door is remembered as being in the NPC's own room
   - Fix: In observe record person.place, the room the server says they stand in, and fall back to npc.location only when it is missing
100. **[MEM-12](findings/MEM-12-my-bodys-hands-are-full-is-said-as-is-hands-are-full.md)** (not checked, finder sure, memory): My body's hands are full is said aloud as I's hands are full, and was becomes am
   - Fix: Add rules for my body's and your body's before the bare ones, keep the tense of was, and only strip a third-person s from verbs that are not es-forms
101. **[MEM-14](findings/MEM-14-rooms-only-heard-of-are-described-as-visited-and-seen-empty.md)** (not checked, finder sure, memory): Rooms the NPC has only been told of are described to the model as rooms it visited and saw nothing in
   - Fix: Keep lastVisit unset for rooms learned without going there, and describe them as known of, not seen, until the body has stood in them
102. **[MULTI-05](findings/MULTI-05-second-order-from-one-asker-within-two-minutes-is-dropped-by-the-free-technician.md)** (not checked, finder sure, cargo): A second order from the same person within two minutes is refused by the free technician because the busy one took the first, and nobody places it though the voice says it will
   - Fix: Key an order claim by the asker and what was asked for, or let a claim go as soon as the claimer has placed its order, so a second asking can be taken by a technician who is free
103. **[MULTI-09](findings/MULTI-09-knock-from-inside-left-to-the-quartermaster-by-name-order-and-nobody-goes.md)** (not checked, finder sure, cargo): A knock from inside a cargo room is left to whoever in cargo has the first name in the alphabet, the Quartermaster included, so with the Quartermaster in sight neither technician goes
   - Fix: In the name-order tie-break count only technicians who are on their feet and not busy (isTechnician, not down, not cuffed, not hauling), not the Quartermaster
104. **[PARSE-11](findings/PARSE-11-words-in-double-quotes-are-cut-out-of-what-was-heard.md)** (not checked, finder sure, brain): Words a speaker puts in double quotes are cut out of what the crew hear, so there is blood all over the bar with blood quoted names no mess
   - Fix: Take the words from the event's details.message, or from the first quote after says to the last quote before (person, never by pairing quote marks
105. **[PARSE-12](findings/PARSE-12-a-whispered-line-is-heard-but-never-read-as-said.md)** (not checked, finder sure, brain): A line whispered to a crew member wakes it but is never read as said, so whatever it agrees to is refused as nothing said called for it
   - Fix: Treat says and whispers alike in every report filter, through one helper isSpeechLine, or have describeEvent write every heard line with says
106. **[PARSE-18](findings/PARSE-18-ok-go-check-the-bar-may-go-unanswered.md)** (not checked, finder sure, brain): An order that begins with ok, thanks or alright, ok go check the bar, is taken as a goodbye that needs no answer, so the order is carried out without a word back
   - Fix: In buildTalk never allow silence when an order was made out or work was told, and in needsNoAnswer require the line to be nothing but the closing words, give or take a name and please
107. **[PERF-01](findings/PERF-01-href-log-is-99-percent-crew-traffic.md)** (not checked, finder sure, logs): href.log and href.log.json are 99 percent crew traffic, every brain log record written there in full a second time, past the trim and the rate limit
   - Fix: Send acks for all crew as one act per update, stop sending a ROUTINE brain log record that repeats the last one for that body, and ask the owner whether tgui may skip logging the payload of a crew brain link act
108. **[PERF-07](findings/PERF-07-ui-data-does-work-in-the-world-lost-crates-written-off-there.md)** (not checked, finder sure, core): Building the window's data does work in the world - a lost crate is written off, said aloud and owed a PDA message from inside ui_data, and shuttle crates and held crates are marked there
   - Fix: Move write_off_lost_crates and the held-crate and shuttle-crate marking into the cargo body's once-a-second look, and leave held_state and freight_state reading only
109. **[QM-06](findings/QM-06-word-of-an-order-not-in-its-book-is-answered-and-dropped.md)** (not checked, finder sure, quartermaster): Word that an order has come in is answered I have that even when the order is not in the Quartermaster's book, so the crate numbers reach nobody
   - Fix: Say I have that to has-come-in word only when noteDocked found the order, so the technician falls back to sending the numbers to whoever ordered, and read the book before taking new orders after the window is reopened
110. **[QM-09](findings/QM-09-captain-who-refuses-paper-is-asked-again-every-five-minutes.md)** (not checked, finder sure, quartermaster): A Captain who says no to the Quartermaster's own crate of paper is asked about a new one every five minutes for the rest of the round
   - Fix: In orderForItself, do not order again a crate the Captain has refused, or not for a long while, and say so in the cues
111. **[QM-11](findings/QM-11-order-that-will-not-go-through-is-given-again-for-good.md)** (not checked, finder sure, quartermaster): An order a technician says did not go through is given out again every two minutes with no limit, and whoever ordered is never told
   - Fix: Count the failures on the order, tell whoever ordered after the second, and after the third hold it and tell the Captain, instead of giving it out again
112. **[SEC-11](findings/SEC-11-pardon-with-cuffs-left-on-is-reported-freed-and-never-retried.md)** (not checked, finder sure, security): A pardon whose cuffs would not come off is reported to the Captain as freed and never tried again, leaving the person in security's cuffs
   - Fix: In beatAfterActing for free, treat ok with cuffs_left as not done, keep the toFree entry for another try, and say so in the outcome after the last try
113. **[SEC-12](findings/SEC-12-prisoner-who-steps-out-of-the-cell-in-sight-is-reported-lost.md)** (not checked, finder sure, security): A prisoner who steps out of the cell behind the officer, in plain sight and in its cuffs, is reported to the Head of Security as lost
   - Fix: In beatAfterActing for jail, push the lost outcome only when got_away comes without a handle, and set lastSeen from details.place
114. **[SEC-16](findings/SEC-16-free-name-from-the-window-goes-into-the-log-uncapped.md)** (not checked, finder sure, security): The name sent with free is written into game.log and back to the brain as it came, with no length cap and no line breaks taken out
   - Fix: In tool_free, cut person_name down the way tool_order cuts for_name (the not_a_name regex and MAX_NAME_LEN) before it is matched, stored or logged
115. **[SECT-14](findings/SECT-14-a-stranger-whose-name-is-inside-anothers-is-counted-as-asked.md)** (not checked, finder sure, security): A second stranger whose first name is inside the words said to the first, Ian beside Brian, is counted as asked and is put out without a question
   - Fix: In guardAfterSaying match the first name as a whole word, and better still note which stranger the step was for instead of searching the line
116. **[SECT-18](findings/SECT-18-warden-and-detective-are-not-counted-as-security.md)** (not checked, finder sure, security): A Warden or Detective is not counted as security, so a warrant on one is taken and one who brings a warrant is told to take it to their head
   - Fix: Make isSecurity true for every job of the Security department in hierarchy.ts, Warden and Detective included, and keep isOfficer for who makes arrests
117. **[SECT-19](findings/SECT-19-nobody-or-lost-anywhere-in-an-answer-is-owning-up.md)** (not checked, finder sure, security): An answer with nobody, no one or lost anywhere in it, such as Nobody was at the counter so Donna let me in, is taken as owning up to having no business there
   - Fix: Look for a workmate's name first and let it win, and take nobody or no one only at the start of the answer or as nobody sent me
118. **[SECT-23](findings/SECT-23-try-again-anywhere-in-the-captains-line-sends-a-hurt-officer-back-out.md)** (not checked, finder sure, security): Try again anywhere in what the Captain sends security, Don't try again until you are healed included, sends a hurt officer back to making arrests
   - Fix: Take try again only as the whole order or at its start, with no negation before it, and only while some security member is out hurt
119. **[SECT-24](findings/SECT-24-five-of-them-for-resisting-said-when-the-cap-ate-them.md)** (not checked, finder sure, security): A prisoner who fought back on a warrant of eleven minutes or more is reported as having five of their minutes for resisting, when the cap took some or all of them
   - Fix: Carry the minutes actually added for resisting in the outcome and say that number, or leave the clause out when it is nought
120. **[SECT-25](findings/SECT-25-told-to-say-warrant-for-the-clown-which-it-cannot-read.md)** (not checked, finder sure, security): Told the clown is in the bar, security answers To declare one, say Warrant for The clown, and then cannot read those very words
   - Fix: Do not offer words the reader refuses, test sightedName's result against NOT_A_NAME, and for a description ask for the name instead
121. **[SECT-26](findings/SECT-26-staff-keep-sending-sightings-of-someone-jailed-or-pardoned-until-the-next-meeting.md)** (not checked, finder sure, security): Staff go on sending security sightings of someone already jailed or pardoned for up to ten minutes, and security drops them without a word
   - Fix: Have whoever keeps the list answer a sighting of someone no longer wanted with a fixed line that staff read to strike the name from their own list
122. **[SENSE-02](findings/SENSE-02-harm-sense-names-a-janitor-with-a-mop-and-misses-a-gunman.md)** (not checked, finder sure, senses): The harm sense, once switched on, names a janitor with a mop as the one standing over a victim, misses a gunman, and misses a beating spread over seconds
   - Fix: Judge a weapon by what it is (sharp, a gun, a baton, combat mode) not by force alone, look further than one tile for a gun, and compare health against the look of a few seconds ago, not one second ago
123. **[SENSE-04](findings/SENSE-04-blind-or-shut-in-a-locker-keeps-seeing-an-open-door-and-water.md)** (not checked, finder sure, senses): A body that is blinded or shut in a locker forgets what it saw but keeps an open door and water to hand in view, and its people stay just seen for fifteen seconds
   - Fix: Put the clearing of sight in one helper that also resets open_door_in_view, sink_in_view, water_from and bucket_to_fill, and call it from both early returns in look_around
124. **[SIM-03](findings/SIM-03-every-voice-is-one-tile-away-and-facing-is-never-sent.md)** (not checked, finder sure, tools): In the simulator every crew voice is one tile away and nobody is ever turned away, so who a line was said to is never tested end to end
   - Fix: Give each body a spot in its room, send the real distance between two bodies and a facing flag with every speech_heard, as the server does
125. **[SIM-06](findings/SIM-06-janitor-checks-pass-in-scenarios-with-no-janitors.md)** (not checked, finder sure, tools): Two janitor checks run in every scenario and pass where there are no janitors, and a tool the stand-in does not know is never a failure
   - Fix: Run the two janitor checks only when there are janitors, and count every tool call that reaches the default case as a failed check
126. **[SIM-09](findings/SIM-09-voice-test-sends-prompts-the-game-never-sends.md)** (not checked, finder sure, tools): The model test voice.ts judges prompts the game never sends - no "speaking to you" on any line heard, everyone in view counted as having spoken, and word-for-word lines never marked
   - Fix: Build each voice case's report line with describeEvent from a real speech_heard event, pass only the speaker's handle as speakers, and pass exact from the driver's step
127. **[SIM-10](findings/SIM-10-set-off-too-soon-check-misses-walking-up-and-most-walks.md)** (not checked, finder sure, tools): The check that nobody sets off right after speaking does not count walking up to someone, working a machine, an arrest or five other walks
   - Fix: Build the stand-in's LEAVES from the driver's own rule - every tool but say, hold and those in STAYS - by exporting STAYS from driver.ts
128. **[SIM-11](findings/SIM-11-stand-in-picks-up-from-a-closet-anywhere-without-walking.md)** (not checked, finder sure, tools): The stand-in's pick_up takes an item out of any closet the body has ever looked in, from wherever it stands, in two seconds and without moving
   - Fix: Make the stand-in's pick_up from a remembered box walk the body to that box's room first, through the same door and fire-door checks as go_to, and leave the body there
129. **[SUP-14](findings/SUP-14-console-left-on-buy-privately-charges-the-technician.md)** (not checked, finder sure, supply): A supply console left on "buy privately" puts a technician's order on its own bank account, though the money was checked in cargo's budget
   - Fix: In place_order look at console.self_paid, as a player sees it on the screen, and switch it off through the console's own toggleprivate action before adding the order
130. **[SUP-16](findings/SUP-16-pda-refused-for-cuffs-or-the-one-second-wait-is-called-not-working.md)** (not checked, finder sure, supply): A PDA message refused because the body is cuffed or down, or because one went less than a second ago, is reported as the PDA not working and is sent again later on its own
   - Fix: Before send_message_signal, test body.can_perform_action(computer, ALLOW_RESTING) and the messenger's own cooldown, and answer each with its own reason without keeping the message to resend
131. **[SUP-18](findings/SUP-18-order-cancelled-at-the-console-is-taken-for-one-aboard.md)** (not checked, finder sure, supply): An order someone cancels at the supply console is taken for one loaded aboard, and the technician is told the shuttle has docked without it
   - Fix: Keep the pending order's id as well as its weak reference, and when the order is gone with no shuttle trip since it was placed, end the run as cancelled and say so
132. **[TRA-07](findings/TRA-07-technician-with-no-pda-never-tells-the-quartermaster-face-to-face.md)** (not checked, finder sure, cargo): A technician with no PDA never tells the Quartermaster face to face that an order has come in, is still waiting or is lost, though that word does not go by PDA
   - Fix: Gate the arrived, waiting and lost tasks on having a PDA only when the word would go by PDA, so that word owed to the Quartermaster face to face is owed with or without one
133. **[TRB-10](findings/TRB-10-an-outcome-said-again-for-want-of-i-have-that-is-taken-again-by-the-desk.md)** (not checked, finder sure, security): An officer's word on a warrant that it says again, because it did not hear I have that, is taken again by the Head of Security, and the Captain and the declarer are told twice
   - Fix: In deskOutcome keep the last few outcome lines heard from each officer with the time, and on the same line again only answer I have that, doing nothing else
134. **[CARGO-19](findings/CARGO-19-order-for-a-captain-with-an-honorific-is-pdad-to-a-name-no-pda-has.md)** (not checked, finder likely, cargo): An order taken at the counter for someone whose ID shows an honorific is held for and messaged to the shown name, which no PDA has, so the crate number never reaches them
   - Fix: In tool_order take order_for from the asker's ID name without the honorific (get_id_name with honorifics FALSE), the name their PDA goes by, falling back to the seen name
135. **[DOOR-08](findings/DOOR-08-named-door-takes-first-of-two-with-one-name.md)** (not checked, finder likely, doors): Of two doors of a room that go by one name, the first found is opened, not the one the person is standing at
   - Fix: Among the doors that match the name given, take the one the person stands at, or failing that the nearest to them
136. **[DOOR-16](findings/DOOR-16-any-shut-fire-door-in-sight-is-blamed-for-a-failed-walk.md)** (not checked, finder likely, doors): Any shut fire door in sight is blamed for a walk that found no way, even one nowhere on the way, and that walk is then not counted towards being shut in
   - Fix: In fire_door_report blame only a shut fire door the body can walk up to and that lies nearer the goal than the body does, and pass the walk's goal in so it can tell
137. **[JAN-06](findings/JAN-06-locked-engine-air-alarm-never-unlocks-for-the-body.md)** (not checked, finder likely, engineering): A locked engine air alarm never unlocks for an engineer, because the game checks the ID of usr and the body's click carries none
   - Fix: Make the click in click_as_body as the body with world.push_usr, as work_wires and work_timer already do
138. **[JAN-10](findings/JAN-10-stubborn-mess-list-kept-by-bare-ref-and-never-pruned.md)** (not checked, finder likely, cleaning): Messes given up on are kept by their bare ref for the whole round, so a new mess that is given a dead one's ref is passed over unseen
   - Fix: Keep stubborn_messes as REF to WEAKREF and treat an entry as live only while the weakref resolves to the same mess, and drop dead entries in remember_messes
139. **[JOBS-03](findings/JOBS-03-second-crate-collected-before-the-first-empty-goes-back-loses-the-first.md)** (not checked, finder likely, cargo): Sent for two crates, a body that hauls the second before taking the first empty back leaves the first empty crate where it was unpacked for good
   - Fix: In planPickups, while another collect task of this body is unpacked and an empty is still to go back, a crate not yet hauled waits, so take_back runs first
140. **[MEM-13](findings/MEM-13-shut-in-with-no-head-aboard-it-never-writes-to-the-captain.md)** (not checked, finder likely, memory): Shut in a room with no head of its department aboard, a crew member never sends word to the Captain
   - Fix: In nextToWrite look the head up with headName from jobs/meetings.ts, which falls back to the Captain, instead of headOf and a search of the PDA list
141. **[PARSE-13](findings/PARSE-13-a-head-npc-small-talk-to-security-declares-warrants.md)** (not checked, finder likely, security): A crew head's small talk with the Head of Security, written by the model, is read as declaring a warrant, keep up the good work and arrest those troublemakers is a warrant on those troublemakers
   - Fix: Have crew heads declare warrants only in the fixed warrantLine words, and have the desk take a spoken line from a head as a warrant only when it begins with the verb or the warrant words, not from words in the middle of a remark
142. **[PERF-09](findings/PERF-09-window-draws-every-card-twice-for-every-update.md)** (not checked, finder likely, brain): The Crew Brain window draws every crew card twice for every update from the server, once before the brains have taken it in and once after, and nothing skips a card that has not changed
   - Fix: Wrap NpcCard in React memo with a compare on the few fields it shows, and run ingest before render or skip the first draw of each update
143. **[QM-13](findings/QM-13-look-report-names-people-and-mess-outside-the-room.md)** (not checked, finder likely, senses): Sent to look at a room and report, a crew member names as in there everyone and every mess it can see, through windows and doorways into other rooms
   - Fix: In whatIsThere count only people whose place is the room looked at, and say nothing of messes unless the server says which room each is in
144. **[RT-06](findings/RT-06-two-large-brain-log-records-in-one-millisecond-still-collide.md)** (not checked, finder likely, logs): Two large brain log records sent in the same millisecond still collide, and the second is lost with a duplicate ID runtime
   - Fix: Send every brain_log record through one queue in brain.ts that lets out at most one record every few tens of milliseconds, instead of a fixed 300 ms delay per record
145. **[SEC-10](findings/SEC-10-paw-signal-edit-reaches-listeners-beyond-the-officer.md)** (not checked, finder likely, security): The attack_paw edit is heard once, as meant, but it also wakes base-game listeners that never heard a monkey before, and a tackle is told as a shove
   - Fix: Keep the edit, but send it only after the combat-mode and pacifism checks a bite or tackle passes, and tell a monkey's right-click as a tackle, not a shove; the owner to say whether monkeys fighting monkeys back is wanted
146. **[SEC-13](findings/SEC-13-kit-locker-shut-on-whoever-stands-in-it.md)** (not checked, finder likely, security): After taking its kit the officer shuts the security locker on anyone standing in it, and leaves it unlocked
   - Fix: Before the closing click in kit_from_locker, leave the locker open if any mob stands on its tile, and lock it again after closing with the click a player uses
147. **[SUP-10](findings/SUP-10-tidying-shuts-the-quartermasters-opened-crate.md)** (not checked, finder likely, quartermaster): The crate the Quartermaster opens for itself is shut again by a tidying technician, with the paper bin back inside where the Quartermaster cannot find it
   - Fix: Have the Quartermaster take what it ordered the crate for out of it before it leaves, and let nearest_paper_bin count a bin in a crate the body may open

### Medium fix (one part of the code): 6

148. **[SIM-01](findings/SIM-01-stand-in-pda-always-sends-to-anyone.md)** (confirmed, tools): The simulator's PDA always sends, to any name at all, so no scenario can reach a message that fails
   - Fix: List every player in the stand-in's pda_people, make the stand-in message case look the name up in that same list and fail with the server's words when it is not there, and add a PDA-down switch that answers with the would-not-send words and keeps the message to resend
149. **[SIM-08](findings/SIM-08-stand-in-mop-never-dries-and-is-wetted-anywhere.md)** (confirmed, tools): In the simulator a mop never dries, spray never runs out, a dry mop is wetted with no water in sight, and the bucket fields are never sent
   - Fix: Give the stand-in's mop and spray a store of water and cleaner that each clean uses up (15 and about 50 messes when full), stop a dry mop being wetted from nothing when a rag is held, add a bucket, send water_from, bucket_to_fill, wants_bucket, beyond_kinds and at_door_label, and add a scenario that starts the janitor short
150. **[TRA-05](findings/TRA-05-word-of-an-old-crate-wipes-the-heads-newer-order.md)** (confirmed, supply): Word that an older crate has come or is still waiting wipes out the head's newer order in hand, so the Captain's no to the newer one is never read, and once HEAD-08 is fixed those it was for are never ordered for again
   - Fix: Together with HEAD-08, keep the Quartermaster's order number on the head's order from its Noted line, put the order number in every word about crates, and clear the order in hand only when the word is about that order
151. **[CHK-05](findings/CHK-05-the-engineering-every-room-gets-the-article.md)** (not checked, finder sure, head): The Chief Engineer calls its meeting "in the Engineering" - every room name is given "the", fitting or not
   - Fix: Put the article on through one helper that knows which room names take one, and let the code that reads these lines back accept the name with or without it
152. **[MAP-09](findings/MAP-09-window-table-of-departments-disagrees-with-the-games-own.md)** (not checked, finder sure, brain): The window's own table of who answers to whom is matched by words inside titles and disagrees with the game's, so a Bridge Assistant and every Assistant are the Head of Personnel's staff and a Chef is nobody's
   - Fix: Have the server send each person's department and head job (from the job datum's departments_list) with the PDA list and the people in view, and drop the hand-written DEPARTMENTS table except as a fallback
153. **[TRUST-09](findings/TRUST-09-who-said-a-line-is-read-back-out-of-the-report-text.md)** (not checked, finder sure, brain): Code reads who said a line back out of the report text, which holds the speaker's own words, so a speaker can make a line look like someone else's
   - Fix: Keep the sense event behind each report line and read the speaker, the handle and the words from its details, never by matching the line's text

---

# Gaps: missing or half built, for you to decide

Not faults in what is there, but things planned and not built, or never thought of. Most need your decision before anyone builds them. Same order: most important first, then the smallest piece of work.

## Gaps: critical (1)

### Large fix (a design change, or both halves): 1

154. **[HOLE-02](findings/HOLE-02-closing-the-window-wipes-every-brain-for-good.md)** (confirmed, design): Closing the brain window, or the owner dropping off, wipes every crew member's memory for good and nothing says so
   - Fix: Keep a copy of each brain's lasting memory on the server and hand it back when the window opens, log and announce when the window shuts, and open it again by itself when the owner is back

## Gaps: high (13)

### Small fix (a few lines, one file): 2

155. **[CORE-04](findings/CORE-04-one-runtime-in-ui-data-stops-the-window-for-every-body.md)** (not checked, finder sure, core): One runtime error in ui_data, from any of its forty calls for any one body, stops every update to the window, so every crew member stalls while it lasts
   - Fix: Build each body's record in its own proc inside try and catch, and on an error log it once and send a short record for that body with an error field, so the others still get their update
156. **[MAP-01](findings/MAP-01-first-round-to-reach-the-shuttle-sends-the-next-to-kilostation.md)** (not checked, finder sure, design): The first test round that sees the emergency shuttle leave makes the next round KiloStation, where the crew has never been run
   - Fix: Pin the test server to MetaStation in config/maps.txt (the only votable map, with no minplayers) until the crew is checked on other maps, and say so in the change log, since the MAPROTATION flag is read by nothing

### Medium fix (one part of the code): 7

157. **[DRV-06](findings/DRV-06-one-thrown-error-stops-every-brain.md)** (confirmed, driver): One thrown error anywhere in the window code, for any one NPC, stops every brain for good and then costs all their memory
   - Fix: Catch errors per NPC in ingest and round the whole of think, chooseJob and readOrder, log them through brain_log, always free the LLM turn in a finally, and escape names built into RegExps
158. **[GAP-02](findings/GAP-02-crate-unpacked-by-forcemove-without-opening-it.md)** (confirmed, supply): A collected crate is unpacked by moving its contents in code, without opening it (no-cheats plan 4.6, approved, not built)
   - Fix: Open the crate by the click a player uses, leave everything on its tile, pull the open crate one tile clear, shut it, and take it back
159. **[GAP-04](findings/GAP-04-janitors-still-spawn-in-galoshes-and-nobody-walks-on-wet-floor.md)** (confirmed, janitor): Janitors are still given galoshes at spawn, and the plan's way to remove them clashes with the owner's ruling that a mopped floor is not seen (no-cheats plan 4.5 and 4.1)
   - Fix: Ask the owner whether a janitor may know the tiles it has just mopped, build that in knows_slippery, see it in a round, then delete the shoe swap in create_crew_npc
160. **[GAP-07](findings/GAP-07-no-cheats-read-through-and-check-script-never-done.md)** (confirmed, tools): The read-through for cheats and the check script that fails on new ones were approved and never done (no-cheats plan 4.9), a list of what is left
   - Fix: Add tools/llm_crew/cheats.ts that greps the crew code for a short list of calls against an allowed list, and put the list below to the owner
161. **[HOLE-11](findings/HOLE-11-body-never-presses-resist-unless-crew-security-arrested-it.md)** (not checked, finder sure, core): A crew member strapped to a chair, shut in a locker, set alight or cuffed by a player never tries to get free
   - Fix: Add one reflex to the body, run from look_around, that presses Resist the way a player would when it is buckled by someone else, shut in a container, on fire, or in cuffs with nobody holding it, and tells the brain what happened
162. **[MAP-03](findings/MAP-03-no-cargo-lobby-on-kilo-and-catwalk-stops-all-supply.md)** (not checked, finder sure, cargo): KiloStation and CatwalkStation have no Cargo Lobby, so no crate can be put out, asked for at the counter, collected or brought back
   - Fix: Have the server work out the counter room from the post (the room on the far side of the service window or desk nearest the post spot), send its name to the brain as the counter, and use that name everywhere the window says Cargo Lobby
163. **[QM-07](findings/QM-07-given-order-has-no-deadline.md)** (not checked, finder sure, quartermaster): An order a technician has said it has is waited on with no time limit, so any word that does not come back leaves that technician busy and the money spoken for until the round ends
   - Fix: Give a taken order a deadline past the server's six-minute shuttle limit, after which the Quartermaster asks the technician face to face whether it has come in, and failing an answer puts it back to be given again and tells whoever ordered

### Large fix (a design change, or both halves): 4

164. **[GAP-01](findings/GAP-01-supply-shuttle-still-moved-by-timer-and-by-code.md)** (confirmed, cargo): The supply shuttle is still sent and called home by code, from wherever the technician is (no-cheats plan 4.7, approved, not built)
   - Fix: Press send through work_window at the console as the owner allowed for machine windows, drop the timer that moves the shuttle, and make an order two presses at the console
165. **[GAP-05](findings/GAP-05-fire-doors-nobody-asks-engineering-and-server-says-if-alarm-is-real.md)** (confirmed, doors): Fire doors, the owner's chain to engineering is not built, and the server still tells every body whether an alarm is real
   - Fix: Drop crew_npc_alarm_was_pulled, reset once and leave the room if the doors shut again, and build the ask up the chain to an engineer who pries the door
166. **[HOLE-06](findings/HOLE-06-when-pdas-stop-nobody-walks-over-to-say-it.md)** (not checked, finder sure, design): When PDA messages stop going out the crew are never told, word owed by PDA is dropped after eight minutes, and nobody walks over to say it
   - Fix: Tell the window when the body's PDA has not been sending, treat that as having no PDA, keep word that did not go, and add one general step that carries word to someone in person
167. **[HOLE-08](findings/HOLE-08-the-dead-and-the-silent-are-counted-on-for-ever.md)** (not checked, finder sure, design): Whoever a PDA lists first with the job is "the officer" or "the head" for ever, whether they are dead, a player who does not answer, or a PDA in a locker
   - Fix: Keep, for each person a crew member relies on, a count of words sent and not answered and whether they were last seen down, pass over anyone who fails it when picking who holds a job, and tell its own head or the Captain once when someone has stopped answering

## Gaps: medium (62)

### Small fix (a few lines, one file): 9

168. **[ENG-10](findings/ENG-10-cooling-is-not-looked-at-again-before-the-emitters-go-on.md)** (not checked, finder sure, engineering): The engineer never looks again at the cooling it set before it switches the emitters on, though the server tells it how every machine in view stands
   - Fix: Before each emitter step, take back out of engine.done any step whose machine is in view and seen not to be as it was set, so that it is done again before the emitters
169. **[HOLE-04](findings/HOLE-04-no-admin-at-round-start-means-no-crew-all-round.md)** (not checked, finder sure, design): With no admin connected ten seconds into the round there is no crew all round, and nothing is logged
   - Fix: Log why no crew was spawned, try again when an admin who may spawn connects, and name the owner in config instead of taking the first admin on the list
170. **[HOLE-12](findings/HOLE-12-what-the-body-answered-to-each-step-is-logged-nowhere.md)** (not checked, finder sure, logs): The logs say what each crew member was told to do and almost never how it went, so a round cannot be read back
   - Fix: Write every action result to the round's crew brain log from the server, with the tool, whether it went, and the words, and log tool calls the rate limit drops
171. **[KNA-08](findings/KNA-08-hurt-officer-with-a-baton-does-not-defend-itself.md)** (not checked, finder sure, security): A hurt officer with a working baton walks away from someone who follows and keeps hitting it
   - Fix: Let a hurt officer that is struck again while getting away stop its attacker with the baton, in self-defence only, if the owner agrees
172. **[KNA-21](findings/KNA-21-captains-pardon-to-the-officers-face-is-sent-on-not-done.md)** (not checked, finder sure, security): The Captain pardoning someone to the officer's face, with the prisoner in sight, is told to take it to the Head of Security, and nothing is done
   - Fix: Let an officer act on a pardon from the Captain itself, and pass it to the Head of Security as news, if the owner agrees that the Captain outranks the list
173. **[KNA-25](findings/KNA-25-staff-hear-of-a-warrant-only-at-the-next-meeting-read-out-before-the-wanted.md)** (not checked, finder sure, security): Staff hear of a warrant only at their head's next meeting, up to ten minutes late, and the list is read out with the wanted person standing in the room
   - Fix: Have a head pass a new name on the list to its staff by PDA at once, and leave out of the meeting line anyone on the list who is in the room, if the owner agrees
174. **[PARSE-10](findings/PARSE-10-captain-cannot-order-the-emitters-off.md)** (not checked, finder sure, engineering): The Captain cannot have the engine shut down - turn the emitters off, shut down the engine and kill the engine are read by nobody, to the Chief Engineer or the engineer
   - Fix: Read a shut-down order from anyone the Chief Engineer answers to, as LIGHT_AGAIN_WORDS is read, and have it give the engineer the same Emitters off order as a falling crystal does
175. **[SECT-20](findings/SECT-20-someone-walked-out-who-comes-straight-back-is-asked-afresh-for-ever.md)** (not checked, finder sure, security): Someone walked out of a post who comes straight back in is a stranger again, is asked why from the start, and is never reported however often they return
   - Fix: Keep a short record of who was put out of the post and when, walk a returner out without asking again, and tell the head the second time they come back
176. **[HOLE-16](findings/HOLE-16-crew-locked-in-a-cell-by-a-player-do-not-know-they-are-prisoners.md)** (not checked, finder likely, security): A crew member locked in a brig cell by the Captain or any player does not know it is a prisoner, goes on with its work from the cell and asks to be let out
   - Fix: In look_around, when the body stands in a brig cell whose timer is running and it is in no custody, put it in custody of that cell the way put_in_custody does, with nobody named, so the existing cell phase holds it and lets it go when the timer stops

### Medium fix (one part of the code): 39

177. **[CARGO-20](findings/CARGO-20-a-player-quartermaster-cannot-get-a-technician-to-order-anything.md)** (not checked, finder sure, cargo): A player who is Quartermaster cannot get a technician to order anything except in the NPC Quartermaster's exact words, and is told nothing it can answer in its own
   - Fix: When the Quartermaster aboard is not one of this window's NPCs, offer the model the order option for the Quartermaster's own asking, and take any plain acknowledgement from it as heard
178. **[CHK-02](findings/CHK-02-no-crew-test-runs-by-itself.md)** (not checked, finder sure, tools): None of the crew tests runs by itself - not in the build, not in CI, and the tools folder is never type checked or linted
   - Fix: Add one runner script that runs the tables, the dry model tests and the simulator scenarios and exits non-zero on any failure, and hang the quick part of it on the tgui test target
179. **[DESK-06](findings/DESK-06-called-to-a-locked-room-by-anyone-not-in-cargo-the-janitor-never-asks-in.md)** (not checked, finder sure, janitor): Called to a mess in a room locked to it by anyone but cargo, a janitor walks at the door every few minutes, never knocks or asks, and never tells the caller
   - Fix: Give any told mess task the let-in steps once a walk to its room fails for want of a way in, whoever called, and let anyone coming into view restart the asking, not only cargo
180. **[GAP-08](findings/GAP-08-order-asked-while-door-or-pickup-is-in-hand-is-still-lost.md)** (not checked, finder sure, cargo): An order asked of a technician while someone wants a door or a crate is still lost (no-cheats plan 4.2, approved, not built)
   - Fix: Keep the ask in code when hears() is turned away by a door or a pick-up, tell the LLM the truth meanwhile, and place it from the kept words once the door is done
181. **[GAP-09](findings/GAP-09-janitor-call-and-let-out-words-do-not-say-what-is-true.md)** (not checked, finder sure, janitor): A technician still does not know its workmate called a janitor, and a janitor leaving for water still says "I am done" (no-cheats plan 4.3, approved, not built)
   - Fix: Send who called whom in place of the yes or no, word the waiting step with it, and give the let-out message its true reason (done, dry mop, cannot shift it)
182. **[GAP-13](findings/GAP-13-nobody-notices-anyone-hurt-down-or-dead-the-harm-senses-are-off.md)** (not checked, finder sure, senses): Nobody notices a person hurt, down or dead, the harm senses were written and never switched on
   - Fix: Call watch_for_harm from look_around for people in view, and build the one use the plans name, any crew member who sees someone lying still tells its head or the Captain once
183. **[GAP-14](findings/GAP-14-janitors-do-not-put-trespassers-out-of-their-own-rooms.md)** (not checked, finder sure, janitor): Janitors do not question or put out a trespasser in the Custodial Closet, the owner asked for it on 2026-11-18 and keeping a room is tied to having a post
   - Fix: Give every body a list of rooms it keeps (its department's locked rooms), key the guarding code on that list instead of the post, and add guarding to the janitor job
184. **[GAP-15](findings/GAP-15-loose-wording-is-forgiven-only-for-warrants-sent-by-pda.md)** (not checked, finder sure, brain): Loose wording and bad spelling are understood only for warrants and pardons sent to security by PDA, every other typed order still needs the exact words
   - Fix: Lift the forgiving speller and the small LLM reader out of security into shared code, and give each job's order reader a list of the orders it takes so the same last-resort question serves all of them
185. **[GAP-17](findings/GAP-17-nobody-leaves-a-room-for-bad-air-and-other-secure-area-leftovers.md)** (not checked, finder sure, core): No body leaves a room because its air has turned bad or its alarm is ringing, and four more leftovers of the locked-areas plan
   - Fix: Have the server say when the air on the body's own tile is not fit to stand in, and have the driver treat that as the one emergency that comes before any job, walking to the nearest room it knows with good air
186. **[GAP-24](findings/GAP-24-a-pda-message-no-reader-knows-gets-no-answer-at-all.md)** (not checked, finder sure, brain): A PDA message never wakes the voice, so anything sent by PDA that no job's reader knows gets no answer and no action, the Captain's orders to heads included
   - Fix: Have readsMessage say whether it used the message, and for one from a person that no reader used send a fixed acknowledgement by PDA, with the voice wording it when the model is up and GAP-15's reader trying it as an order
187. **[HOLE-03](findings/HOLE-03-crew-are-not-on-the-stations-books.md)** (not checked, finder sure, design): The crew are made outside the job system, so they hold no job slot, are not on the manifest and have no records or bank account
   - Fix: Give each body a mind and its job through SSjob when it is spawned, take the job's slot, and put it on the manifest, and skip any job a player already holds
188. **[HOLE-10](findings/HOLE-10-crew-of-two-owners-do-not-know-each-other-for-crew.md)** (not checked, finder sure, design): Crew owned by two players do not know each other for crew, and nobody can take over a crew whose owner has left
   - Fix: Have the server say of each person seen and heard whether they are a crew NPC, use that in place of "is in my window", and add an admin verb that hands a crew to another owner
189. **[HOLE-13](findings/HOLE-13-a-player-doing-a-crew-job-stalls-whoever-hands-them-work.md)** (not checked, finder sure, design): A player holding a crew job is handed work like an NPC, and work waits for ever on set words a player will never say
   - Fix: Take any answer from the person a job was given to as their word that they have it, give a job that goes unanswered to someone else after a set number of tries, and call to a staff meeting only those who have answered a call before
190. **[HOLE-15](findings/HOLE-15-crew-never-see-an-emote-a-point-or-anything-done-in-front-of-them.md)** (not checked, finder sure, senses): The crew never see an emote, a point, or any of the game's "X does Y" lines, so a player who points at a mess, waves someone over or nods yes is not seen at all
   - Fix: When a person comes into view register for COMSIG_MOB_EMOTE and COMSIG_MOVABLE_POINTED on them, and emit a seen sense event with what they did and at what, for the window to keep as context and for the readers to use
191. **[HOLE-17](findings/HOLE-17-a-crew-member-arrested-by-a-player-walks-off-to-its-work.md)** (not checked, finder sure, security): A crew member arrested by a player, the Captain or a human officer, is not held, walks off to its work, and is only told so in its prompt
   - Fix: Give the body one general way to be arrested by anyone it answers to, read from what it hears and feels, which holds it still the way being_arrested does and lets it go on the same rules, and read the arrest words loosely
192. **[HOLE-19](findings/HOLE-19-requests-made-at-the-game-request-consoles-are-never-seen.md)** (not checked, finder sure, cargo): Supplies asked for the game's own way, at a supply request console, are never seen by cargo, so a player who orders as players do waits for good
   - Fix: Have a technician standing at its supply console read the console's request list the way its screen shows it, and pass each new request to the Quartermaster as an order taken from its orderer, approving it at the console once the Quartermaster says yes
193. **[HOLE-20](findings/HOLE-20-messages-to-a-department-requests-console-are-never-read.md)** (not checked, finder sure, senses): A message sent to Janitorial, Security or Engineering at a wall requests console is never read, the console says aloud only who it is from, and the crew take that for machine chatter
   - Fix: When a crew body hears its own department's requests console announce a message, have it go to the console, read the newest message the way its screen shows it, and hand the text to the same readers a PDA message goes to
194. **[HOLE-21](findings/HOLE-21-a-player-put-into-a-crew-body-keeps-the-crew-controller.md)** (not checked, finder sure, core): A player put into a crew body keeps the crew controller, so they walk through people, the other crew treat them as one of their own, and the brain takes the body back when they leave
   - Fix: Have the crew controller notice COMSIG_MOB_LOGIN on its body, take PASSMOB off, tell the window the body is now a player's and drop it from the window's crew, and on logout not take the body back unless the owner says so
195. **[HOLE-24](findings/HOLE-24-a-note-handed-to-a-crew-member-is-put-down-unread.md)** (not checked, finder sure, senses): A paper note, form or order handed to a crew member is put down unread as something that is not its own, so writing is no way to reach the crew, not even when speech and PDAs fail
   - Fix: When a sheet of paper with writing on it comes into a crew hand from someone, read it the way the Quartermaster reads its own book and pass the text to the same readers a PDA message from that person goes to, then put it down or keep it as the job says
196. **[KNA-07](findings/KNA-07-officer-with-no-fresh-word-walks-only-primary-hallways.md)** (not checked, finder sure, security): With no fresh word of a suspect the officer walks only rooms named Primary Hallway, and never looks beside where they were last seen
   - Fix: Look first in the rooms that open onto the room of the last sighting, then walk every hallway the station has, by kind of room and not by name
197. **[KNA-11](findings/KNA-11-engineer-does-not-force-the-room-in-between.md)** (not checked, finder sure, engineering): An engineer sent to a door behind another locked room says so and stops, when it could force the outer door first
   - Fix: When the server says the way is through another locked room, force that room's door first and then go on to the door that was asked for
198. **[KNA-18](findings/KNA-18-shuttle-barred-technician-knows-why-and-does-nothing.md)** (not checked, finder sure, supply): When the supply shuttle will not leave, the technician is told what is barring it and has no step to clear it, and the Captain is not told
   - Fix: Give the technician a step for each thing what_bars_shuttle can name - carry a loose thing off the deck, ask a person to step off - and have the Quartermaster tell the Captain when an order has been held up
199. **[KNB-11](findings/KNB-11-no-engineer-no-engine-and-no-reading-no-watch.md)** (not checked, finder sure, engineering): With no engineer free to do it nobody lights the engine, and with no PDA reading the Chief Engineer never orders the emitters off
   - Fix: Let the Chief Engineer take the engineer's lighting list itself when no engineer has taken the order, and go and look at the crystal when the monitor has told it nothing for some minutes
200. **[KNB-12](findings/KNB-12-locked-room-rules-are-given-out-job-by-job.md)** (not checked, finder sure, design): Having rooms of your own is handed out job by job, so janitors put nobody out of the Custodial Closet and cannot open their own door for anyone
   - Fix: Work out a body's own rooms from its ID and its job's department for every job, and let anyone with rooms of their own guard them and open their doors
201. **[MAP-08](findings/MAP-08-tramstation-crew-know-nothing-of-the-tram-or-its-crossings.md)** (not checked, finder sure, design): On Tramstation the crew know nothing of the tram, so they cross the tracks without looking at the crossing signal and cannot ride it between the station's parts
   - Fix: Treat a tram track tile as a place to step onto only when the nearest crossing signal is green, as a player would, and leave riding the tram to the lift work in HOLE-05
202. **[PARSE-02](findings/PARSE-02-a-room-is-only-known-by-its-whole-exact-name.md)** (not checked, finder sure, brain): A room is found in what was said only by its whole exact name, so medbay, the captains office, the hop office, the dorms and hydro name no room
   - Fix: Give placeNamedIn a forgiving match - apostrophes optional, a room's distinctive word alone when only one room has it, and a short table of the usual station shorthands (hop, ce, qm, hydro, dorms, medbay)
203. **[PARSE-05](findings/PARSE-05-common-ways-to-order-an-arrest-are-not-read.md)** (not checked, finder sure, security): Cuff Bob, brig Bob, Bob needs arresting, I want Bob arrested, bring Dana in and arrest the monkey are none of them read as a warrant
   - Fix: Add the missing verbs and the passive and wish forms to readWarrant, read bring X in with the name between, and let the X be a job or the monkey when exactly one known person fits
204. **[SEC-14](findings/SEC-14-prisoner-held-while-the-officer-waits-works-the-cuffs-off-unseen.md)** (not checked, finder sure, security): A player held by the arm while the officer stands waiting works the cuffs off in a minute and walks away, and the officer never sees it start
   - Fix: While the body holds someone it arrested, listen on them for COMSIG_MOB_REMOVING_CUFFS, tell the brain what any onlooker sees, and have the officer break the attempt by a step or a tighter grip
205. **[SENSE-03](findings/SENSE-03-crew-see-no-one-who-is-not-human.md)** (not checked, finder sure, senses): Crew see nobody who is not human, a cyborg talking to them, a space carp biting them or a xenomorph in their room is not in view at all
   - Fix: Report every living mob in view in look_around, humans as now and the rest as creatures with kind, name and whether hostile, and let handle_for take any mob/living
206. **[SENSE-09](findings/SENSE-09-fire-smoke-and-anomalies-are-not-seen.md)** (not checked, finder sure, senses): Fire, smoke and anomalies are never seen, so a body walks into flames and goes on mopping beside a burning room without a word
   - Fix: In look_around report hotspots, smoke and anomalies in sight as a hazard list, and keep the walk and the idle step off burning tiles
207. **[SIM-07](findings/SIM-07-stand-in-model-never-hangs-cuts-off-or-talks-nonsense.md)** (not checked, finder sure, tools): The stand-in model answers every call in two and a half seconds with whole, well-formed JSON, so a slow, hung, cut-off or wayward model is never simulated
   - Fix: Add stand-in model modes slow, hung, cutoff, junk and wayward, honour the abort signal, and run the long scenarios in each
208. **[DOOR-05](findings/DOOR-05-free-exit-doors-not-known-to-the-crew.md)** (not checked, finder likely, doors): A door that lets anyone out from one side is taken as locked, so a body asks to be let out of somewhere it could walk out of
   - Fix: Teach the route planner that an airlock opens from its free-exit side, or failing that have a shut-in body look for such a door of its room and walk into it
209. **[HAND-10](findings/HAND-10-crate-jammed-in-a-doorway-is-cleared-for-a-walk-but-never-for-an-errand.md)** (not checked, finder likely, hands): A crate jammed in a doorway is moved when it shuts a walk, but never when it shuts an errand, so a held crate behind it is written off as one nobody can get to
   - Fix: When an errand's walk finds no way, try clear_the_way as walk_finished does before giving the errand up, with the errand kept in after_clearing to be taken up again
210. **[HOLE-22](findings/HOLE-22-nothing-holds-what-the-model-says-to-the-servers-rules.md)** (not checked, finder likely, brain): Nothing holds what the model says aloud or by PDA to the server's rules beyond the hard word filter, so any player can talk a crew member into saying what a player would be banned for, and no admin is told
   - Fix: Check the soft filter too and tell admins when the model trips either, refuse lines that speak of the model, the game or other players out of character, and give admins a verb to silence one crew member's voice
211. **[HOLE-23](findings/HOLE-23-a-bar-sign-renames-the-meeting-room-and-the-crew-lose-it.md)** (not checked, finder likely, core): Rooms are known by a name taken once at round start, so when a player sets the bar sign the Bar Lounge is renamed, the Head of Personnel's meetings there never gather, and the new name is no room at all
   - Fix: Key every room by its area (a stable id sent with the name) instead of by its display name, and when rename_area runs tell every crew controller and the window the room's new name
212. **[HOLE-26](findings/HOLE-26-the-window-sends-more-than-the-topic-limit-allows-a-non-admin.md)** (not checked, finder likely, brain): The brain window sends the server two to three hundred calls a minute, over the game's topic limit, which only admins are spared, so an owner who deadmins, or any owner who is not an admin, has crew steps dropped and their own clicks refused
   - Fix: Batch the window's traffic into one call per update (acks, tool calls and log records together), keep it under the game's limits by a margin, and decide with the owner whether a crew owner is exempt from the topic limit by a check in client Topic
213. **[PERF-05](findings/PERF-05-one-model-is-a-quarter-busy-at-eleven-and-full-before-forty.md)** (not checked, finder likely, brain): The one model was a quarter busy with eleven crew and will be full before forty, and then every job choice costs its body eight seconds for nothing and every fixed line waits its turn for an optional remark
   - Fix: Under load, say a fixed line at once without its remark, skip the job choice when the talk queue is not empty, give a player's line the front of the queue, and log each call's wait in the queue
214. **[SECT-17](findings/SECT-17-no-hand-over-of-the-list-between-an-officer-and-a-head-of-security.md)** (not checked, finder likely, security): When a Head of Security comes aboard after an officer has kept the list, or leaves after it, the list is not handed over, and the old warrants drop out of sight
   - Fix: Have whoever stops keeping the list send it to whoever takes it up, in the fixed words of the notice, and have the new keeper read that notice into its desk
215. **[TRUST-10](findings/TRUST-10-crew-do-not-notice-their-id-taken-off-them.md)** (not checked, finder likely, senses): A crew member stands still while its ID card or PDA is taken off it, tells nobody, and then no longer knows its own job, while the thief is that head to every other crew member
   - Fix: Have every body notice when its card, PDA or bag leaves it for someone else's hands, tell the brain who took it, and keep the job it was given at spawn as its own whatever card it holds

### Large fix (a design change, or both halves): 14

216. **[GAP-06](findings/GAP-06-workmates-share-lists-in-code-that-no-body-could-sense.md)** (not checked, finder sure, design): Workmates share lists in code that no body saw, heard or was sent (the brief's decision 4 has quietly stopped being true)
   - Fix: Ask the owner whether a department's shared list is allowed, then either write the exception into the brief or carry each list by speech, PDA or something the body can read
217. **[GAP-10](findings/GAP-10-water-by-cart-the-cart-crate-and-a-bucket-asked-for-not-built.md)** (not checked, finder sure, janitor): Carrying water, the cart is never pulled or filled, cargo cannot order one, and a janitor short of a bucket tells nobody (no-cheats plan 4.4 and 4.1, half built)
   - Fix: Add the cart crate to orderable_crates, tell the head of a missing bucket as a need that does not stop work, then build pulling and filling a cart on the crate-hauling code
218. **[GAP-11](findings/GAP-11-light-replacer-plan-not-built-at-all.md)** (not checked, finder sure, janitor): The light replacer (LLM_CREW_PLAN_LIGHTS.md), all six decisions accepted, none of it built
   - Fix: Build the plan's seven steps in its own order, starting with the server seeing dead fixtures by room
219. **[GAP-16](findings/GAP-16-security-plan-leftovers-in-one-list.md)** (not checked, finder sure, security): Security, what the two plans decided or proposed and is still not built, in one list
   - Fix: Take the small ones (cuffs collected, a freed prisoner seen out, the sighting answered, a follow order) in one sitting and put the rest to the owner as a list
220. **[GAP-19](findings/GAP-19-engineering-answers-no-calls-and-no-fault-is-handed-on-between-jobs.md)** (not checked, finder sure, engineering): Engineering lights the engine and nothing else, no power call is taken and no fault is handed on between jobs (engineering plan stages 2 and 3, and the owner's lights-out example)
   - Fix: Build stage 2 as a shared reporting duty plus a list of calls on the Chief Engineer, starting with the one call the game makes easy, a room's breaker that is off
221. **[GAP-22](findings/GAP-22-tests-the-plans-promised-and-never-wrote-or-ran.md)** (not checked, finder sure, tools): Tests the plans promised and never wrote or ran, no server code is ever exercised, the model has never been asked the new questions, and two scenarios fail by chance
   - Fix: Write the scenarios the plans list as the fixes for them are built, run the model cases once with the card free, pin the simulator's randomness so a failing run can be replayed, and add a checklist round for server code
222. **[HOLE-07](findings/HOLE-07-crew-hear-no-station-announcement-and-never-evacuate.md)** (not checked, finder sure, design): The crew hear no station announcement, so nobody goes to the emergency shuttle or takes note of an alert level
   - Fix: Give every conscious body on the station a sense event for each station announcement, and build one shared duty on top of it, going to the shuttle when it is called
223. **[SEC-08](findings/SEC-08-brig-with-no-power-holds-prisoners-for-good.md)** (not checked, finder sure, security): When the brig loses power a prisoner is never let out, a pardon is dropped without a word, and a new prisoner is held by the arm for ever
   - Fix: Tell the brain a cell is dead (reason no_power), have security say so to its head and the Captain, and give it a player's way to open a dead cell door
224. **[SIM-04](findings/SIM-04-failure-paths-the-stand-in-server-can-never-give.md)** (not checked, finder sure, tools): The stand-in server never gives most of the failures the real tools give, so the window code that handles them has never run
   - Fix: Give the stand-in a per-tool table of the real failures and a FAULTS switch that makes a named one happen, then add one scenario per job that runs with faults on
225. **[GAP-18](findings/GAP-18-cargo-and-quartermaster-plan-leftovers-in-one-list.md)** (not checked, finder likely, supply): Cargo and the Quartermaster, what five plans left unbuilt, in one list (an uncollected order is never sent back, the stuck shuttle is told to nobody, and more)
   - Fix: Build the uncollected order going back and the Quartermaster telling the Captain of a stuck shuttle first, both small, and put the rest to the owner as a list
226. **[HOLE-05](findings/HOLE-05-nothing-works-on-a-station-with-more-than-one-floor.md)** (not checked, finder likely, design): On a station with more than one floor the crew cannot leave the floor they are spawned on, and jobs whose rooms are on another floor get no post
   - Fix: Turn on the route planner's multi-floor routes for crew, look for rooms on every station level, and send a body to the nearest floor of a room that it can reach
227. **[HOLE-09](findings/HOLE-09-what-breaks-first-with-a-whole-station-of-crew.md)** (not checked, finder likely, design): A whole station of crew will not fit through one window as built, since every event from any body resends every body's whole state, and the brain log drops records without saying so
   - Fix: Send each body's slow-changing state on a timer and only its new events at once, count the brain log limit per body and log what is dropped, and measure the payload before adding more crew
228. **[HOLE-14](findings/HOLE-14-a-crew-member-given-a-new-job-is-half-old-job-half-new.md)** (not checked, finder likely, design): A crew member whose ID is given a new job, promoted to replace a dead head or demoted, is run by the new job in the window and the old one on the server
   - Fix: Have the server notice when the job on the body's own worn ID changes, learn that job's places again and send a knowledge event, and have the window start the new job's state fresh and drop the old job's tasks
229. **[SIM-05](findings/SIM-05-what-no-scenario-covers-by-job.md)** (not checked, finder likely, tools): What no scenario or table covers, by job, and no run is longer than 23 minutes
   - Fix: Add the scenarios listed here, most important first, each with checks that can fail, and one long scenario of an hour with power lost part way

## Gaps: low (17)

### Small fix (a few lines, one file): 11

230. **[CHK-03](findings/CHK-03-stale-compiled-tree-can-be-loaded-unnoticed.md)** (not checked, finder sure, tools): The crew's behaviour tree is read from a compiled copy on disk that the side compile does not rebuild and that cannot be checked on this machine
   - Fix: Add the tree check to the list of checks, with a command that works under Python 3.11, and mend the comment that says which defines the tree compiler reads
231. **[DESK-07](findings/DESK-07-word-that-a-mess-is-cleaned-goes-only-face-to-face.md)** (not checked, finder sure, janitor): Word that a mess someone called the janitor to is cleaned up is only ever said face to face, so a caller by PDA who is not there is never told
   - Fix: When a told mess task is done and the caller is not in view, send the sayDone line by PDA once, as orders.ts does for a report, and mark it reported
232. **[GAP-21](findings/GAP-21-the-brief-no-longer-describes-the-system-decisions-one-to-nine-checked.md)** (not checked, finder sure, design): The brief no longer describes the system, its nine decisions checked against today's code (three reversed on purpose and never written into it, three quietly untrue)
   - Fix: Rewrite sections 2, 5 and 6 of the brief to say what is true now, with the date and the owner's words for each reversal, and list what the brief promised that is still unbuilt
233. **[GAP-26](findings/GAP-26-plan-headers-and-change-log-summary-say-built-work-is-not-built.md)** (not checked, finder sure, logs): Six plans still open with "Planning only, nothing here is built", the no-cheats plan has no Status section, and the change log's summary calls two built plans unbuilt
   - Fix: Give the no-cheats plan a Status section at the top that says what is built (4.1, the mail chute, the water half of 4.4), change the six opening lines to point at the Status, and correct the change log's summary in a new top entry
234. **[HAND-06](findings/HAND-06-search-and-fetch-call-any-locker-that-will-not-open-locked.md)** (not checked, finder sure, hands): Searching and fetching call any locker that will not open locked, welded or blocked alike, and never unlock one the body's own card opens
   - Fix: Open storage with the click a player makes, so a locker its card opens is unlocked first, and report welded, blocked and locked apart
235. **[HEAD-11](findings/HEAD-11-staff-known-only-from-the-pda-list.md)** (not checked, finder sure, head): A head knows its staff only from its PDA's list, so a janitor with no PDA asking it face to face is ignored, and a head with no PDA has no staff, holds no meetings and orders nothing
   - Fix: Make staff() the PDA list joined with everyone in view whose ID puts them in the head's department, so word given face to face counts and the no-PDA paths in meetStep can run
236. **[JAN-11](findings/JAN-11-tidying-takes-things-from-under-and-beside-people.md)** (not checked, finder sure, cleaning): Tidying takes anything off the floor with no thought for whose it is, things a person has just put down, is standing on, or that fell from someone lying hurt
   - Fix: In wants_tidying leave alone a thing on or next to a tile with a living person other than the body, and ask the owner whether a fresh drop should be left a minute
237. **[KNA-27](findings/KNA-27-first-try-on-a-monkey-is-the-cuffs-alone.md)** (not checked, finder sure, security): The first go at anyone, a monkey included, is "Stand still" and the cuffs alone, which a monkey never stands for, so one of the three tries is spent for nothing
   - Fix: Send in each person in view whether they are a person or an animal, as the body sees it, and go straight to the baton for one that cannot be told to stand still, if the owner agrees
238. **[KNB-17](findings/KNB-17-thing-put-in-a-pocket-is-never-noticed.md)** (not checked, finder sure, hands): A thing Pun Pun puts in a crew member's pocket is never noticed or put down, only one put in a hand is
   - Fix: Let on_item_in_hand also take the two pocket slots, and have put_down_unasked_item take the thing out of the pocket by a click before it sets it down
239. **[PERF-04](findings/PERF-04-nothing-measures-what-the-crew-costs-the-server.md)** (not checked, finder sure, logs): Nothing measures what the crew costs the server, and the round's perf csv cannot show it, so a forty-crew round would show only lag with no cause
   - Fix: Count the time and the calls of ui_data, look_around and the sends to the window, and the bytes sent, and write them once a minute as one crew_cost line in game.log
240. **[QM-15](findings/QM-15-captain-asked-about-orders-the-budget-cannot-pay.md)** (not checked, finder sure, quartermaster): The Captain is asked twice to approve every order that the budget cannot pay at all, which at the start of a round is every order, since cargo starts with nothing
   - Fix: In clearOrders test the money first, hold an order the budget cannot cover and tell whoever ordered, and put it to the Captain only once it can be paid and is still big

### Medium fix (one part of the code): 5

241. **[CARGO-17](findings/CARGO-17-no-crew-member-ever-comes-for-their-mail.md)** (not checked, finder sure, cargo): No crew member ever comes for their mail, because no job reads the there is mail for you message, and a technician's own letter is sent to itself by PDA
   - Fix: Give the mail notice fixed words that every job reads in readPickup's way, so the person goes to the counter when free, and leave out the technician's own name from the mail it messages about
242. **[JAN-08](findings/JAN-08-engine-machine-list-worked-out-once-and-never-again.md)** (not checked, finder sure, engineering): The engine room's machines are worked out once a round, so a canister swapped onto a connector, or an emitter welded later, is never known, and the old one is walked to wherever it went
   - Fix: Work the canister and emitter entries out again when looked at - by the connector, not the canister - or rebuild the list when an entry no longer fits, keeping ids stable for the machines that did not change
243. **[JAN-12](findings/JAN-12-mopped-floor-left-wet-with-no-caution-sign.md)** (not checked, finder sure, janitor): Every tile a janitor mops is left slippery for up to a minute with no caution sign put out, and nothing warns anyone walking in
   - Fix: Ask the owner - put a wet floor sign (obj/item/clothing/suit/caution) down by the mopping when the janitor has one, and pick it up after, or say Wet floor aloud, as a player janitor does
244. **[MAP-10](findings/MAP-10-simulator-has-one-station-with-metastation-names.md)** (not checked, finder sure, tools): The simulator has one station, with MetaStation's room names written in, so nothing that depends on the map is ever tested and every map fault passes
   - Fix: Make the station in sim.ts a table chosen by name, add a second one with other names (no Cargo Lobby, no room called Brig, hallways not called Primary Hallway), and run the cargo and security scenarios on both
245. **[DESK-11](findings/DESK-11-janitors-share-out-no-work-and-go-to-the-same-mess-together.md)** (not checked, finder likely, janitor): Janitors share out no work, so two that have seen the same messes go to the same room in the same order, and neither leaves a room to another already in it
   - Fix: Leave a routine mess task alone for a while when another janitor is seen in that room, or is seen cleaning there, and let the order of rooms differ by janitor

### Large fix (a design change, or both halves): 1

246. **[GAP-25](findings/GAP-25-owner-design-direction-items-with-no-plan-and-no-code.md)** (not checked, finder sure, design): Six parts of the owner's design direction have no plan and no code, needs, how-to cards, a stocked work area, cover before a break, rooms handed out to janitors, and a raise
   - Fix: Put the six to the owner as one list, and write a short plan for whichever the owner wants next, starting with the head handing out rooms to its janitors, which is the cheapest and helps today
