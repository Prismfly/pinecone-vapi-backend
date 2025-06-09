import express from "express";
import { queryPinecone } from "./queryHandler.js";
const app = express();
const PORT = process.env.PORT || 3001;
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
    const toolCallId = req.body?.message?.toolCalls?.[0]?.id;
    const toolArgs = req.body?.message?.toolCalls?.[0]?.function?.arguments;

    if (toolArgs?.query) {
      userQuery = toolArgs.query;
    }

    // Optional: fallback if query was passed outside of toolCalls
    if (!userQuery) {
      userQuery = req.body.query || req.body.question;
    }

    if (!userQuery || !toolCallId) {
      console.warn("❌ No valid query or toolCallId found in request body.");
      return res.status(400).json({ error: "Missing query in request body" });
    }
    function truncate(text = "", limit = 500) {
      return text.length > limit ? text.slice(0, limit) + "..." : text;
    }

    const results = await queryPinecone(userQuery);

    const productArray = results.map((meta, i) => ({
      id: `product-${i + 1}`,
      title: meta.title || "N/A",
      price: meta.price || "N/A",
      description: truncate(meta.description || "No description provided"),
      url: meta.url || "",
      specifications: meta.specifications || "",
      productInfo: meta.productInfo || "",
      sample: meta.sample ?? false,
    }));

    function formatProductsForVapi(products) {
      return products
        .map((p) => {
          const cleanInfo = p.productInfo
            .replace(/\n/g, ", ")
            .replace(/\s+/g, " ")
            .trim();
          return `${p.title}, Price: ${p.price}, ${truncate(
            p.description
          )}, ${cleanInfo}`;
        })
        .join(" | "); // separates each product
    }

    const formattedResult = formatProductsForVapi(productArray);

    const response = {
      results: [
        {
          toolCallId,
          result: formattedResult,
        },
      ],
    };

    console.log("📦 Formatted string sent to Vapi:\n", formattedResult);
    console.log(
      "📦 Final response object:\n",
      JSON.stringify(response, null, 2)
    );

    return res.status(200).json(response);
  } catch (err) {
    console.error("❌ Error processing /vapi-query:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(process.env.PORT, () =>
  console.log(`✅ Server listening on port ${PORT}`)
);
