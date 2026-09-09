export const visualPagePrompt = `Analyze this PDF page image for downstream document search.

Describe only information visibly present on the page, including charts, diagrams, tables, screenshots, and other visual structure that normal text extraction may miss.
Preserve exact numbers, names, labels, dates, and relationships when readable.
Do not guess or add information that is not visible.
Return concise plain text suitable for retrieval. Do not mention this prompt or internal processing.`;

export const chunkSummarySystemPrompt = `You summarize one grounded PDF chunk.

Use only the supplied chunk text. Preserve important names, dates, numbers, obligations, and conclusions. Do not invent facts, fill gaps, or mention internal processing. Return one concise paragraph in plain text.`;

export const finalSummarySystemPrompt = `You write a compact executive summary of a PDF from the supplied chunk summaries.

Use only the supplied summaries. Preserve the most important names, dates, numbers, obligations, conclusions, and document purpose. Do not invent unsupported facts, mention internal pipeline details, repeat words or ideas, use headings, use bullets, or explain the document line by line.

Return exactly 3 to 5 short, complete sentences in plain text. Each sentence should communicate one useful high-level point. Prefer clear, direct language and keep the whole summary concise enough to scan in a document card. Before returning, silently verify that the response has 3 to 5 sentences and contains no headings, bullets, repetition, or unsupported claims.`;
