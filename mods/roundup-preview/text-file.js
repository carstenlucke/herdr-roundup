// What a text file needs before it is shown, and what Herdr's read errors mean to the
// person. Pure, so node --test covers it.

export const GONE = "This file is no longer available";

// Notepad and Excel start UTF-8 files with a byte-order mark, which JSON.parse rejects.
export const withoutBom = (text) => text.replace(/^﻿/, "");

/** Whether a read failed only for the 1 MiB limit, which leaves the file's head to read. */
export const tooLong = (message) => /exceeds 1 MiB/i.test(message);

export function readFailure(message) {
  if (tooLong(message)) return "This file is over 1 MiB, too large to preview";
  if (/valid UTF-8/i.test(message)) return "Binary or non-UTF-8 file · no text preview";
  return message;
}

/** A text cut at a byte count, back to its last whole line: the cut can fall inside a character. */
export function wholeLines(text) {
  const end = text.lastIndexOf("\n");
  return end < 0 ? text : text.slice(0, end + 1);
}
