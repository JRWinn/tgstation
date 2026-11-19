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

## Found in play, round-15.44.36 (2026-11-19)

New faults are PLAY-01 to PLAY-13. Known faults seen in play for the first time: TRB-07 (prisoner let go when the cuffs come off in the cell), SENSE-03 (Pun Pun as a gorilla is never seen, so his warrant cannot be served), GAP-24 (the Captain's PDA to the Quartermaster gets no answer), ENG-02 (the emitters lost power and the engine was reported lit), HEAD-08 (a crate credited to the wrong janitor), MULTI-07 and JOBS-05 (a late "still waiting" sends a second janitor), DRV-08 (no step for 15 s after stepping aside), PARSE-04 (a refusal with "step aside" in it read as an ask).

Fixes seen working: DRV-03, TRUST-06 (the Captain's half), KNB-04 step 7 (failed once, see PLAY-05), SUP-01, KNB-08, CHEAT-01 (bodies stop at people). Not set up in that round: ASYNC-08, MEM-05, ARR-02, SEC-05, SEC-01, CARGO-06, KNB-06, TRC-01, TRUST-11, a head's warrant on a head.
