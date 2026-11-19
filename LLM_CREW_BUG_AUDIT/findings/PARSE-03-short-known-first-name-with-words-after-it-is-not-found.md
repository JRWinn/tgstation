---
id: PARSE-03
title: A warrant on someone known by a first name of three letters fails if any word follows it, so arrest bob pls is a warrant on bob pls and nobody is arrested
kind: bug
severity: medium
effort: small
confidence: sure
status: confirmed
found_by: Opus 5.5
checked_by: Opus 5.5
area: security
files: tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:359, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:141, tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:149
fix: In readWarrant, before closeName, try each leading run of the cut words against known first names and full names exactly, so the first word alone can find its one owner
---

## What is wrong

See also: SECT-03 (the same swallowing of words for a name the reader does **not** know). This one is about a person the reader **does** know, and has a different cause.

When the words after "arrest" do not begin with a known full name, `readWarrant` cuts them at a comma, " for ", " and " or a time, keeps up to four words, and then tries two ways to find who is meant:

1. `owners`: everyone known whose first name equals **the whole of those words**. "bob pls" is nobody's first name.
2. `closeName` on the first 4, 3, 2, then 1 of those words. For the single word "bob", `closeName` does nothing: a word under four letters is never compared with a first name (`want.length >= 4 ? ... : 99`), and its slack is 0 against the whole squashed name "bobhale".

So a first name of three letters is only ever found when it is the **last** word before the cut. Any word after it, and the warrant is on the words themselves. In `strings/names/` there are 42 such first names: Ali, Eli, Ian, Jay, Jim, Joe, Kai, Leo, Max, Roy, Sam, Tim, Amy, Ann (in tests), Ava, Eva, Ivy, May, Mia, Sue, Zoe and more.

A warrant on "bob pls" matches nobody (`sameName` needs every word in the person's name), so Bob Hale walks past the officer for the rest of the round, and every head reads "bob pls" out at each meeting. Because `jobOf(brain, "bob pls")` finds no job, the checks that refuse a warrant on the Captain, a head, or security's own staff are skipped as well.

Four-letter names are not hit: "arrest dana pls" finds Dana Reyes, because `closeName("dana")` is compared with the first name "dana".

## Where

`tgui/packages/tgui/interfaces/CrewBrain/jobs/security.ts:353`, in `readWarrant`:

    const raw = cut === -1 ? rest : rest.slice(0, cut);
    const every = raw.split(/\s+/);
    const words = every.slice(0, 4);
    name = tidyName(words.join(' '));
    after = cut === -1 ? '' : rest.slice(cut);
    // A first name alone is whoever it knows of by that first name, if there is only one.
    const owners = known.filter(
      (it) => firstName(it).toLowerCase() === (name ?? '').toLowerCase(),
    );
    if (owners.length === 1) {
      name = owners[0];
    } else {
      ...
      for (let count = words.length; count > 0; count--) {
        const meant = closeName(words.slice(0, count).join(' '), known);

`security.ts:139`, `closeName`:

    const want = squash(raw);
    if (want.length < 3) {
      return undefined;
    }
    ...
        apart: Math.min(
          lettersApart(want, squash(name)),
          want.length >= 4 ? lettersApart(want, squash(firstName(name))) : 99,
        ),

## How it was found

Run. A throwaway script (`parse/warrant2.ts` in the scratchpad) called `readWarrant` with Bob Hale, Dana Reyes, Ann Moss, Tom Reed and Eli Moor known, and `sameName` on the result:

    "arrest bob"                  {"name":"Bob Hale"}          matches: Bob Hale
    "arrest bob pls"              {"name":"bob pls"}           matches: (none)
    "arrest bob in the bar"       {"name":"bob in the bar"}    matches: (none)
    "arrest ann in the bar"       {"name":"ann in the bar"}    matches: (none)
    "arrest tom he stole my id"   {"name":"tom he stole my"}   matches: (none)
    "arrest eli who is in the bar" {"name":"eli who is in"}    matches: (none)
    "warrant for ann - theft"     {"name":"ann - theft"}       matches: (none)
    "arrest dana in the bar"      {"name":"Dana Reyes","reason":"in the bar"}  matches: Dana Reyes
    "arrest dana pls"             {"name":"Dana Reyes","reason":"pls"}         matches: Dana Reyes

Not seen in a round log. The desk reads the warrant as given (it is not null), so the LLM reader of last resort is never asked.

## How to fix it

1. In `readWarrant`, in the branch for a name it does not know in full, before the `owners` test, walk the cut words from the front: for `count` from 1 up to `words.length`, take `words.slice(0, count).join(' ')` and look for exactly one known person whose first name, or whole name, equals it (case-insensitive). The longest run that finds exactly one owner wins; the rest of the words go into `after`, as the `closeName` loop already does.
2. Keep the `closeName` loop after it for misspellings. In `closeName`, allow the first-name comparison for three-letter words with slack 0 (exact), so "bob" alone also finds Bob Hale there: change `want.length >= 4` to `want.length >= 3`. Two people with that first name still give undefined (the tie test), which is right.
3. Add "pls", "plz", "pl0x" and "thx" to `FILLER`.
Step 2 alone mends every case above: the `closeName` loop already counts down to the first word alone, and only the length test stops "bob" there. Step 1 then adds little; take step 2 and 3 first. Either way, a first name alone is taken for the one known person who has it, as it already is for four-letter names: "arrest joe smith" with an unknown Joe Smith and a known Joe Bloggs becomes a warrant on Joe Bloggs. That is how "dana smith" behaves today, so it is not new, but the test cases should hold one such line so the owner sees it.
4. Leave SECT-03's fix (stop an unknown name at a word that cannot be part of one) to that finding; the two should be done together.

## How to test the fix

- Add the lines above to the `readWarrant` cases in `tools/llm_crew/security.ts`, each wanting the known full name, with "in the bar", "he stole my id" or "theft" as the reason.
- Keep "warrant for Bob the clown" behaving as the owner decides in SECT-03.
- Next round, grep `pda.log` for `I have that: a warrant for` and check each name is a whole crew name.

## Check

Checked by Opus 5.5. The quotes match `readWarrant` and `closeName` in jobs/security.ts today. Ran a throwaway script in the scratchpad with bun, importing security.ts by absolute path, known Bob Hale, Dana Reyes, Ann Moss, Tom Reed, Eli Moor: "arrest bob pls" gave `{"name":"bob pls"}` matching nobody, "arrest bob in the bar" gave "bob in the bar", "warrant for ann - theft" gave "ann - theft", "arrest tom he stole my id" gave "tom he stole my"; "arrest bob", "arrest Bob now" (FILLER takes "now"), "warrant for Tom, theft" and "arrest dana pls" were read right. The one caller that matters, `deskTakes` (desk.ts:463), takes the name as read: `jobOf` on "bob pls" and the `sameName` lookup both find nobody, so the refusals for the Captain, a head or security are skipped, and the LLM reader is never asked because the result is not null. Nothing in LLM_CREW_CHANGELOG.md or the plans mends it (the M5 entry added FILLER and `closeName` but not for three-letter words). `strings/names/first_male.txt` and `first_female.txt` hold 40 first names of three letters, Max, Sam and Tim among them, so this will come up. Severity medium and effort small stand. Added a note that step 2 alone is enough and that a first name alone can still pick a known person when someone unknown was meant.
