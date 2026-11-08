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

// git rev-parse --show-toplevel --path-format=absolute --git-common-dir (`code`: its exit code): the repo's
// own .git folder names it, and a worktree's top differs from it. A git before 2.31 knows no
// --path-format: it echoes the flag and gives a relative ".git", the same for every repo. Then each
// checkout is its own repo (`<top>/.git`, never linked), so unrelated repos don't share one card.
// { top, repo, name, linked }; name: the repo folder's, or the bare repo's without ".git".
export function parseRevParse(stdout, code) {
  const [top = "", common, extra] = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const repo = code === 0 && common && !extra ? common : `${top}/.git`;
  const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
  return { top, repo, name, linked: repo !== `${top}/.git` };
}
