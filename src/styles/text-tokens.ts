/**
 * The colours text is drawn in, and the grounds it sits on.
 *
 * Declared here rather than parsed back out of the stylesheet so the contrast
 * test measures values it can see at compile time. `tokens.css` is held to
 * these by a test in the same folder, so the two cannot drift apart.
 *
 * Every text colour meets 4.5:1 against both grounds. The accent colours are
 * also used as fills, where a background does not have to meet text contrast,
 * so each has a text-only variant at the minimum darkening that reaches the
 * threshold — `--cyan` was the worst at 2.55:1.
 */
export const textTokens = `
  --ink: #112440;
  --muted: #5e6c82;
  --paper: #f3f0e9;
  --panel: #fbfaf6;
  --blue: #2068bf;
  --cyan: #11a7b8;
  --coral: #d95d4f;
  --green: #248765;
  --cyan-text: #007687;
  --coral-text: #b93e30;
  --green-text: #177a58;
  --amber-text: #9c5c12;
`;
