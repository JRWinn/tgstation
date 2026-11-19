---
id: PARSE-07
title: A stranger who answers the guard by its name, Donna the Quartermaster asked me to come in, is taken to have named the guard as who let them in and is put out at once
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: brain
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:768, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:294, tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:90
fix: In the stranger's answer, skip the guard's name where it is used to address the guard (at the start, or set off by a comma), read job titles and their shorthand as the workmate who holds them, and match a workmate by first name only
---

## What is wrong

See also: SECT-08 (the Captain or a head named as who sent them) and SECT-19 (owning-up words anywhere). This is a third way the same reader puts out someone with a good answer.

A guard asks a stranger in its post "why are you in here?". The answer is read by `workmateNamedIn`, which looks for any workmate's name in it, **and the guard's own name last**. The guard's own name counts as "they said I let them in, and I know I did not", so the stranger is settled `go` on the spot, with no second ask.

But a player answering someone who has just spoken to them by name answers them by name. "Donna, the Quartermaster asked me to come in" names the guard, Donna, as the one spoken to, not as the one who let them in. It is read as a confession.

Two more misreadings in the same lookup:

- `namesPerson` takes any part of a name over two letters, the surname included, as a whole word. A workmate called Sam Tech is named by "the cargo tech let me in". The guard then asks Sam, which is right by luck. A workmate called Tom Cook would be named by "the cook sent me"; one called Ann Bay by "I came into the bay".
- A job title is not read at all. "The QM sent me", "the quartermaster asked me to come" name nobody, so they count as no answer, the stranger is asked again, and after 30 seconds is walked out (SECT-08 has the same for the Captain by name).

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/guarding.ts:760`, in `guardOverhears`:

    const asked = brain.strangers[speaker];
    if (
      asked &&
      !asked.verdict &&
      !asked.voucher &&
      asked.askedAt !== undefined &&
      event.at >= asked.askedAt
    ) {
      const voucher = workmateNamedIn(brain, heard, [speaker]);
      if (voucher && voucher !== brain.name) {
        asked.voucher = voucher;
      } else if (voucher || NO_REASON_WORDS.test(heard)) {
        settle(brain, speaker, asked, 'go');
      }

`guarding.ts:294`:

    function workmateNamedIn(
      brain: NpcBrain,
      heard: string,
      except: string[],
    ): string | null {
      const others = [...brain.workmates].filter(
        (name) => !except.includes(name) && name !== brain.name,
      );
      return (
        others.find((name) => namesPerson(heard, name)) ??
        (namesPerson(heard, brain.name) ? brain.name : null)
      );
    }

`guarding.ts:90`, `namesPerson`: every part of the name over two letters, as a word.

## How it was found

Run. A throwaway script (`parse/guard.ts` in the scratchpad) built a Cargo Technician Donna Sholl at her post with workmates Sam Tech and Ann Moss, a stranger Ivy Lane already asked once, and passed `guardOverhears` Ivy's answer said to Donna:

    Donna, the quartermaster asked me to come in     verdict: go
    sorry donna, im here for my crate                verdict: go
    hi donna! just here to pick up my order          verdict: go
    Sam let me in                                    voucher: Sam Tech
    Donna let me in                                  verdict: go   (right)
    the QM sent me                                   (no answer)
    im fixing the lights                             (no answer)
    cargo tech let me in, donna                      voucher: Sam Tech (by the surname "Tech")

Not seen in a round log.

## How to fix it

1. Before looking for names in the answer, strip the guard's own name where it is used to address it: at the start of the line after an optional opener ("hi", "hey", "sorry", "ok"), or set off by commas, the same shapes `callsOn` in `addressing.ts` uses. Export `callsOn` (or a helper beside it that returns the line with the address removed) and use it here.
2. After that, the guard's name still in the line ("Donna let me in", "you let me in") is a confession, as now. Add "you let me in", "you asked me", "you sent for me" as naming the guard.
3. Match a workmate by first name, or by full name; a surname alone only when it is not a common word that the line uses as a word. Simplest: first name, or "Mr/Mrs/Ms <surname>", or the full name. Do this in a matcher of its own for `workmateNamedIn`, not by changing `namesPerson`: `namesPerson` is exported and also used by `aside.ts`, the challenge and leave checks in `guardOverhears`, and `strangerNamedIn`, where a surname alone is wanted.
4. Read job titles: for each workmate whose job is known (`brain.peopleInView`, `brain.pdaPeople`), the job title and the shorthand list PARSE-02 proposes (qm, hop, ce, hos) name that workmate when exactly one holds it.
5. Keep crew NPCs' own answers working: `explainStep` says "Zim asked me to come in here, to clean the floor." with the first name, which still matches.

## How to test the fix

- A table in `tools/llm_crew/` running `guardOverhears` with the rows above (brain: `makeBrain('Donna Sholl', 'Cargo Technician')`, `post` and `location` the Cargo Bay, `workmates` a Set of the three, the stranger in `brain.strangers` with `askedAt` before the event's `at`, `said_to: 'me'`), wanting: "Donna, the quartermaster asked me to come in" voucher Ann Moss when Ann is known as the Quartermaster, else no verdict and no voucher; "sorry donna, im here for my crate" and "hi donna! just here to pick up my order" no verdict and no voucher (asked again); "Donna let me in" and "Donna, you let me in" go; "the QM sent me" voucher the Quartermaster; "cargo tech let me in, donna" no voucher by surname; "Sam let me in" and "Ann sent me, Donna" vouchers Sam Tech and Ann Moss, as now.
- `bun tools/llm_crew/sim.ts quiet vouch` and `quiet evict` must still pass.
