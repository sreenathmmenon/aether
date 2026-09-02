/**
 * The colours text is drawn in, and the grounds it sits on.
 *
 * Declared here rather than parsed back out of the stylesheet so the
 * contrast test measures values it can see at compile time. A gate script
 * holds `tokens.css` to these, so the two cannot drift apart.
 *
 * The interface moved from a cream page to a dark ground, which inverts the
 * whole ladder: on paper a text colour is darkened to reach contrast, and
 * here it is brightened. Every value below is measured against the darkest
 * ground it is drawn on.
 */
export const textTokens = `
  --ink: #e8edf7;
  --muted: #9aabc6;
  --void: #070b14;
  --paper: #0b1120;
  --panel: #121b2e;
  --raised: #17223a;
  --blue: #5b9dff;
  --cyan: #2dd4de;
  --coral: #ff6b5e;
  --green: #2fd39b;
  --blue-text: #85b8ff;
  --cyan-text: #5fe3ea;
  --coral-text: #ff8f85;
  --green-text: #5fdfb4;
  --amber-text: #ffc078;
`;
