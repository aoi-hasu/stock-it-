import ExcelJS from 'exceljs';

/**
 * Safely parse an uploaded Excel file using ExcelJS.
 * Limits imports to 5 MB and 5,000 rows, validating each row.
 */
export async function parseExcelFile(
  file: File,
  maxSizeBytes = 5 * 1024 * 1024,
  maxRows = 5000
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  if (file.size > maxSizeBytes) {
    throw new Error('File exceeds the maximum permitted size of 5 MB.');
  }

  const fileName = file.name.toLowerCase();
  const isValidExt = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');
  if (!isValidExt) {
    throw new Error('Unsupported file format. Please upload a valid Microsoft Excel (.xlsx) file.');
  }

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch (err: any) {
    throw new Error('Could not read uploaded file: ' + (err?.message || 'File read error'));
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(arrayBuffer);
  } catch (err: any) {
    throw new Error('Corrupted or invalid spreadsheet file. Please verify the file is a standard Microsoft Excel (.xlsx) workbook.');
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Spreadsheet has no worksheets.');
  }

  const headers: string[] = [];
  const rows: Record<string, string>[] = [];

  const firstRow = worksheet.getRow(1);
  firstRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? '').trim();
  });

  const cleanHeaders = headers.map((h, i) => h || `Col_${i + 1}`);

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header row
    if (rows.length >= maxRows) return; // strictly cap at 5,000 rows

    const obj: Record<string, string> = {};
    let hasValue = false;

    cleanHeaders.forEach((header, index) => {
      const cell = row.getCell(index + 1);
      const val = cell.value;
      let text = '';
      if (val !== null && val !== undefined) {
        if (typeof val === 'object') {
          if ('text' in val) text = String((val as any).text || '');
          else if ('result' in val) text = String((val as any).result || '');
          else text = String(val);
        } else {
          text = String(val).trim();
        }
      }
      obj[header] = text;
      if (text) hasValue = true;
    });

    if (hasValue) {
      rows.push(obj);
    }
  });

  return { headers: cleanHeaders, rows };
}

/**
 * Generate and trigger download of an Excel (.xlsx) file using ExcelJS.
 */
export async function exportToExcel(
  filename: string,
  sheetName: string,
  headers: string[],
  data: (string | number | undefined | null)[][]
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  worksheet.addRow(headers);
  data.forEach(row => {
    worksheet.addRow(row.map(v => (v === undefined || v === null ? '' : v)));
  });

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download a starter template for imports with sample guidance rows.
 */
export async function downloadExcelTemplate(
  filename: string,
  sheetName: string,
  headers: string[],
  sampleRows: (string | number | undefined | null)[][] = []
): Promise<void> {
  return exportToExcel(filename, sheetName, headers, sampleRows);
}
