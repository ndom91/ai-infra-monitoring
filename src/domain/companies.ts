// Companies tracked through SEC filings. Groups matter: hyperscalers fund
// capex from large cash flows, neoclouds largely with debt.
export type CompanyGroup = "hyperscaler" | "neocloud";

export type SecCompany = { ticker: string; cik: number; group: CompanyGroup };

export const SEC_COMPANIES: SecCompany[] = [
  { ticker: "MSFT", cik: 789019, group: "hyperscaler" },
  { ticker: "GOOGL", cik: 1652044, group: "hyperscaler" },
  { ticker: "AMZN", cik: 1018724, group: "hyperscaler" },
  { ticker: "META", cik: 1326801, group: "hyperscaler" },
  { ticker: "ORCL", cik: 1341439, group: "hyperscaler" },
  { ticker: "CRWV", cik: 1769628, group: "neocloud" },
  { ticker: "CORZ", cik: 1839341, group: "neocloud" },
  // Nebius (NBIS, CIK 1513845) is left out: it files 20-F only, so there is
  // no quarterly XBRL, and it would turn every run "partial". See coverage.
  { ticker: "IREN", cik: 1878848, group: "neocloud" },
  { ticker: "APLD", cik: 1144879, group: "neocloud" },
];
