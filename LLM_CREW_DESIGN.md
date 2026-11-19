# LLM Crew NPCs: design

Written 2026-11-19 from the brief, the plans, the change log, the bug audit, the owner's decisions and the code as merged to `master` (commit 3e1419ed). It describes the idea: the parts, how they fit and the rules they keep. It is not a spec. For what changed last and how far it was tested, read the top of `LLM_CREW_CHANGELOG.md`; for detail, read the plans.

Status words used below:

- **Played**: built and seen working in at least one played round.
- **Simulated**: built, type checked, compiled and run in the simulator, but not seen in a round. For server code this means compile-checked only.
- **Planned**: decided or proposed, not built.

---

## 1. What this is

Crew members on /tg/station who are run by a language model and who run the station with the players. Each one has a human body, a job, an ID card and a personality. They walk about, talk, do their work, ask for what they need, hold staff meetings and report to their heads. The thinking is done on the owning player's own PC, by a small local model, so the host carries no inference load. Any player is meant to be able to spawn their own crew in time, and the aim is a whole station of them, so nothing should assume only janitors and cargo exist.

The owner plays the Captain and tests from inside the round. Much of what is described here was shaped by what went wrong in those rounds.

Below, "the owner" means the project owner. "The owning player" means whoever spawned a given NPC and runs its brain.

---

## 2. Founding principles

These are the rules the design does not break. Most were set by the owner, some after a round showed why.

**Senses only, no mind reading.** An NPC knows only what its own body could perceive: what it sees, what it hears nearby, what its PDA shows, what its ID card opens, and its body state. Station news arrives by the means a player has (today PDA and nearby speech; radio is planned). A body knows a slippery tile only if it has seen what makes it slippery, and "no PDA, no knowledge". There is meant to be no hidden channel between NPCs. Where the window shares state today (section 6), this is a known exception and an open question (section 12).

**No cheats: a body acts only as a player could.** Three tests:

1. It stands where a player would have to stand.
2. It goes through the same code a player's click or key press reaches, with the body as the user, so the game's own checks, costs and timings apply.
3. Crew code creates, fills, moves or switches nothing by itself.

What a body needs it finds, or it is ordered from cargo. **Deciding in code is not cheating**; acting outside the game's rules is. Where the game only offers a UI panel, which it will not open for a body with no player, the code sends what that panel would send, after the panel's own checks. The reason for the rule: shortcuts hide the limits that make the game, such as sinks running dry and supplies having to be ordered and waited for.

A body also acts at a player's pace. It has a say cooldown, about a second between clicks, the tool's own waits and a look time to open a container. It is never slower than a player either: against a target that moves, a strike follows the step at once.

The same goes for the station's trouble. Failing power, fire doors, random events and Pun Pun are real conditions the crew must live with. The answer to them is more crew (engineering came because power failed), never code that hides them.

**Code does the work; the LLM is the voice.** How a job is done is never asked of the model. Code works out the next concrete step and the body carries it out. The model speaks for the NPC, says how something lands with its personality, and makes a few narrow choices (section 9). A slow, wrong or dead model must never stall work: every line the work needs has a plain fallback.

**Numbers and names are carried by code.** Any line that holds a number, a name, or words someone's next step depends on is said word for word. The model may add a short remark after most such lines, and the remark is dropped if it holds a number, a question or a word a listener would act on. Orders and questions that someone acts on are said bare.

**Said is not told.** Word counts as passed only once the hearer answers it ("Sam, I have that"). Without an answer the speaker walks up and says it again, then falls back to PDA.

**An example is not the scope.** When the owner describes a behaviour through one job, it is built as a rule keyed on the situation (anyone whose post is behind a locked door), not on that job.

**Decide the layer first.** Before adding a behaviour, decide whether it belongs to the person, the job, or the duties everyone shares (section 5).

**Duties and gear come from a head, not from spawn.** Nobody is handed a special duty or its tools when it appears. A head assigns the duty at a meeting, and the supplies come through cargo.

**Everything from a client is untrusted.** The server checks each tool call as it would a human's input, and the tools and ID access bound the damage. In practice: the tool must be one of a fixed list, each NPC is held to eight calls in ten seconds, job tools are refused to anyone outside the job, speech is cut to 200 characters, stripped of radio and emote prefixes and run through the word filter, and the arrest tool itself refuses the Captain.

