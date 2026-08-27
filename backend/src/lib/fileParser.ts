import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ParsedFile = {
  headers: string[];
  rows: Record<string, unknown>[];
};

export function parseUploadedFile(
  buffer: Buffer,
  originalName: string,
  mimetype: string
): ParsedFile {
  const lowerName = originalName.toLowerCase();

  if (lowerName.endsWith(".json") || mimetype === "application/json") {
    const text = buffer.toString("utf-8");
    const data = JSON.parse(text);
    const rows: Record<string, unknown>[] = Array.isArray(data) ? data : [data];
    const headerSet = new Set<string>();
    for (const row of rows) {
      Object.keys(row).forEach((k) => headerSet.add(k));
    }
    return { headers: Array.from(headerSet), rows };
  }

  if (lowerName.endsWith(".csv") || mimetype === "text/csv") {
    const text = buffer.toString("utf-8");
    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    const headers = result.meta.fields ?? [];
    return { headers, rows: result.data };
  }

  // xlsx / xls
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  const headerSet = new Set<string>();
  for (const row of rows) {
    Object.keys(row).forEach((k) => headerSet.add(k));
  }
  return { headers: Array.from(headerSet), rows };
}
