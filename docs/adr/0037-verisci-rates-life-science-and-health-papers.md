# 0037. VeriSci publishes and rates life-science and health papers

- Status: Accepted
- Date: 2026-10-11

## Context

A rating checks how completely a paper reports its work, against the reporting checklists written for its kind of study ([0018](0018-phase-1-scorer-output-contract.md)). Those checklists (CONSORT for trials, ARRIVE for animal research, MDAR for laboratory work, PRISMA for systematic reviews) exist for biology and medicine. A physics or computer-science paper answers none of their checks, so a score for it would say nothing. VeriSci is a DeSci app for the life sciences.

## Decision

- VeriSci publishes and rates papers in the life sciences and health: biology, medicine, health, neuroscience, pharmacology, public health and bioinformatics, and psychology when the study is about health.
- Publishing checks the field: a small Gemini model reads a new paper's title, abstract and the start of its text, and a paper outside the field is refused before anything is stored. When the check cannot answer, the paper is published and its rating checks the field.
- The phase-1 scorer decides whether a paper is in that field. A rating request for a paper outside it is cancelled with reason "invalid target" ([0011](0011-a-rating-is-a-separate-r-ka.md)).

## Consequences

- Every rating holds a paper to the checks of its own kind of study, so scores compare like with like.
- A model decides the field from the paper's text. A paper at the edge, such as an epidemic model or the chemistry of a drug, may be classed either way.
- Papers published before the check, or while it could not answer, can be outside the field; a request to rate one is cancelled. The two checks read different parts of the paper and can disagree on a paper at the edge.

## History

- 2026-10-12: publishing checks the field too, with a small Gemini model, so a paper outside it is refused rather than published and then cancelled; retitled from "VeriSci rates life-science and health papers" (scope and branding plan, user's choice).
