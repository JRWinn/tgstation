---
id: SEC-16
title: The name sent with free is written into game.log and back to the brain as it came, with no length cap and no line breaks taken out
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: security
files: code/modules/llm_crew/crew_npc_security.dm:1279, code/modules/llm_crew/crew_npc_security.dm:1304, code/modules/llm_crew/crew_npc_security.dm:1340, code/modules/llm_crew/crew_npc_security.dm:1314, code/modules/llm_crew/crew_npc_cargo.dm:371
fix: In tool_free, cut person_name down the way tool_order cuts for_name (the not_a_name regex and MAX_NAME_LEN) before it is matched, stored or logged
---

## What is wrong

`crew_npc_tools.dm` says it at the top: "Tool calls come from a player's client, so every part of them is untrusted." Other tools that take a name clean it first: `tool_order` replaces anything that is not a name character and cuts it to `MAX_NAME_LEN` (`crew_npc_cargo.dm:371`); `tool_message` takes the line breaks out of its text and caps it.

`tool_free` takes `person_name` with only `trim` and `LOWER_TEXT` for matching, and then uses the raw string three ways:

- as `errand_item`, which `set_free` writes into `game.log` when nobody of that name is found in the cell: "stopped the timer of Cell 1 to let [freed] out." (`freed` is still the raw `person_name` in that case);
- in the answer to the brain: "Nothing is holding [person_name] that you know of.";
- in the details, `"freed" = person_name`, which the window matches against its own lists.

The name comes from the window, which takes it from a warrant or a pardon that a player typed into a PDA. The window's reader keeps it short today, so in practice the string is a few words. But nothing on the server holds it to that: a line break in it splits a `game.log` line, which is what the owner greps after every round, and a long one is written out in full.

## Where

`code/modules/llm_crew/crew_npc_security.dm:1279`, `tool_free`:

    var/wanted = istext(person_name) ? LOWER_TEXT(trim(person_name)) : null
    ...
            jail_cell = cell
            start_errand(timer, CREW_TOOL_FREE, person_name)
    ...
    action_result(CREW_TOOL_FREE, TRUE, "Nothing is holding [person_name] that you know of.", list("freed" = person_name, "nothing" = TRUE))

`:1340`, `set_free`, where `freed` is the raw name unless someone of that name was found in the cell:

    var/freed = errand_item
    ...
    log_game("Crew NPC [key_name(body)] (owner: [brain_link?.owner_ckey || "none"]) stopped the timer of [cell?.name] to let [freed] out.")

`code/modules/llm_crew/crew_npc_cargo.dm:371`, the way it is done elsewhere:

    order_for = trim(copytext_char(not_a_name.Replace(for_name, " "), 1, MAX_NAME_LEN + 1))

## How it was found

Read from the code. Not seen in a round.

## How to fix it

1. At the top of `tool_free`, after the `istext` check: `person_name = trim(copytext_char(not_a_name.Replace(person_name, " "), 1, MAX_NAME_LEN + 1))`, using the same static regex as `tool_order` (move it to a shared helper, for example `/proc/crew_npc_clean_name(text)`, and call it from both).
2. Compute `wanted` from the cleaned name. Everything after uses the cleaned name.
3. Keep `is_named`'s matching as it is; SEC-05 and ARR-17 deal with how names are matched.

## How to test the fix

- Server compile on a side copy.
- From the browser console of the brain window (or a simulator stand-in), send `free` with a name holding a line break and 200 characters. `game.log` must show one line with the name cut to `MAX_NAME_LEN`.
