import { execFileSync } from "node:child_process";

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

console.log("Authorship policy passed.");
