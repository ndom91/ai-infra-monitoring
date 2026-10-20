const SITE_URL = "https://artificialliabilities.com";
const SITE_NAME = "Artificial Liabilities";
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;

export function pageHead(path: string, title: string, description: string) {
  const url = `${SITE_URL}${path}`;
  return {
    meta: [
      { title: `${title} | ${SITE_NAME}` },
      { name: "description", content: description },
      { property: "og:title", content: `${title} | ${SITE_NAME}` },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:site_name", content: SITE_NAME },
      { property: "og:image", content: DEFAULT_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: SITE_NAME },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: `${title} | ${SITE_NAME}` },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: DEFAULT_IMAGE },
      { name: "twitter:image:alt", content: SITE_NAME },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

export { DEFAULT_IMAGE, SITE_NAME, SITE_URL };
