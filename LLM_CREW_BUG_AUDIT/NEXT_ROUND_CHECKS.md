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
