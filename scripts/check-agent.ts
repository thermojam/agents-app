import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { prepareFixedWork } from './agent.ts'
import { saveApproval } from './approval.ts'
import { createPdf } from './pdf.ts'
import type { SourceDocument } from './source.ts'
import type { DocumentContent } from '../src/document.ts'

const source = JSON.parse(readFileSync('docs/agents-tools/building-agents/source.json', 'utf8')) as SourceDocument
const fixture = JSON.parse(readFileSync('docs/agents-tools/building-agents/draft.json', 'utf8')) as DocumentContent
const temporaryRoot = mkdtempSync(join(tmpdir(), 'agents-app-agent-check-'))
const workDir = join(temporaryRoot, 'building-agents')
const draftPath = join(workDir, 'draft.json')
const approvedWorkName = `agent-check-${process.pid}`
const approvedWorkDir = join('docs/agents-tools', approvedWorkName)
const expectedParagraph = fixture.sections
  .flatMap((section) => section.blocks)
  .find((block) => block.type === 'paragraph')?.text
if (!expectedParagraph) throw new Error('Fixture не содержит абзаца для проверки PDF')

try {
  mkdirSync(workDir, { recursive: true })
  writeFileSync(draftPath, `${JSON.stringify(fixture, null, 2)}\n`)
  const first = prepareFixedWork(source, 'building-agents', temporaryRoot)
  const firstDraft = readFileSync(first.paths.draftPath, 'utf8')
  const firstPreview = readFileSync(first.paths.previewPath, 'utf8')

  if (first.document.sourceUrl !== source.url) throw new Error('Черновик ссылается не на загруженную статью')
  if (!firstPreview.includes(fixture.title)) throw new Error('Просмотр не содержит заголовок черновика')
  if (existsSync(first.paths.approvalPath) || existsSync(first.paths.outputPath)) {
    throw new Error('Путь T10 создал approval или PDF до решения человека')
  }

  const second = prepareFixedWork(source, 'building-agents', temporaryRoot)
  if (readFileSync(second.paths.draftPath, 'utf8') !== firstDraft) {
    throw new Error('Повторный путь изменил сохранённый черновик')
  }

  mkdirSync(approvedWorkDir, { recursive: true })
  writeFileSync(join(approvedWorkDir, 'draft.json'), `${JSON.stringify(fixture, null, 2)}\n`)
  writeFileSync(join(approvedWorkDir, 'source.json'), `${JSON.stringify(source, null, 2)}\n`)
  const approved = prepareFixedWork(source, approvedWorkName)
  try {
    await createPdf(approvedWorkName)
    throw new Error('PDF неожиданно создан без approval.json')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('ещё не утверждён')) throw error
  }

  saveApproval(approved.paths.approvalPath, approved.document)
  const outputPath = await createPdf(approvedWorkName)
  const pdfText = execFileSync('pdftotext', [outputPath, '-'], { encoding: 'utf8' })
  const flatPdfText = pdfText.replace(/\s+/g, ' ')
  if (!flatPdfText.includes(fixture.title) || !flatPdfText.includes(expectedParagraph.slice(0, 40))) {
    throw new Error('PDF не содержит утверждённый текст')
  }
  if (pdfText.includes('Неподтверждённый текст')) {
    throw new Error('PDF содержит текст, которого нет в утверждённом документе')
  }

  console.log('T10: источник проверен, сохранённый draft переиспользован без Haiku; без approval PDF запрещён; после тестового approval PDF содержит утверждённый текст')
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
  rmSync(approvedWorkDir, { recursive: true, force: true })
}
