/**
 * A poster frame for every Process Tools video, into
 * public/brand/videos/drive/<id>.jpg — then list the ids in
 * src/lib/drive-posters.json (the videos page reads that manifest).
 *
 *   ./node_modules/.bin/tsx --env-file=.env.local scripts/drive-posters.ts
 *
 * Skips ids that already have a poster. Reads the fast-start copies on the
 * Desktop when they exist, else the first 24 MB from Drive (enough for a
 * frame from a fast-start file). Tries a few timestamps and rejects frames
 * whose mean luma is under 22 — the black lead-in most recordings open on.
 * Re-run after a new upload, then regenerate the manifest:
 *
 *   python3 -c "import os,json;json.dump(sorted(f[:-4] for f in os.listdir('public/brand/videos/drive') if f.endswith('.jpg')),open('src/lib/drive-posters.json','w'),indent=0)"
 */
import { google } from "googleapis"; import fs from "fs"; import path from "path"; import { execFileSync, spawnSync } from "child_process";
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!);
if (creds.private_key.includes("\\n")) creds.private_key = creds.private_key.replace(/\\n/g, "\n");
const auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ["https://www.googleapis.com/auth/drive.readonly"] });
const drive = google.drive({ version: "v3", auth });
const LOCAL = "/Users/Revive_Worship/Desktop/Process Tools Videos — fast start";
const OUT = "public/brand/videos/drive"; const TMP = "/tmp/claude-501/posters"; fs.mkdirSync(TMP, { recursive: true });
async function walk(id: string, p: string, out: any[]) {
  const res = await drive.files.list({ q: `'${id}' in parents and trashed=false`, fields: "files(id,name,mimeType,size)", pageSize: 500, supportsAllDrives: true, includeItemsFromAllDrives: true });
  for (const f of res.data.files || []) { if (f.mimeType === "application/vnd.google-apps.folder") await walk(f.id!, p + "/" + f.name, out); else out.push({ id: f.id, name: f.name, path: p, size: Number(f.size || 0) }); }
}
function findLocal(name: string): string | null { const hits: string[] = []; const rec = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) rec(p); else if (e.name === name) hits.push(p); } }; rec(LOCAL); return hits[0] ?? null; }
(async () => {
  const v: any[] = []; await walk(process.env.GOOGLE_TOOL_VIDEOS_FOLDER_ID!, "", v);
  const token = await auth.getAccessToken(); const log: string[] = [];
  for (const f of v) {
    if (!/\.(mp4|mov|m4v)$/i.test(f.name) || f.size < 1e6) continue;
    const out = path.join(OUT, `${f.id}.jpg`); if (fs.existsSync(out)) continue;
    let src = findLocal(f.name);
    if (!src) { // partial download: first 24 MB is plenty for a frame from a fast-start file
      src = path.join(TMP, f.id + path.extname(f.name));
      if (!fs.existsSync(src)) { const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}`, Range: "bytes=0-25165823" } }); fs.writeFileSync(src, Buffer.from(await r.arrayBuffer())); }
    }
    // Try a few timestamps; skip frames that are nearly black (mean luma < 22).
    let done = false;
    for (const t of ["00:00:12", "00:00:25", "00:00:05", "00:00:02"]) {
      try { execFileSync("/opt/homebrew/bin/ffmpeg", ["-y", "-loglevel", "error", "-ss", t, "-i", src, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", out]); }
      catch { continue; }
      if (!fs.existsSync(out)) continue;
      const mean = String(spawnSync("/opt/homebrew/bin/ffmpeg", ["-i", out, "-vf", "signalstats", "-f", "null", "-"], { encoding: "utf8" }).stderr || "");
      const m = /YAVG:(\d+(\.\d+)?)/.exec(mean); const y = m ? Number(m[1]) : 128;
      if (y >= 22) { done = true; log.push(`ok ${f.name} @${t} luma ${y.toFixed(0)}`); break; }
      fs.unlinkSync(out);
    }
    if (!done) log.push(`FAIL ${f.name}`);
    console.log(log[log.length - 1]);
  }
  fs.writeFileSync("/tmp/claude-501/posters/_log.txt", log.join("\n"));
  console.log("DONE", fs.readdirSync(OUT).length, "posters");
})();
