# Crew NPC plan: no cheats, and three faults from the round of 2026-11-18

Written 2026-11-18. **Planning only: nothing here is built.** Items marked **Decided** are the project owner's. Items marked **Proposed** are mine and want a yes or no. Items marked **Unknown** must be settled before anything depends on them.

**Do not start until the project owner says it is this plan's turn.** Another session was building the Quartermaster when this was written, with uncommitted changes in `crew_npc_cargo.dm`, `crew_npc_hands.dm`, `crew_npc_tools.dm`, `_defines.dm`, `cargo.ts`, `janitor.ts`, `driver.ts`, `brain.ts`, `types.ts`, `prompt.ts` and `tools/llm_crew/sim.ts`. This plan touches most of those. The first step is a simulator run on their commit, before anything is changed.

Line numbers below are from the working tree on 2026-11-18 and will have moved.

## 1. What was decided

- **Decided:** crew NPCs do not cheat. "No cheats. Fix all that."
- **Decided:** janitors may carry water in any of three ways: the mop alone, a hand bucket, or the janitorial cart.
- **Decided:** what a body needs it finds, and if there is none to find it is ordered from cargo by the usual method.
- **Decided:** the three faults found in the round are to be fixed as suggested: the mail chute, the dropped order, and the janitor call.

## 2. What the round showed

Round `data/logs/2026/11/18/round-00.56.30`, MetaStation. Times are the station clock the NPCs saw.

- **1:02 to 1:05, the mail chute.** Both technicians set out to look in on the Delivery Office and were flushed through the mail pipes to the Service Hallway, which is locked to them. Sam went twice, Maria once.
  - A slippery oil pool is mapped at (77,140), one step inside the Delivery Office door.
  - A delivery chute at (77,137) takes in anything that bumps it from the north.
  - The pipe lets out at (141,116) in the Service Hallway.
  - Three runtime errors at those moments: `look_around` ran with the body inside a pipe, where its z-level is 0.
- **1:00:58, the dropped order.** The Head of Personnel asked Maria for a crate of janitorial supplies while a janitor was knocking. Maria said "I am placing that order now". Nothing was placed.
- **1:05, "have you called anyone?"** Maria had sent for a janitor four times. Sam's work list did not say so, and Sam told the Captain "not yet".
- **1:02:06, "I am done in the Cargo Bay".** The janitor's mop had run dry after two messes. The mess was still there.

## 3. What the game gives us

### Slipping

- A body runs unless it is told to walk, the same as a player.
- Slippery oil and floors wet with water do not slip someone who is walking. Some other kinds, such as lube, slip a walker too.
- A delivery chute takes in a person who bumps it from its open side. Nothing else about it is unusual.

### Water

| Thing | Holds | How water gets in | How it wets a mop |
|---|---|---|---|
| Mop | 15 units, 1 used per mess | see the right-hand column | — |
| Sink | its own small tank, refilling at half a unit a second; it can run dry | by itself | 5 units a click |
| Hand bucket | 70 units | 20 units a click at a sink or water tank | 5 units a click |
| Mop bucket | 100 units | poured in from a bucket | one right-click fills the mop |
| Janitorial cart | 250 units, starts empty | poured in from a bucket; not at a sink | one right-click fills the mop |

- On MetaStation the Custodial Closet has one sink, one water tank beside the cart, one cart, one hand bucket and one loose mop.
- The Janitorial Supplies crate (400 credits) holds three buckets and a mop among other things. Cargo NPCs can order it today.
- The Janitorial Cart and Galoshes crate (800 credits) holds a cart. Cargo NPCs cannot order it today: `orderable_crates` in `crew_npc_cargo.dm` lists only janitorial supplies and replacement lights.
- A body carries things only in its two hands. Pulling something takes no hand.

### Galoshes

- The janitor wardrobe vendor in the Custodial Closet stocks two pairs. NPCs cannot use vendors.
- No locker on MetaStation that a janitor can reach holds a pair.

### Crates

- Opening a crate drops everything in it onto the crate's own tile. Closing it takes back whatever is on that tile.
- **Unknown:** whether an open crate can be pulled one tile aside and closed there empty. To be tried in the game.

### The supply shuttle

