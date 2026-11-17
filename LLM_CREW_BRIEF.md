# LLM Crew NPCs for /tg/station: project brief

Written 2026-11-16 as a handoff to Claude Code. It records what the project owner (Jordan) has decided, what has been set up, and the first milestone. Items marked **Proposal** are suggestions that have not been built or tested; items marked **Unproven** must be checked before anything depends on them.

## 1. Vision

Crew members controlled by LLMs that run the station and react to problems. Each player can spawn their own NPCs, shaped by a card they write, with the thinking done by an LLM running on that player's own PC so the host carries no inference load.

## 2. Decisions already made

1. **Codebase:** /tg/station, this repo.
2. **The LLM decides what to do; the server knows how to do it.** The LLM receives what its body senses and chooses its own goals. It is never handed a menu of goals to pick from.
3. **Actions are tools.** The LLM acts by calling tools with free parameters (walk to, say, use, and later job skills such as clean). The server validates each call the way it validates a human client: it rejects what the body cannot do and reports the failure back as a sensation.
4. **Senses only, no mind reading.** An NPC's prompt contains only what its own body could perceive: what it sees, what it hears nearby, its headset's radio channels, and its body state. No hidden shared data channel between NPCs. Station-wide awareness arrives through in-game means (radio, alarms, PDA).
5. **Client-hosted brains.** The LLM runs on the owning player's machine. The server never connects to a player's PC; the player's game client relays between the server and their local LLM. The host can run NPCs the same way, since the host is also a client.
6. **NPC cards.** Each NPC is defined by a text file on the player's PC holding persona, rules, examples and memory notes. The card is uploaded to the server at spawn so admins can review it and so a fallback brain could use it.
7. **Multiple NPCs per player** must be supported, each with its own card and its own separate context.
8. **Behavior trees are the motor layer.** They execute multi-tick actions and reflexes. They do not choose goals for LLM-driven NPCs.
9. **Fallback.** If the owner's LLM is missing, slow or disconnected, the NPC keeps running on default behavior without personality.

## 3. Environment

| Item | Value |
|---|---|
| Machine | Windows, user `Zimfi`, GPU RTX 4070 Ti (12 GB VRAM) |
| Repo | `C:\Users\Zimfi\source\repos\tgstation` (shallow clone, `--depth 1`, of tgstation/tgstation master) |
| BYOND | 516, updated 2026-11-16 to meet the repo minimum of 516.1659 (`dependencies.sh` pins 516.1685) |
| Build | `BUILD.cmd` in the repo root |
| Build and host | `bin\server.cmd`: builds, then runs Dream Daemon on port 1337 with `-trusted` |
| Helper scripts | `..\start-ss13-server.cmd` (wraps `bin\server.cmd`), `..\join-ss13.cmd` (opens `byond://127.0.0.1:1337`) |
| Admin | `ENABLE_LOCALHOST_RANK` is on in `config/config.txt`, so a localhost client gets near-full admin |
| Round logs | `data/logs/<yyyy>/<mm>/<dd>/round-*/` (`runtime.log`, `game.log`) |
| Local LLM | Ollama, model `qwen3.5:9b`, serving at `http://localhost:11434`. Confirmed answering a test prompt. |

No git branch has been created yet. Create one (suggested name `crew-npc`) before changing anything.

## 4. Codebase orientation

Found by reading the repo on 2026-11-16. Verify before relying on details.

- **AI framework:** `code/datums/ai/`. Read `learn_ai.md` first. Trees are authored as `.bt.json` files next to a `.dm` file that declares the node type, and are compiled during the build (the `behavior-tree-compiler` step). There is an in-game Behavior Tree Viewer (`code/datums/ai/bt_viewer.dm`, tgui `BehaviorTreeViewer`).
- **Closest existing example:** monkeys. `code/datums/ai/monkey/monkey_controller.dm` and `monkey.bt.json`. Monkeys are carbon mobs, the same family as humans.
- **Reusable pieces:** leaves in `code/datums/ai/generic_behaviors/` (`move_to_target`, `random_walk`, `speech`, `pick_up`, `use_on_object`, `wait`), subtrees in `generic_subtrees/`, decorators in `generic_decorators/`.
- **Pathfinding:** `code/datums/ai/movement/ai_movement_navmap_astar.dm`. It passes `controller.get_access()` into pathing, so routes respect the pawn's ID access.
- **Attaching a controller:** atoms have an `ai_controller` var (`code/game/atom/_atom.dm`). Admins can change a mob's controller through View Variables (`code/game/atom/atom_vv.dm`).
- **Hearing:** `/atom/movable/proc/Hear(...)` in `code/game/say.dm`, and the signal `COMSIG_MOVABLE_HEAR`.
- **Outbound HTTP from the server:** `/datum/http_request` in `code/datums/http.dm`. Only relevant if a host-side fallback brain is built later.
- **Client UI:** tgui, source in `tgui/packages/tgui/interfaces/`. Server-to-window and window-to-server messaging goes through `code/modules/tgui/`.
- **Precedent for a client window reaching local software:** the chat panel has a websocket client option (`tgui/packages/tgui-panel/websocket/helpers.ts`) that connects to an address such as `localhost:4242`.
- **Admin verbs:** declared with the `ADMIN_VERB(...)` macro, for example in `code/modules/admin/verbs/server.dm`.
- **Janitor job and outfit:** `code/modules/jobs/job_types/janitor.dm` (`/datum/job/janitor`, `/datum/outfit/job/janitor`).

