# Crew NPC plan: a security officer, warrants and the brig

Written 2026-11-18. **Planning only: nothing here is built, and it is not to be built until the owner says so.** No code was changed in writing this.

Items marked **Decided** are the project owner's. Items marked **Proposed** or **Mine** are mine. Section 7 lists the seven questions that change the design. The owner settled them all as suggested.

It builds on the staff meeting (`jobs/head.ts`, `jobs/meetings.ts`), the locked-room rules (`jobs/guarding.ts`, `crew_npc_guarding.dm`) and the machine work from engineering (`crew_npc_machines.dm`). Read their header comments first.

## Status

**Built 2026-11-18, with a Head of Security and one officer** ("The build is yours ... Add the head and officer"). **Type check, server compile on a side copy, the table of cases and the simulator only. Not played in a round, and nothing has been tried against the real model.** The top entry of `LLM_CREW_CHANGELOG.md` for that date says what was built, where, what was left out and what is unproven.

**Section 3.0 says who does what now that there is a head, and where the build departs from the rest of section 3.** Sections 3.1 to 3.12 were written for one officer and no head and have been left as they were written: read 3.0 first.

Earlier, kept for the record: waiting for the owner to say it is my turn ("write up what you got and I will let you know when it is your turn", 2026-11-18).

**The seven questions in section 7 are settled, all as suggested.** The owner, 2026-11-18: "Any questions I didn't answer, just go with your gut". The same goes for the items marked **Mine** and **Proposed**: they stand unless the owner changes one.

The owner asked the same day whether a Head of Security should be added in this round after all. My answer was yes, and the owner said to add it.

Added last on 2026-11-18, on the owner's word: the Captain's pardon (3.10). Laws, and random reactions by personality, are for later and are not designed here (section 5).

Changed 2026-11-18, later the same day, on the owner's answers: a warrant is for anyone, and a head of department can give one as well as the Captain (3.1). What happens when someone fights back is new (3.7). The owner said again: no code yet.

Another session has uncommitted work in `jobs/head.ts`, `jobs/meetings.ts`, `types.ts`, `driver.ts`, `brain.ts` and most of the server files. Building this has to wait for that to be committed: it needs the same files.

## 1. What was asked, and what was already decided

The owner, 2026-11-18:

- **Decided:** "I am tired of this monkey".
- **Decided:** "a security guard that can arrest people and put them in the brig".
- **Decided:** the Captain can put warrants out on people, and that sends "a PDA apb to all the department heads".
- **Decided:** at their next meeting the heads say that security is looking for so and so, the full list, and that anyone who spots them reports the sighting to security.
- **Decided:** security then goes looking where they were last seen.
- **Decided:** no Head of Security yet. One officer, who answers to the Captain.
- **Decided:** "its for anyone that a head of departments or captain declares". So a warrant can name anyone, the monkey included, and a head of department can give one as well as the Captain.
- Asked, and answered in 3.7: "what happens if someone fights back? Pun Pun might?"
- **Decided:** "Captain can Pardon people". See 3.10.
- **Decided:** "We will come up with laws later". No list of crimes or times is designed here. See section 5.
- **Decided:** "random reations based on personalities", also later. Until then a crew NPC under arrest goes quietly. See section 5.
- **Decided:** "write up what you got and I will let you know when it is your turn". Nothing is to be built until the owner says so.

From earlier plans, and bearing on this one:

- **Decided:** no cheats. A body acts only as a player could. What it needs it finds, or has ordered.
- **Decided:** code does the work and the LLM is the voice. A dead LLM must not stall the work.
- **Decided:** numbers and names are carried by code. A line someone's next step is read from is said word for word.
- **Decided:** said is not told. Word is not counted as passed until it is answered.
- **Decided:** an example is not the scope. A rule is keyed on the situation, not on one job.
- **Decided (2026-11-17):** nobody lays a hand on the Captain or a head of staff. That was said of putting people out of rooms. "Anyone" above reads as overriding it for a warrant. Question 5 asks where the line is.
- **Decided (2026-11-18, earlier the same day):** "pun pun is meant to be annoying, that is the charm", and nothing was to be built to catch it. That now holds only until someone declares a warrant on it. Nothing here keeps it out of anywhere.

## 2. What the game gives us

Read from the code and the MetaStation map on 2026-11-18. **None of it has been seen in a round.** Lines marked "worked out" were not read.

### Warrants

