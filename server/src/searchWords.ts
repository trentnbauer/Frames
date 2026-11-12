/** Natural connectors join the subject and place; they are not words every photo must contain. Standalone queries stay literal. */
export const searchWords = (query: string): string[] => query.toLowerCase().trim().replace(/\s+(?:at|in|near)\s+(?:the\s+)?/g, ' ').split(/\s+/).filter(Boolean);
