/**
 * The kinds of study the phase-1 scorer tells apart (ADRs 0018, 0037), each with the reporting
 * checklist its checks are drawn from. The checks are worded in our own words; their sources:
 * CONSORT 2025 (randomized trials), STROBE (observational studies), ARRIVE 2.0 (animal
 * research, CC0), MDAR (life-science laboratory work, CC BY 4.0), PRISMA 2020 (systematic
 * reviews), SANRA (narrative reviews), and the DOME recommendations (machine learning in
 * biology). The expectations that depend on the kind of study, and the credit for a statement
 * that a check does not apply, follow the Rigor and Transparency Index (Menke et al., iScience
 * 2020; JMIR 2022).
 */
export const STUDY_TYPES = [
  {
    id: "randomized-trial",
    label: "a randomized controlled trial in people",
    source: "CONSORT 2025",
  },
  {
    id: "observational",
    label: "an observational study of people: cohort, case-control or cross-sectional",
    source: "STROBE",
  },
  { id: "animal", label: "an experiment on live animals", source: "ARRIVE 2.0" },
  {
    id: "lab",
    label: "a laboratory study of cells, tissues, molecules or microbes",
    source: "MDAR",
  },
  {
    id: "systematic-review",
    label: "a systematic review or meta-analysis of published studies",
    source: "PRISMA 2020",
  },
  {
    id: "narrative-review",
    label: "a narrative review of a topic, without a systematic search",
    source: "SANRA",
  },
  {
    id: "computational",
    label: "a computational study: bioinformatics, modelling or machine learning on data",
    source: "DOME",
  },
  {
    id: "other",
    label:
      "any other kind, such as a case report, a qualitative study, a protocol or a diagnostic accuracy study",
    source: "none",
  },
] as const;

/** One of {@link STUDY_TYPES}' ids. */
export type StudyType = (typeof STUDY_TYPES)[number]["id"];

/** What each check asks of a paper, in the words the scorer's prompt uses. */
export const CHECKS = {
  "data-availability":
    "says where the data behind the results can be found, or why they cannot be shared",
  "code-availability":
    "says where the analysis code or scripts can be found, or that no custom code was written",
  funding: "states who funded the work, or that it had no funding",
  conflicts: "states the authors' competing interests, or that there are none",
  ethics:
    "names the ethics approval for work on people or animals, and the consent of the people studied",
  limitations: "discusses the limitations of the study",
  registration:
    "gives a registration or a protocol published before the study began (a trial registry, PROSPERO, OSF)",
  "sample-size": "explains how the sample size was chosen, such as with a power calculation",
  randomization:
    "says how participants, animals or samples were randomly allocated, and by what method",
  "allocation-concealment": "says how the allocation was kept concealed until assignment",
  blinding:
    "says who was blinded (participants, carers, assessors, analysts) and how, or that no one was",
  "primary-outcome": "defines the primary outcome and when it was measured",
  "participant-flow":
    "gives the number of participants at each stage: enrolled, allocated, followed up and analysed",
  "effect-estimates": "reports effect sizes with confidence intervals, not only p-values",
  harms: "reports harms or adverse events in each group",
  "design-setting": "describes the study design, its setting, locations and dates",
  eligibility: "gives the eligibility criteria: who or what was included and excluded",
  confounding: "names the confounders and says how the analysis adjusted for them",
  "missing-data": "says how missing data were handled",
  subjects: "describes the animals: species, strain, sex, and age or weight",
  "inclusion-exclusion":
    "gives the criteria for including or excluding animals or data points, and the exclusions made",
  "exact-n": "gives the exact number of animals or samples in each group for each analysis",
  statistics: "names the statistical methods used for each analysis",
  "resources-identified":
    "identifies key resources (antibodies, cell lines, organisms, plasmids) by supplier and catalogue number or RRID",
  "software-identified": "names the software, with versions, used for the analysis",
  "cell-line-authentication": "says how cell lines were authenticated and tested for mycoplasma",
  replicates: "states the number of replicates and whether they are biological or technical",
  "sex-variable":
    "reports the sex of the animals, people or cells studied, or why sex was not considered",
  search: "describes how the literature was searched: databases or sources, dates and search terms",
  selection: "describes how studies were screened and selected, and by how many reviewers",
  "risk-of-bias": "assesses the risk of bias of the included studies",
  synthesis: "describes how the results of the studies were combined",
  "study-flow": "gives the number of records found, screened, excluded and included",
  importance: "explains why the topic matters",
  aims: "states the review's aims or questions",
  referencing: "supports its key statements with references",
  reasoning: "weighs the strength of the evidence it cites, rather than only listing it",
  "data-presentation":
    "presents relevant results of the studies it cites, such as outcomes or numbers",
  "data-source": "identifies the datasets used, with accession numbers, versions or links",
  parameters: "gives the settings or hyperparameters needed to run the analysis again",
  validation: "validates the results on independent data or by cross-validation",
  uncertainty: "reports results or performance with a measure of uncertainty",
  baseline: "compares the method with existing methods or a baseline",
  "methods-described": "describes how the work was done in enough detail to repeat it",
} as const;

