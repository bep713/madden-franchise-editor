// The replace step and its journal. <previousDir> holds only what the latest
// replacing add moved out, plus journal.json:
//   { identity, staged, added, addedStat, moved: [{from, to}], state }
// state: 'moving' (steps 2-4 in progress) -> 'done' -> 'restoring' (Undo).
// Recovery at startup rolls 'moving' back and finishes 'restoring'; both are
// idempotent, so a crash during recovery is recovered by the next start.
const fs = require("fs");
const path = require("path");

const JOURNAL = "journal.json";

const journalPath = (port) => path.join(port.previousDir, JOURNAL);
const exists = (p) => fs.existsSync(p);

function readJournal(port) {
  try {
    return JSON.parse(fs.readFileSync(journalPath(port), "utf8"));
  } catch {
    return null;
  }
}

function writeJournal(port, journal) {
  const tmp = `${journalPath(port)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(journal));
  fs.renameSync(tmp, journalPath(port));
}

function clear(port) {
  fs.rmSync(port.previousDir, { recursive: true, force: true });
}

const statOf = (p) => {
  const s = fs.statSync(p);
  return { size: s.size, mtimeMs: s.mtimeMs };
};

const sameStat = (p, stat) => {
  if (!stat || !exists(p)) return false;
  const now = statOf(p);
  return now.size === stat.size && now.mtimeMs === stat.mtimeMs;
};

/**
 * Move the staged file onto target.path, first moving every replaced file
 * into previousDir. An add that replaces nothing leaves previousDir alone.
 * @param {string} staged
 * @param {{ path: string, replaces: { path: string }[] }} target
 * @param {object} identity
 * @param {{ previousDir: string }} port
 */
function replace(staged, target, identity, port) {
  if (!target.replaces.length) {
    fs.renameSync(staged, target.path);
    return;
  }
  clear(port);
  fs.mkdirSync(port.previousDir, { recursive: true });
  const journal = {
    identity,
    staged,
    added: target.path,
    addedStat: null,
    // Indexed, since a root copy and a subfolder copy can share a name
    moved: target.replaces.map((r, i) => ({
      from: r.path,
      to: path.join(port.previousDir, `${i}_${path.basename(r.path)}`),
    })),
    state: "moving",
  };
  writeJournal(port, journal);
  for (const { from, to } of journal.moved) fs.renameSync(from, to);
  fs.renameSync(staged, target.path);
  writeJournal(port, { ...journal, addedStat: statOf(target.path), state: "done" });
}

/** Run once at startup, before any add. */
function recover(port) {
  const journal = readJournal(port);
  if (journal?.state === "done") return;
  if (journal?.state === "moving") rollBack(journal);
  else if (journal?.state === "restoring") putBack(journal);
  // Without a journal the folder holds nothing to undo
  clear(port);
}

function rollBack(journal) {
  // When the target replaced nothing at its own path, a file there is the new one
  const addedWasNew = !journal.moved.some((m) => samePath(m.from, journal.added));
  if (addedWasNew && exists(journal.added) && !exists(journal.staged)) {
    fs.rmSync(journal.added, { force: true });
  }
  moveBack(journal);
  fs.rmSync(journal.staged, { force: true });
}

function putBack(journal) {
  if (sameStat(journal.added, journal.addedStat)) fs.rmSync(journal.added);
  moveBack(journal);
}

function moveBack(journal) {
  for (const { from, to } of journal.moved) {
    if (!exists(to)) continue;
    fs.mkdirSync(path.dirname(from), { recursive: true });
    fs.renameSync(to, from);
  }
}

/**
 * Undo the latest replacing add, while its added file is unchanged.
 * @returns {{ status: 'restored', restored: string[] } | { status: 'gone' }}
 */
function restore(port) {
  const journal = readJournal(port);
  if (journal?.state !== "done" || !sameStat(journal.added, journal.addedStat)) {
    return { status: "gone" };
  }
  writeJournal(port, { ...journal, state: "restoring" });
  putBack(journal);
  clear(port);
  return { status: "restored", restored: journal.moved.map((m) => m.from) };
}

const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

module.exports = { replace, recover, restore, readJournal };
