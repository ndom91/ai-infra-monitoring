import * as XLSX from "xlsx";

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// Last day of a calendar month; `month` is 1-12.
export const monthEnd = (year: number, month: number) => isoDay(new Date(Date.UTC(year, month, 0)));

export async function readWorkbook(res: Response) {
  return XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
}
