import type {DocumentBlock, DocumentContent} from './document.ts'

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

function renderSourceLink(sourceUrl: string): string {
    const url = new URL(sourceUrl)
    if (url.protocol !== 'https:') throw new Error('Источник должен использовать HTTPS')
    const safeUrl = escapeHtml(url.toString())
    return `<a href="${safeUrl}">${escapeHtml(url.toString())}</a>`
}

function renderBlock(block: DocumentBlock): string {
    if (block.type === 'heading') {
        return `<h${block.level} class="content-heading">${escapeHtml(block.text)}</h${block.level}>`
    }
    if (block.type === 'paragraph') {
        return `<p>${escapeHtml(block.text)}</p>`
    }
    if (block.type === 'list') {
        return `<ul>${block.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    }
    return `<aside class="example-block"><p class="example-label">${escapeHtml(block.label)}</p><p>${escapeHtml(block.text)}</p></aside>`
}

export function renderDocument(
    document: DocumentContent,
    fontPath = '../../public/fonts/InterVariable.woff2',
): string {
    const sections = document.sections
        .map(
            (section) => `
                <section class="document-section">
                    <h2>${escapeHtml(section.title)}</h2>
                    ${section.blocks.map(renderBlock).join('\n')}
                </section>`,
        )
        .join('\n')

    return `<!doctype html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(document.title)}</title>
    <style>
        @font-face {
            font-family: Inter;
            font-style: normal;
            font-weight: 100 900;
            src: url("${fontPath}") format("woff2");
        }

        :root {
            color: #141414;
            background: #ffffff;
            font-family: Inter, Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.5;
        }

        @page {
            size: A4;
            margin: 18mm;
        }

        * {
            box-sizing: border-box;
        }

        body {
            margin: 0;
            background: #ffffff;
        }

        .document {
            max-width: 174mm;
            margin: 0 auto;
        }

        .document-header {
            margin-bottom: 32px;
            padding-bottom: 16px;
            border-bottom: 1px solid #e0e0e0;
        }

        .eyebrow,
        .example-label {
            color: #0066ff;
            font-size: 9pt;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }

        h1,
        h2,
        h3,
        p,
        ul {
            margin-top: 0;
        }

        h1 {
            margin-bottom: 12px;
            font-size: 28pt;
            line-height: 1.05;
        }

        h2 {
            margin-bottom: 16px;
            font-size: 20pt;
            line-height: 1.15;
            break-after: avoid;
        }

        h3 {
            font-size: 14pt;
            line-height: 1.25;
            break-after: avoid;
        }

        p {
            margin-bottom: 12px;
        }

        .source {
            color: #707070;
            font-size: 9pt;
            overflow-wrap: anywhere;
        }

        a {
            color: #141414;
            text-decoration: underline;
        }

        .document-section {
            margin-bottom: 28px;
        }

        .content-heading {
            margin-bottom: 8px;
        }

        ul {
            padding-left: 22px;
        }

        li {
            margin-bottom: 6px;
        }

        .example-block {
            margin: 20px 0;
            padding: 16px;
            background: #f3f3f3;
            break-inside: avoid;
        }

        .example-label {
            margin-bottom: 8px;
        }

        .example-block p:last-child {
            margin-bottom: 0;
        }
    </style>
</head>
<body>
    <main class="document">
        <header class="document-header">
            <p class="eyebrow">Учебный PDF-гайд</p>
            <h1>${escapeHtml(document.title)}</h1>
            <p class="source">Источник: ${renderSourceLink(document.sourceUrl)}</p>
        </header>
${sections}
    </main>
</body>
</html>
`
}
