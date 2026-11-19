# What to look for in the next round

One line for each fix on the branch `crew-bug-fixes`: the finding, and what to grep for in that round's logs (`data/logs/YYYY/MM/DD/round-HH.MM.SS/`).

- ASYNC-06: press Home with the Crew Brain and another window open; the other closes and the Crew Brain stays. `game.log` has "Crew Brain window of" "closed" only when the window really closed.
- API-01: each "trespass" warrant in `pda.log` follows a "took hold of [person] to walk them out of" line in `game.log` for the same person; one with none before it is still the fault.
