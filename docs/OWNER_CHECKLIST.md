# What only the owner can finish

Three items remain, and none of them can be done by an agent working in this
repository — each needs either a browser profile it cannot launch or an
account it cannot sign into. Everything else is verified against the deployed
origin and recorded in `STATUS.md`.

## 1. Prove the origin trial works without the local flag (M10.4b, M13.6)

`document.modelContext` is present in the development browser, but from inside
the page there is no way to tell whether the **Chrome testing flag** or the
**origin trial** provided it. The flag masks the very thing the trial is meant
to prove, so the check has to happen in a profile where the flag is off.

Run this in a terminal. It launches a throwaway Chrome profile with no flags
set, so nothing but the origin-trial header can enable the API:

```sh
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --user-data-dir=/tmp/aether-clean-profile \
  --no-first-run \
  https://webmcp-production-38e5.up.railway.app/?system=payment-platform
```

In that window open DevTools (⌥⌘I) and run:

```js
typeof document
  .modelContext // expect "object"
  (await document.modelContext.getTools()).length; // expect 5
```

Five tools on the committed payment architecture is the pass condition. If
`document.modelContext` is `undefined`, the trial is not activating and the
token needs re-checking — the server prints its status at startup, and
`curl -sI <origin> | grep -i origin-trial` shows what is being served.

Then mark **M10.4b** and the final clause of **M13.6** done in `STATUS.md`,
and change the compliance row in `docs/WEBMCP_COMPLIANCE.md` from "Verified,
except confirming activation in a profile with the testing flag disabled".

## 2. Record the three-minute demo (M11.1)

`docs/DEMO.md` is the script. Every figure it quotes is held to the engine by
`src/app/demo-script.test.ts`, so if the suite passes, the numbers on screen
will match the words being spoken. Clear `localStorage` before the first take —
a returning visitor is restored into their previous workspace.

## 3. Publish the Devpost entry (M11.6)

`docs/SUBMISSION.md` holds the title, description, links, and the screenshot
checklist, and the checklist is now guarded against drifting from the product
(`demo-script.test.ts`).

---

## Pushing the rewritten history

The attribution trailers prohibited by `AGENTS.md` were stripped from all 485
commits, which changed every commit hash. `origin/main` still holds the old
history. The content is identical — all 485 commit trees compare byte-for-byte
equal — but publishing needs a force push, which is deliberately left to you:

```sh
git push --force-with-lease origin main
```

`--force-with-lease` refuses if anyone else has pushed since your last fetch.
A full backup of the folder, including `.git`, was taken before the rewrite.
