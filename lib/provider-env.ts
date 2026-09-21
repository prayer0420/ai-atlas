/** Only OS/runtime discovery reaches the subprocess. App secrets never do. */
export function providerEnvironment(source: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const allowed = new Set([
    "PATH", "PATHEXT", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP",
    "USERPROFILE", "HOME", "HOMEDRIVE", "HOMEPATH", "LOCALAPPDATA", "APPDATA",
    "PROGRAMFILES", "PROGRAMFILES(X86)", "PROGRAMDATA", "LANG", "LC_ALL", "TZ",
  ]);
  return {
    ...Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key.toUpperCase()))),
    NODE_ENV: "production", NO_COLOR: "1", PYTHONIOENCODING: "utf-8",
  };
}
