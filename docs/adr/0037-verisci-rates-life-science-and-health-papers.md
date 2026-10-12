# 0037. VeriSci publishes and rates life-science and health papers

- Status: Accepted
- Date: 2026-10-11

## Context

A rating checks how completely a paper reports its work, against the reporting checklists written for its kind of study ([0018](0018-phase-1-scorer-output-contract.md)). Those checklists (CONSORT for trials, ARRIVE for animal research, MDAR for laboratory work, PRISMA for systematic reviews) exist for biology and medicine. A physics or computer-science paper answers none of their checks, so a score for it would say nothing. VeriSci is a DeSci app for the life sciences.

## Decision

- VeriSci publishes and rates papers in the life sciences and health: biology, medicine, health, neuroscience, pharmacology, public health and bioinformatics, and psychology when the study is about health.
- Publishing checks the field: a small Gemini model reads a new paper's title, abstract and the start of its text before anything is stored. A paper it places outside the field is refused. When it gives no answer (an outage, a rate limit, the free tier's daily limit used up), the paper is published and its rating checks the field. When Gemini refuses the request (a bad key, a retired model), it is a setup error: publishing stops until it is fixed.
- The phase-1 scorer decides whether a paper is in that field. A rating request for a paper outside it is cancelled with reason "invalid target" ([0011](0011-a-rating-is-a-separate-r-ka.md)).

## Consequences

- Every rating holds a paper to the checks of its own kind of study, so scores compare like with like.
- A model decides the field from the paper's text. A paper at the edge, such as an epidemic model or the chemistry of a drug, may be classed either way.
- Papers published before the check, or while it could not answer, can be outside the field; a request to rate one is cancelled. The two checks read different parts of the paper and can disagree on a paper at the edge.
- The check sends a paper's title, abstract and the start of its text to Gemini's free tier, where Google may use them; the PDF is already public on IPFS by then, as for the scorer ([0018](0018-phase-1-scorer-output-contract.md)).

## History

- 2026-10-12: publishing checks the field too, with a small Gemini model, so a paper outside it is refused rather than published and then cancelled; retitled from "VeriSci rates life-science and health papers" (scope and branding plan, user's choice).
- 2026-10-12: Gemini refusing the field check's request is a setup error that stops publishing, so a bad key never lets papers through unchecked (scope and branding plan's review, user's choice).
- 2026-10-12: the check's three outcomes stated in one place, a used-up daily limit counting as no answer, so the paper is published; and what the check sends to Gemini's free tier (ADR sweep, user's choices).
