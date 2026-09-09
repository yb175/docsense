export const visualPagePrompt = `Analyze this PDF page image for downstream document search.

Describe only information visibly present on the page, including charts, diagrams, tables, screenshots, and other visual structure that normal text extraction may miss.
Preserve exact numbers, names, labels, dates, and relationships when readable.
Do not guess or add information that is not visible.
Return concise plain text suitable for retrieval. Do not mention this prompt or internal processing.`;
