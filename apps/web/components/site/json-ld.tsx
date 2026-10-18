import { serializeJsonLd } from "../../lib/seo/json-ld.ts";

/**
 * A page's structured data for search engines and AI search, in one
 * `<script type="application/ld+json">` (`lib/seo/json-ld.ts` builds it, ADR 0040).
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON whose every < is escaped by serializeJsonLd
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
