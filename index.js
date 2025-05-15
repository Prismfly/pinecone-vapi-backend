import express from "express";
import { queryPinecone } from "./queryHandler.js";
const app = express();
const PORT = process.env.PORT || 3000;
import bodyParser from "body-parser";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
app.use(express.json());
app.use(cors());

const urlencodedParser = bodyParser.urlencoded({ extended: false });
app.use(bodyParser.json(), urlencodedParser);

app.post("/vapi-query", async (req, res) => {
  const userQuery = req.body.query;

  try {
    const results = await queryPinecone(userQuery);
    res.json({ context: results });
  } catch (err) {
    console.error("Query failed:", err.message);
    res.status(500).json({ error: "Query failed" });
  }
});

app.listen(process.env.PORT, () =>
  console.log(`✅ Server listening on port ${PORT}`)
);