- The game's own warrant is a crew record set to "Arrest". It is set at a security records console, by adding a crime to the record.
- The Captain's ID opens that console. There is one on the Bridge.
- **Pun Pun has no crew record.** Records are made for crew with a job. So the game's own warrant cannot name Pun Pun, unless someone makes it a record with a photograph.
- A record is found by exact name. Someone whose face and ID are hidden has no name to match.
- Pun Pun's name is not always "Pun Pun". It can carry a number ("Pun Pun III"), and now and then it is another name altogether.
- The "warrant console" in the hallway is for paying fines. It cannot set anyone wanted.
- The officer's PDA has a records program. It shows who is wanted and cannot change it.
- Security glasses show a wanted mark over a person, and only for someone with a record.

### The officer

- The Security Officer outfit has: one pair of handcuffs, a flash, a disabler (a stun gun), a helmet, a vest, a security headset and a security PDA.
- **It has no baton and no security glasses.** Both are in the officers' lockers in the security gear room. The baton is in a belt in the locker. The lockers open to an officer's ID.
- Its ID opens the brig's front door, the Security Office, the gear room and the cells. It does not open the armoury. Not checked: whether it opens maintenance on this server's settings.
- Dressed by our spawn code, it is a plain officer with no department. Nothing needs one.

### Making an arrest

- **Handcuffs** take 4 seconds to put on, and the target has to stay put for all of it. The target needs two hands. Pun Pun has two.
- **A baton** is switched on in the hand. A hit drains stamina and, two seconds later, knocks the target down for 5 seconds. The same officer cannot stun the same target again for 2.5 seconds. A loaded baton is good for about ten hits.
- Worked out: two hits put a target flat for long enough to cuff. One may not.
- Someone in cuffs can still walk. They cannot break a hold. They get out of the cuffs in one minute if they stand still that long.
- Cuffs come off through the same menu a player uses to take anything off someone. 4 seconds, worked out.
- Worked out: doors open for the one pulling, and whoever is pulled comes through with them.

### The brig

- MetaStation's brig has three timed cells: Cell 1, Cell 2, Cell 3. Each has a door, a timer on the wall, a flasher and a locker.
- The timer answers to a security ID. It is set in its own window: 2, 3 or 5 minutes by a button, or any time up to 15 minutes.
- Starting the timer shuts the cell door. When it runs out the door opens by itself and the Security radio says so.
- There is also a Holding Cell with no timer.
- The timer does not touch anyone's record.

### Pun Pun

- Pun Pun is a monkey of the human kind, so the crew's eyes already list it as a person.
- Hit, it turns on whoever hit it 85 times in 100. Cuffed, 20 in 100. Pulled, 5 in 100.
- Held or cuffed, it tries to get free about half the time it thinks.
- Pun Pun is marked "tamed". Nothing in the code reads that mark, so it fights like any monkey.

### A monkey in a fight

Read from the monkey's own behaviour (`code/datums/ai/monkey/`).

- **It looks for a weapon first.** Off the floor, or out of the hand of someone nearby. The officer's baton is such a weapon.
- It bites, or hits with what it holds.
- About one time in five it shoves someone who is holding something. A shove can put a person on the floor for two seconds. Not read: whether it knocks the baton out of the hand.
- It runs when its health is under 40. A baton takes stamina, not health, so the baton does not make it run.
- **When whoever it is fighting is down and helpless, it drags them to a disposal unit and puts them in.**
- Each blow it lands has a 40 in 100 chance of cooling it a step. From a single grudge that is about ten blows. Then it stops by itself.
- It can call other monkeys nearby into the fight.
- The officer's vest and helmet take about a third off a blow. Read for the plain vest. The officer's is a kind of it and was not checked.
- Not read: how much a bite does.

### What the crew can do in a fight

- **Nothing.** No crew body can hit, block, run from harm or heal.
- A body does not know it has been hit. The code that would tell it exists and is switched off (`crew_npc_danger.dm`).
- There are no medical staff. A hurt body stays hurt.

### Officer Beepsky

- A security robot patrols from the brig. It stuns and cuffs anyone whose record says "Arrest", and then leaves them where they lie.
- It goes by records only. With no record, it leaves Pun Pun alone.
- Nothing in stage 1 touches a record, so Beepsky does nothing new. See section 5.

### What the crew code has, and does not

- A head's meeting has a slot for something the head says before it closes (`MeetingWay.before`). The Quartermaster and the Chief Engineer both use it.
- A body can take someone by the arm and walk them out of a room (`take_hold_of`, `put_out`). A crew NPC taken hold of goes along quietly (`taken_hold_of`).
- A body can work a machine by hand, and set a machine's window by sending what the window would send (`work_machine`, `work_window`).
- A body can take a tool from its belt and put it back.
- People in view come with a name, a job, a room and a distance. A PDA lists everyone aboard by name and job.
- A PDA message and a spoken line are both cut at 200 characters.
- **A body cannot put on clothes.** No glasses, no belt.
- **A body cannot hit anyone, cuff anyone, or open the menu that takes things off someone.**
- **A body does not hear its radio.**
- PDA messages stop when station power goes.

