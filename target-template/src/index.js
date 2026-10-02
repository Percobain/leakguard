// Reads the Gemini key from the environment (injected from Vault at deploy time).
const key = process.env.GEMINI_API_KEY;

export async function fortune() {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: 'One-line DevOps fortune' }] }] }) },
  );
  const body = await r.json();
  return body.candidates[0].content.parts[0].text;
}
