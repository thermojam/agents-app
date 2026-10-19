import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const MAX_REDIRECTS = 5
const MAX_BYTES = 2_000_000
const REQUEST_TIMEOUT_MS = 20_000
const OUTPUT_DIR = resolve('docs/agents-tools')

type SourcePart = {
  id: string
  heading: string
  text: string
}

type SourceDocument = {
  requestedUrl: string
  url: string
  title: string
  fetchedAt: string
  parts: SourcePart[]
  text: string
}

function assertAllowedUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('URL имеет неверный формат')
  }

  const hostname = url.hostname.toLowerCase()
  const isOpenAiHost = hostname === 'openai.com' || hostname.endsWith('.openai.com')
  if (url.protocol !== 'https:') throw new Error('Разрешены только HTTPS-адреса')
  if (!isOpenAiHost) throw new Error('Разрешены только домены OpenAI')
  if (url.username || url.password) throw new Error('URL не должен содержать учётные данные')

  return url
}

async function fetchHtml(requestedUrl: string): Promise<{ html: string; finalUrl: string }> {
  let currentUrl = assertAllowedUrl(requestedUrl)

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(currentUrl, {
      headers: { accept: 'text/html,application/xhtml+xml' },
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error(`Редирект ${response.status} не содержит адреса`)
      if (redirect === MAX_REDIRECTS) throw new Error('Превышен лимит редиректов')
      currentUrl = assertAllowedUrl(new URL(location, currentUrl).toString())
      continue
    }

    if (!response.ok) throw new Error(`Страница ответила ${response.status}`)
    if (!response.headers.get('content-type')?.includes('text/html')) {
      throw new Error('Источник не является HTML-страницей')
    }

    const declaredLength = Number(response.headers.get('content-length') ?? 0)
    if (declaredLength > MAX_BYTES) throw new Error('Ответ превышает лимит размера')
    if (!response.body) throw new Error('Ответ не содержит тела')

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let totalBytes = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      totalBytes += value.byteLength
      if (totalBytes > MAX_BYTES) throw new Error('Ответ превышает лимит размера')
      chunks.push(value)
    }

    const bytes = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }

    return { html: new TextDecoder().decode(bytes), finalUrl: currentUrl.toString() }
  }

  throw new Error('Не удалось получить страницу')
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match)
}

function cleanText(markup: string): string {
  return decodeEntities(
    markup
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|h[1-6]|li|pre|blockquote|div|section)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  )
}

function extractContainer(html: string): string {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1]
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
  const container = article ?? main
  if (!container) throw new Error('Не найден контейнер статьи')

  return container.replace(/<(nav|header|footer|aside|form|script|style|noscript|svg|button)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
}

function extractSource(html: string, finalUrl: string, requestedUrl: string): SourceDocument {
  const container = extractContainer(html)
  const title = cleanText(
    container.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
      html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ??
      html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
      '',
  )
  if (!title) throw new Error('Не найден заголовок h1')

  const headings = [...container.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)]
  const parts: SourcePart[] = []
  const firstHeadingStart = headings[0]?.index ?? container.length
  const introduction = cleanText(container.slice(0, firstHeadingStart))
  if (introduction) parts.push({ id: 'introduction', heading: 'Введение', text: introduction })

  headings.forEach((heading, index) => {
    const start = (heading.index ?? 0) + heading[0].length
    const end = headings[index + 1]?.index ?? container.length
    const headingText = cleanText(heading[1])
    const sectionText = cleanText(container.slice(start, end))
    if (headingText && sectionText) parts.push({ id: `section-${index + 1}`, heading: headingText, text: sectionText })
  })

  if (parts.length < 2) throw new Error('Не найдено достаточно разделов статьи')

  return {
    requestedUrl,
    url: finalUrl,
    title,
    fetchedAt: new Date().toISOString(),
    parts,
    text: parts.map((part) => `${part.heading}\n${part.text}`).join('\n\n'),
  }
}

async function main() {
  const requestedUrl = process.argv[2]
  if (!requestedUrl) throw new Error('Использование: npm run source -- "https://openai.com/..."')

  const { html, finalUrl } = await fetchHtml(requestedUrl)
  const source = extractSource(html, finalUrl, requestedUrl)
  mkdirSync(OUTPUT_DIR, { recursive: true })
  writeFileSync(join(OUTPUT_DIR, 'source.json'), `${JSON.stringify(source, null, 2)}\n`)
  console.log(`Сохранено: ${join(OUTPUT_DIR, 'source.json')}`)
  console.log(`Заголовок: ${source.title}`)
  console.log(`Разделов: ${source.parts.length}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
