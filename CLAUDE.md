# Read this first

This checkout is /tg/station with LLM-driven crew NPCs being built on the `crew-npc` branch.

**Before you change any crew NPC code, read the top entry of [LLM_CREW_CHANGELOG.md](LLM_CREW_CHANGELOG.md).** It says what changed last, how far it was tested, and what is known to be wrong.

**When you change crew NPC code, add an entry at the top of that file before you finish.** How to write one is at the top of the file. Say plainly what was not tested.

Where things are:

- Change log: `LLM_CREW_CHANGELOG.md`
- What the project is and what was decided: `LLM_CREW_BRIEF.md`
- The design as built, in outline (layers, rules, how the parts fit): `LLM_CREW_DESIGN.md`
- Plans, each with a Status section: `LLM_CREW_PLAN_*.md`
- Server code: `code/modules/llm_crew/`
- Brain window code: `tgui/packages/tgui/interfaces/CrewBrain/`
- Simulator and test tools: `tools/llm_crew/`
- Round logs: `data/logs/YYYY/MM/DD/round-HH.MM.SS/`
