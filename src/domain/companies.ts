// Companies tracked through SEC filings. Groups matter: hyperscalers fund
// capex from large cash flows, neoclouds largely with debt, suppliers sell
// the hardware (and may finance buyers), datacenter REITs own the buildings.
// Compare within a group, never across.
export type CompanyGroup = "hyperscaler" | "neocloud" | "supplier" | "dc_reit";

export const COMPANY_GROUP_LABELS: Record<CompanyGroup, string> = {
  hyperscaler: "Hyperscalers",
  neocloud: "Neoclouds",
  supplier: "Suppliers",
  dc_reit: "Datacenter REITs",
};

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
  { ticker: "NVDA", name: "NVIDIA", cik: 1045810, group: "supplier" },
  { ticker: "AMD", name: "AMD", cik: 2488, group: "supplier" },
  { ticker: "AVGO", name: "Broadcom", cik: 1730168, group: "supplier" },
  { ticker: "SMCI", name: "Super Micro Computer", cik: 1375365, group: "supplier" },
  // Fiscal year ends in late January; quarters use real period dates.
  { ticker: "DELL", name: "Dell Technologies", cik: 1571996, group: "supplier" },
  { ticker: "DLR", name: "Digital Realty", cik: 1297996, group: "dc_reit" },
  { ticker: "EQIX", name: "Equinix", cik: 1101239, group: "dc_reit" },
];

export const SEC_FILING_COMPANIES: SecCompany[] = [
  ...SEC_COMPANIES,
  { ticker: "NBIS", name: "Nebius", cik: 1513845, group: "neocloud" },
];
