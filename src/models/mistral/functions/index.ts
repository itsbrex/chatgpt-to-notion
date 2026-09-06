import type { MistralReference } from "~models/mistral/types"
import type { Conversation, ConversationTextdocs, Message } from "~utils/types"

function parseMultipleJSON(raw: string): any[] {
  // Use a regex to capture individual JSON objects in the stream.
  try {
    return JSON.parse(raw)
  } catch {
    const regex = /{[\s\S]*?}(?=\s*{|\s*$)/g
    const matches = raw.match(regex) || []
    return matches.map((str) => JSON.parse(str))
  }
}

function findObjectWithKeysAndCondition(
  data: any,
  keys: string[],
  condition: (obj: any) => boolean
): any | null {
  if (data && typeof data === "object") {
    if (
      !Array.isArray(data) &&
      keys.every((key) => key in data) &&
      condition(data)
    ) {
      return data
    }
    const values = Array.isArray(data) ? data : Object.values(data)
    for (const value of values) {
      const found = findObjectWithKeysAndCondition(value, keys, condition)
      if (found) return found
    }
  }
  return null
}

export function extractConversationAndMessages(raw: string) {
  const objects = parseMultipleJSON(raw)
  let metadata: any = null
  let conversation: any = null

  for (const obj of objects) {
    if (!metadata) {
      metadata = findObjectWithKeysAndCondition(
        obj,
        ["id", "title"],
        () => true
      )
    }
    if (!conversation) {
      conversation = findObjectWithKeysAndCondition(
        obj,
        ["items", "nextCursor"],
        (o) => Array.isArray(o.items) && o.items.length > 0
      )
    }
    if (metadata && conversation) break
  }

  return { metadata, conversation }
}

/**
 * Parses a Mistral conversation by:
 * 1. Sorting messages by createdAt (ensuring the user message comes first).
 * 2. Grouping the conversation into user–assistant pairs.
 *    (If two user messages come consecutively, they are merged.)
 *
 * For the sample conversation this produces:
 *  - prompts: [ "Compte jusqu'à 10", "Compte jusqu'à 20" ]
 *  - answers: [ <assistant reply for 10>, <assistant reply for 20> ]
 */
export const parseConversation = (rawConv: Conversation["mistral"]) => {
  // Sort messages by createdAt (ascending order)
  const messages = rawConv.conversation.items.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  const prompts: string[] = []
  const answers: string[] = []

  // We track the last processed role and build a conversation pair:
  // a prompt from a user message followed by an assistant answer.
  let lastRole: "user" | "assistant" | null = null
  let currentPrompt = ""
  let currentAnswer = ""

  messages.forEach((msg) => {
    if (msg.role === "user") {
      // If the last message was from the assistant, the previous conversation pair is complete.
      if (lastRole === "assistant" && currentPrompt && currentAnswer) {
        prompts.push(currentPrompt)
        answers.push(currentAnswer)
        // Start a new conversation pair.
        currentPrompt = ""
        currentAnswer = ""
      }
      // If two user messages occur consecutively, merge their texts.
      if (lastRole === "user") {
        currentPrompt += "\n" + msg.content
      } else {
        currentPrompt = msg.content
      }
      lastRole = "user"
    } else if (msg.role === "assistant") {
      const answer = flattenMistralMessage(msg)
      // Merge consecutive assistant messages if needed.
      if (lastRole === "assistant") {
        currentAnswer += "\n\n" + answer
      } else {
        currentAnswer = answer
      }
      lastRole = "assistant"
    }
  })

  // Push any remaining conversation pair.
  if (currentPrompt && currentAnswer) {
    prompts.push(currentPrompt)
    answers.push(currentAnswer)
  }

  // Use metadata (if available) for the URL and title.
  // Fallback: use the chatId from the first message and the first prompt as title.
  const url =
    "https://chat.mistral.ai/chat/" +
    (rawConv.metadata?.id || (messages[0]?.chatId ?? ""))
  const title =
    rawConv.metadata?.title ||
    (prompts.length > 0 ? prompts[0] : "Conversation")

  return { url, title, prompts, answers, textDocs: [] }
}

/** Rebuilds the message from its ordered text and reference chunks. */
export const flattenMistralMessage = (msg: Message["mistral"]): string => {
  if (!msg.contentChunks?.some((chunk) => chunk.type === "reference")) {
    return msg.content
  }

  const references = new Map(
    (msg.references ?? []).map((reference) => [reference.id, reference])
  )

  for (const chunk of msg.contentChunks) {
    if (chunk.type !== "tool_call" || !chunk.publicResult) continue

    for (const [id, reference] of Object.entries(chunk.publicResult)) {
      if (!references.has(id)) references.set(id, reference)
    }
  }

  return msg.contentChunks
    .map((chunk) => {
      if (chunk.type === "text") return chunk.text
      if (chunk.type !== "reference") return ""

      return chunk.referenceIds
        .map((id) => formatReference(references.get(id)))
        .filter((reference): reference is string => reference !== null)
        .join(" ")
    })
    .join("")
}

const formatReference = (reference?: MistralReference) => {
  if (!reference) return null

  if (/^https?:\/\//i.test(reference.url)) {
    const label = reference.source || reference.title || reference.url
    return `[${label}](${reference.url})`
  }

  const label = reference.title || reference.source || reference.url
  return label ? `[${label}]` : null
}
