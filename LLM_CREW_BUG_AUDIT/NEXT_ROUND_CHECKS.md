# What to look for in the next round

One line for each fix on the branch `crew-bug-fixes`: the finding, and what to grep for in that round's logs (`data/logs/YYYY/MM/DD/round-HH.MM.SS/`).

- ASYNC-06: press Home with the Crew Brain and another window open; the other closes and the Crew Brain stays. `game.log` has "Crew Brain window of" "closed" only when the window really closed.
- API-01: each "trespass" warrant in `pda.log` follows a "took hold of [person] to walk them out of" line in `game.log` for the same person; one with none before it is still the fault.
- CHEAT-07: `game.log` "wrote in its order book" lines appear only with light in the office; with the bulbs out none, and the window shows "too dark here to write". The admin paper log (`log_paper`) has a "wrote to order book" line for each.
- CHEAT-09: each cleaner grenade a janitor throws has one "primed" line in `game.log` (log_bomber), not two; a spent casing is never offered as a grenade.
- CHEAT-16: things tidied land on tables at the centre, about a second slower each; nothing is set on a flipped table; `work_put_away` still rises.
- CORE-01: compare counts of `walk failed (go_to` and `walk failed (step_aside` with earlier rounds; "there is no way through" right after a walk was replaced should be gone.
- ENG-01: after "Emitters off, now" in `pda.log` or `game.log`, either "the emitters are off" or "I cannot switch the emitters off:" follows, and the Captain gets "The emitters will not go off" at most once.
- HAND-12: no "look inside the large crate" in the brain log or `game.log`; a fetch that names one says it is "nailed shut".
- KNA-29: with a pulled alarm in the next room, the body resets the alarm in its own room ("reset a fire alarm.") and walks on through the shared door, with no run of "Stopped at" lines on one square.
- LOGA-01: a janitor sent to the Delivery Office alone and asking at the Cargo Bay door is answered "coming to ... let you in", never "nobody here sent for you" (`pda.log`).
- PARSE-01: grep `crew_brain.log` for "your PDA says what you asked for has come" and check each follows only the head's fixed message in `pda.log`; a typed "clean the X" now makes a mess task.
- PARSE-09: grep `crew_brain.log` for "[an order, made out from what was said]" and read the line before each: none should be a question, a "no need", or word that the mess is gone. (Until PLAY-07 is fixed this marker is never written to `crew_brain.log`: judge by `game.log` and `pda.log` only.)
- QM-08: with two orders waiting on the Captain, a bare "yes" in `pda.log` is followed by "The Captain said yes" for the order asked about last, in the Quartermaster's book lines in `game.log`.
- QM-14: in `game.log`, "I have that" from the Quartermaster follows each technician's word within a few seconds all round; no "Your order has come in" PDA from a technician to a head while the Quartermaster is aboard.
- SECT-01: Captain sends "Joan, do not arrest <name>": `pda.log` must have no "I have that: a warrant for <name>" after it.
- SECT-02: grep `pda.log` for "is pardoned" and check each against the Captain's message just before it.
- SECT-03: grep `pda.log` for "I have that: a warrant for" and read each name for words that are not part of it.
- TRB-03: grep `pda.log` for "is in a cell: the warrant is served", and for two "is in Cell" lines to the Captain for one name on one warrant.
- TRUST-06: grep `pda.log` for "by that name:" and check each is a real shared name; grep `game.log` for an arrest of a head on a warrant a head declared.
- RT-01: in `attack.log`, no 8.0 to 9.5 s gaps between one janitor's "fired a puff of reagents" lines on neighbouring tiles; in `crew_brain.log`, "will not come off" no longer shows for dirt when the janitor holds space cleaner.
- HAND-01: in `game.log`, "hit X with its baton 3 times" is followed by "arrested X ... after 3 baton hits", not another baton line; no "would not stay still" after a third hit.
- SEC-01: grep `game.log` for "was knocked down itself while arresting"; while `attack.log` shows the officer stunned, no movement lines for it, and no "could not put X in Cell" from a fall in a cell.
- SEC-05: grep `game.log` for "found X not in it" and "stopped the timer of": the second must not show for a name whose cell holds somebody else.
- SEC-03: grep `game.log` for "broke off its arrest" and "broke off putting"; after an officer's "is hurt" PDA, no further baton or "arrested" line for that go.
- JAN-04: grep `game.log` for "could not get to the sink" or "for water.": on MetaStation at most one for the Medbay Central sink seen from the Medbay Lobby, not a run of them.
- SECT-06: grep `game.log` for "I am going." said by a crew member: the line its head or the Captain said just before is a plain order to leave.
- SECT-07: grep `game.log` for "I am putting": the head's line just before names the person, or says him, her or that one.
- MULTI-08: grep `pda.log` for "Warrant for" lines that name a janitor, and `game.log` for "could not put" or "you were knocked down" next to a janitor's name.
- QM-01: as Captain, answer a big purchase with "Sure, no worries": the `game.log` line "wrote in its order book: Order" shows "The Captain said yes"; `pda.log` shows "is that a yes or a no" after a mixed line.
- QM-10: as Captain, send the Quartermaster "Has the janitorial order come in?": `pda.log` has an "Order N, ..." answer and no "Noted, order"; grep `game.log` for "Cancelled by".
- KNA-01: in `game.log`, every "I am coming to the ... door of the ... to let you out" is followed within about a minute by "opened ... to let X out of ...". Count the ones that are not.
- CHEAT-08: time the "take ... piece of mail" result in `game.log` against the crate's letter count (about 2 s a letter); the emptied mail crate is put aboard and the shuttle leaves.
- CHEAT-14: grep `game.log` for "and could not:", "who has receiving turned off" and "would not send it (" with a reason.
- KNB-06: after a collection, the crate's things lie on one tile, and the crate is back in the lobby or bay, shut and empty; grep `game.log` for "unpack it there".
- SUP-01 (check this first): with power on, orders are still placed ("You order ... at the supply console" and the crates arrive); with the bay APC off, the order result reads "The supply console is dead".
- TRC-01: grep `game.log` for "open: someone is on it"; lie on an open crate in the Cargo Bay with an item on its tile: the technician leaves it open.
- ASYNC-08: give an order in passing and walk on at once: `crew_brain.log` shows work(...) [an order, made out from what was said], and `game.log` a walk to that room. (Until PLAY-07 is fixed the marker is not in `crew_brain.log`: look for the walk in `game.log`.)
- MEM-05: with two crew in view, give one an order by name, then speak to the other: no work(...) [an order...] entry for the other in `crew_brain.log`.
- KNB-13: "Excuse me" lines in `game.log`, each within a few seconds of a "lost its grip ... Next to the crate: <person>" line; "has given up hauling" with a person beside the crate is rare.
- KNB-08: no more than one "opened X to let <janitor> into Cargo Bay" per janitor message in `game.log`; the janitor is in the outer room within seconds of the door opening.
- TRUST-11: ask a head NPC by the Head of Security to have someone arrested: `crew_brain.log` shows "[sounded like an order: not said]", and `game.log` no warrant or arrest. (Until PLAY-07 is fixed the marker is not in `crew_brain.log`: judge by `game.log` and `pda.log` only.)
- CHEAT-01: grep `game.log` for "standing in your way": present but not many; watch a meeting of four or more in a small office for anyone stuck; stand in a doorway in combat mode: a technician stops, not passes.
- KNB-04: in `game.log`, "opened X to let Y" once per asking; the door opens, shuts by itself, and opens again if the visitor was slow, while the technician stands beside it.
- ARR-02: in `game.log`, after "took hold of ... to walk them out" on an officer, no "was laid hands on by <keeper> ...: grab" and no "hit <keeper> with its baton"; an officer let in by a technician is not walked out within 5 minutes while the one the warrant is on is still uncuffed in the bay. A pull by your own body must still give "was laid hands on by ...: grab".
- TRUST-06 (steps 4 and 5): `pda.log` has "Bring them in, N minutes. The Captain declared it." on the Captain's warrants; "I cannot bring in ... they are a head of staff" only on a head's warrant on a head.
- SEC-01 (window): a "You were knocked down yourself" result in `game.log` is followed by the same arrest or jailing tried again, with no "lost" PDA to the Head of Security.
- SEC-05: after a pardon of someone whose time already ran out, `game.log` has "came to let X out of Cell N and found X not in it", and no "stopped the timer of" for that cell.
- KNA-01 (guarding): a janitor who sent "let me out" shows no "took hold of <janitor> ... to walk them out" before "opened ... to let <janitor> out of".
- KNB-04 (step 7): after "opened X to let Y", the same technician starts no walk until Y is through or about 35 s pass; `crew_brain.log` shows "You are done holding the door of X for Y.", and the technician moves on within a second or two of it.
- CARGO-06: a non-head asking a technician for supplies near a head gets nothing ordered (`crew_brain.log` "[nothing said called for it: not done]"); no order with order_for a janitor's name when there is no Quartermaster. (Until PLAY-07 is fixed the marker is not in `crew_brain.log`: judge by `game.log` and `pda.log` only.)
- CHEAT-14 (steps 6 and 7): in the Crew Brain window, has_pda and has_locator are false for a body whose PDA an admin broke; in View Variables an engineer's PDA shows enabled early in the round.
- KNB-06 (crate_collected): collecting a locked, welded or large wooden crate gives "you cannot unpack it" in the brain window, no "is unpacked in" in `pda.log`, and no take back of that crate.
- TRC-01 (take_from_container): `game.log` "left the X open in Y: someone is on it." when something is taken from a locker or crate with someone on its tile.
- ASYNC-08 (both halves): the Captain gives an order in passing and walks out of view at once: `crew_brain.log` shows work(...) [an order, made out from what was said], and `game.log` a walk. (Until PLAY-07 is fixed the marker is not in `crew_brain.log`: look for the walk in `game.log`.)
- DRV-03: the step-aside line in `crew_brain.log` ("has asked you to step aside") comes within a second or two of the ask in `game.log`, and the body is out of the way at once.

