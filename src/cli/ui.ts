/** Tiny zero-dependency terminal styling for the ump CLI. */

const enabled =
  (process.stdout.isTTY || process.stderr.isTTY) &&
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb";

const wrap = (open: string, close = "0") => (s: string) =>
  enabled ? `\x1b[${open}m${s}\x1b[${close}m` : s;

export const ember = wrap("38;2;255;84;54");
export const amber = wrap("38;2;255;174;60");
export const bold = wrap("1", "22");
export const dim = wrap("2", "22");
export const gray = wrap("38;5;245");
export const green = wrap("32");
export const red = wrap("31");

/** The wordmark used at the top of CLI output. */
export function brand(): string {
  return `${ember(bold("UMP"))} ${dim("Universal Memory Protocol")}`;
}

export const ok = (s: string) => `${green("✓")} ${s}`;
export const warn = (s: string) => `${amber("!")} ${s}`;
export const err = (s: string) => `${red("✗")} ${s}`;
export const arrow = () => ember("→");

/** Right-pad ignoring ANSI escape codes. */
function padVisible(s: string, width: number): string {
  const visible = s.replace(/\x1b\[[0-9;]*m/g, "").length;
  return s + " ".repeat(Math.max(0, width - visible));
}

/** A labelled key/value row, e.g. for a server summary. */
export function row(label: string, value: string): string {
  return `  ${ember(padVisible(label, 9))} ${value}`;
}

/** A two-column command/description list for help screens. */
export function list(items: Array<[string, string]>): string {
  const w = Math.max(...items.map(([k]) => k.length));
  return items
    .map(([k, v]) => `  ${bold(padVisible(k, w + 2))} ${gray(v)}`)
    .join("\n");
}

/** Write a line to stderr (servers keep stdout clean for protocol I/O). */
export function note(s: string): void {
  process.stderr.write(s + "\n");
}