- The supply console has one "send" control. With the shuttle at the station it sends it away; with the shuttle away it calls it back. Whoever presses it must be at the console.
- The console refuses if someone is aboard or the cargo is not allowed. On calling it back it prints a requisition form.
- That code sits inside the console's window handler (`orderconsole.dm`, the `"send"` branch), where a body cannot reach it.

### Doors

- Someone with access opens an airlock by clicking it or walking into it.
- It shuts by itself 8 seconds later. It will not shut on someone standing in the doorway.
- Someone with access can click an open airlock to shut it.

### What the crew code does today

| Cheat | Where | What it does |
|---|---|---|
| Water | `wet_mop`, `crew_npc_cleaning.dm` | Clicks the sink once (5 units), then adds the other 10 straight into the mop. |
| Galoshes | `crew_npc_spawn.dm` | Deletes a janitor's shoes at spawn and creates galoshes on it. |
| Unpacking | `tip_out`, `crew_npc_cargo.dm` | Moves a crate's contents by code onto the tiles round it. |
| Shuttle | `supply_run_step`, `crew_npc_cargo.dm` | A timer sends the shuttle out and calls it home, wherever the body is. |
| Shuttle | `send_shuttle_back`, `crew_npc_freight.dm` | Walks to the console first, then calls the shuttle system and not the console. |
| Door | `hold_door_for`, `crew_npc_doors.dm` | Walks to the door and checks access, then opens it by code and switches its auto-close off. |

Checked and honest: placing an order (`console.add_item` with the body as the user), handing over items and mail, picking up, pulling, opening storage.

## 4. How it would work

### The rule

- **Proposed:** a body acts honestly when all three hold:
  1. it is standing where a player would have to stand;
  2. it goes through the same code a player's click or key press reaches, with the body as the user, so the game's own checks, limits and costs apply;
  3. crew code creates nothing, fills nothing, moves nothing and switches nothing by itself.
- **Proposed:** deciding is not cheating. Which mess is next, when to call a janitor, what a line of speech must contain: that stays code.
- **Proposed:** the rule goes at the top of `LLM_CREW_BRIEF.md`.

### 4.1 Slippery floors and the mail chute

- **Proposed:** a body walks for any step onto a tile that would slip a runner, and runs again once it is off. This is a player pressing the walk key.
- **Proposed:** where a way round the tile costs only a few steps, the route takes it. Where there is none, the body walks across.
- **Proposed:** nothing special is done about chutes. A body that does not slide is not thrown into one.
- **Proposed:** a body that is not standing on a floor tile (in a pipe, a locker, a crate) senses nothing and plans nothing until it is out. This ends the runtime errors.
- **Proposed:** when it comes out, its event list says so: "You were carried through the disposal pipes and came out in the Service Hallway." The round's log then shows it in plain words.
- **Status, 2026-11-18:** built the same night the Quartermaster was posted through the chute (`round-01.53.17`), compiled and not played. Built: walking wherever the next step may be onto a slippery tile, unless its shoes grip (`mind_its_step` in `crew_npc_senses.dm`); sensing nothing while not on a floor; and the line on coming out, in the event list and in `game.log`. Not built: the route taking a way round.

### 4.2 An order asked for while the tool is withheld

- The order tool is withheld from the LLM while someone wants a door, or has come to collect a crate (`offers` in `cargo.ts`, about line 1344). The plain-words fallback (`hears`) uses the same test, so an ask in that window is lost.
- **Proposed:** an ask from the Captain or a head that passes the supply-words test in that window is kept by code: who asked, their words, and when.
- **Proposed:** while it is kept, the LLM is told the truth: "Hedley Bowchiew has asked you for an order. You have not placed it: you are seeing to the door first, and will place it after." It is not told that its body places orders.
- **Proposed:** when the door or the collection is done, the body places the order from the kept words, by the same code that reads kinds and counts today, and says a fixed line: "Hedley, your order is in: 1 Janitorial Supplies."
- **Proposed:** a kept ask lapses after three minutes, or as soon as an order is placed for the same person.
- **Unknown:** how much of this path is left once the Quartermaster is in. Its header says orders reach it by PDA and are read by code, which cannot be dropped this way. The path above is still used when no Quartermaster is aboard. To be re-read on their commit.

