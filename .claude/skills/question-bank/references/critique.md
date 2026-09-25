# The four critique passes

Run **separately**, one perspective per subagent, after a bank is drafted and before it goes to a
human expert. Separately matters: asked to hold four perspectives at once, a model produces one
blended review that finds the obvious defects and nothing else. Each pass gets the bank, the
blueprint, and its own brief — and nothing about the other three.

Each pass returns findings **against named slugs**, in this shape:

```
<question-slug or rubric-slug>: <what is wrong> — <what would fix it>
```

Every finding is then either **applied as an edit**, or **recorded in `reviewer_notes`** when it is
a judgement an expert should make rather than one a model should. Say which in the blueprint's
critique appendix, with the count: "fairness pass, 11 findings — 7 applied, 4 to `reviewer_notes`".

A pass that returns nothing has failed. Say so and run it again with a sharper brief.

---

## Pass 1 — a senior engineer who interviews for this role at a Nigerian company

You hire juniors and mid-level engineers here. You have sat on the other side of this table many
times, and you have a limited hour.

- **Would I actually ask this, at this level?** Not "is it fair" — have you asked it, or heard it
  asked, of someone at this stage? A question only a textbook would ask teaches candidates the wrong
  thing to prepare for.
- Does a good answer tell me anything I could not get from the CV?
- Is it the _cheapest_ question that discriminates? An hour holds six questions, not sixteen.
- Where does the conversation go after the answer? A question with no follow-up is a quiz.
- Is the difficulty right, or is it a mid question wearing a junior label?

## Pass 2 — a hiring manager abroad hiring remote Nigerian developers

You are filling a remote role on a distributed team. You care about who works out at month six.

- **Does a strong answer here predict someone who works out on my team?**
- Does it test something that survives contact with an unfamiliar codebase, or only recall?
- Does it reward the habits remote work actually needs — writing clearly, saying what you do not
  know, escalating before the deadline, working when nobody is watching?
- Is it portable, or does it assume one company's tooling and process?

## Pass 3 — a nervous junior candidate

You have prepared for weeks. This is your third interview ever and you want it badly.

- **Do I understand what is being asked?** Read the prompt once, as it will be spoken — the engine
  says it out loud and does not repeat it unprompted.
- Does it feel like a trap — is there a "right" answer I am being led away from?
- Is there jargon I would have to know before I could start answering, as opposed to jargon the
  answer is about?
- Is the context enough to answer from, or am I guessing at what was left out?
- If I froze here, would I know what the interviewer wanted more of?

## Pass 4 — a fairness reviewer

You are looking for the ways this bank scores something other than competence.

- **Hierarchy norms.** Does it punish a candidate whose workplace forbids disagreeing upward, or who
  was never in the room where the decision was made? (`pushing-back-on-a-release` and
  `stuck-and-asked-for-help` both carry exactly this worry in their own notes today.)
- **Assumed access.** Paid tools, a fast laptop, stable broadband, a company with a staging
  environment, a team with code review at all. Much of this audience has learned on a phone-tethered
  connection and a second-hand machine.
- **Assumed experience.** "Tell me about a production incident" assumes production. "When you
  mentored someone" assumes juniors below them.
- **Jargon and idiom.** Untranslated shorthand, sports and cultural metaphors, and anything that
  reads as a test of English rather than of engineering.
- **Rubric wording.** Does any descriptor reward fluency, confidence or accent over content? "States
  it confidently" at level 4 is the canonical defect — score what was said, not how it sounded.
- **Naming and scenarios.** Do the names, currencies, companies and situations in the prompts look
  like this candidate's world, or like an imported one? (₦, Lagos traffic on the way to standup, a
  bank's USSD flow, a phone that drops to 2G — these are not decoration, they are the setting the
  candidate reasons in.)

---

## After the passes

Both of the first two passes finding the same thing is strong evidence; passes 3 and 4 finding
something the first two did not is the whole reason they are run separately.

**Four AI critique passes are still one model.** They remove the defects an expert should not have
to spend time on. They do not substitute for the expert, and nothing here changes `author:
ai_draft` or the production publish guard. The measure of success is that the expert's notes come
back about judgement, not about typos and stale versions.
