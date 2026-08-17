const blockedPathParts = ["/search", "/s/", "/b/", "/keyword", "/collections/", "/category/", "/categories/", "/browse/"];
const retailerProductPaths: [string, RegExp][] = [
  ["homedepot.com", /^\/p\//],
  ["lowes.com", /^\/pd\//],
  ["target.com", /^\/p\//],
  ["walmart.com", /^\/ip\//],
  ["ikea.com", /\/p\//],
  ["wayfair.com", /\/pdp\//],
  ["westelm.com", /^\/products\//],
  ["potterybarn.com", /^\/products\//],
  ["crateandbarrel.com", /\/[sf]\d+$/],
  ["lampsplus.com", /^\/(p|products)\//],
  ["rugsusa.com", /^\/products\//],
];

export function isDirectProductUrl(value?: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || !hostname.includes(".")) return false;
    const path = url.pathname.toLowerCase().replace(/\/+$/, "");
    if (!path || blockedPathParts.some(part => path.includes(part))) return false;
    if (url.searchParams.has("q") || url.searchParams.has("query") || url.searchParams.has("keyword")) return false;
    const retailer = retailerProductPaths.find(([domain]) => hostname === domain || hostname.endsWith(`.${domain}`));
    return retailer ? retailer[1].test(path) : true;
  } catch {
    return false;
  }
}

export function verifiedPriceLabel(status?: "verified" | "estimate", checkedAt?: string) {
  if (status !== "verified" || !checkedAt) return "Estimated price";
  const checked = new Date(checkedAt);
  return Number.isNaN(checked.getTime()) ? "Price verified at generation" : `Price checked ${checked.toLocaleString()}`;
}