### 4.3 The janitor call, and "I am done"

- **Proposed:** when a workmate has sent for a janitor, the second technician's work list says so: "There is a mess in the Cargo Bay. Maria Williams has sent for Ysabel Harrold. If nobody has come in a while, you will call one." Today it reads as if nobody had been called (`tidyStep` in `cargo.ts`, about line 933).
- **Proposed:** the server sends who called whom, in place of today's yes or no (`workmate_called`).
- **Proposed:** a janitor asking to be let out says why, from what is true:
  - mess gone: "I am done in the Cargo Bay..."
  - out of water: "My mop has run dry. Could you let me out of the Cargo Bay to the Fore Port Maintenance, please? I will be back."
  - cannot shift it: as today.
- **Proposed:** a janitor who left for water is still expected. The door is opened for it again without a second call.

### 4.4 Water

- **Proposed:** wetting is honest. The body clicks the sink until the mop is full or the sink is dry. The top-up in `wet_mop` is removed.
- **Proposed:** a dry sink is something it is told ("The sink has run dry"). It waits a little, or goes to another sink or tank it knows.
- **Proposed:** a janitor uses the best water carrier it can find, in this order: a cart nobody has, then a hand bucket, then the mop alone.
- **Proposed:** it finds one the way it finds a mop today: what it has seen, then where the cleaning gear is kept.
- **Proposed:** a cart is one janitor's. A cart someone is pulling is taken, the same rule as a crate someone is going for.
- **Proposed:** filling:
  - bucket: at a sink or water tank, a click at a time, until full;
  - cart: bucket filled at the tank and poured into the cart, until the cart is full or the tank is empty.
- **Proposed:** using it: when the mop is dry and the carrier has water, the mop is wetted from the carrier. When the carrier is empty, the janitor goes to refill it.
- **Proposed:** the bucket is carried in the other hand. The cart is pulled, which leaves both hands free.
- **Proposed:** being short of something to carry water in is a need, told to its head like "something to clean with", with two differences: it does not stop the janitor cleaning, and it waits for the next staff meeting unless the head is in view.
- **Proposed:** the head orders Janitorial Supplies for it. One crate holds three buckets, enough for three janitors.
- **Proposed:** the server sends each janitor what water it has: in the mop, in the bucket, in the cart.

### 4.5 Galoshes

- **Proposed:** nothing is swapped at spawn. A janitor starts in the shoes its job gives it.
- **Proposed:** it does not slip on its own wet floor, because it walks across wet tiles (4.1).
- **Proposed:** wearing a pair it finds or is sent is left for later. It needs an action to change shoes, which no body has.

### 4.6 Unpacking a crate

- **Proposed:** unpacking is opening the crate, by the same code a click reaches. Everything lands on the crate's own tile, as the game does it.
- **Proposed:** the body then pulls the open crate one tile clear, shuts it, and takes it back to cargo empty.
- **Proposed:** nothing is spread over the tiles round it by code. Whoever the things are for picks them up from the one tile.
- If the **Unknown** in section 3 goes the wrong way, the body takes the things out by hand, one at a time, before it shuts the crate.

### 4.7 The supply shuttle

- **Proposed:** one honest action: press send at a supply console. The body walks to the console, and the console's own send code runs with the body as the user.
- **Proposed:** to allow that, the console's send code is lifted out of its window handler into a proc of its own, called from both. Nothing changes for players. This is the one change to a game file outside the crew code.
- **Proposed:** an order then runs like this:
  1. place the order at the console (as today);
  2. press send: the shuttle leaves;
  3. go back to work;
  4. after the trip time, which any technician knows, go to the console and press send again: the shuttle is called home;
  5. see it dock from the bay (as today).
- **Proposed:** the timer that moves the shuttle is removed. If the technician is held up, the shuttle waits at the far end. A workmate at the post may press in its place.
- **Proposed:** sending the shuttle back with the empties uses the same action.

### 4.8 Holding a door

