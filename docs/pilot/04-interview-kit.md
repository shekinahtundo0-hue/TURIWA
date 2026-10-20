# Day 4 — Interview kit for three chama officials

The interviews themselves have to be run by a person, on a phone call or in a room, with
Kenyan time and Kenyan trust: **this is the instrument, not the result.** Fill in §6 as you
go. Target: three officials, ideally from three different groups, one of each role
(treasurer, secretary, chairperson), 25–35 minutes, KSh 200 airtime afterwards as a
thank-you if the relationship needs it.

Every question below exists because the code disagrees with reality somewhere. Day 2 and
Day 3 produced a list of assumptions this app was built on; the interviews either confirm
them or kill them. Nothing here is a sales script.

## 1. Who to book, and why that specific person

| Role | What only they can tell you | Book first |
| --- | --- | --- |
| Treasurer | How money is actually recorded, and what they fear at audit time | ✔ the highest-value interview |
| Secretary | What members argue about, and what gets written down late | |
| Chairperson | Who is allowed to spend, and how a dispute ends | |

Ask for a group of **10–50 members** that meets weekly, bi-weekly or monthly. Avoid your
own group — you cannot interview your own chama, they already know what you think.

## 2. Opening (2 minutes, say it out loud, do not skip)

> "I'm not selling you anything today. I'm building a tool for group savings and I need to
> understand how your chama actually works before I decide what it should do. Can I ask
> you about the last few months, and take notes? Nothing you say leaves this conversation."

Record nothing without asking. Names optional — ask for permission to note the group's
size and meeting rhythm only.

## 3. Their current system (10 minutes — the answers here matter most)

1. Walk me through the last meeting from the moment money came in. Who counted it, who
   wrote it down, and where did it go?
2. What do you keep records in today? *(note exact artefact: exercise book, Excel,
   M-Pesa SMS, a WhatsApp thread, a SACCO app, none)*
3. Show me that record if you can — how many pages/rows is it now?
4. What does the book get wrong, or make hard, that you'd fix first if it took five
   minutes?
5. When a member says "I paid", and the book says they didn't — what happens?
6. Have you ever lost money or had a dispute you couldn't resolve from your records? What
   happened?
7. Who checks the treasurer's book, and how often?

**Hypotheses to listen for** (from the audit and the test cycle):

| If they say | It confirms |
| --- | --- |
| "M-Pesa is my book" / "I copy from the SMS" | no provider reference in our schema (finding §3.6) — reconciliation is a real need |
| "I write it at home that evening" | the ledger is entered late and from memory, so a phone-first record is worth something |
| "The treasurer also keeps the money" | four-eyes approval is not a nice-to-have, it's the trust story |
| "We argue about who paid what every month" | free-text `member` attribution (Day 3 §2.3) is the wrong model; a roster-driven one is right |
| "We lost a page once" / "the book got wet" | backup/cloud is a selling point, not a technical footnote |
| "Joining fee is the first thing we collect" | the missing `Joining` ledger type (Day 3 §2.2) is a real blocker |

If they say none of these, write down what they actually care about — that is the finding.

## 4. Money rules in their group (7 minutes)

8. How much does a member pay, how often, and what happens when they're late?
9. Is there welfare? Is it separate money, or the same pot?
10. What are your loan rules: who may borrow, how much, what interest, how repaid, and who
    must agree before the money moves?
11. Who can spend the group's money without asking anyone? What is the biggest amount they
    can spend alone?
12. At the end of the year, what does a member get? How is it worked out?

*Why: questions 10–11 decide whether the current single-record-keeper model
(§2 of the audit) is a limitation or a non-issue for real groups, and whether the loan
invisibility from Day 3 §2 actually bothers anybody.*

## 5. Tooling and willingness to pay (8 minutes)

13. What have you tried? *(Excel, WhatsApp, a bank app, another chama app — name it)* What
    made you stop using it?
14. Who in the group is good with a phone? Would the treasurer's phone be enough?
15. Would you want every member to see the book, or only the officials? What would you
    worry about if everyone could see it?
16. If this tool existed and worked, what would you expect to pay for it per month?
17. Then tell them the price ladder and take the answer, no negotiation:
    **free with one group and 10 records / KSh 500 a month per group / KSh 1,500 a month
    for unlimited groups / your own number.**
    - Which one would you actually pay, today, from who holds the money?
    - Who signs off that expense in your group?
    - What would have to be true before you'd hand over KSh 500 every month?
18. If we started with your group next week, what one thing would have to work in the
    first month or you'd stop using it?

*Do not answer 15–18 for them. Silence is part of the question.*

## 6. Results sheet — copy one column per interview

| | A (treasurer) | B (secretary) | C (chair) |
| --- | --- | --- | --- |
| Name / contact (with permission) | | | |
| Group size, meeting rhythm | | | |
| Current record | | | |
| Top 3 problems in their own words | | | |
| Ever lost money/dispute from records? | | | |
| Who checks the treasurer? | | | |
| Loan rules + who approves | | | |
| Tried before, why stopped | | | |
| Members see the book? (yes/no + fear) | | | |
| Price they'd pay / who signs off | | | |
| Must-work-or-they-quit | | | |
| Verbatim quote worth repeating | | | |
| Follow-up demo? (date) | | | |

## 7. After the three interviews (30 minutes, same day)

1. Transcribe the verbatim quotes first — the wording is the data, not a summary of it.
2. Count each problem across the three groups. **Anything mentioned by 2 of 3 is a
   requirement**; anything mentioned once is a note.
3. Write one number per interview: would they pay, yes / no / "ask me after the pilot".
   Anything under 2 yeses is a pricing problem, not a product problem.
4. Bring the ranked list, the quotes and the pricing answers to Day 5 — that day's
   priorities are supposed to be decided by this evidence, not by what the codebase made
   easy.
5. Say thank you and give the airtime. Note the meeting date for the pilot demo (Day 7).

## 8. Interviewer discipline

- Ask about the **last meeting**, not "normally". People describe an ideal, not a fact.
- "Show me" beats "tell me". A photo of an exercise book page is worth ten answers.
- Never correct them, never defend their current system, never mention our app's features
  before question 13.
- If they ask "so does it do X?", write X down and say "I'll show you on Thursday."
- Stop at three. Three groups you can reach beat ten you cannot.
