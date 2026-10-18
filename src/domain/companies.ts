// Companies tracked through SEC filings. Groups matter: hyperscalers fund
// capex from large cash flows, neoclouds largely with debt.
export type CompanyGroup = "hyperscaler" | "neocloud";

export type SecCompany = { ticker: string; name: string; cik: number; group: CompanyGroup };

export const SEC_COMPANIES: SecCompany[] = [
  { ticker: "MSFT", name: "Microsoft", cik: 789019, group: "hyperscaler" },
  { ticker: "GOOGL", name: "Alphabet", cik: 1652044, group: "hyperscaler" },
  { ticker: "AMZN", name: "Amazon", cik: 1018724, group: "hyperscaler" },
  { ticker: "META", name: "Meta Platforms", cik: 1326801, group: "hyperscaler" },
  { ticker: "ORCL", name: "Oracle", cik: 1341439, group: "hyperscaler" },
  { ticker: "CRWV", name: "CoreWeave", cik: 1769628, group: "neocloud" },
  { ticker: "CORZ", name: "Core Scientific", cik: 1839341, group: "neocloud" },
  // Nebius (NBIS, CIK 1513845) is left out: it files 20-F only, so there is
  // no quarterly XBRL, and it would turn every run "partial". See coverage.
  { ticker: "IREN", name: "IREN", cik: 1878848, group: "neocloud" },
  { ticker: "APLD", name: "Applied Digital", cik: 1144879, group: "neocloud" },
];