## 3. How it would work

Everything here is **Proposed**, except where it repeats section 1.

### 3.0 As built: who does what, with a Head of Security

**Decided:** there is a Head of Security as well as an officer. Everything in this section is **Mine** unless it says otherwise.

The Head of Security keeps the list. The officer does the legwork.

- **Warrants, pardons and sightings go to the Head of Security**, by PDA or to its face. It answers them, keeps the list, sends the heads the notice, and tells the Captain how each warrant went. Where 3.1 to 3.5 and 3.10 say "the officer" does one of those, read "the Head of Security".
- **It gives each warrant to its officer**, to its face if the officer is there and by PDA if not: "Hale, warrant: Pun Pun, for trespass. Bring them in, 5 minutes." Said to its face, the officer answers "The warrant, right away." With no word back in a minute it is given again.
- **It passes the newest sighting on** the same way: "Hale, Pun Pun was seen in the Bar."
- **The officer tells it how the warrant went**, to its face, and does not count that as told until it hears "Hale, I have that." Out on the station, it sends it by PDA.
- **It delegates.** It lays a hand on nobody while its officer is fit. With no officer aboard, or once its officer says it is hurt, it fetches a baton and serves the warrants itself.
- **It holds a staff meeting** in the Security Office, called aloud, thirty seconds in and every ten minutes after. The officer reports its arrests, from the server's count. It closes with who is still wanted, and the Captain is sent the same. It calls no meeting within two minutes of a new warrant or a sighting: that would bring its officer back in.
- **A warrant declared to the officer is sent on its way**: "Captain, warrants go to Joan, the Head of Security."
- **With no Head of Security aboard, the officer keeps the list itself**, in the same code, and takes warrants from the Captain and the heads directly. That is what 3.1 to 3.12 describe.
- The test crew is eleven bodies: one Head of Security and one officer more than before.

Where the build departs from the sections below:

- **3.4:** the officer does not answer a sighting with "On my way". Nothing answers a sighting.
- **3.5:** nothing new was built for a locked room. The officer walks at it, and if there is no way in it leaves that room alone. A report from someone who works there does not yet count as sending for it.
- **3.6:** the officer does not wait four seconds and then judge. It tells them they are under arrest and puts the cuffs on, which takes four seconds by itself. Someone who stays put for it is cuffed. Someone who does not gets the baton on the next try.
- **3.6:** the baton lands twice, and a third time if they are still on their feet.
- **3.7:** a crew NPC that sees security lying still does not tell the Captain. Not built.
- **3.8:** the officer does not go back for its cuffs when a cell opens. It fetches another pair from a locker, or picks up a pair it sees lying.
- **3.9:** a freed prisoner is not seen out of the brig by anything new. The rules already built may do it. Not tried.
- **3.11:** the ten-minute report to the Captain is the Head of Security's report of its staff meeting.

### 3.1 The warrant

- **Decided:** the Captain or a head of department declares it, and it can be on anyone.
- Whoever declares it tells the officer, by PDA or to its face: "Warrant for Pun Pun, for wrecking the Custodial Closet." A time may be added: "ten minutes".
- Code reads it: the name, the reason if one is given, the time if one is given. The LLM is not asked.
- Words that count: "warrant for", "warrant on", "arrest", "bring in", "lock up".
- The officer answers word for word, so the Captain sees what was understood: "Captain, I have that: a warrant for Pun Pun, for wrecking the Custodial Closet. 5 minutes."
- A name that is on nobody's PDA and has never been seen gets the same answer with "I do not know that name yet" added. Pun Pun is on no PDA, so this must not be a refusal.
- A warrant names a person by every word of the name given. "Pun Pun" matches "Pun Pun III".
- The server says who is the Captain or a head, from the ID they carry. Nothing anyone says makes them one. Anyone else who asks is told to take it to their head.
- The officer answers a head by first name, in the same words.
- **Mine:** when a head declares one, the officer sends the Captain a copy: "Captain, Ada has declared a warrant for Pun Pun, for wrecking the Custodial Closet."
- **Mine:** nobody takes a warrant out on the Captain, or on the officer. Only the Captain can name a head. See question 5.
- The officer keeps the list, with who declared each. It is the only copy. See question 1.

When a head who is a crew NPC declares one:

