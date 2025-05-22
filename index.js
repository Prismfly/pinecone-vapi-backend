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
  let userQuery;

  try {
    // If toolCalls exist, extract directly from the object
    const toolArgs = req.body?.message?.toolCalls?.[0]?.function?.arguments;
    if (toolArgs?.query) {
      userQuery = toolArgs.query;
    }

    // Optional: fallback if query was passed outside of toolCalls
    if (!userQuery) {
      userQuery = req.body.query || req.body.question;
    }

    if (!userQuery) {
      console.warn("❌ No valid query found in request body.");
      return res.status(400).json({ error: "Missing query in request body" });
    }
    function truncate(text = "", limit = 500) {
      return text.length > limit ? text.slice(0, limit) + "..." : text;
    }

    const results = await queryPinecone(userQuery);

    const updatedResults = results.map((meta, index) => {
      const summary = `Product ${index + 1}:
Title: ${meta.title}
Price: ${meta.price}
URL: ${meta.url}
Description: ${truncate(meta.description)}
`;

      return {
        id: meta.id || `product-${index}`,
        title: meta.title,
        url: meta.url,
        price: meta.price,
        description: meta.description,
        specifications: meta.specifications,
        productInfo: meta.productInfo,
        sample: meta.sample,
        summary,
      };
    });
    console.log(
      "📦 Final data sent to Vapi:\n",
      JSON.stringify({ context: { products: updatedResults } }, null, 2)
    );

    return res.status(200).json({
      context: {
        products: updatedResults,
      },
    });
  } catch (err) {
    console.error("❌ Error processing /vapi-query:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(process.env.PORT, () =>
  console.log(`✅ Server listening on port ${PORT}`)
);
