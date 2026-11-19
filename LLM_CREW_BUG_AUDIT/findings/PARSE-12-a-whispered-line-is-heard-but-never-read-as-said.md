---
id: PARSE-12
title: A line whispered to a crew member wakes it but is never read as said, so whatever it agrees to is refused as nothing said called for it
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1483, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:93, tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1626, code/modules/llm_crew/crew_npc_senses.dm:442, tgui/packages/tgui/interfaces/CrewBrain/talk.ts:140, tgui/packages/tgui/interfaces/CrewBrain/tasks.ts:248
fix: Treat says and whispers alike in every report filter, through one helper isSpeechLine, or have describeEvent write every heard line with says
---

## What is wrong

Also written up as: MEM-15

What MEM-15 adds, kept here: with a whisper, `tasks.ts:248` `workInWords` finds none of the speaker's own lines (`] ${toldBy} says: `) and falls back to **everyone's** quoted lines in the report, so the work is read from what others said. Its concrete case: the Captain, beside a cargo technician, whispers "Order me a crate of soap." The technician is woken, the model replies `{"say": "Right away, Captain.", "move": {"tool": "order", ...}}`, `heardLines` in `think()` is empty, `calledFor` is undefined, and the order is logged "[nothing said called for it: not done]". No order is placed. MEM-15 also proposes a larger fix that would serve MEM-05 too: keep speech in the report as records with `speaker`, `message`, `saidTo` and `whispered`, and render them to text only when the prompt is built, so no reader has to parse text back. Its round test: whisper an order to a technician, and the order is placed.

The server words a whispered line differently: `"[speaker_name] [whispered ? "whispers" : "says"]: \"[message]\""` (`crew_npc_senses.dm:442`). The window's readers of what was said all look for the text `' says: '`, so a whisper is never one of them:

- `brain.ts:1483`: the lines that can have called for what the model agrees to. For a cargo technician or Quartermaster (`agrees` is defined only in `jobs/cargo.ts`), no whispered line is found, `calledFor` is undefined, and every move is dropped with `[nothing said called for it: not done]`. A head whispering "can you order me a crate of janitorial supplies" at the counter, or anyone whispering "can you show me the way to the bar", gets a spoken yes and no action. For other jobs `calledFor` is `''` and the move goes ahead.
- `talk.ts:93` (`wordsHeard`) and `talk.ts:140`: the words that pick the job's `whenAsked` lines, the notes and memory sent, and the options offered (`availableOptions`). For a whisper they are empty.
- `brain.ts:1582`: with the model down, the plain request read by `hears` is the last line with `' says: '`, so a whisper is not read, or an older spoken line is read in its place.
- `brain.ts:1626`: after a failed call, the report is put back with the spoken lines taken out "or it would be heard as said again every time after". Whispered lines are not taken out, so they are sent to the model again as new on the next call, and the next.

`shouldWake` does wake the NPC for a whisper (it goes by `said_to`), so the NPC answers in its voice; only the reading of it is missing. Whispering in SS13 is one tile only, so it is always someone right beside the NPC talking to it.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/brain.ts:1482`:

    const heardLines = report.filter(
      (line) => line.includes('(person ') && line.includes(' says: '),
    );

`brain.ts:1626`:

    brain.pending.unshift(...report.filter((line) => !line.includes(' says: ')));

`tgui/packages/tgui/interfaces/CrewBrain/talk.ts:91`:

    function wordsHeard(report: string[]): string[] {
      return report
        .filter((line) => line.includes(' says: ') && line.includes('(person '))

and `talk.ts:140`, `brain.ts:1455`, `brain.ts:1582`, `tasks.ts:248` (the same test).

## How it was found

Read from the code: grep of `CrewBrain/` for `' says: '` and `whisper`; the word "whisper" appears nowhere in the window code. Not run and not seen in a round log.

## How to fix it

1. Simplest: in `describeEvent` (`brain.ts`), write every heard person's line with "says", and add ", whispering" inside the bracket (`(person p3, 1 tiles away, whispering, speaking to you)`) so the model still knows. Then every existing filter works.
2. Or add `isSpeechLine(line)` to `tasks.ts` that tests `/ (says|whispers): "/` and use it in the seven places above. Either way `tasks.ts:248`'s `] ${toldBy} says: ` must take whispers too.
3. Check `jobs/cargo.ts:1787` (`speakerOf`, `/\] (.+?) says: /`) at the same time.

## How to test the fix

- A table in `tools/llm_crew/` that builds a whispered report line and checks `wordsHeard` (export it, or test through `buildTalk`'s trigger) and that a cargo technician's `agrees` finds it.
- `bun tools/llm_crew/sim.ts quiet` must still pass.