- **Mine:** in one case by itself. One of its staff tried to put someone out of their room and could not, and tells the head so. The head then declares a warrant for trespass, by PDA to the officer. That is how the monkey in the Custodial Closet becomes security's business without the Captain.
- **Mine:** and whenever the Captain tells it to: "Ada, put a warrant out on Dana Reyes."
- Nothing else. A head does not declare one because it is annoyed. See question 2.

### 3.2 The notice to the heads

- When the list changes, the officer sends every head of department on its PDA the whole list, word for word: "Security notice. Wanted: Pun Pun, for wrecking the Custodial Closet. If you or your staff see them, send me where, at once."
- A list too long for one message goes out as two.
- A head who is on the list is not sent it.
- Each head answers "Security notice received." A head who has not answered in a minute is sent it once more. Then the officer stops, and tells the Captain which heads have it.
- When the last warrant is served or dropped: "Security notice. Nobody is wanted now."
- The heads keep the list they were last sent. A new notice replaces it whole.
- A head starts watching for those on the list at once.

### 3.3 At the meeting

- **Decided:** each head says it at its next staff meeting. Not before.
- It is said after the reports and before the close, word for word: "Security is looking for Pun Pun and Dana Reyes. If you see either of them, send security a PDA message saying where."
- It is the same step for every head, in the shared meeting code. It comes before a head's own business (the engine, the work split).
- **Mine:** it is said at every meeting while anyone is wanted, the whole list each time. Someone who missed one meeting hears it at the next.
- **Mine:** when the list is empty again it is said once: "Security is looking for nobody now."
- Staff who hear it keep the list. Code reads the line, as it reads the call to a meeting.
- Someone who did not come is sent the same line by PDA, with the word that the meeting went ahead.
- So the staff may not know for up to ten minutes. The Captain can hurry it: "hold a meeting" is already an order a head takes.

### 3.4 Spotting someone

- Anyone who holds the list and sees someone on it sends the officer a PDA message, word for word: "Security: Pun Pun is in the Bar."
- It costs no walking. Work in hand is not dropped for it.
- Once for each wanted person, each room, each spotter, in two minutes.
- Not sent while the officer is in sight. It can see for itself.
- Not sent by the wanted person about themselves.
- Someone whose name cannot be seen is not spotted.
- With no officer on the PDA, or no PDA, nothing is sent. See section 8.
- The Captain, or any player, can report the same way. The officer reads any message or spoken line that names someone wanted and a room it knows.
- **Mine:** the officer answers the first sighting that sets it moving: "On my way to the Bar." It does not answer every one.
- Three janitors at a meeting who all see the monkey will each send word. That is three messages for one sighting. See section 8.

### 3.5 Looking

- The officer keeps, for each warrant, where they were last seen, when, and by whom. The newest sighting wins.
- It goes to that room, stands where it can see it, and looks for twenty seconds.
- A sighting more than five minutes old is not walked to.
- A room locked to it is handled by the rules already built: it knocks, and someone who works there lets it in. A report from someone who works there counts as sending for it.
- Not found: it tells nobody, and goes back to its rounds until the next sighting.
- With no sighting to follow it walks the main hallways and looks. See 3.11.
- Two people wanted: the one seen most lately first.

### 3.6 The arrest

- On seeing someone wanted, the officer walks up and says, word for word: "Pun Pun, you are under arrest, for wrecking the Custodial Closet. Stand still."
- **A crew NPC stands still.** Code reads the line. It sets down a crate it is hauling first, and drops everything else. It may say a line in its own voice.
- Anyone who is standing still next to the officer four seconds later is cuffed without being hit.
- **Anyone who is not is hit with the baton.** Once, then again when the baton allows, then cuffed. See question 3.
- The cuffs take four seconds. If they fail, the officer starts again from the baton.
- Three failed tries, or the target out of sight, and it lets them go for now. The warrant stands. Where it lost them is the newest sighting.
- Nobody else joins in. A crew NPC who sees an arrest carries on with its work.
- The server counts arrests made, as it counts crates and messes.

### 3.7 If they fight back

Who can: Pun Pun, any other monkey, and a player. A crew NPC cannot. It has no way to hit anyone, and it stands still when told.

**What counts.** The one being arrested hits the officer, shoves it, takes hold of it, or takes something out of its hand. The server tells the officer's brain who did it, as something the body felt. This is a small part of the harm code that is switched off now, switched on for the officer only.

**What the officer does.**

- **No more waiting.** Someone who has hit the officer is hit with the baton at once. The four seconds to stand still are over.
- The force is the same as for someone who runs: the baton, twice, then the cuffs. A stunned attacker cannot bite. There is nothing harder to go to, and nothing harder is wanted.
- It never hits someone who is down or cuffed.
- **Fighting back adds time.** 5 minutes for resisting arrest, on top of the warrant's own, up to the timer's limit of 15. The Captain is told both: "Captain, Pun Pun is in Cell 1 for 10 minutes: 5 for wrecking the Custodial Closet and 5 for resisting arrest." See question 4.

