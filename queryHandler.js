import { CohereClient } from "cohere-ai";
import { index } from "./pineconeClient.js";
import dotenv from "dotenv";
dotenv.config();

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

export async function queryPinecone(userQuery) {
  const embedRes = await cohere.embed({
    texts: [userQuery],
    model: "embed-english-v3.0",
    input_type: "search_query",
  });

  const embedding = embedRes.embeddings?.[0];
  if (!embedding) throw new Error("Failed to generate embedding");

  const queryRes = await index.query({
    vector: embedding,
    topK: 3,
    includeMetadata: true,
  });

  console.log(queryRes.matches);
  return queryRes.matches.map((match) => ({
    title: match.metadata.title,
    url: match.metadata.url,
    price: match.metadata.price,
    productInfo: match.metadata.productInfo,
    description: match.metadata.description,
    sample: match.metadata.sample,
    specifications: match.metadata.specifications,
  }));
}
