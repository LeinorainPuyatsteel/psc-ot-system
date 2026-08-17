const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

function pad(n) { return String(n).padStart(2, '0'); }

// Local calendar date (YYYY-MM-DD). Uses local parts — not toISOString, which
// is UTC — so a commit lands on the same day its time is shown in.
function localISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 12-hour time with AM/PM, e.g. "8:23 AM", "11:05 PM".
function formatTime(date) {
  let h = date.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${pad(date.getMinutes())} ${ampm}`;
}

// A unique separator unlikely to appear in commit messages
const SEP = '\u0001';
const REC_SEP = '\u0002';

/**
 * Get commits for one repo within [since, until], inclusive.
 * Returns array of { repo, hash, date (Date), dateISO, time, message, author }
 */
async function getCommitsForRepo(repo, since, until) {
  const format = `%H${SEP}%ad${SEP}%an${SEP}%s${REC_SEP}`;
  const args = [
    '-C', repo.path,
    'log',
    // Every branch, not just whichever one happens to be checked out — a day's
    // work shouldn't vanish from the form because you switched branches before
    // generating it. `--branches --remotes` rather than `--all` on purpose:
    // `--all` also walks refs/stash, which would file your WIP stashes as
    // overtime reasons. Tags are skipped too; they point at commits the
    // branches already reach. Git dedupes the walk, so a commit reachable from
    // several refs (local + its origin/* twin, say) is still returned once.
    '--branches',
    '--remotes',
    `--since=${since.toISOString()}`,
    `--until=${until.toISOString()}`,
    '--date=iso-strict',
    `--pretty=format:${format}`
  ];

  if (repo.author) {
    args.push(`--author=${repo.author}`);
  }

  let stdout;
  try {
    ({ stdout } = await execFileAsync('git', args, { maxBuffer: 1024 * 1024 * 20 }));
  } catch (err) {
    throw new Error(`Failed to read git log for "${repo.name}" at ${repo.path}: ${err.message}`);
  }

  if (!stdout || !stdout.trim()) return [];

  return stdout
    .split(REC_SEP)
    .map(s => s.trim())
    .filter(Boolean)
    .map(rec => {
      const [hash, dateISO, author, message] = rec.split(SEP);
      const date = new Date(dateISO);
      return {
        repo: repo.name,
        hash: hash.slice(0, 7),
        date,
        dateISO: localISODate(date),
        time: formatTime(date),
        message,
        author
      };
    });
}

/**
 * Get commits across all configured repos, grouped by date (YYYY-MM-DD).
 * Returns { [dateISO]: [commit, ...] } sorted within each day by time.
 */
async function getCommitsGroupedByDay(repos, since, until) {
  const all = [];
  for (const repo of repos) {
    const commits = await getCommitsForRepo(repo, since, until);
    all.push(...commits);
  }

  const grouped = {};
  for (const c of all) {
    if (!grouped[c.dateISO]) grouped[c.dateISO] = [];
    grouped[c.dateISO].push(c);
  }
  for (const day of Object.keys(grouped)) {
    grouped[day].sort((a, b) => a.date - b.date);
  }
  return grouped;
}

module.exports = { getCommitsForRepo, getCommitsGroupedByDay };