**If the baton leaves its hand.**

- On the floor: it picks the baton up before anything else.
- In the other one's hand: it breaks off and backs away. A monkey with a stun baton wins. It tells the Captain: "Captain, Pun Pun has my baton."
- It then goes to the gear room for another. There is one in each officer's locker. Then it follows the newest sighting again.
- With no baton to be had it makes no arrests by force. It still follows sightings and tells the Captain where they are.

**If the officer is hurt.**

- Under half its health it breaks off, goes back to the Security Office, and tells the Captain: "Captain, I could not take Pun Pun. I am hurt."
- The warrant stands. The officer does not use force again that round unless the Captain tells it to: "try again". It has no way to heal. See question 7.
- It still follows sightings, at a distance, and tells whoever declared the warrant where the wanted person is.
- **If the officer goes down, nothing in this plan gets it up again.** A monkey will put it in a disposal unit. Not checked: where it comes out on MetaStation, and in what state.
- **Mine:** any crew NPC that sees a security officer lying still tells the Captain by PDA, once: "Captain, Officer Hale is down in the Bar." That is the first use of handing a fault on, which the owner described on 2026-11-16.

**If someone else joins in.**

- Another monkey, or a player, who hits the officer during an arrest is stopped with the baton. They are not arrested: there is no warrant on them.
- The officer tells the Captain after: "Captain, Dana Reyes attacked me while I was arresting Pun Pun." A warrant on them is the Captain's or a head's to declare.

**On the walk and in the cell.**

- Worked out: someone cuffed and held by the arm cannot hit and cannot break the hold. If that is wrong and the hold breaks, the officer takes hold again.
- A cuffed prisoner gets the cuffs off in a minute of standing still. Being walked along is not standing still. Left in a cell in cuffs, it will get them off. That does not matter: it is in the cell.
- A prisoner that attacks in the cell before the door is shut is hit once more, and the officer steps out.

**What the crew NPC under arrest does, for now.**

- It never fights, runs or hides. It may complain, in its own voice.
- **Decided:** that changes later. How a person takes being arrested will be random and will follow their personality. See section 5.

### 3.8 The brig

- With the cuffs on, the officer takes the prisoner by the arm and walks to the brig.
- It picks the first of the three cells with nobody in it and its timer not running. With all three in use it waits in the brig with the prisoner. That is rare enough to leave.
- It walks the prisoner into the cell and lets go.
- **A prisoner who stands for it has the cuffs taken off.** A crew NPC always does.
- A prisoner who does not is left in them. The officer steps out, and picks the cuffs up from the cell floor when the time is up.
- It steps out, sets the timer, and starts it. That shuts the door.
- Then it tells the Captain by PDA, word for word: "Captain, Pun Pun is in Cell 1 for 5 minutes." A head who declared the warrant is sent the same.
- The warrant is then served. It comes off the list, and the heads are sent the new list.
- **The time is 5 minutes unless whoever declared it said otherwise, and never more than 15.** The game's timer stops at 15. See question 4.
- The timer is set as the batteries are: by sending the timer what its window would send, with the body standing at it. See question 6.

### 3.9 When the time is up

- The door opens by itself. Nobody has to do anything.
- A crew NPC who was in the cell goes back to its work. It keeps nothing against the officer in code. What it feels is the LLM's to say.
- The officer does not hear the radio, so it keeps the time itself. When the time is up it looks in at the cell and collects its cuffs if they are there.
- A freed prisoner still in the brig a minute later is seen out, by the rules already built.
- Pun Pun goes back to being Pun Pun. A new warrant is the Captain's or a head's to declare.

### 3.10 A pardon, and dropping a warrant

**Decided:** the Captain can pardon people.

- The Captain tells the officer, by PDA or to its face: "Pardon Pun Pun." Code reads it. Words that count: "pardon", "release", "let go", "free".
- **Only the Captain pardons.** A head who says it is told so.
- A pardon ends whatever is standing against that person, whoever declared it:
  - a warrant not yet served comes off the list;
  - an arrest under way stops. The officer lets go and takes the cuffs off;
  - time in a cell ends. The officer goes to the cell's timer and stops it, and that opens the door.
