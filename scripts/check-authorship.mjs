import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const expectedName = "Sreenath";
const expectedEmail = "sreenathmmmenon@gmail.com";
const bannedTrailers = /^(co-authored-by|co-committed-by):/im;

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const name = git("config", "--local", "--get", "user.name");
const email = git("config", "--local", "--get", "user.email");

if (name !== expectedName || email !== expectedEmail) {
  throw new Error(
    `Local Git identity must be ${expectedName} <${expectedEmail}>.`,
  );
}

const commits = git(
  "log",
  "--format=%H%x00%an%x00%ae%x00%B%x00",
  "--all",
).split("\0");
for (let index = 0; index + 3 < commits.length; index += 4) {
  const [hash, author, authorEmail, message] = commits.slice(index, index + 4);
  if (!hash) continue;
  if (author !== expectedName || authorEmail !== expectedEmail) {
    throw new Error(
      `Commit ${hash} has an unauthorized author: ${author} <${authorEmail}>.`,
    );
  }
  if (bannedTrailers.test(message)) {
    throw new Error(
      `Commit ${hash} contains a prohibited attribution trailer.`,
    );
  }
}

/**
 * The rule at AGENTS.md line 40 was broken on roughly 390 commits while this
 * very script sat unrun. The commit-msg hook is what makes forgetting
 * impossible, so the hook itself has to be checked — and checked from disk,
 * because a Vitest `?raw` import of a file outside src returns empty and an
 * assertion there passes whatever the hook says. That exact trap swallowed
 * the first attempt at this guard.
 */
const hookPath = ".githooks/commit-msg";
if (!existsSync(hookPath)) {
  throw new Error(
    `${hookPath} is missing; nothing stops an attribution trailer at commit time.`,
  );
}
const hook = readFileSync(hookPath, "utf8").toLowerCase();
for (const trailer of [
  "co-authored-by",
  "co-committed-by",
  "generated-by",
  "claude-session",
]) {
  if (!hook.includes(trailer))
    throw new Error(
      `${hookPath} no longer refuses "${trailer}", which AGENTS.md prohibits.`,
    );
}
/**
 * The pre-commit hook, for the same reason the commit-msg hook is checked:
 * a splice produced broken CSS that prettier accepted on --write, and the
 * same edit silently dropped a grid-area the token gate would have caught.
 * The gate had been run before that edit and not after. A check that has to
 * be remembered after the last edit is not a check.
 */
const preCommit = ".githooks/pre-commit";
if (!existsSync(preCommit)) {
  throw new Error(
    `${preCommit} is missing; nothing runs the design system check after the last edit.`,
  );
}
const preCommitBody = readFileSync(preCommit, "utf8");
for (const check of ["prettier --check", "tsc -b", "check-tokens.mjs"])
  if (!preCommitBody.includes(check))
    throw new Error(
      `${preCommit} no longer runs "${check}", so that class of defect can reach a commit again.`,
    );

const configured = git("config", "--get", "core.hooksPath");
if (configured !== ".githooks") {
  throw new Error(
    `core.hooksPath is "${configured || "unset"}"; run "npm run hooks:install" so the commit-msg hook actually runs.`,
  );
}

console.log("Authorship policy passed, and the commit-msg hook is armed.");