**The prompt is a fixed budget.** A small model on one GPU serves one request at a time, and an overfull context cuts replies off silently, which looks like NPCs standing idle. Anything added to every prompt has to be paid for elsewhere.

---

## 3. The layers

The work is split between two programs and a model.

```
  SERVER (DM, code/modules/llm_crew/)            PLAYER'S PC
  ---------------------------------             ---------------------------------------
  The BODY                                      The BRAIN: Crew Brain tgui window
                                                (tgui/packages/tgui/interfaces/CrewBrain/)
  human mob + AI controller
  senses: sight, hearing, PDA,       sense      memory, feelings, tasks per NPC
          container contents,       ------->    job plans pick the next step
          knowledge                 events +    driver carries it out, paces it
  memory of places and containers   state       organisation: heads, meetings,
  tools: say, walk/go_to, pick_up,              Quartermaster
         clean, knock, open_door,    tool       |
         order, work_machine,       <-------    |  small, separate calls
         force_door, arrest...      calls,      v
  behaviour tree: motor layer       acknow-     local Ollama (small model)
  reflexes                          ledgements, voice, remarks, job choice,
  checks every call like a          log lines   last-resort reading of orders
  player's input; failures come
  back as senses
```

**The body (server).** Each crew NPC is an ordinary human mob run by an AI controller that never picks goals. A small behaviour tree carries out the action it was last given, and otherwise keeps the body wandering safely near its post. The server holds the know-how (routes by the body's own ID access, reaching, opening, hauling, working machines), senses for the body, and reports in plain words what came of each action. The brain picks from about forty named tools. The clicks a tool needs are made inside it by the server.

**The brain (client and local model).** The thinking runs in the owning player's Crew Brain window, which talks to that player's own Ollama. A player may own several NPCs. Each has its own card, its own memory and its own prompt, and none sees another's context. They share only the window and the player's one model queue. The server never contacts a model or a player's PC: the game client relays. A host who wants NPCs runs them the same way, from their own game client. The owner has decided the crew stays on the local model.

**The link.** On every update the server sends each NPC's state and its recent sense events. The window sends back tool calls, an acknowledgement of the last event it dealt with, and records for the round's `crew_brain.log`. A few fields (the full inventory, the locked-rooms list, department colours) are for the watching player and are not put into the prompt as they stand, though code plans steps from what is stowed in the bag, and those steps can name it.

**Person, job and shared duty.** Every NPC is built from three layers on one body. These are described in section 5.

---

## 4. How an NPC thinks and acts

In the brain, each job's plan lists the tasks and their next steps. The driver is the part that picks one step for each NPC, sends it to the body and paces it.

One turn of the loop:

1. **Something happens to the body**: a person comes into view, someone speaks, a PDA message arrives, an action ends. The server makes it a numbered sense event.
2. **The window takes it in.** Memory records what was seen, and code decides who a line was said to.
3. **The task list is brought up to date** from what the body senses, not from what the model claims. A mess is done when the body stands in the room and sees none.
4. **The driver picks one step**, in a fixed order: anything the job says must be done at once, getting out of the way, leaving when told, getting out when shut in, word owed to someone, the first ready task, then idling. It sends a tool call, or asks for a line to be said.
5. **If there is a reason to talk, the model is asked.** The prompt is a short fixed card plus only what this moment needs. The reply is constrained JSON built from the options on offer, so it cannot name a move that does not exist.
6. **Code checks the reply.** An action in the reply is carried out only if something said called for it, and the particulars of an order are read from the words heard, not from the model.
7. **The server checks the call** against the body's real situation. A call it cannot carry out comes back as a sense saying why, in words the body could have noticed.
8. **The result becomes a new sense**, and the loop goes round.

The model is called for talk (answering someone, greeting someone new, saying a line the work calls for, a remark in a quiet moment or after something happens), to choose between ready routine jobs, and to read an order code could not. One GPU means one queue for all of a player's NPCs, with urgent calls first.

**Reflexes run in the server body**, without asking the brain. They are "how", not "what": walk onto a known slippery tile instead of running, put down a thing that turned up in the hand unasked, take hold again of a crate that slipped. The driver also paces the body like a person (it holds still while spoken to and takes a breath between jobs), and loop guards stop it spinning on a step that keeps failing.

---

## 5. People and organisation

### The person

Every NPC is a person first. Its personality card says who it is, what wears on it and what it warms to. The cards are written to rub against each other, and any personality can hold any job. A small set of cards exists today. Each NPC keeps the same card for the whole round. They are meant to become files on the player's PC (**planned**).

**Feelings.** After anyone speaks to an NPC, the model must say whether that sat warmer, cooler or the same with this personality, and why. Code keeps the score, from -3 to +3 per person, moving one step at a time, and shows it beside the person's name in later prompts. A feeling colours speech, whether the NPC makes small talk, and how it weighs work someone it likes or dislikes is waiting on when it chooses which job comes first. It moves at most once a minute per person, and it grants no ability.

**Memory.** Rooms it has stood in and what it saw there, what was in each container, where it last saw each person, and a few notes the model chose to keep. Crew know every room's name and the way there, but not what is in a room until they have looked. The model sees what was said lately, its own lines included, as plain lines of who said what. It is never shown its raw replies as it wrote them, because a small model copies the shape of its old mistakes.

**Needs, relationships proper and how-to cards (planned).** Food, rest and health that come first once low, with work covered before a break. Relationships as "a very important part of memory", shaped by personality clashes. How-to cards holding procedures with their conditions, tools and best methods. None is designed in detail.

### The job and the shared duties

A **job** is a plug-in: hooks that say what tasks it has, the next step for each, what it may agree to, and what it tells the model is true. Job-specific behaviour lives in the jobs folder. Outside it, the brain asks a job's hooks rather than its title, with few exceptions (pointing a non-cleaner at a janitor in view, and the chain of command). A job is read off the ID card. A job also says what its work area should hold.

Jobs built so far: janitor, cargo technician, Quartermaster, Head of Personnel, Chief Engineer, station engineer, Head of Security and security officer. The Captain is played by a person.

**Shared duties** belong to everyone with a post: keep your area tidy, keep a locked post free of strangers, send for a janitor when you see a mess, go to meetings, collect crates, carry out general orders, report wanted people, look in on your department's locked rooms when it is quiet, and keep your area stocked with emergency and general supplies, asking your head for what is short (**planned**: no plan and no code yet).

**Urgency.** Every task is an emergency, something someone asked for, or routine. A call or order from one's superior is an emergency and pre-empts other work. Most of a janitor's work is routine; some jobs are drop-everything by nature. Today only orders and a few job states (an engine being shut down, being challenged in a locked post) raise an emergency. Nothing in the world yet does (fire, someone down, a breach): that waits on the senses for it.

### The chain of command

The hierarchy is written down in the brain for people out of view and PDA contacts. For people in view, the server says from the game's own job data whether the NPC answers to them. Everyone answers to their department head, and heads answer to the Captain. Rank comes from the ID a person wears, never from what they say.

- **Staff go through their own head**, never to cargo directly.
- **Heads delegate.** The Quartermaster never hauls, the Chief Engineer never works the engine room, and the Head of Security lays a hand on nobody while its officer is fit.
- **The test crew spawns every department's head with its staff.** Any job can also be spawned alone, so each role has a fallback when its head or partner is missing.
- **The Captain is at the top.** It is copied on meetings, approves big purchases, declares warrants and alone pardons. It has no NPC job: it is a person, in practice the owner.
- **Force has fixed limits.** Nobody lays a hand on the Captain, and nobody guarding a locked post walks a head out. Only the Captain can name a head on a warrant, and nobody can name the Captain.
- **Faults are handed to the job that owns them.** A body that cannot put a trespasser out tells its head, who declares a warrant. Security shut out goes up to the Chief Engineer, whose engineer forces the door. A janitor in a dark room with whole tubes reports a power fault to engineering, and fire doors go to engineering (both **planned**).
- **Work for one person is chosen by what it holds; work for several waits for a head to divide it**, and the split must hold for any headcount (the Quartermaster's counter, shuttle and rooms).

Requests between departments go up the chain, across head to head, and back down, with the Captain copied.

---

## 6. How crew talk and pass on messages

NPCs coordinate only through things a body could do: speech in earshot, knocks, PDA messages and paper. There is no shared planner. The window does share some state between the NPCs it runs: shared department lists (the "clipboard by the counter") of who has been sent for, the names of all its NPCs as people each knows of, and the choice of which NPC answers a group request, made from every NPC's hearing. Whether these are allowed under senses only is an open question (section 12).

**The channels.**

- **Face to face** within a department that shares a room. A technician with word for the Quartermaster knocks at its office door.
- **Aloud** for meetings where staff share a room.
- **PDA** across departments, up to the Captain, to scattered staff, and as the fallback.
- **Paper** for records. The Quartermaster's order book is a real sheet on its clipboard.

Speech and PDA are cut at about 200 characters, so every line puts what matters first.

**Fixed lines are the contract between NPCs.** Anything passed on and acted on is a fixed sentence: "the engine is yours", a warrant read back, a meeting call, "order 3 has come in". The code that writes a line and the pattern that reads it sit side by side in one file per area, so speaker and hearer cannot drift apart. The model cannot reword these lines. **Said is not told** applies to word passed face to face, and to the PDA lines that wait for an answer (meeting calls, orders, warrants, the wanted list). A sighting goes by PDA once, with no answer expected. Urgent word, such as an officer being hurt, goes by PDA at once.

**Every wait has a limit and a fallback.** A meeting waits a few minutes at most. The Captain is asked twice, then the order is held and the orderer told. A head that hears no "Noted" takes its order to the counter itself.

**Who is being spoken to is decided in code**, by what a person would use: a name used as a call-on, group words, distance, whether the speaker faces them. A request to a group goes to the nearest NPC only.

**Understanding orders.** Code reads an order from a superior directly; it becomes urgent work, and the model is only asked how to say it is going. When someone else speaks, the model may pick a piece of work from the job's list, and code catches what it missed, erring towards taking work on. The owner wants typed orders understood with loose wording and bad spelling. For warrants and other security orders sent by PDA, code mends misspellings first, and a tiny separate model call reads what is left. The name it gives must be made of words in the message, and the result goes back through the same code and is read back to the sender. Orders said aloud are not put to it. It has run in two played rounds, and neither reading was usable: one gave a warrant on "him", which code refused, and the other was answered "I did not follow that".

**Getting into locked rooms is a social matter.** A body shut in, or sent to a room it cannot open, stands at the right door, knocks, asks anyone in sight who works there, and sends a PDA to whoever called it. Then it waits, and asks again only when someone who works there turns up. "The call is the permission": someone expected is let in. Rooms can sit inside locked rooms, and nothing may assume a room stays locked.

---

## 7. Work

### Supply: asked for and collected, not delivered

Cargo does not offer and does not deliver. A need goes staff, head, Quartermaster, technician. The Quartermaster numbers each order in its book, pays from one cargo budget, asks the Captain about big purchases, and hands the order to a technician face to face. The crate is held in the bay and the orderer is told its number. The head sends someone to collect it, who hauls it home, unpacks it and takes the empty back. Crates nobody comes for are chased, and a lost one is reordered once.

The order book is real paper, and also the Quartermaster's memory: if the window reloads, it reads the book back and carries on. Freight (unloading, mail, empties, the shuttle) is routine and asks the model nothing. Crates are physical: a body that loses its grip takes hold again and puts the crate clear of doors.

### Janitorial

A janitor first gets something to clean with, the way a person would: a thing it knows of, then the custodial locator on its PDA, then the supply rooms, and only then its head, who orders from cargo. A mop must be wetted at a real sink or from a carried bucket, one click at a time. Each room it remembers a mess in becomes a task, and the model may choose which comes first. A mess beyond it is reported truthfully to whoever called it. Later, one janitor is to be named by its head at the first meeting to replace lights, with the lights ordered through cargo.

### Engineering

Engineering was added because test rounds lost power about fifteen minutes in. The engine start is a checklist kept as data for one map (MetaStation). Each step is one real click or tool use, checked after it is done. The Chief Engineer gives the engine to its engineer at the first meeting and watches it only through its PDA. The safe state is emitters off: if in doubt it stops, since a dark station is better than a wrecked engine. An engine that matches no list is not lit by guesswork. The work comes in stages: first the engine and batteries, then power faults and gravity.

Engineering is also the last rung for doors: an engineer forces a door as a player would, by panel, wires and crowbar.

### Security

Security came because the owner, as Captain, wanted Pun Pun arrested. A warrant is declared by the Captain or a head and read back word for word. The Head of Security keeps the list and sends it to every other head, who read it out at their meetings. Anyone who holds it and sees a wanted person sends a sighting by PDA. The officer follows the newest sighting, says a fixed arrest line, and uses the least force that works: someone who stands still is cuffed and never hit, and the baton is for someone who runs or fights. The prisoner goes in a timed cell. Only the Captain pardons. A head who cannot put a trespasser out declares a trespass warrant.

There are no laws yet. A warrant's reason is whatever was said. Crew NPCs always go quietly when arrested, for now.

### Guarding a locked post

Anyone whose post is behind a locked door keeps that room. A stranger is asked why they are there, and if they name a workmate, the workmate is asked. A no, or silence, means they are walked out by the arm. A visitor sent for is welcome while their job lasts. Pun Pun's mischief is part of the game; nothing stops it getting in, but once inside a post it is treated like any stranger.

---

## 8. Meetings and reports

The staff meeting is how information spreads, and every head runs it the same way:

1. The head calls its staff and tells the Captain. A call from one's head is an order, so staff set down what they are doing and come.
2. The head waits until everyone is there or a time limit passes. Being there is judged by sight.
3. It calls on each person by name. Each reports the work done since last time, counted by the server, and says what they need.
4. It reads out the wanted list, hands out standing work at the first meeting, sums up and closes.
5. Anyone absent is asked by PDA, and the Captain gets a copy of the whole.

Meetings come early in the shift and at regular intervals after, or when a superior orders one. Reports are fixed lines (section 6) carrying the server's own counts.

---

## 9. Coded routine and LLM judgement

The brief began with the model choosing its own goals through free tools. After five rounds of NPCs standing about, the owner moved every work decision into code: "the randomness is killing us". A small model is right most of the time, but a job is a long run of steps, and that ends with an NPC standing in a hallway. The brief's "the LLM decides what to do, the server knows how" still holds for the body; inside the brain, the deciding moved from the model into the job plans.

**Code does:** every step of every job. Every number, name, crate number, cost and timer. Who was spoken to. Whether an order from a superior is taken (it is). The order of urgent work. Opening and closing tasks from what the body senses. What counts as done.

**The model does:**

- **Voice.** It speaks for the NPC, words the lines that are not fixed, and adds a remark after most that are.
- **Feeling.** It says how something said lands with this personality.
- **Agreeing.** It says yes or no to the few things the job offers to someone who asks.
- **Noticing work it is told of.** When someone who is not over it mentions work, it may pick that work from the job's list, and code catches what it misses.
- **Keeping notes.** It may keep a short note of news it was told; code drops repeats and notes that only say where someone was.
- **Choosing the next routine job.** When a few routine jobs are ready, the model picks which comes first, as the person it is, in its own small call. Every option is vetted by code, and if no usable answer comes quickly, code's own order stands. Emergencies, orders and work someone is waiting on are never put to the choice.
- **Reading an order that code could not read**, as a last resort, for security orders only.

The owner's view is that the earlier failures may have come from overwhelming the model, not from the model itself. How far the choosing role should grow again is open.

To keep the voice truthful, each job sends **cues**: short statements of what is true now, and what the body will and will not do if asked. The model is told not to say more than that. It is not told how a job ended, so its remarks can still be false.

---

## 10. The Crew Brain window and the player

The window is where the brains live and the player's view into them. It shows one card per NPC (what it is doing and why, what it last said, what it holds) and a details panel with its feelings, tasks, memory, the last prompt and reply, and the raw sense events. Every decision is also written to the round's `crew_brain.log`.

The NPCs think only while the window is open. Closing it, or a tgui rebuild mid-round, wipes what the brain holds (feelings, tasks, notes, where people were last seen, word owed). What the body remembers on the server (rooms it has been in, what was in each container, messes it saw) survives. The body finishes any walk or errand it was given and then falls back to safe wandering.

So there are two fallbacks. A dead model is covered: the job plans and plain lines carry the work. A dead window is not: the bodies keep their reflexes and wander near their posts, but no work is done. The brief's host-side fallback brain is what would cover the second case, and it is not designed.

Today a test crew of eleven is spawned at round start, owned by the first admin. The brief's player-facing parts are **planned**: player spawning with limits, NPC cards uploaded for admin review, and memory across rounds.

---

## 11. Testing

The work goes in a loop. A round is played on MetaStation with the owner as Captain, and its logs are read. The faults go into a plan named after the round, grouped by severity, easiest fix first, with the proposed change beside each, and each point tagged Decided (owner), Proposed, Mine (the agent's, which the owner may overrule) or Unknown. The owner approves, the fixes are built, checked and logged, and the next round is read against that entry. Game-feel questions are always the owner's: Pun Pun in locked rooms is wanted, downed crew wait for medical, and laws and reactions to arrest come later. Ask the owner before an undecided design choice; new code goes in its own files.

Checks are made at five levels, cheapest first:

1. **Type check** of the window code.
2. **Tables of cases** in `tools/llm_crew/`, with no model and no station, mostly proving that fixed lines round-trip and look-alike talk does not match.
3. **The simulator** runs the real window code against a stand-in server and a stand-in model that is quiet, chatty or dead. Passing with a quiet or dead model is the evidence that code does the work.
4. **Model tests** put fixed moments to the real local model, once for every personality card.
5. **Server compile**, then a **played round**, read back through `game.log`, `pda.log` and `crew_brain.log`.

The simulator runs none of the server code, so everything that moves in the game is compile-checked only until a round shows it. Played rounds are noisy: power failing, PDA outages and random events are ruled out before the brain is blamed. Every change log entry names the levels it reached, and "not played" is said plainly. The bug audit (`LLM_CREW_BUG_AUDIT/`, branch `crew-bug-audit`) lists possible faults and gaps read from the code, with a fix beside each.

---

## 12. Where it stands and what comes next

### Built

- **Played:** the brain window and the Ollama link; the server body with its senses, its core tools (walking, speech, picking up, cleaning, ordering, hauling, knocking, opening doors) and motor layer, and walking over known slippery tiles; feelings and memory; janitors, including wetting mops honestly; cargo technicians; the Quartermaster, with its order book, meetings and orders; the Head of Personnel and its staff meetings with reports and the Captain's copy; collecting crates by number; locked-room entry by knocking and asking; addressing rules; engineering stage 1 (the engine was seen lit); security stage 1 (warrants, the wanted list and arrests) in several rounds; and the last-resort order reader (run twice in play, no correct reading yet).
- **Simulated:** most of the latest work, including the Quartermaster's newest fixes, the other reflexes (putting down something that came to hand unasked, taking hold again of a crate that slipped), dropped-crate handling (not yet confirmed in a round), locked areas and visitors, door forcing, the latest security fixes, and the locked-rooms list in the window.
- **Planned:** needs, relationships proper, how-to cards, stocked work areas, the light-replacing janitor, janitors putting out trespassers, power faults and fire doors handed to engineering, engineering stage 2 (power faults, gravity) and later, laws, reactions to arrest, records, more officers and self-defence for officers, radio and harm senses, medical, mining under the Quartermaster, NPC card files, persistent memory and player spawning.

### Known weak points, as themes

- **The window is a single point of failure.** A dead model degrades gracefully; a closed or crashed window wipes what every brain holds and stops all work.
- **The no-cheats rule is not yet true everywhere.** Known breaches (galoshes at spawn, doors held by code, crates tipped out by code, the shuttle moved without its console) are listed in `LLM_CREW_PLAN_NO_CHEATS.md` and approved for removal.
- **Reading words is brittle at the human edge.** Fixed lines work between NPCs, but players' typed orders can be misread, negations and questions included.
- **Authority is read from text**: rank from the job text on a card, and a PDA sender is believed.
- **Senses-only leaks both ways.** Crew sense too little: their headset radio is not yet a sense, nor are announcements or real fire, and the harm sense (someone hurt, collapsing, found dead) is written but switched off. In places they know too much: shared department lists in the window, who can open a door read off every PDA holder's ID card (audit CHEAT-02), and some alarm handling.
- **Waits without an end in places**, where the rule that every wait has a limit is not yet kept, and give-ups reported to nobody.
- **Timing and scale**: a slow model against a world that moves on; one map, about a dozen crew, one model call at a time.
- **Tests miss where the faults are**: the simulator does not run server code, and nothing runs automatically.

### Open questions for the owner

- How far should the model's choosing role grow, and should the brief be rewritten to record the turn to "code does the work"?
- Are the window's shared department lists, and the other state it shares between NPCs, an allowed exception to senses only?
- Where should a brain's memory live so that a closed window does not wipe the crew?
- Is the host-side fallback brain still wanted, now that the job plans run in the window and not on the server?
- How should players' typed orders be read beyond warrants?
- Should rank come from a server-checked field rather than job text?
- Should every give-up be reported to the person's head?
- Where the body still knows or does more than a player could (for example some alarm handling), should that go?
- How will needs, how-to cards and more jobs fit the prompt budget on a small local model?

### What comes next

The owner has already approved some of this work: removing the remaining cheats, the light-replacing janitor, and the last-resort reader for loosely worded orders, which is so far built for security only. Engineering stage 2 is planned, and medical is needed before downed crew can matter. Beyond that, the person layer (needs and relationships) is the largest part of the original idea still to design.