- The officer answers word for word: "Captain, Pun Pun is pardoned."
- If the person is in sight it tells them: "Pun Pun, the Captain has pardoned you. You are free to go."
- A head who declared the warrant is told: "Ada, the Captain has pardoned Pun Pun."
- The heads are sent the new list, and say so at their next meeting, as for any change.
- **Mine:** a pardon is for what has been declared so far. It does not stop a new warrant later. A head's new one is copied to the Captain like any other.
- **Mine:** a pardon for someone with nothing against them is answered "Captain, there is nothing against Pun Pun."

A head can take back its own warrant, and only its own: "Cancel the warrant on Pun Pun." It cannot let anyone out of a cell. That is the Captain's pardon.

### 3.11 The officer's day

- **Its first job is its kit.** It goes to the gear room, opens its locker, and takes the baton. It carries the baton in its bag.
- It has no security glasses on. A body cannot put on clothes. It knows who is wanted by name, from its list.
- Its post is the Security Office.
- **Mine:** with no warrant, it stays at its post and looks in on the brig's rooms, as cargo staff do theirs.
- **Mine:** with a warrant standing and no sighting to follow, it walks the main hallways, one round, and comes back.
- **A prisoner in a cell is not a stranger.** The locked-room rules would have the officer question its own prisoner and walk it out. Anyone the officer has put in a cell is left alone until the time is up.
- Every ten minutes it sends the Captain a report by PDA, since it has no head to report to: "Captain, security report: 1 arrest. Still wanted: Dana Reyes, last seen in the Bar."
- Its baton, cuffs, flash and disabler are tools of its trade. A full hand does not drop them.
- It does not fire the disabler or use the flash.

### 3.12 The test crew

- One Security Officer is added to the crew that spawns at round start, in the Security Office. That makes ten bodies.
- It is added to the "Spawn Crew NPC" list.

## 4. What carries over

| Piece | Where it is now | Security |
|---|---|---|
| An order from the Captain or a head, read by code | `jobs/orders.ts`, `jobs/guarding.ts` | The warrant, the pardon, a head taking its own back |
| A body that could not put someone out | `put_out` in `crew_npc_guarding.dm` | Word to its head, who declares a warrant for trespass |
| Noticing harm | `crew_npc_danger.dm`, switched off | Switched on for the officer: who hit it, and how hurt it is |
| Word for word lines, shared by sayer and hearer | `jobs/supply.ts`, `jobs/engineering.ts` | `jobs/security.ts` |
| Said is not told | `tellChief` in `jobs/engineer.ts` | The notice to the heads |
| Something a head says before the close | `MeetingWay.before` | The wanted list, for every head |
| Taking someone by the arm | `take_hold_of`, `put_out` | The walk to the brig |
| Going along quietly | `taken_hold_of`, `let_go_of` | A crew NPC under arrest |
| A tool from the belt or bag | `connect_canister` | The baton, the cuffs |
| A machine's window | `work_window` | The cell timer |
| Getting into a locked room | `expected.ts`, the knock | Following a sighting |
| Rounds | `jobs/rounds.ts` | The hallway round |
| Counted work | `work_done`, `jobs/reports.ts` | Arrests |
| Dead LLM | Every line has a plain fallback | Same. Every line above is fixed. |

## 5. Later stages, in outline

Not to be built until stage 1 has been played in a round.

**Stage 2: the records.**

- The Captain may also set someone wanted at the records console on the Bridge. The officer reads it off its PDA's records program once a minute, as the Chief Engineer reads the engine monitor.
- The officer enters its own warrants at the console in the Security Office, for anyone who has a record.
- Then Beepsky joins in. It stuns and cuffs and walks away. The officer has to know to go and collect.
- Until then: **if the Captain sets a crew NPC to "Arrest" at a console, Beepsky will cuff it and nobody will take the cuffs off.** Do not do that in a stage 1 round.

**Laws.** **Decided:** "We will come up with laws later."

- Until then there is no list of crimes. The reason on a warrant is whatever was said, and is carried word for word.
- Until then the time in a cell is 5 minutes, or what was said with the warrant, and 5 more for fighting back.
- When there are laws they would set what can be declared, and the time for each. The owner writes them.

**Reactions.** **Decided:** "random reations based on personalities", later.

- How a crew NPC takes being arrested, and how others take seeing it: going quietly, arguing, running, fighting.
- Until then every crew NPC stands still and goes along (3.6, 3.7).
- When it comes, 3.7 already says what the officer does with someone who runs or fights. Nothing there has to change.
- Not designed here. It belongs with the person layer: personality, relationships, feelings about the officer afterwards.

**Stage 3: more.**

