// What git says about a space's place, read without git: check() in main.js runs the two commands and
// hands their output here. No `herdr` import, so tests run it in node.

const base = (path) => path.replace(/\/+$/, "").split("/").pop();

// git status --porcelain=v2 --branch: the branch, how far ahead of and behind its upstream, and how many
// paths changed. Changed, renamed, conflicted and untracked files count one line each; ignored ones ("! ")
// and the headers ("# ") don't. No branch.ab line (no upstream): 0 and 0.
export function parseStatus(stdout) {
  const info = { branch: null, ahead: 0, behind: 0, dirty: 0 };
  for (const line of stdout.split("\n")) {
    if (/^[12u?] /.test(line)) info.dirty++;
    else if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
    else if (line.startsWith("# branch.ab ")) {
      const [a, b] = line.slice(12).split(" ");
      info.ahead = Math.abs(parseInt(a, 10)) || 0;
      info.behind = Math.abs(parseInt(b, 10)) || 0;
    }
  }
  return info;
}

// A repo's name from its git folder: the folder holding .git, a bare repo's own name without
// ".git", or the folder holding a hidden bare repo (<project>/.bare; Herdr's spaces 0.1.17).
export function repoName(common) {
  if (common.endsWith("/.git")) return base(common.slice(0, -5));
  const own = base(common);
  return own === ".bare" ? base(common.slice(0, -own.length - 1)) : own.replace(/\.git$/, "");
}

// git rev-parse --show-toplevel --path-format=absolute --git-common-dir (`code`: its exit code): the repo's
// own .git folder names it, and a worktree's top differs from it. A git before 2.31 knows no
// --path-format: it echoes the flag and gives a relative ".git", the same for every repo. Then each
// checkout is its own repo (`<top>/.git`, never linked), so unrelated repos don't share one card.
// { top, repo, name, linked }; name: repoName's.
export function parseRevParse(stdout, code) {
  const [top = "", common, extra] = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const repo = code === 0 && common && !extra ? common : `${top}/.git`;
  return { top, repo, name: repoName(repo), linked: repo !== `${top}/.git` };
}
