import { z } from "zod";
import { type Provider, openAIClient, safeSdk } from "./models";
import { ConnectorError, postJson, requestJson, requiredEnv } from "./http";

export const planTools = [
  "search.web",
  "email.list",
  "calendar.list",
  "memory.search",
  "files.search",
  "report.compose",
] as const;
export type PlanTool = (typeof planTools)[number];
export type PlanStep = { tool: PlanTool; argument: string };
const planShape = z
  .object({
    steps: z
      .array(
        z
          .object({
            tool: z.enum(planTools),
            argument: z.string().trim().min(1).max(400),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();

export function validateToolPlan(
  raw: unknown,
  allowedTools: readonly PlanTool[],
): PlanStep[] {
  const parsed = planShape.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.steps.some((step) => !allowedTools.includes(step.tool))
  ) {
    throw new ConnectorError(
      "planner",
      "The proposed plan exceeds the permitted tools or execution budget.",
      422,
    );
  }
  return parsed.data.steps;
}

const functionName = "propose_workspace_plan";
const description =
  "Propose up to four steps for the authenticated user's request. Each argument is a short query or report topic.";
const guidance =
  "Propose the smallest useful plan using the supplied read and composition tools. Search the public web only if explicitly requested or necessary for the question. Web queries must use public topic keywords from the request. Keep account data and private user context out of web queries. Only use email, calendar, memory, or file tools when needed for this user's stated task. The report step summarizes the preceding results. Do not send messages or perform external writes. The application checks permissions separately.";

export async function planModelTools(input: {
  provider: Provider;
  apiKey: string;
  model: string;
  instruction: string;
  allowedTools: readonly PlanTool[];
}) {
  const tools = [...new Set(input.allowedTools)].filter((id) =>
    planTools.includes(id),
  );
  if (
    !tools.length ||
    !input.apiKey ||
    !input.model ||
    !input.instruction.trim() ||
    input.instruction.length > 8_000
  )
    throw new ConnectorError(
      "planner",
      "Select an available model, a permitted tool, and a brief instruction.",
    );
  const parameters = {
    type: "object",
    additionalProperties: false,
    required: ["steps"],
    properties: {
      steps: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["tool", "argument"],
          properties: {
            tool: { type: "string", enum: tools },
            argument: {
              type: "string",
              description:
                "Plain text query or report topic, maximum 400 characters.",
            },
          },
        },
      },
    },
  };
  const finish = (raw: unknown, inputTokens = 0, outputTokens = 0) => ({
    steps: validateToolPlan(raw, tools),
    inputTokens,
    outputTokens,
  });
  const decoded = (raw?: string) => {
    try {
      return JSON.parse(raw ?? "null") as unknown;
    } catch {
      throw new ConnectorError(
        "planner",
        "The model returned an invalid tool call.",
        422,
      );
    }
  };
  if (input.provider === "openai") {
    const response = await safeSdk("OpenAI planner", () =>
      openAIClient("openai", input.apiKey).responses.create({
        model: input.model,
        store: false,
        instructions: guidance,
        input: input.instruction,
        max_output_tokens: 1200,
        tools: [
          {
            type: "function",
            name: functionName,
            description,
            parameters,
            strict: true,
          },
        ],
        tool_choice: { type: "function", name: functionName },
        parallel_tool_calls: false,
      }),
    );
    const call = response.output.find(
      (o) => o.type === "function_call" && o.name === functionName,
    );
    return finish(
      decoded(call?.type === "function_call" ? call.arguments : undefined),
      response.usage?.input_tokens,
      response.usage?.output_tokens,
    );
  }
  if (
    input.provider === "compatible" &&
    process.env.PUBLIC_DEPLOYMENT !== "1" &&
    process.env.LOCAL_MODEL_DISCOVERY === "1" &&
    process.env.AI_COMPATIBLE_BASE_URL === "http://127.0.0.1:11434/v1"
  ) {
    // Constrain small on-device models during generation and validate again before dispatch.
    const schema = {
      ...parameters,
      properties: {
        steps: { ...parameters.properties.steps, minItems: 1, maxItems: 4 },
      },
    };
    const response = await safeSdk("Ollama planner", () =>
      openAIClient("compatible", input.apiKey).chat.completions.create({
        model: input.model,
        temperature: 0,
        max_tokens: 600,
        response_format: {
          type: "json_schema",
          json_schema: { name: "workspace_plan", strict: true, schema },
        },
        messages: [
          {
            role: "system",
            content:
              guidance +
              " Return JSON matching " +
              JSON.stringify(schema) +
              ". Use the narrowest literal keyword from the request as each search argument.",
          },
          { role: "user", content: input.instruction },
        ],
      }),
    );
    return finish(
      decoded(response.choices[0]?.message.content || undefined),
      response.usage?.prompt_tokens,
      response.usage?.completion_tokens,
    );
  }
  if (input.provider === "compatible") {
    const response = await safeSdk("compatible planner", () =>
      openAIClient("compatible", input.apiKey).chat.completions.create({
        model: input.model,
        messages: [
          { role: "system", content: guidance },
          { role: "user", content: input.instruction },
        ],
        max_tokens: 900,
        tools: [
          {
            type: "function",
            function: { name: functionName, description, parameters },
          },
        ],
        tool_choice: { type: "function", function: { name: functionName } },
      }),
    );
    const call = response.choices[0]?.message.tool_calls?.find(
      (c) => c.type === "function" && c.function.name === functionName,
    );
    return finish(
      decoded(call?.type === "function" ? call.function.arguments : undefined),
      response.usage?.prompt_tokens,
      response.usage?.completion_tokens,
    );
  }
  if (input.provider === "anthropic") {
    type Output = {
      content: { type: string; name?: string; input?: unknown }[];
      usage?: { input_tokens: number; output_tokens: number };
    };
    const response = await requestJson<Output>(
      "Anthropic planner",
      "https://api.anthropic.com/v1/messages",
      postJson(
        { "x-api-key": input.apiKey, "anthropic-version": "2023-06-01" },
        {
          model: input.model,
          max_tokens: 900,
          system: guidance,
          messages: [{ role: "user", content: input.instruction }],
          tools: [
            { name: functionName, description, input_schema: parameters },
          ],
          tool_choice: {
            type: "tool",
            name: functionName,
            disable_parallel_tool_use: true,
          },
        },
      ),
    );
    return finish(
      response.content.find(
        (c) => c.type === "tool_use" && c.name === functionName,
      )?.input,
      response.usage?.input_tokens,
      response.usage?.output_tokens,
    );
  }
  if (input.provider !== "google")
    throw new ConnectorError("planner", "Unknown provider.");
  type GooglePlan = {
    candidates?: {
      content?: {
        parts?: { functionCall?: { name: string; args?: unknown } }[];
      };
    }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
    };
  };
  const response = await requestJson<GooglePlan>(
    "Gemini planner",
    "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(input.model) +
      ":generateContent",
    postJson(
      { "x-goog-api-key": input.apiKey },
      {
        systemInstruction: { parts: [{ text: guidance }] },
        contents: [{ role: "user", parts: [{ text: input.instruction }] }],
        generationConfig: { maxOutputTokens: 1200 },
        tools: [
          {
            functionDeclarations: [
              {
                name: functionName,
                description,
                parametersJsonSchema: parameters,
              },
            ],
          },
        ],
        toolConfig: {
          functionCallingConfig: {
            mode: "ANY",
            allowedFunctionNames: [functionName],
          },
        },
      },
    ),
  );
  const call = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.functionCall?.name === functionName,
  )?.functionCall;
  return finish(
    call?.args,
    response.usageMetadata?.promptTokenCount,
    (response.usageMetadata?.candidatesTokenCount ?? 0) +
      (response.usageMetadata?.thoughtsTokenCount ?? 0),
  );
}

export async function embedText(
  apiKey: string,
  text: string,
  modelOverride?: string,
) {
  const model = requiredEnv("EMBEDDING_MODEL");
  if (modelOverride && modelOverride !== model)
    throw new ConnectorError(
      "embedding",
      "The selected model does not match the server embedding configuration.",
    );
  if (!apiKey || !text.trim() || text.length > 16_000)
    throw new ConnectorError(
      "embedding",
      "A connected OpenAI key and text up to 16,000 characters are required.",
    );
  const client = openAIClient("openai", apiKey);
  // Availability depends on this workspace's credentials, including for an operator-selected model.
  await safeSdk("OpenAI embeddings", () => client.models.retrieve(model));
  const response = await safeSdk("OpenAI embeddings", () =>
    client.embeddings.create({
      model,
      input: text,
      dimensions: 1536,
      encoding_format: "float",
    }),
  );
  const embedding = response.data[0]?.embedding;
  if (
    !embedding ||
    embedding.length !== 1536 ||
    !embedding.every(Number.isFinite)
  )
    throw new ConnectorError(
      "embedding",
      "The provider returned an incompatible embedding.",
      502,
    );
  return { model, embedding, inputTokens: response.usage?.prompt_tokens ?? 0 };
}