- A Head of Security, a Warden, and a second officer. The warrant then goes to the head, and sightings are shared out.
- Security glasses, once bodies can put on clothes.
- The radio.
- Arresting on sight for a crime the officer sees, with no warrant.
- Searching a prisoner, and the cell locker.
- A hold with no time limit: the Holding Cell, or the prison wing.
- Recharging the baton. Spare cuffs.
- The janitors' duty to put people out of their own rooms, which the owner asked for on 2026-11-18 and is not built.

## 6. What has to be built for stage 1

In the order I would build it. It is two halves. The first is words and walking, and the simulator can prove nearly all of it. The second is hands, and only a round can prove it.

**First half: the warrant reaches everyone, and the officer finds them.**

1. **Brain: the words.** `jobs/security.ts`: every fixed line and its reader, and the name match. A table of cases in `tools/llm_crew/security.ts`, run with no model.
2. **Brain: the list everyone keeps.** `jobs/wanted.ts`, not any one job's work: holding the list, spotting, sending word. New fields in `types.ts` and `tools/llm_crew/fixtures.ts`.
3. **Brain: the heads.** Reading the notice, answering it, and the wanted step in the shared meeting code in `jobs/head.ts`. Staff reading it in `jobs/meetings.ts`. Declaring a warrant: for trespass when its staff could not put someone out, and when the Captain says to.
4. **Brain: the officer.** `jobs/officer.ts`, added to `jobs/index.ts`: the warrant, the notice, the sightings, the looking, the report.
5. **Server: the officer.** A new `crew_npc_security.dm`: its post, its rooms, its trade tools. The outfit in `spawn_test_crew`. People in view marked as security staff.
6. **Simulator.** A person who can be wanted and who moves. Scenarios:
   - the Captain declares a warrant, every head gets the notice and answers;
   - a head declares one, and the Captain is sent a copy;
   - someone who is neither is refused;
   - a technician cannot put someone out of the bay, tells the Quartermaster, and the Quartermaster declares a warrant for trespass;
   - a head who does not answer is sent it twice and no more;
   - the list is said at each head's meeting and the staff have it after;
   - someone on the list is seen, one message goes, and the officer walks there;
   - a stale sighting is not followed;
   - the Captain pardons someone wanted, the warrant comes off, and the heads say so;
   - a head takes back its own warrant, and cannot take back another's;
   - the LLM is dead, and all of the above still happens.
7. **A round.** The officer should end up standing next to Pun Pun. It cannot arrest yet: it tells the Captain where they are.

**Second half: the arrest and the cell.**

8. **Server: kit.** Opening the locker, the belt in it, and the baton out of the belt.
9. **Server: the baton.** Switched on in the hand, and used on someone by a click.
10. **Server: the cuffs.** Put on by a click and a wait. Taken off through the game's own way of taking things off someone.
11. **Server: the walk to a cell.** The hold, the doors, choosing a cell, getting the prisoner in and the officer out.
12. **Server: the timer.** Read and set. The cells, and whether each is in use, in the officer's eyes.
13. **Server and brain: being arrested.** A crew NPC standing still, going along, waiting in the cell, and going back to work.
14. **Server: fighting back.** The officer's body tells its brain who hit, shoved or took hold of it, how hurt it is, and where its baton is if it has left its hand. For the officer only.
15. **Brain: the rest of the officer.** The arrest, fighting back, the cell, the word to the Captain, the cuffs collected, the pardon.
16. **Simulator.** A brig with cells, and someone who can hit. Scenarios:
    - a crew NPC is arrested, stands still, is not hit, and is in a cell with the timer running;
    - someone who runs is hit before being cuffed;
    - someone who hits the officer is hit at once, and gets 5 minutes more;
    - the baton is taken: the officer breaks off, tells the Captain, and fetches another;
    - the officer is hurt: it breaks off, tells the Captain, and uses no force again until told to;
    - a second person joins in, is stopped, and is not arrested;
    - the prisoner in the cell is not questioned or put out;
    - the time runs out and the prisoner goes back to work;
    - the Captain pardons someone in a cell, and the door opens;
    - the Captain pardons someone being walked to the brig, and they are let go with the cuffs off;
    - a head tries to pardon, and is told it is the Captain's to give.
17. **A round.** Read `game.log` for each step.

Rough size: four to five sittings. Two for the first half, the rest for the second. Steps 9 to 11 are the large part and the least certain.

To be checked while building, because the plan leans on them:

- That a click from a body with no player swings a baton and applies cuffs.
- That two baton hits hold a target still for four seconds.
- That a pulled prisoner comes through the brig's doors and the cell's door.
- That the officer can get out of the cell and shut it with the prisoner still inside. This is the step I trust least.
- How the game takes cuffs off, and whether a body with no player can do it without a window.
- That the baton is where the map's lockers say it is.
- What Pun Pun's name is in the round, and how a warrant should name it when it is not "Pun Pun".
- Whether a shove knocks the baton out of the officer's hand.
- How much a monkey's bite does through the vest, and so how long the officer lasts.
- Where a disposal unit sends a body on MetaStation.

