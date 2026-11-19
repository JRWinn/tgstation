---
id: CHK-03
title: The crew's behaviour tree is read from a compiled copy on disk that the side compile does not rebuild and that cannot be checked on this machine
kind: gap
severity: low
effort: small
confidence: sure
status: found
area: tools
files: code/modules/llm_crew/crew_npc.bt.json:1, build/behavior_trees/code/modules/llm_crew/crew_npc.bt.compiled.json:1, code/datums/ai/_ai_controller.dm:266, tools/build_bt.py:310, code/modules/llm_crew/_defines.dm:13
fix: Add the tree check to the list of checks, with a command that works under Python 3.11, and mend the comment that says which defines the tree compiler reads
---

## What is wrong

**Today the two files are in step.** The source tree `code/modules/llm_crew/crew_npc.bt.json` was compiled in memory with the repo's own compiler and the result is byte for byte the committed `build/behavior_trees/code/modules/llm_crew/crew_npc.bt.compiled.json`. This finding is about how easily that stops being true without anyone seeing it.

1. The server does not read `crew_npc.bt.json`. When a crew body's controller is made, it reads the **compiled** copy from disk, at run time. The DM compiler has no part in it.
2. The compiled copy is only written by `tools/build_bt.py`, which the normal build runs as a step before the DM compile (`BehaviorTreeCompilerTarget` in `tools/build/build.ts:178`). The check this project uses instead of the normal build, so as not to disturb a running round ("Server compile, without touching a running game" in the audit README and in every change log entry: `cp tgstation.dme tgstation_check.dme`, then `dm.exe -DCBT`), does not run it. So a session that edits the tree, runs the side compile, sees "0 errors, 0 warnings" and commits has tested nothing about the tree, and can commit a source tree with a stale compiled copy beside it.
3. The compiled copy is a tracked file. If it is committed stale, the stale tree is what plays for anyone who starts the server without the full build, and nothing warns: an old tree is as loadable as a new one. If it is missing, `initialize_behavior_tree` logs one stack trace and returns, and every crew body stands still for the round with no tree at all.
4. The repo's own check for this, `tools/build_bt.py --check`, **crashes on this machine**: it calls `Path.read_text(newline='')`, which Python only has from 3.13, and both Pythons here (the one on PATH and `tools/bootstrap/.cache/python-3.11.0`) are 3.11. Upstream CI installs "3.x" and is fine. Here the command dies before it compares anything, so "run the check" is not an option until that is known.
5. The tree repeats values by hand that are defines in `code/modules/llm_crew/_defines.dm`: the three blackboard keys as strings, and `"time_limit": "3 MINUTES"` for what DM calls `CREW_NPC_TRAVEL_TIMEOUT`. The comment that explains why is wrong: it says "the tree compiler only reads defines from code/__DEFINES". `parse_defines` in `tools/build_bt.py` walks all of `code/` (`defines_dir = repo_root / 'code'`, then `rglob('*.dm')`), and it does resolve `CREW_NPC_TRAVEL_TIMEOUT` to 1800 and `BB_CREW_NPC_WALK_TARGET` to its string. What is true is narrower: the *build* only reruns the tree compiler when a file under `code/__DEFINES/` changes (the `inputs` of `BehaviorTreeCompilerTarget`), so a define outside that folder would be read, but a later change to it would not trigger a rebuild. The hand-written strings are therefore the safer choice, but nothing checks them against the defines: change `CREW_NPC_TRAVEL_TIMEOUT` or rename a blackboard key in `_defines.dm` and the tree silently keeps the old value, and a tree branch guarded by a key the DM code no longer sets never runs.

The concrete case: a later fix changes the errand walk's time limit by editing `CREW_NPC_TRAVEL_TIMEOUT` in `_defines.dm` (the natural place), runs the side compile, and plays. `start_walk` calls that pass the define use the new time. The errand branch of the tree still gives up at `"3 MINUTES"`. Nothing fails; errands just time out at a different moment from walks.

## Where

`code/datums/ai/_ai_controller.dm:266`, in `initialize_behavior_tree`:

    var/compiled_path = BT_COMPILED_PATH(behavior_tree_json) //Find the compiled version of this BT
    var/datum/bt_node/root = load_tree_from_json(compiled_path)
    if(isnull(root))
        stack_trace("[type] failed to load behavior tree from compiled JSON: [compiled_path]")
        return

`tools/build_bt.py:310`:

    existing = compiled_path.read_text(encoding='utf-8', newline='') if compiled_path.exists() else ''

`code/modules/llm_crew/_defines.dm:13`:

    /// crew_npc.bt.json uses this string directly, because the tree compiler only reads defines from code/__DEFINES.
    #define BB_CREW_NPC_WALK_TARGET "BB_crew_npc_walk_target"

`code/modules/llm_crew/crew_npc.bt.json`, the errand walk:

    "target_key": "BB_crew_npc_errand_target",
    "required_dist": 1,
    "time_limit": "3 MINUTES",

## How it was found

Checks that were run at commit `b4284e5fe54`:

- `tools/bootstrap/.cache/python-3.11.0/python.exe -B tools/build_bt.py --check` printed "Resolved 18427 defines", "Found 345 .bt.json source files", then `TypeError: Path.read_text() got an unexpected keyword argument 'newline'`.
- A throwaway script outside the repo that imports `build_bt`, calls `parse_defines` and `compile_node` on the crew tree and compares the text with the committed compiled file printed `same`. It also printed `CREW_NPC_TRAVEL_TIMEOUT 1800` and `BB_CREW_NPC_WALK_TARGET 'BB_crew_npc_walk_target'`, which is what shows the compiler reads defines outside `code/__DEFINES`.

No server was started. The stale and missing cases are read from the code.

## How to fix it

1. Add the tree to "How to check your work" (audit README, and wherever the side compile is described): after any change to `crew_npc.bt.json`, or to a define the tree repeats, run `tools/bootstrap/python tools/build_bt.py` (write mode, which works under 3.11: `write_text` has had `newline` since 3.10) and commit the compiled file with the source. Say that the side compile does not do this.
2. Mend the comment at `_defines.dm:13` to say what is true: the compiler would read the define, but the build only watches `code/__DEFINES` for changes, so the strings are written out by hand and must be kept the same as the defines.
3. Optional, and it is base tooling so the owner may prefer to leave it: in `tools/build_bt.py:310` read with `compiled_path.read_bytes().decode('utf-8')`, which gives the same text on every Python and makes `--check` usable here.
4. Optional: have the crew controller say so plainly when its tree did not load (a `log_game` line and an admin message from `/datum/ai_controller/crew_npc` once `behavior_nodes` is still empty after `initialize_behavior_tree`), so a missing compiled file is one clear line and not eleven bodies standing still.

## How to test the fix

- After step 1, change `"time_limit": "3 MINUTES"` to `"4 MINUTES"` in a scratch copy of the checkout, run the write command, and see `"time_limit":2400` in the compiled file. Put it back.
- After step 3, `tools/bootstrap/python tools/build_bt.py --check` prints "All generated BT files are up to date." and exits 0.
- The side compile still gives 0 errors and 0 warnings.
