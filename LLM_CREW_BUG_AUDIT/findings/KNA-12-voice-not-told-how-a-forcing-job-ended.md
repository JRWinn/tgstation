---
id: KNA-12
title: Once a door-forcing job is closed the voice is told nothing of how it ended, and says the door is forced when it is not
kind: bug
severity: low
effort: small
confidence: sure
status: found
found_by: Fable 5.2
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:407, tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:386
fix: Keep the outcome of the last forcing job for a few minutes and give it to the voice as a cue
---

## What is wrong

Listed in the change log entry of 2026-11-18, 20:19 to 20:40, Known and not fixed: "The engineer said aloud 'the Bar Backroom door is forced' at 20:10:03, when it was not. That was the LLM's own remark after the job was closed: nothing tells it how the job ended."

While the job is in hand the voice is told "X has sent you to force the door of the Y for security. Your body sees to it." The moment the job ends, in success or failure, it is taken off the list and that cue goes with it. The model's history still has it being sent to force the door, and nothing saying it failed. Asked or greeted in the next minutes, it fills the gap.

The fixed line sent up the chain by PDA is right ("I could not open the door of the Bar Backroom: ..."). Only what the engineer says aloud is wrong. A player standing by hears that the door is forced.

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/forcing.ts:407`:

    export function forcingCues(brain: NpcBrain): string[] {
      return (brain.forcing?.jobs ?? []).map(
        (job) =>
          `${job.by} has sent you to force the door of the ${job.room} for security. Your body sees to it.`,
      );

`jobs/forcing.ts:386`, `forcingAfterActing`: the job is removed and nothing is kept.

    forcing.jobs = forcing.jobs.filter((it) => it !== job);

## How it was found

Read from the code, against the change log's account of `data/logs/2026/11/19/round-20.00.21`.

## How to fix it

1. In `forcingAfterActing`, when a job is closed, keep `forcing.last = { room, ok, why, at: brain.now }`, with `why` from `whyNot(reason, through)`.
2. In `forcingCues`, for five minutes after `last.at`, add one line: on failure "You were sent to open the door of the X and could not: WHY. It is still shut. Do not say it is open." On success "You forced the door of the X. It stands open."
3. This is one more line in the prompt of an engineer for five minutes, and only after a forcing job. The prompt budget rule is met by its being rare; if a line must be trimmed to pay for it, the in-hand cue and this one never appear together.

The same hole is likely wherever a job is closed and the model was told about it only while it was open. The officer's warrant cues (`beatCues` in `jobs/arrests.ts`) are worth the same look: the 19:38 entry has the officer telling the room about a warrant.

## How to test the fix

- `tools/llm_crew/security.ts`: a case that `forcingCues` returns the failure line after `forcingAfterActing` with `ok = false`, and nothing after five minutes.
- Model test (`tools/llm_crew/voice.ts`, only with the graphics card free): an engineer with the failure cue, asked "did you get the door open?", must not say yes.
