/** Package name, imported by the web app's package test (`apps/web/app/packages.test.ts`). */
export const coreName = "@verisci/core";

export {
  type AssetNameError,
  type AssetNameResult,
  rKaName,
  targetKaName,
} from "./asset-names.ts";
export { BASE_SEPOLIA_CHAIN_ID } from "./chains.ts";
export {
  CHECKS,
  type Check,
  type CheckId,
  checklistOf,
  STUDY_TYPES,
  type StudyType,
} from "./checklists.ts";
export { canonicalCid } from "./cid.ts";
export {
  knowledgeAssetToken,
  ORIGINTRAIL_CONTRACTS,
  type OriginTrailContracts,
} from "./origintrail.ts";
export {
  type PaperListing,
  paperAuthorsQuery,
  paperCountQuery,
  paperListQuery,
  parsePaperAuthors,
  parsePaperCount,
  parsePaperListing,
  publishedPaperQuery,
} from "./paper-list.ts";
export {
  type PaperRecord,
  paperRecordQuery,
  parsePaperRecord,
  type QueryBinding,
} from "./paper-record.ts";
export {
  normalizeForQuote,
  type PaperText,
  type PreparePaperResult,
  preparePaperText,
  type QuoteText,
  quoteFound,
  quoteTextOf,
} from "./paper-text.ts";
export {
  classifyTarget,
  paperPdfQuery,
  parseRating,
  pdfCidOf,
  type RatingContent,
  type RatingRecord,
  ratingQuery,
  rKaQuads,
  type TargetClass,
  triplesFromBindings,
} from "./rating.ts";
export {
  CHECK_ANSWERS,
  type CheckAnswer,
  type CheckResult,
  FIELDS,
  type Field,
  parseScorerAnswer,
  SCORER_OUTPUT_SCHEMA,
  SCORER_PROMPT_VERSION,
  type ScorerAnswer,
  type ScorerOutput,
  scoreChecks,
  scorerPrompt,
} from "./scorer.ts";
export {
  canonicalContextGraph,
  SUBMISSION_DOMAIN,
  type SubmissionMessage,
  submissionTypedData,
} from "./submission.ts";
export { type PaperSubmission, type Triple, targetKaQuads, VERISCI_NS } from "./target-ka.ts";
export { type PaperMetadata, parseTeiHeader, type TeiResult } from "./tei.ts";
export {
  formatUal,
  isSameUal,
  type NormalizeUalResult,
  normalizeUal,
  type ParseUalResult,
  parseUal,
  type Ual,
  type UalError,
} from "./ual.ts";
