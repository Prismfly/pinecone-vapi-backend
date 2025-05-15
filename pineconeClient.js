const { Pinecone } = require("@pinecone-database/pinecone");
const dotenv = require("dotenv");

dotenv.config();

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);

module.exports = { index };
