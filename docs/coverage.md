# Coverage matrix

What each indicator can and cannot show, as of 18 Oct 2026. The live version,
with series counts and collector status, is the **Coverage** page
(`src/domain/coverage.ts`).

| # | Indicator | Status | Source(s) | Main gaps |
|---|---|---|---|---|
| 01 | GPU rental pricing | Partial | Azure Retail Prices (H100/H200 on-demand + spot), AWS Price List (H100/H200 on-demand, monthly since Oct 2024), Salad Community Cloud (RTX 4090/5090, priority tiers) | Published prices only, no inventory. Salad tiers differ in preemption risk. Vast.ai and Shadeform terms forbid building price indexes. GCP needs an API key. |
| 02 | GPU resale & collateral | Partial | American Compute resale index (manual, "free to use with attribution") | An index, not per-model prices. ServerBuyback has no reuse license. Nothing links resale to secured debt. |
| 03 | Credit spreads | Partial | FRED (ICE BofA HY/BB/B/CCC/BBB OAS, HY yield, Baa−10y, DBAA, DGS10); issuer coupons and SOFR margins from filings | ICE history is a rolling 3 years. No per-bond market prices: FINRA's free data forbids automated collection; TRACE feeds are paid. |
| 04 | Capex & cash flow | Implemented | SEC XBRL for MSFT, GOOGL, AMZN, META, ORCL, CRWV, CORZ, IREN, APLD | Nebius (20-F) excluded. Tag changes cut some series short. Maturities and off-balance-sheet commitments not captured. |
| 05 | Customer concentration | Partial | Filings, cited manually (8 neoclouds / miners) | Irregular disclosure; some give contract values only. |
| 06 | Construction & preleasing | Partial | CBRE (H2 2021+), JLL, cited manually | Manual per release. JLL definitions changed twice (kept separate). |
| 07 | Vacancy & absorption | Partial | CBRE, JLL, cited manually | Some CBRE absorption only in charts. JLL 2022–23 not retrievable. |
| 08 | Contracted vs realized revenue | Implemented | SEC XBRL (RPO, revenue, receivables) | META has no RPO; AMZN RPO tag ends 2020. Cancellations only in text. |
| 09 | Depreciation & useful life | Partial | Filings (8 companies, cited manually); D&A from SEC XBRL | Rarely GPU-specific. Book-vs-resale curve needs per-model resale prices. |

## Sources checked and not used

| Source | Reason |
|---|---|
| Vast.ai API | Terms (Sep 2026) forbid using pricing data to build or maintain any price index or comparison database. |
| Shadeform API | Terms (Aug 2026) forbid systematic retrieval to create databases without written permission. |
| GCP Cloud Billing Catalog | Requires an API key and project. |
| ServerBuyback GPU index | No reuse license; estimate ranges, no dated history. |
| FINRA per-bond TRACE data | Free site limits use to personal viewing and bans automated copying; the API has only aggregates. |

Both marketplace sources offer written-permission exceptions. Asking Vast.ai
and Shadeform would unlock a much better rental signal (real prices plus inventory).
