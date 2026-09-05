import type {
  PlasmoCSConfig,
  PlasmoCSUIAnchor,
  PlasmoContentScript,
  PlasmoGetInlineAnchorList,
  PlasmoGetStyle,
  PlasmoRender
} from "plasmo"
import styleText from "data-text:~styles.css"
import { createRoot } from "react-dom/client"
import { compress } from "shrink-string"

import { useStorage } from "@plasmohq/storage/hook"

import PinIcon from "~common/pin"
import { useCallback, useEffect, useState } from "react"

import LogoIcon from "~common/logo"
import { STORAGE_KEYS } from "~utils/consts"
import { getChatConfig, i18n } from "~utils/functions"
import type { AutosaveStatus, PopupEnum, ToBeSaved } from "~utils/types"

export const config: PlasmoCSConfig = {
  matches: ["https://chat.deepseek.com/*"]
}

export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = styleText
  return style
}

export const getInlineAnchorList: PlasmoGetInlineAnchorList = async () =>
  document.querySelectorAll(".ds-assistant-message-main-content")

export const render: PlasmoRender<Element> = async ({
  anchor, // the observed anchor, OR document.body.
  createRootContainer // This creates the default root container
}) => {
  if (!anchor || !createRootContainer) return

  const parent = anchor.element.parentElement?.parentElement
  if (!parent) return

  const rootContainer = await createRootContainer(anchor)
  const rootNode = rootContainer.getRootNode()
  if (rootNode instanceof ShadowRoot) {
    parent.parentNode?.insertBefore(rootNode.host, parent)
  }
  const root = createRoot(rootContainer) // Any root
  parent.classList.add("pin")
  root.render(<Content parent={parent} />)
}

export const Content = ({ parent }: Props) => {
  const [toBeSaved, setToBeSaved] = useStorage<ToBeSaved>(
    STORAGE_KEYS.toBeSaved
  )
  const [showPopup, setShowPopup] = useStorage<PopupEnum | false>(
    STORAGE_KEYS.showPopup,
    false
  )
  const [authenticated] = useStorage(STORAGE_KEYS.authenticated, false)
  const [isPremium] = useStorage(STORAGE_KEYS.isPremium, false)
  const [activeTrial] = useStorage(STORAGE_KEYS.activeTrial, false)
  const [chatID] = useStorage(STORAGE_KEYS.chatID, "")
  const [status] = useStorage<AutosaveStatus>(
    STORAGE_KEYS.autosaveStatus,
    "generating"
  )

  const [autosaveEnabled, setAutosave] = useState(false)
  const [isLastMessage, setIsLastMessage] = useState(false)
  const [showPin, setShowPin] = useState(true)
  const [pinIndex, setPinIndex] = useState(-1)

  useEffect(() => {
    // if (parent.parentElement?.querySelector(".agent-turn")) setShowPin(true)
    // else parent.classList.remove("pin")
    const index = getPinIndex(parent)
    setPinIndex(index)
  }, [])

  useEffect(() => {
    if (!(isPremium || activeTrial) || !chatID) return
    const checkAutosave = async () => {
      const config = await getChatConfig(chatID)
      if (!config) return
      setAutosave(config.enabled)
    }
    checkAutosave()

    setIsLastMessage(
      (() => {
        const pins = document.querySelectorAll(".pin")
        const lastPin = pins[pins.length - 1]
        if (!lastPin) return false
        // Unelegant way to get the node of an element
        const parentNode = parent.firstChild?.parentNode
        if (!parentNode) return false
        return (
          lastPin.firstChild?.parentNode?.isSameNode(
            parent.firstChild?.parentNode
          ) ?? false
        )
      })()
    )
  }, [chatID, status])

  const LastMessageIcon = useCallback(() => {
    switch (status) {
      case "disabled":
        return <LogoIcon />
      case "generating":
        return <LogoIcon loading />
      case "saving":
        return <LogoIcon loading />
      case "error":
        return <LogoIcon error />
      case "saved":
        return <LogoIcon />
    }
  }, [chatID, status])

  const handleClick = async () => {
    if (!authenticated) {
      alert(i18n("errConnect"))
      return
    }

    const images = Array.from(parent.querySelectorAll("img") || [])
    const container = parent

    // Get all markdown content elements within the container
    const text = Array.from(container!.querySelectorAll("ds-assistant-message-main-content")).map(
      (el) =>
        el.parentElement?.classList.contains("mt-3")
          ? "%%CHATGPT_TO_NOTION_WORK1%%" + el.innerHTML
          : el.innerHTML
    )

    console.log(text)

    let uncompressedAnswer = text[0]
    if (text.length > 1) {
      uncompressedAnswer = text.reduce((acc, curr, i, arr) => {
        if (i == 0) return curr

        const prev = arr[i - 1]
        const joint = (curr + prev).includes("%%CHATGPT_TO_NOTION_WORK2%%")
          ? ""
          : "%%CHATGPT_TO_NOTION_SPLIT%%"
        return [acc, curr].join(joint)
      }, "")
    }

    const preCompressionAnswer =
      images.length > 0
        ? "%%CHATGPT_TO_NOTION_IMAGE%%" + uncompressedAnswer
        : uncompressedAnswer
    const answer = await compress(preCompressionAnswer)

    console.log(parent)

    const prompt = await compress(
      // @ts-ignore
      parent.previousElementSibling.previousElementSibling.querySelector(".ds-message")
        .textContent
    )
    const title = document.title
    const url = window.location.href

    await setToBeSaved({
      answer,
      prompt,
      title,
      url,
      pin: pinIndex
    })

    await setShowPopup("save")
  }

  if (!showPin) return null

  if (autosaveEnabled)
    return (
    <div className="flex items-center gap-2 px-2 py-1 absolute top-0 -left-16">
      <button
        onClick={handleClick}
        className="text-gray-800 dark:text-gray-100 flex items-center ml-2 mt-1"
        style={{
          background: "transparent",
          border: "none",
          marginTop: 10,
          padding: 4,
          borderRadius: 4,
          cursor: "pointer"
        }}>
        <PinIcon />
      </button>
    </div>
    )

  return (
    <div className="flex items-center gap-2 px-2 py-1 absolute top-0 -left-16">
      <button
        onClick={handleClick}
        className="text-gray-800 dark:text-gray-100 flex items-center ml-2 mt-1"
        style={{
          background: "transparent",
          border: "none",
          marginTop: 10,
          padding: 4,
          borderRadius: 4,
          cursor: "pointer"
        }}>
        <PinIcon />
      </button>
    </div>
  )
}

const getPinIndex = (parent: Element) => {
  const pins = document.querySelectorAll(".pin")
  return Array.from(pins).findIndex((pin) => pin.isSameNode(parent))
}

type Props = {
  parent: Element
}
