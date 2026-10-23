import type { DocumentContent } from '../src/document.ts'

export const ARTICLE_TERMS = ['guardrails', 'RAG', 'MCP', 'jailbreak'] as const

export type TermCheck = {
    term: string
    found: boolean
    explained: boolean
    occurrences: number
}

export type TermReport = {
    terms: TermCheck[]
    unexplainedTerms: string[]
    allExplained: boolean
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^$|[\]\\{}]/g, '\\$&')
}

function blockText(document: DocumentContent): string {
    return document.sections
        .flatMap((section) => section.blocks)
        .map((block) => (block.type === 'list' ? block.items.join(' ') : block.text))
        .join('\n')
}

function isExplained(text: string, term: string): boolean {
    const escaped = escapeRegExp(term)
    const pattern = '(?:\\([^)]*\\b' + escaped + '\\b[^)]*\\)|\\b' + escaped + '\\b\\s*[:—-]|[:—-]\\s*[^.!?\\n]{0,120}\\b' + escaped + '\\b)'
    return new RegExp(pattern, 'iu').test(text)
}

export function findUnexplainedTerms(
    document: DocumentContent,
    terms: readonly string[] = ARTICLE_TERMS,
): TermReport {
    const text = blockText(document)
    const checks = terms.map((term) => {
        const matches = text.match(new RegExp('\\b' + escapeRegExp(term) + '\\b', 'giu'))
        const occurrences = matches?.length ?? 0
        return {
            term,
            found: occurrences > 0,
            explained: occurrences > 0 && isExplained(text, term),
            occurrences,
        }
    })
    const unexplainedTerms = checks.filter((check) => check.found && !check.explained).map((check) => check.term)
    return { terms: checks, unexplainedTerms, allExplained: unexplainedTerms.length === 0 }
}
