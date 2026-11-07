// "Open in editor": $VISUAL or $EDITOR, else the default app for the file.
import { exec, window } from "herdr";
import { commands } from "./platform.js";

export async function openInEditor(file, on) {
  if (on) throw new Error("Open in editor works for files on this computer only");
  const [program, args] = commands(window()?.platform, new Set()).editor(file);
  const r = await exec(program, args);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim() || `${program} exited with ${r.code}`);
}
