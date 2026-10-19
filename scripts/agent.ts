import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateDocument } from '../src/document.ts'
import type { DocumentContent } from '../src/document.ts'
import { renderDocument } from '../src/preview.ts'
import { fetchSource, saveSource } from './source.ts'
import type { SourceDocument } from './source.ts'

export const FIXED_WORK_NAME = 'building-agents'
const AGENTS_TOOLS_DIR = resolve('docs/agents-tools')

export type AgentPaths = {
  workDir: string
  sourcePath: string
  draftPath: string
  previewPath: string
  approvalPath: string
  outputPath: string
}

export type AgentResult = {
  source: SourceDocument
  document: DocumentContent
  paths: AgentPaths
}

export function getAgentPaths(workName = FIXED_WORK_NAME, rootDir = AGENTS_TOOLS_DIR): AgentPaths {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workName)) {
    throw new Error('Имя работы должно состоять из строчных латинских букв, цифр и дефисов')
  }

  const workDir = join(rootDir, workName)
  return {
    workDir,
    sourcePath: join(rootDir, 'source.json'),
    draftPath: join(workDir, 'draft.json'),
    previewPath: join(workDir, 'preview.html'),
    approvalPath: join(workDir, 'approval.json'),
    outputPath: join(workDir, 'guide.pdf'),
  }
}

export function prepareFixedWork(
  source: SourceDocument,
  workName = FIXED_WORK_NAME,
  rootDir = AGENTS_TOOLS_DIR,
): AgentResult {
  const paths = getAgentPaths(workName, rootDir)
  if (!existsSync(paths.draftPath)) {
    throw new Error(`Сохранённый черновик не найден: ${paths.draftPath}. Новый запрос Haiku не запускается.`)
  }

  const document = validateDocument(JSON.parse(readFileSync(paths.draftPath, 'utf8')) as unknown, source)
  if (document.sourceUrl !== source.url) {
    throw new Error(`Черновик относится к ${document.sourceUrl}, а загружена статья ${source.url}`)
  }

  mkdirSync(paths.workDir, { recursive: true })
  writeFileSync(paths.previewPath, renderDocument(document, '../../../public/fonts/InterVariable.woff2'))
  return { source, document, paths }
}

export async function runFixedPath(requestedUrl: string): Promise<AgentResult> {
  console.log('[1/4] Загружаю разрешённую статью')
  const source = await fetchSource(requestedUrl)
  const sourcePath = saveSource(source)
  console.log(`      Источник: ${sourcePath}`)
  console.log(`      Заголовок: ${source.title}`)

  console.log('[2/4] Использую сохранённый черновик без обращения к Haiku')
  const result = prepareFixedWork(source)
  console.log(`      Черновик: ${result.paths.draftPath}`)

  console.log('[3/4] Проверяю структуру и строю HTML-просмотр')
  console.log(`      Просмотр: ${result.paths.previewPath}`)

  console.log('[4/4] Останавливаюсь перед approval')
  console.log('      Финальный PDF не создаётся без явного утверждения человека')
  return result
}

async function main() {
  const requestedUrl = process.argv[2]
  if (!requestedUrl) throw new Error('Использование: npm run agent -- "https://openai.com/..."')
  await runFixedPath(requestedUrl)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
