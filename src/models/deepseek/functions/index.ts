import type { Conversation, Message } from "~utils/types"

export const parseConversation = (rawConv: Conversation["deepseek"]) => {
  const { chat_session, chat_messages } = rawConv.data.biz_data
  const id = chat_session.id
  const title = chat_session.title
  // DeepSeek can give an assistant message an inserted_at value that is a few
  // milliseconds earlier than its prompt. message_id preserves the real order.
  const messages = [...chat_messages].sort(
    (a, b) => a.message_id - b.message_id || a.inserted_at - b.inserted_at
  )

  // Group consecutive user messages and their following assistant messages.
  const pairs: {
    prompt: string
    answers: string[]
  }[] = []
  let currentPrompt: string | null = null
  let currentAnswers: string[] = []
  let lastRole: "USER" | "ASSISTANT" | null = null

  messages.forEach((msg) => {
    const content = flattenMessage(msg)

    if (msg.role === "USER") {
      if (lastRole === "USER" && currentPrompt !== null) {
        // Merge consecutive user messages.
        currentPrompt += "\n" + content
      } else {
        if (currentPrompt !== null) {
          pairs.push({ prompt: currentPrompt, answers: currentAnswers })
        }
        // Start a new prompt.
        currentPrompt = content
        currentAnswers = []
      }
      lastRole = "USER"
    } else if (msg.role === "ASSISTANT") {
      if (lastRole === "ASSISTANT" && currentAnswers.length) {
        // Merge consecutive assistant messages.
        currentAnswers[currentAnswers.length - 1] += "\n" + content
      } else {
        currentAnswers.push(content)
      }
      lastRole = "ASSISTANT"
    }
  })
  if (currentPrompt !== null)
    pairs.push({ prompt: currentPrompt, answers: currentAnswers })

  const prompts = pairs.map((pair) => pair.prompt)
  const answers = pairs.map((pair) => pair.answers.join("\n\n"))
  const url = "https://chat.deepseek.com/a/chat/s/" + id

  return { url, title, prompts, answers, textDocs: [] }
}

export const flattenMessage = (msg: Message["deepseek"]): string => {
  const text =
    msg.fragments
      ?.filter(
        (fragment) =>
          fragment.type === "REQUEST" || fragment.type === "RESPONSE"
      )
      .map((fragment) => fragment.content)
      .filter((content): content is string => typeof content === "string")
      .join("\n") ?? msg.content ?? ""

  const references = new Map(
    msg.fragments
      ?.filter((fragment) => fragment.type === "SEARCH")
      .flatMap((fragment) => fragment.results)
      .map((reference) => [reference.cite_index, reference]) ?? []
  )

  return text.replace(/\[citation:(\d+)\]/g, (marker, rawIndex) => {
    const reference = references.get(Number(rawIndex))
    if (!reference?.url) return marker

    const label = reference.site_name || reference.title || reference.url
    return ` ([${label}](${reference.url}))`
  })
}
