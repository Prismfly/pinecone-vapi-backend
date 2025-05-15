const { CohereClient } = require("cohere-ai");
const index = require("./pineconeClient.js");
const dotenv = require("dotenv");

dotenv.config();

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

async function queryPinecone(userQuery) {
  const embedRes = await cohere.embed({
    texts: [userQuery],
    model: "embed-english-v3.0",
    input_type: "search_query",
  });

  const embedding = embedRes.embeddings?.[0];
  if (!embedding) throw new Error("Failed to generate embedding");

  const queryRes = await index.query({
    vector: embedding,
    topK: 5,
    includeMetadata: true,
  });

  return queryRes.matches.map((match) => match.metadata);
}

module.exports = { queryPinecone };
