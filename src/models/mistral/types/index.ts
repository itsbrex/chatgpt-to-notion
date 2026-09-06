export type MistralConversation = {
  metadata: {
    id: string
    title: string
    generatedTitle: string
    updatedAt: string
    organizationId: string
    permission: string
    features: string[]
    integrations: any[]
    pinned: boolean
    visibility: string
    createdById: string
    copies: any[]
  }
  conversation: {
    items: MistralMessage[]
  }
}

export type MistralMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  contentChunks: MistralContentChunk[] | null
  version: number
  status: string
  reaction: string
  createdAt: string
  createdById: string
  chatId: string
  model: any
  moderationCategory: string
  references: MistralReference[] | null
  turn: number
  parentId: string
  parentVersion: number
  prevVersion: any
  nextVersion: any
  versionCount: number
  visibility: string
  toolCalls: number
  isAcceleratedAnswer: boolean
  files: any[]
}

type MistralContentChunk =
  | {
      type: "text"
      text: string
    }
  | {
      type: "reference"
      referenceIds: string[]
    }
  | {
      type: "tool_call"
      publicResult?: Record<string, MistralReference>
      [key: string]: any
    }

export type MistralReference = {
  id: string
  url: string
  title: string
  source: string
  can_open?: boolean
  date?: string
  rank?: number
  metadata?: Record<string, any>
  snippets?: string[]
  description?: string | null
}
