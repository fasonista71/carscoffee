/*
  Where chromium is.

  Every script here used to hardcode an executablePath into
  /opt/pw-browsers, because the container this harness was written in
  had chromium 1194 on disk and a playwright that wanted a newer
  revision. That path exists on exactly one machine, so the harness
  could not be run anywhere else, including on the machine the game is
  actually tested on.

  Default now: no executablePath at all, which is what a normal
  "npx playwright install" gives you. PW_CHROMIUM keeps the escape
  hatch for a machine whose browser is somewhere playwright will not
  look.
*/
export function chromiumOpts(extra = {}) {
  const exe = process.env.PW_CHROMIUM;
  return exe ? { executablePath: exe, ...extra } : { ...extra };
}