- **Proposed:** the body opens the door by the code a click reaches, standing beside it. The door's auto-close is left alone.
- **Proposed:** it stays beside the door, out of the doorway. If the door shuts before the person is through, it opens it again, for as long as it holds doors today.
- **Proposed:** once they are through it clicks the door shut, so that nobody walks in behind them.

### 4.9 Finding any others

- My search for cheats was by pattern, not by reading. **Proposed:** one pass through every tool proc in `code/modules/llm_crew/`, top to bottom, against the rule. What turns up is listed for the project owner before it is touched.
- **Proposed:** a small check script in `tools/llm_crew/` that fails when crew code contains a call from a short list (adding reagents, moving by `forceMove`, creating items, calling the shuttle system) outside a short allowed list. It is run with the simulator.

## 5. What has to be built

In the order I would build it. Each step can be checked before the next.

1. **Simulator run** on the other session's commit, with nothing changed.
2. **Server: walking on slippery tiles, and no sensing off the floor.** The smallest change with the largest effect: it ends the trips to the Service Hallway.
3. **Brain: wording.** The workmate's call on the work list, and the three let-out messages. Text and one server field.
4. **Brain: the kept order.** After re-reading the Quartermaster's commit.
5. **Server: the honest door.**
6. **Server and brain: the honest shuttle.** The console proc, the send action, and the order run in five steps.
7. **Server: the honest unpack.** After trying the open crate in the game.
8. **Server: no galoshes at spawn.** Only after step 2 is seen working in a round.
9. **Water, in four parts:** honest wetting at the sink; the bucket; the cart; the need and the order.
10. **The read-through and the check script.**
11. **Simulator scenarios:**
    - a technician walks in and out of the Delivery Office;
    - a head orders while someone is knocking, and the order is placed after;
    - the second technician says who was called;
    - a janitor runs dry in a locked room, leaves, comes back and is let in;
    - a janitor with a bucket, with a cart, with neither and none to find;
    - the sink runs dry with three janitors;
    - an order runs with the technician held up between the two presses;
    - a door shuts before the person is through.
12. **The voice.** Cases against the real model: an order asked for at the door, and "have you called anyone?".
13. **A round**, watched, with the log read afterwards.

Rough size: larger than the light replacer. Water and the shuttle are most of it. Steps 2 and 3 are an hour's work and worth doing first by themselves.

## 6. Settled questions

All eleven were put to the project owner with a suggestion, and all eleven suggestions were accepted on 2026-11-18 ("I do"). They are **Decided**.

The items in section 4 marked **Proposed** have not been gone through one by one. They were in front of the project owner when the eleven were accepted, and none was objected to.

| Question | Decided |
|---|---|
| Is the three-part rule in section 4 the right meaning of "no cheats"? | Yes. |
| Walk across slippery tiles, or always go round? | Go round when it costs little, walk across when it does not. |
| Is walking enough in place of galoshes? | Yes for now. Vendors and changing shoes are a plan of their own. |
| Which water carrier comes first? | A free cart, then a bucket, then the mop alone. |
| Should cargo be able to order the cart crate (800 credits)? | Yes, added to what it can order. Under the Quartermaster plan it is under the big-purchase line. |
| Does a janitor stop cleaning to ask for a bucket? | No. It asks at the next meeting, or when its head is in view. |
| The light replacer holds a box of lights in one hand. Bucket or box? | The box. The light replacer wets its mop at a sink, or pulls the cart. |
| How full is a cart filled? | Full, or until the tank is empty. |
| Where does a technician wait between the two presses? | It goes back to work and returns to the console. |
| Unpacked things all on one tile? | Yes. That is what the game does. |
| A check script that fails on new cheats? | Yes. |

## 7. Not in this plan

- Vendors, and changing shoes or clothes.
- Lube, ice and other floors that slip a walker.
- The Quartermaster. This plan is written to fit round it.
- Seen in the same round and not looked into:
  - the janitor's chosen door into the Delivery Office was the one from the Security Post, which is locked to it (`walk failed (go_to_door, to the door into Delivery Office)`, twice);
  - the janitor walked to the Cargo Bay door at 1:03:04 and did not knock before going on to other doors;
  - the Cargo Bay's oil pools went from two to five while it was being cleaned;
  - several walks to the Corporate Showroom, Kitchen and Medbay Central found no way through.
