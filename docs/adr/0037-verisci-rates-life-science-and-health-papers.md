# 0037. VeriSci rates life-science and health papers

- Status: Accepted
- Date: 2026-10-11

## Context

A rating checks how completely a paper reports its work, against the reporting checklists written for its kind of study ([0018](0018-phase-1-scorer-output-contract.md)). Those checklists (CONSORT for trials, ARRIVE for animal research, MDAR for laboratory work, PRISMA for systematic reviews) exist for biology and medicine. A physics or computer-science paper answers none of their checks, so a score for it would say nothing. VeriSci is a DeSci app for the life sciences.

## Decision

- VeriSci rates papers in the life sciences and health: biology, medicine, health, neuroscience, pharmacology, public health and bioinformatics, and psychology when the study is about health.
- The phase-1 scorer decides whether a paper is in that field. A rating request for a paper outside it is cancelled with reason "invalid target" ([0011](0011-a-rating-is-a-separate-r-ka.md)).

## Consequences

- Every rating holds a paper to the checks of its own kind of study, so scores compare like with like.
- A model decides the field from the paper's text. A paper at the edge, such as an epidemic model or the chemistry of a drug, may be classed either way.
- Publishing does not check the field yet: a paper outside it can be published, and a request to rate it is cancelled.
