import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "data");
const OUTPUT_CSV = path.join(DATA_DIR, "projects.csv");
const OUTPUT_SQL = path.join(DATA_DIR, "projects.sql");
const OUTPUT_JSON = path.join(DATA_DIR, "projects.json");

const GITHUB_TREE_URL =
  "https://api.github.com/repos/coinbase/x402/git/trees/main?recursive=1";
const RAW_BASE_URL =
  "https://raw.githubusercontent.com/coinbase/x402/main/";
const USER_AGENT =
  "x402archive-script/0.1 (+https://github.com/Calcutatator/x402archive)";

const WEBSITE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
};

const EXCLUDED_SLUGS = new Set([
  "402104",
  "mcp-example",
  "node-servers",
  "proxy402",
  "tip-md",
  "x402-examples",
  "x402-facilitator",
  "x402-rs-facilitator",
  "x402station",
  "zyte",
]);

const TWITTER_OVERRIDES = new Map([
  ["aeon", "https://x.com/AEON_Community"],
  ["aurracloud", "https://x.com/AurraCloud"],
  ["axios-fetch-clients", "https://x.com/axios"],
  ["bonsai", "https://x.com/onbonsai"],
  ["daydreams", "https://x.com/daydreamsagents"],
  ["fluora", "https://x.com/fluora_ai"],
  ["heurist-mcp-portal", "https://x.com/heurist_ai"],
  ["mogami-facilitator", "https://x.com/mogami_tech"],
  ["pinata", "https://x.com/pinatacloud"],
  ["snackoney", "https://x.com/snackmoneyapp"],
  ["thirdweb-client", "https://x.com/thirdweb"],
  ["thirdweb-infra", "https://x.com/thirdweb"],
  ["tweazy", "https://x.com/aaronjmars"],
]);

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.github+json",
      ...headers,
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`Request failed (${res.status} ${res.statusText}) for ${url}`);
  }

  return res.json();
}

async function fetchText(url, headers = {}) {
  const res = await fetch(url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`Request failed (${res.status} ${res.statusText}) for ${url}`);
  }

  return res.text();
}

function extractSlug(metadataPath) {
  const parts = metadataPath.split("/");
  const slugIndex = parts.indexOf("partners-data");
  if (slugIndex === -1 || slugIndex + 1 >= parts.length) {
    throw new Error(`Unexpected metadata path: ${metadataPath}`);
  }

  return parts[slugIndex + 1];
}

function deriveMainnetSummary(partner) {
  if (!partner.facilitator) {
    return "Unknown";
  }

  const { networks = [] } = partner.facilitator;
  if (!networks.length) {
    return "Unknown";
  }

  const lower = networks.map((value) => value.toLowerCase());
  const supportsBase =
    lower.includes("base") || lower.includes("base-mainnet") || lower.includes("base-main");

  if (supportsBase) {
    return `Yes (${networks.join(", ")})`;
  }

  return `No (${networks.join(", ")})`;
}

function normaliseTwitterUrl(rawUrl) {
  if (!rawUrl) {
    return null;
  }

  try {
    const url = new URL(rawUrl.replace(/^http:\/\//i, "https://"));
    if (!/^(?:www\.)?(twitter|x)\.com$/i.test(url.hostname)) {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (!segments.length) {
      return null;
    }

    const handle = segments[0];
    if (
      [
        "share",
        "intent",
        "home",
        "search",
        "hashtag",
        "compose",
        "i",
        "messages",
        "notifications",
      ].includes(handle.toLowerCase())
    ) {
      return null;
    }

    return `https://x.com/${handle}`;
  } catch {
    return null;
  }
}

function extractTwitterFromHtml(html) {
  const exactHandleRegex =
    /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})(?![A-Za-z0-9_])/gi;

  for (const match of html.matchAll(exactHandleRegex)) {
    const candidate = match[0];
    const normalised = normaliseTwitterUrl(candidate);
    if (normalised) {
      return normalised;
    }
  }

  const protocolRelativeRegex =
    /\/\/(?:www\.)?(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})(?![A-Za-z0-9_])/gi;
  for (const match of html.matchAll(protocolRelativeRegex)) {
    const normalised = normaliseTwitterUrl(`https:${match[0]}`);
    if (normalised) {
      return normalised;
    }
  }

  return null;
}

async function discoverTwitter(url) {
  if (!url) {
    return null;
  }

  try {
    const html = await fetchText(url, WEBSITE_HEADERS);
    return extractTwitterFromHtml(html);
  } catch {
    return null;
  }
}

