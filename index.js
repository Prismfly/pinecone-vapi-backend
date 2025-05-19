import express from "express";
import { queryPinecone } from "./queryHandler.js";
const app = express();
const PORT = process.env.PORT || 3000;
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
app.use(
  cors({
    origin: "*",
  })
);

/* Middleware */
app.use(express.json());

app.post("/vapi-query", async (req, res) => {
  console.log("🔍 Incoming request body:", req.body);

  let userQuery;

  try {
    // Handle tool call format
    if (req.body?.arguments) {
      const parsedArgs = JSON.parse(req.body.arguments);
      userQuery = parsedArgs.query || parsedArgs.question;
    }

    // Handle raw query or question formats
    if (!userQuery) {
      userQuery = req.body.query || req.body.question;
    }

    if (!userQuery) {
      console.warn(
        "❌ No query found in request:",
        JSON.stringify(req.body, null, 2)
      );
      return res.status(400).json({ error: "Missing query in request body" });
    }

    const results = await queryPinecone(userQuery);
    return res.json({ context: results });
  } catch (err) {
    console.error("❌ Failed to handle /vapi-query:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(process.env.PORT, () =>
  console.log(`✅ Server listening on port ${PORT}`)
);