## 7. Questions for the owner

**All seven are Decided, as suggested.** The owner did not answer them one by one, and said on 2026-11-18: "Any questions I didn't answer, just go with your gut". The right-hand column is what will be built.

Settled since the first draft, by the owner on 2026-11-18: a warrant is for anyone, Pun Pun included; a head of department can declare one as well as the Captain; the Captain can pardon; laws and reactions by personality come later.

| # | Question | Decided |
|---|---|---|
| 1 | How is a warrant declared? The game's own way is the records console on the Bridge, but Pun Pun has no record, so that way cannot name it. | Tell the officer, by PDA or to its face. It works for anyone, the monkey included. The console is stage 2. |
| 2 | Every head aboard but the Captain is a crew NPC. When does one declare a warrant by itself? | In one case: its staff tried to put someone out of their room and could not. And whenever the Captain tells it to. Nothing else for now. |
| 3 | How much force? The baton is in the locker. The disabler is already on the officer, but it is a gun, and a shot can hit someone else. | The baton, fetched from the locker. Used on someone who does not stand still after being told, and at once on someone who hits the officer. Crew NPCs always stand still, so they are never hit. A player gets the same four seconds. |
| 4 | How long in the cell, until there are laws? | 5 minutes, or what was said with the warrant, up to the game's limit of 15. Fighting back adds 5. Then they walk free and the warrant is spent. |
| 5 | "Anyone": does that reach the heads and the Captain? The rule so far is that nobody lays a hand on either. | A head can be arrested, but only the Captain can name one. Nobody can name the Captain or the officer. |
| 6 | The cell timer is set in a window, and the game will not open a window for a body with no player. Engineering sends the machine what the window would send. The same here? | Yes. The body stands at the timer, and its ID is checked. |
| 7 | The officer loses the fight. What then? Nothing aboard can heal it. | Under half its health it breaks off and tells the Captain. It keeps finding the wanted person and saying where, and uses no force again until the Captain says "try again". The other choice is to fight until it drops. |

## 8. Known risks

- **Pun Pun will fight back, and may win.** See 3.7. Hit, it turns on the officer 85 times in 100. It goes for the officer's baton, and it puts a downed officer in a disposal unit. Nothing aboard heals the officer. One bad arrest can end security for the round. Look for it in the first round.
- **Trespass warrants start in cargo and engineering only.** Those are the staff who put people out of their rooms now. Janitors do not yet, so the monkey in the Custodial Closet still needs the Captain, until the janitors have that duty (stage 3).
- **A head's warrant could be a nuisance.** Pun Pun gets into the bay often. Each failure to put it out would start a warrant. One standing warrant for one person is the limit: a second for the same name is not taken.
- **The cell door.** A cuffed prisoner can walk. Getting out and shutting the door before it follows is not certain. If it cannot be done by hand, the cell's flasher is what a player would use, and the officer has no eye protection against it.
- **One pair of cuffs.** A prisoner left in them takes the cuffs into the cell. A second arrest has to wait for the first one's time to run out.
- **About ten baton hits in a round.** After that the baton is dead. Recharging is stage 3.
- **Staff learn late.** Up to ten minutes, by the owner's design. The heads and the officer are the only eyes until then.
- **Several messages for one sighting.** Each spotter sends its own. The officer takes the newest and ignores the rest.
- **No PDA, no sightings.** When the power goes the notices and the sightings stop. The officer still has its list and its own eyes.
- **A name that cannot be seen is not wanted.** A mask, or no ID and a hidden face, and nobody spots them.
- **A crew NPC in a cell does no work.** Its head's meeting goes on without it. If the head is the one in the cell, there is no meeting.
- **The officer has a post behind locked doors.** The locked-room rules apply to the brig and the Security Office as built. Only its own prisoners are let off.
- **Ten bodies on one graphics card.** The officer's work asks the LLM nothing. Its talk does.

## 9. Not in this plan

- A Head of Security, a Warden, a Detective, a Lawyer.
- Crimes the officer sees for itself. It acts on warrants only.
- Laws: what counts as a crime and how long each earns. The owner will write them later.
- How people react to an arrest, by personality. Later.
- Fines and citations.
- Searching people, and taking things from them.
- Anything lethal, the armoury, and the disabler.
- Permanent confinement, the prison wing and the gulag.
- Antagonists.
- Keeping Pun Pun out of anywhere.