/** One of {@link CHECKS}' ids. */
export type CheckId = keyof typeof CHECKS;

/**
 * A check of a study type's checklist: `required` checks always count; a `conditional` one
 * may not apply to a given paper, and then leaves the count.
 */
export interface Check {
  readonly id: CheckId;
  readonly label: string;
  readonly applies: "required" | "conditional";
}

type Entry = CheckId | `${CheckId}?`;

/** Each study type's checks in prompt order; `?` marks a conditional one. */
const CHECKLISTS: Readonly<Record<StudyType, readonly Entry[]>> = {
  "randomized-trial": [
    "sample-size",
    "randomization",
    "allocation-concealment",
    "blinding",
    "primary-outcome",
    "participant-flow",
    "effect-estimates",
    "harms",
    "registration",
    "ethics",
    "data-availability",
    "code-availability?",
    "funding",
    "conflicts",
    "limitations",
  ],
  observational: [
    "design-setting",
    "eligibility",
    "sample-size",
    "confounding",
    "missing-data",
    "participant-flow",
    "effect-estimates",
    "registration?",
    "ethics",
    "data-availability",
    "code-availability?",
    "funding",
    "conflicts",
    "limitations",
  ],
  animal: [
    "subjects",
    "sample-size",
    "randomization",
    "blinding",
    "inclusion-exclusion",
    "exact-n",
    "statistics",
    "ethics",
    "data-availability",
    "code-availability?",
    "funding",
    "conflicts",
    "limitations",
  ],
  lab: [
    "resources-identified",
    "software-identified?",
    "cell-line-authentication?",
    "replicates",
    "statistics",
    "randomization?",
    "blinding?",
    "sex-variable?",
    "ethics?",
    "data-availability",
    "code-availability?",
    "funding",
    "conflicts",
    "limitations",
  ],
  "systematic-review": [
    "search",
    "eligibility",
    "selection",
    "risk-of-bias",
    "synthesis",
    "study-flow",
    "registration",
    "ethics?",
    "data-availability",
    "code-availability?",
    "funding",
    "conflicts",
    "limitations",
  ],
  "narrative-review": [
    "importance",
    "aims",
    "search",
    "referencing",
    "reasoning",
    "data-presentation",
    "ethics?",
    "data-availability?",
    "code-availability?",
    "funding",
    "conflicts",
    "limitations",
  ],
  computational: [
    "data-source",
    "software-identified",
    "parameters",
    "validation",
    "uncertainty",
    "baseline",
    "ethics?",
    "data-availability",
    "code-availability",
    "funding",
    "conflicts",
    "limitations",
  ],
  other: [
    "methods-described",
    "statistics?",
    "ethics?",
    "data-availability?",
    "code-availability?",
    "funding",
    "conflicts",
    "limitations",
  ],
};

/**
 * The checks a paper of `type` is held to, in the order the scorer's prompt lists them: the
 * study type's own checks, then those every paper is asked (ethics, data and code availability,
 * funding, competing interests, limitations), each `required` or `conditional` for that type.
 */
export function checklistOf(type: StudyType): readonly Check[] {
  return CHECKLISTS[type].map((entry) => {
    const conditional = entry.endsWith("?");
    const id = (conditional ? entry.slice(0, -1) : entry) as CheckId;
    return { id, label: CHECKS[id], applies: conditional ? "conditional" : "required" };
  });
}