function escapeCsvField(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildSqlInserts(rows) {
  const values = rows
    .map(
      (row) =>
        `(${row
          .map((value) =>
            value === null || value === undefined
              ? "NULL"
              : `'${String(value).replace(/'/g, "''")}'`,
          )
          .join(", ")})`,
    )
    .join(",\n  ");

  return `DROP TABLE IF EXISTS projects;
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  project_twitter TEXT,
  project_x402_mainnet TEXT,
  project_link TEXT NOT NULL,
  earliest_x402_mention TEXT,
  category TEXT,
  slug TEXT
);
INSERT INTO projects (
  project_name,
  project_twitter,
  project_x402_mainnet,
  project_link,
  earliest_x402_mention,
  category,
  slug
) VALUES
  ${values}
;
`;
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  console.log("Fetching project metadata list …");
  const tree = await fetchJson(GITHUB_TREE_URL);

  const metadataEntries = tree.tree.filter(
    (node) =>
      node.type === "blob" &&
      node.path.startsWith("typescript/site/app/ecosystem/partners-data/") &&
      node.path.endsWith("metadata.json"),
  );

  console.log(`Found ${metadataEntries.length} metadata files.`);

  const partners = [];
  for (const entry of metadataEntries) {
    const slug = extractSlug(entry.path);
    if (EXCLUDED_SLUGS.has(slug)) {
      continue;
    }
    const rawUrl = `${RAW_BASE_URL}${entry.path}`;
    try {
      const response = await fetch(rawUrl, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`Failed to load metadata: ${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      const json = JSON.parse(text);
      partners.push({ slug, ...json });
    } catch (error) {
      console.warn(`Skipping ${slug}: ${error.message}`);
    }
  }

  console.log(`Loaded ${partners.length} partner records.`);

  const enriched = [];
  for (const partner of partners) {
    const mainnet = deriveMainnetSummary(partner);
    const twitterUrl = await discoverTwitter(partner.websiteUrl);
    const derivedSlug =
      partner.slug ??
      extractSlugFromWebsite(partner.websiteUrl) ??
      partner.name.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/(^-|-$)/g, "");

    const overrideTwitter =
      TWITTER_OVERRIDES.get(derivedSlug) ??
      TWITTER_OVERRIDES.get(partner.name.toLowerCase());

    const projectTwitter = overrideTwitter ?? twitterUrl ?? "unknown";

    enriched.push({
      project_name: partner.name,
      project_twitter: projectTwitter,
      project_x402_mainnet: mainnet,
      project_link: partner.websiteUrl,
      earliest_x402_mention: "unknown",
      category: partner.category,
      slug: derivedSlug,
    });
    if (projectTwitter === "unknown") {
      console.warn(`No Twitter handle discovered for ${partner.name} (${partner.websiteUrl})`);
    }
  }

  enriched.sort((a, b) => a.project_name.localeCompare(b.project_name));

  const csvRows = [
    [
      "project_name",
      "project_twitter",
      "project_x402_mainnet",
      "project_link",
      "earliest_x402_mention",
      "category",
      "slug",
    ],
    ...enriched.map((row) => [
      row.project_name,
      row.project_twitter,
      row.project_x402_mainnet,
      row.project_link,
      row.earliest_x402_mention,
      row.category,
      row.slug,
    ]),
  ];

  const csvContent = csvRows.map((row) => row.map(escapeCsvField).join(",")).join("\n");
  await fs.writeFile(OUTPUT_CSV, csvContent, "utf8");

  const sqlRows = enriched.map((row) => [
    row.project_name,
    row.project_twitter,
    row.project_x402_mainnet,
    row.project_link,
    row.earliest_x402_mention,
    row.category,
    row.slug,
  ]);
  const sqlContent = buildSqlInserts(sqlRows);
  await fs.writeFile(OUTPUT_SQL, sqlContent, "utf8");

  await fs.writeFile(OUTPUT_JSON, JSON.stringify(enriched, null, 2), "utf8");

  console.log(`Wrote ${OUTPUT_CSV}`);
  console.log(`Wrote ${OUTPUT_SQL}`);
  console.log(`Wrote ${OUTPUT_JSON}`);
}

function extractSlugFromWebsite(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const pathSegments = parsed.pathname.split("/").filter(Boolean);
    if (pathSegments.length) {
      return pathSegments[pathSegments.length - 1]
        .replace(/\.html?$/i, "")
        .replace(/[^a-z0-9-]/gi, "-")
        .replace(/-+/g, "-")
        .toLowerCase();
    }
    return parsed.hostname
      .replace(/^www\./, "")
      .replace(/\.[a-z]{2,}$/i, "")
      .replace(/[^a-z0-9-]/gi, "-");
  } catch {
    return null;
  }
}

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});