## From the medium small-fix bugs, round one (branch `crew-bug-fixes-medium`)

- PARSE-03: pda.log: 'I have that: a warrant for': each name should be a whole crew name
- SECT-04: pda.log: 'the warrant on .* is withdrawn' and 'I did not follow that' sent to heads
- SECT-05: pda.log: 'I have that: a warrant for .*minutes' with a reason that holds a time
- SECT-11: pda.log: after 'you are to make arrests again', a 'warrant: X. Bring them in' line to the officer for each warrant still standing
- SECT-12: pda.log: 'I have that: .*, N minutes.' and check each answers a line about how long someone is held
- SECT-13: pda.log: 'Warrant for Unknown', 'put Unknown out', 'someone with their face hidden would not leave'
- SECT-15: pda.log: 'there is no warrant on' and check each against the wanted list at the time
- SECT-21: pda.log: 'I have that: a warrant for' with a reason of 'on the bridge', 'in the kitchen' or 'the night shift'
- SECT-22: pda.log: 'the warrant on .* is withdrawn' and check the line before it asked for that
- ARR-03 (window part): game.log: no 'hit ... with its baton ... (stop)' on a head of staff; pda.log: 'X attacked NAME. There is no warrant on them.' after a head shoves the officer.
- ARR-07: pda.log: 'there is no way through to them'; crew_brain.log: the arrest line said once, not before each failed try.
- ARR-09: pda.log: 'we will try again' followed in game.log by an arrest ('hit X with its baton'), not by a second 'is hurt. I am serving the warrants myself'.
- ARR-10: pda.log: 'I cannot bring in X: no cuffs' or 'no baton', sent soon after the officer meets them.
- ARR-11: game.log: after 'walk failed (go_to, X Primary Hallway)' by the officer, its next go_to is to a different hallway.
- ARR-12: pda.log: 'carry a Captain's ID'; crew_brain.log: no arrest line said again and again to the same person.
- ARR-14: pda.log: 'Could you let me in, please?' from security; game.log: no walk by the officer in the 90 s after it, unless the door was opened.
- ARR-19: pda.log: 'Could you let me in, please?' after an officer is bitten; game.log: the same arrest line said no more than twice.
- TRB-01 (window part): Once the server half is in: game.log 'took hold of NAME' after the Captain cuffs a wanted crew NPC and lets go beside the officer.
- TRB-02: game.log: 'arrested NAME' followed by 'took the cuffs off' for the same name after a pardon.
- TRB-09: pda.log: a second 'I cannot bring in Pun Pun: nobody has opened the ...' on a second warrant, and a second engineering ask.
- ARR-08 (window part): game.log: no approach or arrest of a second wanted person while the officer's arrest of the first is under way.
- ARR-13: game.log: when the Head of Security 'arrested' someone, a 'put ... in Cell' line follows.
- KNA-32 (arrests part): Once wired: in game.log, no 'was told by its brain to say' line from a security body that names a wanted person, outside the arrest line.
- ASYNC-07: crew_brain.log: a remark with no say should no longer be followed by a stop in game.log; watch janitors walking with company
- BRAIN-01: game.log: talk to one NPC for a minute without pause; a 'was told by its brain to say' after each line
- BRAIN-03: grep -c "too many things" crew_brain.log should be 0; no two ROUTINE records for one NPC in the same second with the same text
- BRAIN-05: crew_brain.log: no reply with "tool": "go_to" in move unless the report has someone asking the way
- BRAIN-07: crew_brain.log: '[the line in it is no longer needed: not said]' and '[whoever spoke is still to be answered]' records, and any '[the LLM gave none]' checked against the state just before it
- BRAIN-09: crew_brain.log: '[whoever spoke is still to be answered]' followed within a few seconds by a call answering that speaker; no double order
- BRAIN-12: game.log: with two people owed word in view, one done line to each, 4 or more seconds apart
- CHK-07: crew_brain.log: 'is not in sight to be called to it' records should have the meeting room as their room
- GAP-23: grep game.log for 'was told by its brain to say:' lines of 199+ characters not ending in . ! ? or a quote: should print nothing
- KNA-06: game.log: between 'you are under arrest' and 'arrested' for one suspect, no officer say other than the arrest line
- HOLE-25 (window part): crew_brain.log: no 'your greeting' moment whose trigger line has 'lying on the floor'; report lines show '(lying still)' or '(in cuffs)'
- DRV-01: crew_brain.log: ROUTINE (no LLM) lines ending "stepping clear to wait", for bodies at a staff meeting that arrived in a doorway
- DRV-11 (window part): game.log: "walk failed (go_to_door" two or more times for a shut-in body, then in crew_brain.log "cannot get to its door" and pda.log "I am shut in the ... and cannot get to its door"
- ENG-04: pda.log: each "I am sending X to open the Y" should be followed by "is open", "could not open", or "nobody from engineering has said it is open" for the same room
- JOBS-06: game.log: "nowhere here to step aside", then the next ask to the same body within two minutes should be followed by a step_aside
- PARSE-04: game.log: each step_aside, checked against what was said to that body just before it
- LOGB-04: crew_brain.log: "Someone is knocking at the door of your office" should come once for each technician knock() step
- QM-04: game.log: "open_own_crate" repeated for the same crate number
- QM-12: pda.log: "Lost at cargo" for an order that was itself a reorder should say "It will have to be ordered again", with no new order number
- TRUST-07: pda.log: an order told "did not go through" by a technician other than the one it was given to should not be given again
- CARGO-07: game.log: with the model down (decision.error in crew_brain.log), no '[made out without the LLM]' order after a head's line with no crate kind in it, or with 'where'/'yet'/'cancel' in it.
- CARGO-08: game.log: 'I am holding no crate for you. Which number is it?' or 'Which number is it?' said at the counter; no 'not holding a crate by that number' said to someone who had a crate held for them and gave no number.
- CARGO-11: pda.log: a janitor call from the technician who does not have the rooms, after the keeper was taken to the Brig; crew_brain.log: no lasting 'has the rooms this shift, and sends for a janitor' step while the keeper is out of sight.
- CARGO-12: crew_brain.log: no lasting 'That is X's to see to' step while X is in cuffs or down in the bay.
- CARGO-13: pda.log: 'Cargo has not brought out crate #' from a collector; game.log: no collector asking the same technician more than three times running.
- CARGO-14: game.log: an order line naming Replacement Lights after a head or the Captain asks for 'light bulbs for the janitors'.
- JOBS-02: Once tasks.ts honours keepUntil: in game.log, a take_back after every 'is unpacked in' PDA line in pda.log.
- KNB-10: game.log: no 'orders go through the Quartermaster' said to a head or the Captain who was standing in the Quartermaster's Office.
- PARSE-06: game.log: an order for a Bureaucracy Crate after someone says 'order paper'.
- PARSE-08: game.log: no 'opened ... to let X out of Y' straight after X asked to be let in from outside (for example 'I'm stuck out here').
- TRA-03: pda.log: no 'Cargo says there is no crate #N' from a collector whose crate N was then brought out or still held.
- JOBS-04: game.log: after 'no room in your bag' or 'The supply shuttle is not here to send back' three times, the same body goes on to tidy, look-in walks or go_to its post; crew_brain.log: 'it has failed three times running'.
- LOGA-04: game.log: no 'opened ... to let X out of Y' by one technician within half a minute of the other's 'opened ... to let X into Y'. If one is seen, check the technician's crew_brain.log prompt for 'knocking ... from inside' first.
- DESK-01: crew_brain.log: every "your PDA says what you asked for has come" step follows a "what you asked for has come" line in pda.log to that janitor.
- MULTI-03: game.log: "took hold of ... to walk them out of" a post with workmates of the same department on both sides; crew_brain.log: "I work here".
- PARSE-07: game.log: a stranger's answer naming the guard at the start or after a comma followed at once by "You have no business in here".
- SECT-09: game.log: a workmate's "Yes ..." answer to "did you ask X to come in" followed by "You have no business in here, X".
- DESK-02: crew_brain.log: "nobody let you in" steps; each should follow a real knock in game.log for that same call.
- DESK-10 (window part): game.log: "Your hands are full of things you need" from a janitor repeated; after it, a go_to the mess.
- LOGA-05 (window part): crew_brain.log: no janitor "holding damp rag, damp rag" for more than a minute, a "putting one damp rag down here" step, and no run of go_to between the same two rooms.
- ENG-05: In pda.log, a Captain's line to the Chief Engineer with light/relight/restart in it, then in game.log the Chief Engineer's "the engine is yours. Light it now, please." to its engineer.
- ENG-08: game.log or pda.log: "The engine has been lit again." to the Captain, and a second "losing integrity" afterwards if integrity is still under 95.
- ENG-09: pda.log: "I cannot reach" from the Chief Engineer to the Captain; crew_brain.log: no Chief Engineer step "You are looking for" lasting more than a minute.
- ENG-11: pda.log: "I have no engineer to switch the emitters off"; a Chief Engineer's meeting close saying "I have ordered the emitters off, and have not heard that they are".
- LOGA-02: crew_brain.log: a head step "You are waiting for X, who is on the way or somewhere in the"; pda.log: "the staff meeting is over. Send me your report by PDA" from a Quartermaster or Chief Engineer to a staff member who was never called on.
- TRA-01: pda.log: the Head of Personnel's "I need to order 2 crates of janitorial supplies" after a meeting where three janitors reported a need.
- TRA-06: game.log: no "could you get it ordered" said to the Captain while a Head of Personnel is aboard.
- TRC-03: pda.log: no "On my way to the" answering a Captain message that did not begin "Staff meeting in the".
- ENG-06: game.log: no emitter "switch_on" before the last cooling step of the lighting list; crew_brain.log: the Chief Engineer's "I have that" only after a line that begins "<name>, the engine is lit."
- HEAD-03: game.log: call-on lines with a full name ("Alex Moor, your report, please.") where two staff share a first name; the Captain's copy "3 of 3 there".
- HEAD-06: pda.log: the time from a head's "Staff meeting in the" to its "the staff meeting is over" is never more than about four minutes once its staff have arrived; "I could not get to the" in the HoP's copy to the Captain.
- HEAD-07: game.log: two reports said within a few seconds of one call-on; there should be none.
- ARR-03 (server part): game.log: no 'hit <head> with its baton ... (stop)' for a head of staff; the brain log should have an arrest result with reason command if a head attacks an officer
- ARR-17: game.log: 'let ... go at' lines; the name should match the pardon in pda.log
- KNA-30: game.log: from 'put on the security belt' to the first 'with its baton' should be about 0.4 s longer per storage, and the counts should not change; engineers' 'forced open' lines as before; attack.log and the Crew Brain hands should show no belt taken off and no box out of a bag; draw_stopped 'it could not open what it was kept in' should not appear
- MAP-04: game.log 'put X in Cell N': on MetaStation it should be the nearest free cell; on Tram it should not be 'Cargo Cell' unless that is the nearest
- SEC-04: game.log: one 'could not put X in Cell 1: it could not get to the cell's timer' (or 'its timer would not start' / 'would not take the time'), then 'put X in Cell 2'
- TRB-05: game.log: 'got <name> up from the <chair>' before 'arrested <name>'; there should be no 'got away from you on the way to the cell' after arresting someone who was seated
- TRB-07: crew_brain.log or game.log for a jailed crew NPC: no 'You are free to go.' and no 'walked out of Cell N before you could shut it' between 'took the cuffs off' and 'put ... in Cell N'
- TRB-08: game.log: 'could not put X in Cell N: its door is broken' after a cell's windoor is smashed, and no 'put X in' that cell
- DOOR-04: game.log after power fails: an engineer without a multitool should still 'force open' a dead door; there should be no 'no_tools' with only multitool missing for a door with no power
- DOOR-01: game.log: 'opened .* to let' followed by a second 'opened' line for the same room within a minute means someone was shut in again.
- DOOR-03: game.log: 'tested whether it is shut in'. Each line now says 'N way(s) tried'. 'found no way out' should come only for a room whose doors are all locked to that body, bolted or dead, and 'nowhere to test' should appear in place of the old false 'no way out' (the Custodial Closet at round start, KNA-28).
- DOOR-11 (server part): game.log: 'reset the fire alarm in' should come only when the doors really opened. Look for the results 'has no power. It will not reset' and 'would not reset'.
- HAND-03 (server part): game.log: grep 'told by its brain to say:.*\*' should find nothing, and no GAME-SAY line should show a custom say emote from a crew NPC.
- KNA-31: pda.log: an officer after someone in the Bar Backroom should not say 'I am at the Bar Storage door' unless it has service access. game.log: 'found no way to ... a door into' lines for doors behind a Service Hallway door that stands open.
- LIFE-01: game.log: 'walk failed (go_to' followed by 'you were knocked off your feet'. After one, the next go_to to the same room should be sent within a minute, not five.
- LIFE-03: game.log: 'had been given something else to do meanwhile'.
- CORE-07: game.log: 'had been given something else to do meanwhile'. A step aside or a lead asked while a janitor explores should be carried out, not replaced by the explore walk.
- CORE-11: game.log: 'walk failed (' with 'has hold of you', 'strapped into' or 'cannot move your legs'.
- DOOR-06: game.log: 'a door out of' in 'found no way to' lines, followed by a walk to another door of the same room.
- KNB-14 (server part): game.log: 'walk failed (go_to' for a janitor let into a cargo room. Once let out it should go straight to its next call, and no 'I could not get in' report should follow a time shut in.
- MAP-07 (server part): After 'Gravity Generator Blackout' in game.log: 'you are floating, with nothing to push off from' on walk failed lines. Crew in open floor should not move.
- MAP-11: Only on Tramstation, IceBox, NebulaStation or CatwalkStation: no walk failed line to a spot on /turf/open/openspace. On MetaStation nothing should change.
- HAND-07: game.log: "found .* inside the"; crew_brain.log: storage_seen with "you find"
- JAN-01: game.log: "wrote off the" (each should be a mess that really would not shift, such as a cobweb under a mop); crew_brain.log: "You stopped cleaning" / "could not finish cleaning"
- JAN-02 (server part): game.log: a janitor with a wet mop near decomposing garbage reports "You clean up 1 mess in ..."; no tool change to a rag for garbage
- JAN-05: game.log: "to put things on it: passed over for a while" should appear once for each place, not once for each thing
- JAN-09: game.log: after an NPC's "worked the emitter ... switch_off", no emitter "turned ON by" that NPC; crew_brain.log: "is off already" / "is connected already"
- KNA-05: game.log: "found a .* in its hand that it did not pick up" during an arrest, then "put down the"; no "put away its X to free a hand" for a beer or circuit board
- LIFE-05: game.log: one "hit ... with its baton" per swing, never two lines a fraction of a second apart for one errand
- LOGA-05 (server part): crew_brain.log: no janitor "holding damp rag, damp rag" for more than a minute; game.log: "put away its damp rag to free a hand"
- RT-05: game.log: "stopped on an error" (each one is a runtime that would have frozen a body) and "gave up its"
- MULTI-04: crew_brain.log at round start: no "standing open with nothing left inside" for a janitorial locker that holds things; the three janitors list the same things for the closet's lockers
- PERF-06: Hard to see in logs: a mess put down by an admin in the bay late in a long round should still get a technician to call a janitor
- SUP-15: game.log: no "nobody can get to it" for a crate that was reached since its last failed walk
- CHEAT-10: grep game.log for 'has every right to be in' and 'outranks you' and check each against the person's card title
- CORE-06: grep game.log for 'got away from you' during custody walks and throw_out, and check whether a slippery thing was on the tile
- CORE-09: watch the Crew Brain window's job for a technician carrying a picked-up ID; grep game.log for tidy steps with an ID card
- CORE-10: grep game.log for 'Crew Brain window of' ... 'closed' near round start; the owner should see 'The Crew Brain window opens when you join or observe.' in chat if in the lobby
- DOOR-09: compare the Crew Brain window's locked rooms list with the map; check a technician answers knocks at the Cargo Bay door
- MAP-05: grep game.log for 'nowhere on the station to stand'; on a multi-level map check each body's spawn room
- MAP-06: grep crew_brain.log or the start prompts for 'Your technicians work from the' and 'Your post is the' and check they name the same room
- SENSE-01: grep game.log for 'is down and cannot walk', 'already has hold of', 'is in cuffs. That is security'
- SENSE-05: after station power fails, grep game.log for throw_out results: 'walk X out of' and 'You cannot see a door to walk'
- SENSE-10: grep pda.log for messages to a crew NPC while game.log has it in a locker or disposals, then crew_brain.log for the message arriving
- SENSE-11: after the keycard emergency maintenance access is swiped, grep game.log for 'has every right to be in' for people with no job there
- SUP-03: grep game.log for 'order book, sheet' items dropped, and for 'Your hands are full, so you cannot get your'
- SUP-13: grep crew_brain.log or game.log for 'did not come with it'
- SUP-04: grep game.log for STOW hauls of the same crate twice in a row; on MetaStation check crates still end on the bot_white squares

## From the medium small-fix bugs, round two

Written by the fixers. Where a check greps crew_brain.log for a marker, nobody has checked that the log holds that marker: crew_brain.log holds raw model replies, not every line the brain records. If grep finds nothing, look in game.log for the same thing before calling it a failure.

- KNA-32 (hook part): game.log: look at every 'was told by its brain to say' from a security body while it holds a warrant, and check none names that person outside the arrest line. crew_brain.log: look for '[not to be said aloud: said instead' to see what was replaced.
- CARGO-07 (brain part): game.log: with the model down, check that an order placed 'for' someone is for whoever said the line.
- DOOR-11 (window part): game.log: after a failed reset_alarm that carries alarm_dead, the body must not walk back to that room's doors for ten minutes.
- HAND-03 (window part): crew_brain.log and game.log: the line the brain recorded should match 'was told by its brain to say' after the server strips asterisks.
- CHK-07 (rest): game.log: a Quartermaster that has walked to its office must not call its Cargo Bay meeting by PDA from there.
- ASYNC-07 (driver part): game.log: a body waiting only on a remark should keep walking. Look for fewer 'hold' or stop-to-talk pauses with nobody speaking.
- ARR-08 (rest, steps 1-2): game.log: with two warrants, an officer arresting B does not walk off toward A when A comes into sight. An officer struck with no baton mid-arrest does go for its kit, or gets away.
- JOBS-02 and CARGO-13 (tasks part), with MEM-11: game.log: a take_back after every "is unpacked in" PDA line in pda.log, even for errands sent over half an hour earlier. Crew Brain window: any "Gave up on, not done:" in the last-job line.
- TRA-03 and KNB-10 (step 5, addressing part): crew_brain.log / game.log: with a crew member named with a two-letter first name, a line opening "Name," is not answered by others.
- BRAIN-11 (rest: minutes): crew_brain.log: READING entries; game.log: a warrant read by the reader from a message with no time should get the default term, not one the model chose.
- ARR-13 (desk part): game.log: after a Captain's "try again" while the Head of Security is mid-arrest, the officer is not sent that warrant (no "warrant: NAME. Bring them in" PDA in pda.log) until the arrest has failed. Nobody is arrested by both.
- QM-05 (steps 1-2): pda.log: 'I am shut in the' sent to the Quartermaster. game.log: the QM saying 'is shut in the ... Could you let them out, please?', then the technician named in it walking to that room and opening the door to let the shut-in technician out.
- LOGA-04 (rest): game.log: no 'opened ... to let X out of Y' by the second technician within a minute of the first letting X out of Y. If one turns up, check that technician's crew_brain.log for a 'knocking ... from inside' line first.
- CARGO-12 (rest): game.log: no 'I am going to look in on the' said in the bay while the only other technician there is in cuffs or down.
- PARSE-06 (rest): pda.log: the Captain's answer to an order waiting on their say, when it names the crate (for example 'yes, the paper one'), followed by 'Order N. The Captain said yes.' in the book.
- KNB-10 (step 4): game.log: a technician telling a head 'crate #N ... is lost' at the counter should not be followed by a new order in the QM's book. A head at the counter should ask again after ANSWER_WAIT_DS if the technicians only spoke to each other.
- BRAIN-03 (janitor part): grep -c "too many things" crew_brain.log should be 0. A janitor let out of the Cargo Bay into the lobby that still has a mess inside should ask at the door at once, with no run of identical ROUTINE say records within one second.
- JAN-02 (window part): Have a janitor with a wet mop called to decomposing garbage. In game.log look for "You clean up 1 mess in ...", and in pda.log there should be no "I have no soap or rag" reply to that call.
- TRA-01 (step 5): After a Janitorial Supplies Crate is unpacked with two janitors short, pda.log should have no "something better than a rag" from either of them.
- SENSE-01 (window part): game.log: no 'took hold of' line for anyone who was lying down. crew_brain.log: no 'what are you doing in here' said to someone who was down.
- SECT-11 (simulator part): pda.log: after the Captain's "Try again", look for "Hale, you are to make arrests again." and then "Hale, warrant: <name>..." for a warrant declared while the officer was out.
- TRB-02 (simulator part): game.log or crew_brain.log: an officer holding someone after a pardon or withdrawal that came mid-arrest, with no "free" afterwards.
- ARR-11 (simulator part): game.log: an officer on a warrant whose go_to to a Primary Hallway fails should go_to the next Primary Hallway within seconds, not the same one again.
- SEC-04 (simulator part): game.log: a jail that fails with "The timer of Cell N will not start" or "will not take the time" should be followed by a jail into a different cell.
- HEAD-06 (simulator part): pda.log: a head that cannot reach its meeting room should send "<name>, the staff meeting is over. Send me your report by PDA, please." about 3 minutes after "Staff meeting in the ... now". Its Captain's copy should start "I could not get to the ...".
- JOBS-06 (simulator part): game.log: a step_aside that fails, then a second request within 20 s, should get a second step_aside within seconds.
- ARR-09 (simulator part): pda.log: after "Captain, we will try again.", there should be no second "... is hurt. I am serving the warrants myself." game.log should show an arrest by the officer.
- ARR-07 (server part): game.log: the officer's arrest failing, then a reset of the fire alarm in the room named; crew_brain.log: an arrest event with fire_doors in its details.
- TRB-01 (server part): game.log: 'took hold of <name>' from hold_arrested after a player's cuffs; crew_brain.log: peopleInView entries with pulled_by null or a name.
- HOLE-25 (server part, arrival text only): crew_brain.log: person_in_view lines with 'not moving' or 'in handcuffs'; no 'your greeting' moment for them.
- LIFE-03, CORE-07 (forcing part): game.log: 'worked out which door of' ... 'to force, and had been given something else to do meanwhile'; crew_brain.log: force_door results 'You are still working out the way.'
- DOOR-11 (hands part): crew_brain.log: a reset_alarm result with "alarm_dead"; game.log: no "reset the fire alarm in" line for that room.
- LIFE-03 (hands and link part): crew_brain.log: "working out the way" in the body's doing; no step sent while an explore or force_door is still testing routes.
- DESK-10 (server part): game.log: "put away its" lines for janitors; crew_brain.log: no failed pick_up of a bucket before a janitor with mop and soap goes to a mess.
- SUP-15 (step 1): game.log: "nobody can get to it" should not appear for a crate on a square; on MetaStation crates still land on all sixteen squares.

## From the medium small-fix bugs, round three

- TRB-02 (rest): game.log: after a pardon that reaches an officer mid-arrest, look for its "arrested" line followed by "took the cuffs off" for the same name.
- ARR-13 (step 2): game.log: a Head of Security 'arrested' someone, followed by a 'put ... in Cell' line.
- ARR-08 (step 3): crew_brain.log: an officer that broke off an arrest to get away, then a 'cuffed' report on that person.
- MAP-04 (step 3): game.log on Tramstation: where an officer whose cells all refused waits; it should be a checkpoint room, not the Brig.
- MAP-07 (step 4): crew_brain.log: a body in a room with the gravity off should be told "There is no gravity here"; game.log: how often walks are refused with the floating reason.

## Found in play, round-15.44.36 (2026-11-19)

New faults are PLAY-01 to PLAY-13. Known faults seen in play for the first time: TRB-07 (prisoner let go when the cuffs come off in the cell), SENSE-03 (Pun Pun as a gorilla is never seen, so his warrant cannot be served), GAP-24 (the Captain's PDA to the Quartermaster gets no answer), ENG-02 (the emitters lost power and the engine was reported lit), HEAD-08 (a crate credited to the wrong janitor), MULTI-07 and JOBS-05 (a late "still waiting" sends a second janitor), DRV-08 (no step for 15 s after stepping aside), PARSE-04 (a refusal with "step aside" in it read as an ask).

Fixes seen working: DRV-03, TRUST-06 (the Captain's half), KNB-04 step 7 (failed once, see PLAY-05), SUP-01, KNB-08, CHEAT-01 (bodies stop at people). Not set up in that round: ASYNC-08, MEM-05, ARR-02, SEC-05, SEC-01, CARGO-06, KNB-06, TRC-01, TRUST-11, a head's warrant on a head.

## From the night fixes, round P: PLAY-01 to PLAY-13 (branch `crew-bug-fixes-night`)

- PLAY-01: game.log: no "could not walk back out to the timer"; "took the cuffs off" followed within a few seconds by "put ... in Cell N", with the prisoner on the bed tile.
- PLAY-02: a prisoner cuffed several times before "put ... in Cell" still gives "1 arrests made" at the meeting. pda.log: any "cannot bring in ... no cell would take them" comes while the officer is still in the brig, never after "is in Cell".
- PLAY-03: after the Captain tells the officer to its face where someone wanted is, with a Head of Security aboard: game.log "I have that:" then a walk there; pda.log "Security: X is in the Y." from the officer to the Head of Security.
- PLAY-04: game.log "went round MULEbot ... which will not move" and "found no way round"; at most about one "MULEbot ... is standing in your way" per body.
- PLAY-05: crew_brain.log "You are done holding the door of <room> for X" after each "opened ... to let X into" in game.log; no "has asked you about the door. You are not opening it" for someone the technician sent for.
- PLAY-06: game.log "did not open <door> ... for <person>"; "took hold of <janitor> to walk them out of" only after "I could not get to the door to let you out" or "that door will not open for me".
- PLAY-07: `grep -c '"calls"' crew_brain.log` is about the number of model-call records. From now on the crew_brain.log greps above for "[an order, made out from what was said]", "[sounded like an order: not said]" and "[nothing said called for it: not done]" can be trusted.
- PLAY-08: no "did not reach" for a head while they are in a cell; one "Security notice." to them soon after "is free to go".
- PLAY-09: with a head on a warrant shut in their own office, a let-in PDA from the officer to the Captain before any "no way into the ..." line.
- PLAY-10: after the Captain says "call a janitor" or "ask for a janitor" to any crew member: pda.log "<Captain> has asked for a janitor" to one janitor, and game.log the crew member telling the Captain whom it sent for. crew_brain.log "[said word for word just now: not said]"; game.log: no NPC says the same long line twice within a minute.
- PLAY-11: game.log: no crew line with "before I can step aside", "finish" or "first" within 5 s of a "step aside" said to them; crew_brain.log prompts carry "You have broken off".
- PLAY-12: after "has given up hauling ... (collect_crate:" in game.log, a PDA from the collector within seconds starting "I could not get crate #", then the head sending another staff member for that number.
- PLAY-13: attack.log: after a puff with no "sprayed" line, the same body's next puff within about 2 s, not 8 or more; game.log "wrote off the dirt" should be rare.

## From the night fixes, round M1: the medium bugs marked "Medium fix"

**Big changes to watch first:** CHEAT-15 (crew see only lit squares, or the square next to them: after the station power fails they will see far less), BRAIN-02 (with a long queue more lines go out plainly, not in the model's words), CHEAT-04 (a pardoned crew prisoner stands about 20 s before it is told it is free), and bodies now go round MULEbots and slippery things (PLAY-04, SENSE-06).

Security:
- PLAY-01: game.log "could not get past" / "to the door of Cell"; no "could not walk back out to the timer"; "took the cuffs off" then "put ... in Cell N".
- ARR-01: crew_brain.log `arrest("pN", "force", 2)`: a few seconds between tries, about 30 s after every third.
- ARR-04: game.log "found no cell's timer with power"; pda.log "the cells have no power" or "every cell is in use", once.
- ARR-05: game.log "PDA would not send it. You are going to your post"; pda.log: one "Captain, X is in Cell" per jailing.
- CHEAT-03: game.log "came to its timer and found it in use" or "dark"; never "Every cell is in use" said from afar.
- CHEAT-04: a deaf or far prisoner is not told it is under arrest; for a pardoned crew prisoner, about 20 s between the pardon and "is free to go".
- KNA-26: game.log a knock, then "Could you let me in" said aloud when a keeper is in the room.
- SEC-07: game.log "begins try N at working its cuffs off"; never "is free to go" for a body still in cuffs.
- SECT-10: pda.log: no "I did not follow that" after thanks or questions.
- TRB-06: pda.log "before their time". TRB-11: pda.log "is letting them out", "has not let ... out. I am going to do it"; game.log `release_prisoner`.
- MULTI-01 (rounds with a player officer): pda.log "was seen in the" and "is to be let go" only to the officer holding that warrant.
- SENSE-08: game.log: never "took hold of" the Captain or a head; crew_brain.log "You do not lay a hand on them."

Doors and walking:
- KNA-03: game.log "was routed through ... which is shut", "the route planned ran through"; crew_brain.log "the X door is locked to you".
- KNA-19, KNA-28: no "found no route to Research Division" from a janitor; no walk to the sealed surgery corner of Lesser Starboard Maintenance.
- KNB-01: game.log "tries the tile inside its door"; no "walk failed (go_to, to Warehouse)" from a technician.
- CHEAT-11: game.log "found the air bad at", "walk failed (...): the air in there is bad".
- DOOR-02: no "Doors of Cargo Lobby: ... locked to it", and no janitor "shut in Cargo Lobby".
- DOOR-07: game.log "came to force ... waiting for it to shut", "forced open"; no "did not: it opens to its ID".
- DOOR-12, DOOR-15: "could not force ... (fire_doors)" or "(electrified)", one per door.
- DOOR-14: "did not open ... The door has no power" or "is bolted".
- SENSE-06: game.log "went round banana peel" (the line still ends "which will not move"); fewer "slipped on" in attack.log.
- SUP-06: game.log "broke off a haul", "broke off walking someone out".
- HAND-08: "but cut off from it: walking round to", "nowhere beside it to reach it from".
- KNA-02: crew_brain.log: no "seeing what is kept in the storage" between "knocking at the door" and the door opening. Watch also for a shut-in officer standing at the door while someone it should arrest is in the room (seen in the code, being fixed in round M2).

Talk, brain, words:
- ASYNC-05, DRV-07: crew_brain.log "is out of sight: the line waits until they are back", "[the line was not said: it waits]".
- BRAIN-02: crew_brain.log "the line its work called for had waited". BRAIN-04: "[line lost:", "the server would not say a line its work called for, twice".
- LOGB-02: a janitor answering a meeting call while hauling a collected crate still unpacks and reports it.
- DRV-12: no `explore()` followed within about 10 s by a `go_to` back to a room whose step "came to nothing".
- PARSE-04 (left-over): no step_aside right after a line where the other NPC refuses to step aside.
- MEM-01, PARSE-14, PARSE-16: crew_brain.log "speaking to you)" on a line that begins with another person's name and a comma: there should be none. "QM, order some paper" goes to the Quartermaster only.
- MEM-04: a look or clean task is for the room named first in the order, not one after "not" or "instead of".
- MEM-08: with the model down, a look asked as a question ("Could you check on the Bar?") is now dropped.
- PARSE-15: "status report on your department" and "gather your staff" call a meeting; "did you hold a meeting" does not.

Janitor and hands:
- HAND-02: game.log "could not get to the", "passed over for a while"; the caller hears "I could not get to the rest".
- HAND-04, HAND-05: "to pick up ... passed over for a while"; a `pick_up` answered "is locked" at most once in 5 minutes. HAND-05 side effect: a locker the body's own card opens is also passed over for 5 minutes at a time (HAND-06 is not built).
- HOLE-18: game.log "working hands now"; "Your right hand will not hold anything".
- RT-02: "lost the target of its", "lost a container it was going to look in".
- give_item (no finding; it was a cheat): "has no free hand to take the ... You still have it." in place of the thing dropped at their feet.
- JAN-03: "rinsed its filthy rag at the", "wrung out its filthy rag"; no "wrote off ... beyond the damp rag" after blood.
- JAN-13: crew_brain.log "The mess you remembered here is gone."
- DESK-08: "walking into the middle of the room to look"; no "is cleaned up" from a janitor that cleaned nothing ("I found no mess in the X").
- DESK-09: pda.log: no "something better than a rag" soon after a janitor put down a mop.
- LOGA-07: no "walk failed (go_to, <room>)" within a minute of "I have no soap or rag".
- LOGB-05: no `go_to_door("Cargo Lobby")` for a mess in another cargo room. LOGB-06: pda.log: at most one "Could you let me in" per janitor per person per door.

Cargo, Quartermaster, heads:
- CARGO-03: "order N did not go through. <reason>" then "<name>, I have that."
- CARGO-05: counts read from anywhere in the line, at most 4 of a kind.
- CARGO-18: "could not get it out to the lobby. See to it" followed by that technician's `release(`.
- JOBS-05: a collector does not collect until it is in the Cargo Lobby; "Cargo says X has taken crate #N already".
- MULTI-02: no "has still not come" after the crate is in the bay.
- MULTI-07: attack.log: no "pulled from" between two crew over a crate.
- PLAY-12 (rest): "could not get the ... clear of the doors" then "It lies in" in the result; "has given up hauling ... (take_back:" then a PDA "I could not get the empty crate from #".
- SUP-05: "sent the supply shuttle away" never follows a failed `unload`.
- SUP-09: a Bureaucracy Crate unpacked by a collector leaves the cabinet on the floor; no "Recycle" of a crate with something still in it.
- SUP-11: crew_brain.log "not enough money in the cargo budget"; no "Something is holding the supply shuttle up" when money was the cause.
- SUP-12: "sent the supply shuttle away with N crate(s)"; no "haul ... off the supply shuttle" for a crate a player put aboard to sell.
- HEAD-01: pda.log "Nobody at the cargo counter will take my order for"; game.log "Staff meeting in the" about every ten minutes after an order.
- HEAD-05: "PDA would not send it. Kept to send again: I need to order", then "I need to order" said at the counter about 9 minutes later.
- HEAD-10: pda.log "There is nowhere I can call my staff together".
- TRA-08: one "I need to order" per batch of asks.
- TRC-04: game.log "could not work the X ... (reason)" against "I cannot light the engine:" in pda.log.
- ENG-03: pda.log, whom "Emitters off, now" went to.

## From the night fixes, round M2: the held parts of round M1

- KNA-02: a shut-in officer arrests someone in the same room rather than standing at the door; crew_brain.log "will go to the meeting when you are let out" and no failed walk to the meeting room from a shut-in body.
- ARR-06: an officer or janitor at a door someone opened by hand walks in at once (crew_brain.log "has been opened for you, and you are going through").
- ARR-01: an arrest line after a rest is said within about 20 s of being due, not held back longer each time.
- MULTI-01: game.log "when someone else put cuffs on them"; the officer does not report "cuffed" for someone else's cuffs.
- CHEAT-02: "Could you let me in" goes to people by their job title.
- CHEAT-04: game.log "is being arrested by ... and stands still" comes before any "cuffed" line.
- CHEAT-15: crew_brain.log prompts carry "It is dark here" once the power fails; arrests two squares off in the dark come back "lost"; fire-door lines name only doors right beside the body.
- CORE-02: a stunned body still gets knocks, PDA messages and its looks; one out cold gets "While you were out, your PDA got a message from".
- HAND-02, HAND-05: a janitor whose only known mop is in a locked locker asks its head for supplies.
- BRAIN-04: crew_brain.log "that went unsaid", then the line said once more.
- MEM-07: after a mess told in the janitor's own room, "I found no mess in the X" or a clean, never an instant "cleaned up".
- LOGA-07: no "walk failed (go_to, X)" from a janitor within 5 minutes of "I have no soap or rag".
- PARSE-17: a janitor takes a mess called out to the room, not just one said to it.
- DRV-12: filling a bucket or wetting a mop that fails no longer holds back the clean itself.
- SUP-06: game.log "broke off", "claim on it lapsed", "is no longer held by the arm".
- CHEAT-11: game.log "stopped its ... walk ... the air at ... is bad".
- hand_mail_over (no finding; it was a cheat): "has no free hand to take the mail. You still have it."
- QM-03: two cargo staff with one first name are called by whole name ("Sam Bell, order").
- TRA-02: "your order has come in: crate #" said at the counter when a head asks for a kind already held for them.
- TRA-04: "I have put your order in" after each counter order.
- DOOR-14: pda.log "The door of the X will not open"; the person and the head told once.
- KNB-09: an officer's or technician's "On my way" by PDA is read as a meeting answer.
- TRB-06: the officer sees someone it jailed out early and tells its head ("before their time").
- ENG-03: a door to force goes to the engineer the Chief Engineer orders.
- KNA-23: an officer told of a sighting in a big room walks to its far side to look.

## From the night fixes, round M3

- ARR-04 (follow-up): pda.log "I have <name> in cuffs." from the officer while it waits in the Brig with no cell, and the Head of Security's "Captain, <first> has <name> in cuffs."
- PLAY-10 (follow-up): after a "call a janitor" spoken from another room, the janitor PDA names the speaker's room.
- MULTI-06: a technician's workmate sends no second janitor PDA for the same room within the call window; a call for another room does not hold it back.
- CARGO-09: crew_brain.log a door result with "not_inside":1 after one of the three refusals; that person is not let out by that door again every two minutes.
- TRA-04: watch for a head asking the same order again after a technician agreed in other words without saying "I have put your order in".
- LOGB-03: game.log for each "opened X to let Y into Z", the brain books Y; crew_brain.log door results carry "for":"<name>"; no run of "You do not know who that is" for someone never let in.
- SUP-06 (seen in the merged code): a technician asked to step aside while it pulls a crate now lets go of it, "you were called away".
- pardoncell (seen once in 9 simulator runs): after a pardon the officer ignores, the Head of Security holds its staff meeting and never goes to the Brig. In a round, after a pardon nobody acts on, look for "has not let ... out. I am going to do it" in pda.log, and whether a meeting fell in the two minutes after.

## From building the owner's answers of 2026-11-22 (branch `crew-answers`)

**Big changes to watch first:** janitors have no galoshes now (KNB-06): watch attack.log for "slipped on" by a janitor; it should walk on tiles it just mopped. Crew NPCs are on the crew manifest (CHEAT-02): check the manifest lists them, and that door asks between NPCs still go out. A cargo post is the room with the counter window (MAP-06): on DeltaStation, IceBox and Tramstation it is now the Cargo Office, and crates are hauled there (not checked). An engineer's engine reading is empty until its PDA is first used (CHEAT-14).

Security:
- API-01, MULTI-08: pda.log "trespass" only after "out you go", a 10 s wait, a "took hold of" and a broken hold in game.log.
- ARR-02, PLAY-14: game.log "is here on a warrant." and "I am here on a warrant."; no "took hold of <officer> to walk them out of" while it serves a warrant; a wanted keeper who walks the officer out gets 5 more minutes.
- ARR-03: an officer hit by a head of staff with no warrant walks to its post; no baton.
- ARR-04: "served their time with you in the brig" and "Joan, X is free." after a no-cell wait.
- ARR-08: a STOP on an attacker breaks in on an arrest under way.
- CHEAT-04: a player who stood for a quiet arrest is put in the cell with no ", still in cuffs".
- DESK-05: with no Head of Security, each officer serves its own warrants and sends the other nothing.
- KNA-05: game.log "dropped ... to draw its cuffs."
- SEC-07: "cannot get its cuffs off by itself after 3 tries"; pda.log or say "I am in handcuffs and cannot get them off"; a head passing it on to security; an officer's free on that name.
- SECT-10: "Captain, noted." (once a minute at most) after PDA talk to security that is no order; never after "Did you send".
- SENSE-08: "they are the Captain: I know their face" for a Captain with no card.
- CORE-03: game.log "lost sight of ... walking to where they were last seen", "lost sight of X near".

Cargo and heads:
- QM-08: pda.log "Captain, is that order"; nothing done until the Captain names one.
- CARGO-02, KNB-15: a technician's word to a Quartermaster it cannot find goes by PDA about 10 minutes later.
- QM-02: pda.log "has order N come in?".
- QM-05: game.log "opened ... to let <technician> out of" from the Quartermaster.
- CARGO-05: "Four is the most I can order at once."
- CARGO-08: "I will bring them out one after another." and each crate released.
- SUP-17: game.log "was taken out of cargo by"; pda.log "has taken crate #".
- SECT-08: pda.log "Did you send", then "Yes, I sent" or "No, I did not send"; the stranger stays or is put out accordingly.
- PLAY-10: a call-a-janitor order only from an imperative or a line naming the NPC; the janitor sent is let in with no mess seen.
- KNB-01: game.log "goes to press Warehouse Shutters Control", "pressed ... to open/shut the shutters of Warehouse".
- HEAD-10: "Staff meeting in the Head of Personnel's Office" where no meeting room is on the deck; staff shut out of a command-locked office report by PDA.
- ENG-01: pda.log "switch the emitters off myself".
- TRC-04: two "could not work the X (unreached)" runs about 5 minutes apart, then the engine lit.

Janitor and others:
- KNB-08: a second call to a room it closed gets the same words back and no walk, until its tool changes.
- DESK-03: crew_brain.log "to wet it before you set off for the mess in".
- DESK-10: game.log "put away its soap to free a hand".
- DRV-07: a second "knocking at the door" about 2 minutes after the first, for a body shut in with nobody coming.
- DRV-12: no `explore()` while a step is held back, except from a shut-in body.
- MEM-11: pda.log "I could not get to the" / "I could not collect crate" when asked-for work is given up.
- CHEAT-14: an engineer's reading empty until its PDA is used; no false integrity alarm.