## 5. Architecture

One decision cycle for one NPC:

1. Something relevant happens to the NPC's body (a sense event), or its current action finishes or fails.
2. The server sends the sense event to the owning player's client over tgui.
3. The brain window on that client combines the event with the NPC's card, notes and recent history, and calls the player's local Ollama.
4. The LLM replies with tool calls.
5. The brain window sends the tool calls back to the server over tgui.
6. The server validates each call against what the body can do, executes it through the behavior tree and skills, and feeds results back as new sense events.

The LLM is interrupt-driven. Between events the body carries on with its current action or default behavior, and no LLM calls are made.

**Unproven:** step 3. It is not confirmed that a tgui window (WebView2 on BYOND 516) can call `http://localhost:11434` directly. Ollama may reject the window's origin unless the player sets `OLLAMA_ORIGINS`. Test this first. If it cannot work, the fallback is a small local relay program on the player's PC that the window reaches by websocket, following the chat panel precedent.

## 6. Milestone 1: hello-world janitor

**Behavior wanted:** it wanders. When it meets someone new, it greets them and introduces itself. If spoken to, it answers.

**Server side (Proposal)**

| Piece | Notes |
|---|---|
| Human NPC with a new controller | Janitor outfit; default behavior is wandering |
| Tool `walk_to(person)` | Wraps the existing move-to-target behavior |
| Tool `say(text)` | Wraps existing speech; enforce a length limit |
| Sense event: person in view | Name, job as visible, distance; sent when someone newly enters view |
| Sense event: speech heard | Speaker and text, from the hearing hook |
| Speech cooldown | Required from the start so two NPCs do not greet each other forever |
| Admin-only spawn | A verb or button; player-facing spawning comes later |

**Brain window (Proposal)**

- LLM connection status.
- A list of active NPCs showing the last sense event, the decision and the reply.
- Tool `remember(note)`, handled in the window: appends to the NPC's notes, which are included in every prompt.
- A hardcoded test card for now; the card file format comes later.

**Build order**

1. Body spawns and wanders, with no LLM involved.
2. Sense events appear as text in the window.
3. The window calls Ollama and the NPC greets a new person. This step contains the unproven link.
4. The NPC answers when spoken to.

**Acceptance checks**

- Spawned janitor walks around without runtime errors in `runtime.log`.
- Walking a player character into view produces one greeting that includes the NPC's name.
- Meeting the same character again does not produce a second introduction.
- Saying something nearby produces a relevant reply within a few seconds.
- Two NPCs left together do not chat endlessly.
- Closing the brain window leaves the NPC wandering silently, with no errors.

## 7. Known risks and constraints

- **Untrusted input, both directions.** Everything from a client is untrusted: validate tool names, parameters and rates server-side. Everything an NPC hears is untrusted too; a player may try to talk it into things. Tools and ID access must bound the damage.
- **One GPU serves requests one at a time.** NPCs take turns on a player's machine. Keep prompts short and wake the LLM only on meaningful events.
- **Thinking mode.** `qwen3.5:9b` supports a thinking mode, which adds latency. Whether to disable it for NPC decisions has not been tested.
- **Small-model failure modes.** Expect loops, wandering and references to things that are not there. Sense events should give each visible thing a handle the LLM can point at, and an NPC needs a fallback when it is stuck.
- **Same-owner NPCs.** One player's NPCs all run on that player's machine. Keep their contexts separate in the window; a determined owner could still merge them, which is a server-rules matter.
- **Upstream merges.** Keep new code in its own files and folders where possible, and touch existing files as little as possible.

## 8. Not in milestone 1

Job skills such as cleaning, the NPC card file format and upload, memory saved between rounds, player-facing spawn UI and per-player limits, host-side fallback brain, radio and PDA senses, card-defined recipes built from basic verbs.

## 9. How Jordan wants the work run

- Small, verifiable steps. Build, run and check each one before the next.
- He tests in-game and reports what he sees; read the round logs yourself.
- Ask before making a design decision that this brief does not cover.
