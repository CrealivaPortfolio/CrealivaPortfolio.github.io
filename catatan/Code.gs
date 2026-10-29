// Tempel seluruh isi file ini di Google Sheet: Extensions → Apps Script
// Ganti SECRET, lalu Deploy → New deployment → Web app
//   Execute as: Me | Who has access: Anyone
// Versi ini menyimpan foto ke Google Drive (folder "Catatan Harian Foto"),
// jadi saat deploy Google akan minta izin akses Drive.

const SECRET = 'GANTI_KODE_RAHASIA';
const SHEET = 'Log';
const FOLDER = 'Catatan Harian Foto';

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(SHEET);
  if (!s) {
    s = ss.insertSheet(SHEET);
    s.appendRow(['id', 'tanggal', 'jenis', 'nama', 'kalori', 'catatan', 'foto']);
    s.getRange('A:B').setNumberFormat('@');
    s.setFrozenRows(1);
  }
  if (!s.getRange('G1').getValue()) s.getRange('G1').setValue('foto'); // untuk sheet versi lama
  return s;
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

function dateStr_(v) {
  return v instanceof Date
    ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd')
    : String(v);
}

function folder_() {
  const it = DriveApp.getFoldersByName(FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER);
}

function savePhoto_(id, dataUrl) {
  const b64 = dataUrl.split(',')[1];
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', id + '.jpg');
  const f = folder_().createFile(blob);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return f.getId();
}

// Ambil semua data
function doGet(e) {
  if (e.parameter.key !== SECRET) return out_({ ok: false, error: 'Kode rahasia salah' });
  const rows = sheet_().getDataRange().getValues().slice(1).map(r => ({
    id: String(r[0]), date: dateStr_(r[1]), type: r[2],
    name: r[3], kcal: Number(r[4]), note: r[5], photo: String(r[6] || '')
  }));
  return out_({ ok: true, rows: rows });
}

// Tambah / hapus data
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  if (d.key !== SECRET) return out_({ ok: false, error: 'Kode rahasia salah' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const s = sheet_();
    const last = s.getLastRow();
    const ids = last > 1 ? s.getRange(2, 1, last - 1, 1).getValues().flat().map(String) : [];

    if (d.op === 'add') {
      const x = d.entry;
      if (ids.indexOf(x.id) === -1) {
        const fid = d.photo ? savePhoto_(x.id, d.photo) : '';
        s.appendRow([x.id, x.date, x.type, x.name, x.kcal, x.note || '', fid]);
      }
    } else if (d.op === 'del') {
      const i = ids.indexOf(String(d.id));
      if (i !== -1) {
        const fid = String(s.getRange(i + 2, 7).getValue() || '');
        if (fid) { try { DriveApp.getFileById(fid).setTrashed(true); } catch (err) {} }
        s.deleteRow(i + 2);
      }
    }
  } finally {
    lock.release();
  }
  return out_({ ok: true });
}
