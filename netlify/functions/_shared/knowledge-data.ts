import rawKnowledge from "../../../knowledge/index.json" with { type: "json" };

import { parseKnowledgeDocument } from "./knowledge-schema.ts";

export const knowledgeDocument = parseKnowledgeDocument(rawKnowledge);
export const publicEntries = knowledgeDocument.entries.filter((entry) => entry.visibility === "public");
export const publicTopics = knowledgeDocument.topics;
