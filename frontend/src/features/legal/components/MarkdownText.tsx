import { Fragment, type ReactNode } from 'react'

/**
 * Минимальный безопасный вывод Markdown: строится только из React-элементов,
 * необработанный HTML в документ не вставляется (никакого dangerouslySetInnerHTML).
 */

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; items: string[] }
  | { kind: 'rule' }

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: string[] = []

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', lines: paragraph })
      paragraph = []
    }
  }

  const flushList = () => {
    if (list.length > 0) {
      blocks.push({ kind: 'list', items: list })
      list = []
    }
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)

    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({
        kind: 'heading',
        level: heading[1].length,
        text: heading[2],
      })
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flushParagraph()
      flushList()
      blocks.push({ kind: 'rule' })
      continue
    }

    const listItem = /^[-*+]\s+(.*)$/.exec(line)

    if (listItem) {
      flushParagraph()
      list.push(listItem[1])
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()

  return blocks
}

function renderInline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter((part) => part.length > 0)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={index}>{part.slice(2, -2)}</strong>
      }

      if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        return (
          <code key={index} className="font-mono text-[0.9em]">
            {part.slice(1, -1)}
          </code>
        )
      }

      return <Fragment key={index}>{part}</Fragment>
    })
}

export function MarkdownText({ content }: { content: string }) {
  const blocks = parseBlocks(content)

  return (
    <div className="space-y-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
      {blocks.map((block, index) => {
        if (block.kind === 'rule') {
          return (
            <hr key={index} className="border-zinc-200 dark:border-zinc-800" />
          )
        }

        if (block.kind === 'heading') {
          const className =
            block.level <= 2
              ? 'text-base font-semibold text-zinc-900 dark:text-zinc-100'
              : 'text-sm font-semibold text-zinc-900 dark:text-zinc-100'

          return (
            <p key={index} className={className}>
              {renderInline(block.text)}
            </p>
          )
        }

        if (block.kind === 'list') {
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInline(item)}</li>
              ))}
            </ul>
          )
        }

        return (
          <p key={index}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {renderInline(line)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </div>
  )
}

export default MarkdownText
