/**
 * The colours text is drawn in, and the grounds it sits on.
 *
 * Declared here rather than parsed back out of the stylesheet so the
 * contrast test measures values it can see at compile time. A gate script
 * holds `tokens.css` to these, so the two cannot drift apart.
 *
 * The design council returned the product to the ground its own contract
 * always specified — warm ivory surfaces, midnight structural ink — after a
 * dark rebuild inverted it. Two of the three reference products measured
 * live ship a light ground; Vercel, the supposedly dark one, is #fafafa.
 *
 * Two ladders run here, and both are measured. Ink on ivory is darkened to
 * reach contrast; ink on the midnight canvas is brightened. The canvas is
 * the one dark region, where the dependency graph lives and the agent acts.
 */
export const textTokens = `
  --surface: #fdfcfa;
  --surface-sunken: #f6f4f0;
  --surface-raised: #ffffff;
  --structure: #0e1420;
  --structure-raised: #18202f;
  --structure-ink: #f2f5f9;
  --structure-muted: #94a3b8;
  --ink: #16202e;
  --ink-muted: #5b6878;
  --ink-subtle: #646e7b;
  --human-text: #1b4dff;
  --agent-text: #00786e;
  --failure-text: #c0272c;
  --verified-text: #0b7466;
  --branch-text: #96590a;
  --human: #1b4dff;
  --agent: #00a99b;
  --failure: #d93d42;
  --verified: #0f9080;
  --branch: #e08600;
`;
