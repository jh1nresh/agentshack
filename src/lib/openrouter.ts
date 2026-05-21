/**
 * OpenRouter LLM client — thin wrapper for schema inference.
 *
 * Single export: `inferInputSchema(name, desc, inputDesc)`.
 * Model: meta-llama/llama-3.1-8b-instruct (cheap, fast).
 * Env: OPENROUTER_API_KEY
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = 'meta-llama/llama-3.1-8b-instruct';

const SYSTEM_PROMPT = `You are a JSON schema generator for API skills. Given a skill name, description, and input description, produce a JSON Schema (draft-07) for the skill's input parameters along with an example input.

Respond with ONLY valid JSON, no markdown fences, no commentary. The response must be an object with exactly two keys:
- "inputSchema": a JSON Schema object with "type": "object", "properties", and "required"
- "exampleInput": a concrete example object that conforms to the schema

Keep schemas minimal — only include fields the user described. Use "string", "number", "boolean", "array", or "object" types. Add "description" to each property.`;

export interface InferSchemaResult {
  inputSchema: Record<string, unknown>;
  exampleInput: Record<string, unknown>;
}

export async function inferInputSchema(
  name: string,
  description: string,
  inputDescription: string
): Promise<InferSchemaResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured');
  }

  const userPrompt = `Skill name: ${name}
Description: ${description}
Input description: ${inputDescription}

Generate the JSON Schema and example input.`;

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://dojo.maiat.io',
      'X-Title': 'AgentShack',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${text}`);
  }

  const json = await res.json();
  const content: string = json.choices?.[0]?.message?.content ?? '';

  // Strip markdown fences if the model wraps them anyway
  const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

  const parsed = JSON.parse(cleaned) as InferSchemaResult;

  if (!parsed.inputSchema || typeof parsed.inputSchema !== 'object') {
    throw new Error('LLM response missing inputSchema');
  }

  return {
    inputSchema: parsed.inputSchema,
    exampleInput: parsed.exampleInput ?? {},
  };
}
