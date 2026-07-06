const SAFE_KEYS = new Set([
  "PATH", "HOME", "USER", "LOGNAME", "SHELL", "TERM",
  "LANG", "LC_ALL", "LC_CTYPE", "LC_MESSAGES",
  "TMPDIR", "TMP", "TEMP",
  "Path", "USERPROFILE", "HOMEDRIVE", "HOMEPATH",
  "SystemRoot", "SYSTEMROOT", "SystemDrive",
  "ComSpec", "COMSPEC", "WINDIR",
  "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432",
  "CommonProgramFiles", "CommonProgramFiles(x86)", "ProgramData",
  "APPDATA", "LOCALAPPDATA", "ALLUSERSPROFILE", "PUBLIC",
  "PATHEXT", "PSModulePath",
  "PROCESSOR_ARCHITECTURE", "NUMBER_OF_PROCESSORS",
  "SSH_AUTH_SOCK", "SSH_AGENT_PID",
  "NODE_PATH", "NVM_DIR", "NVM_BIN",
  "JAVA_HOME", "GOPATH", "GOROOT",
  "CARGO_HOME", "RUSTUP_HOME",
  "PYENV_ROOT", "PYTHON", "PYTHON3",
]);

export function buildSafeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (SAFE_KEYS.has(k)) env[k] = v;
  }
  return env;
}
