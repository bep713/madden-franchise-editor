// Per-file facts, read from content only: the extension never decides the
// format. Cached by (path, size, mtimeMs).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/**
 * @typedef {{ databaseName: string|null, major: string|null, minor: string|null, includes: string[] }} FtxHeader
 * @typedef {{ gameType: 'madden'|'college'|null, gameYear: number|null, major: number|null, minor: number|null, databaseName: string|null }} GzMeta
 * @typedef {{ path: string, name: string } & (
 *   | { format: 'ftx', header: FtxHeader }
 *   | { format: 'gz', tables: number, meta: GzMeta|null }
 *   | { format: 'invalid', detail: string }
 * )} FileScan
 */

const HEADER_CAP = 4 * 1024 * 1024;
const FOLDER_EXTENSIONS = new Set([".ftx", ".xml", ".gz"]);
// The same chunk size the library uses (Electron GC stall on small chunks)
const ZLIB_CHUNK_SIZE = 1024 * 1024;
// Enough for every file of a big game's FTX tree (CFB 27 franchise-schemas
// has 3,777), so re-plans after an option change don't rescan the folder.
// An entry is only a header: a few names, or the include list.
const CACHE_LIMIT = 10000;
const cache = new Map();

/**
 * Expand folders one level to their schema files, drop duplicates (ignoring
 * case) and scan each path.
 * @param {string[]} paths
 * @returns {Promise<FileScan[]>}
 */
async function scanAll(paths) {
  const expanded = [];
  for (const p of paths) {
    const resolved = path.resolve(p);
    const stats = await fs.promises.stat(resolved).catch(() => null);
    if (stats?.isDirectory()) {
      const names = await fs.promises.readdir(resolved).catch(() => []);
      names
        .filter((n) => FOLDER_EXTENSIONS.has(path.extname(n).toLowerCase()))
        .sort((a, b) => a.localeCompare(b))
        .forEach((n) => expanded.push(path.join(resolved, n)));
    } else {
      expanded.push(resolved);
    }
  }
  const seen = new Set();
  const unique = expanded.filter((p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return Promise.all(unique.map(cachedScan));
}

async function cachedScan(filePath) {
  const stats = await fs.promises.stat(filePath).catch(() => null);
  if (!stats?.isFile()) {
    return invalid(filePath, stats ? "Not a file" : "File not found");
  }
  const key = `${filePath.toLowerCase()}|${stats.size}|${stats.mtimeMs}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const scan = await scanFile(filePath);
  cache.set(key, scan);
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
  return scan;
}

/**
 * @param {string} filePath
 * @returns {Promise<FileScan>} never rejects
 */
async function scanFile(filePath) {
  try {
    const handle = await fs.promises.open(filePath, "r");
    const magic = Buffer.alloc(2);
    try {
      await handle.read(magic, 0, 2, 0);
    } finally {
      await handle.close();
    }
    if (magic[0] === 0x1f && magic[1] === 0x8b) {
      return scanGz(filePath);
    }
    const header = await readFtxHeader(fs.createReadStream(filePath));
    if (!header) return invalid(filePath, "Not a schema file");
    return { path: filePath, name: path.basename(filePath), format: "ftx", header };
  } catch (err) {
    return invalid(filePath, err.message);
  }
}

async function scanGz(filePath) {
  const json = JSON.parse(
    zlib
      .gunzipSync(await fs.promises.readFile(filePath), {
        chunkSize: ZLIB_CHUNK_SIZE,
      })
      .toString(),
  );
  if (!json || !Array.isArray(json.schemas)) {
    return invalid(filePath, "Not a schema file");
  }
  return {
    path: filePath,
    name: path.basename(filePath),
    format: "gz",
    tables: json.schemas.length,
    meta: json.meta && typeof json.meta === "object" ? readGzMeta(json.meta) : null,
  };
}

function readGzMeta(meta) {
  const int = (v) => {
    const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
    return Number.isInteger(n) && n >= 0 ? n : null;
  };
  return {
    gameType:
      meta.gameType === "madden" || meta.gameType === "college"
        ? meta.gameType
        : null,
    gameYear: int(meta.gameYear),
    major: int(meta.major),
    minor: int(meta.minor),
    databaseName:
      typeof meta.databaseName === "string" ? meta.databaseName : null,
  };
}

/**
 * Read an FTX's root attributes and IncludeFiles, stopping at <schemas> (or
 * HEADER_CAP), so a large game file isn't read whole. Not an XML parse: the
 * full file is validated at add.
 * @param {import('stream').Readable} stream
 * @returns {Promise<FtxHeader|null>} null when the root isn't FranTkData
 */
function readFtxHeader(stream) {
  return new Promise((resolve, reject) => {
    let text = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      stream.destroy();
      resolve(parseHeader(withoutComments(text)));
    };
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      text += chunk;
      if (
        text.length >= HEADER_CAP ||
        /<schemas[\s>/]/.test(withoutComments(text))
      ) {
        finish();
      }
    });
    stream.on("end", finish);
    stream.on("error", (err) => {
      if (!done) {
        done = true;
        reject(err);
      }
    });
  });
}

// An unclosed comment at the cut runs to the end of the text
const withoutComments = (text) => text.replace(/<!--[\s\S]*?(?:-->|$)/g, "");

function parseHeader(text) {
  const body = text
    .replace(/^﻿/, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "");
  const root = /^\s*<FranTkData\b([^>]*)>/.exec(body);
  if (!root) return null;
  const attrs = readAttributes(root[1]);
  const includes = [];
  for (const m of body.matchAll(/<IncludeFile\b([^>]*)>/g)) {
    const fileName = readAttributes(m[1]).fileName;
    if (fileName) includes.push(fileName);
  }
  return {
    databaseName: attrs.databaseName ?? null,
    major: attrs.dataMajorVersion ?? null,
    minor: attrs.dataMinorVersion ?? null,
    includes,
  };
}

function readAttributes(source) {
  const attrs = {};
  for (const m of source.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[m[1]] = decodeEntities(m[2] ?? m[3]);
  }
  return attrs;
}

function decodeEntities(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * The key the plan matches an include name to a file by: the basename, `.FTX`
 * stripped, lowercased. Not the library's key (see fileMapFor in commit.js).
 * @param {string} name
 */
function includeKey(name) {
  return path.basename(name).replace(/\.FTX$/i, "").toLowerCase();
}

/**
 * The schema picker's file-name rule (getSchemasInFolder in madden-franchise).
 * @param {string} fileName
 * @returns {{ gameType: 'madden'|'college'|null, gameYear: number|null, major: number|null, minor: number|null }}
 */
function nameIdentity(fileName) {
  const m = /(?:(M|C)(\d+)_(\d+)_(\d+)|(?!M)(\d+)_(\d+))/i.exec(fileName);
  if (!m) return { gameType: null, gameYear: null, major: null, minor: null };
  return {
    gameType: m[1] ? (m[1].toUpperCase() === "C" ? "college" : "madden") : null,
    gameYear: m[2] ? parseInt(m[2], 10) : null,
    major: m[3] || m[5] ? parseInt(m[3] || m[5], 10) : null,
    minor: m[4] || m[6] ? parseInt(m[4] || m[6], 10) : null,
  };
}

function invalid(filePath, detail) {
  return { path: filePath, name: path.basename(filePath), format: "invalid", detail };
}

module.exports = { scanAll, scanFile, readFtxHeader, includeKey, nameIdentity };
