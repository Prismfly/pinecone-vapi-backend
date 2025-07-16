import express from "express";
import { queryPinecone } from "./queryHandler.js";
// import { mcpQuery } from "./mcpHandler.js";
const app = express();
const PORT = process.env.PORT || 3001;
import dotenv from "dotenv";
import cors from "cors";
import { sendGA4Event } from "./sendGA4Event.js";
import { v4 as uuidv4 } from "uuid";

dotenv.config();
app.use(
  cors({
    origin: "*",
  })
);

/* Middleware */
app.use(express.json());

const sessionMap = new Map();

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

const sessionClientMap = new Map();

app.post("/store-client-id", (req, res) => {
  const { sessionId, clientId } = req.body;

  if (!sessionId || !clientId) {
    return res.status(400).send("Missing sessionId or clientId");
  }

  sessionClientMap.set(sessionId, clientId);
  console.log(`Stored clientId ${clientId} for session ${sessionId}`);
  res.status(200).send("Client ID stored");
});

const signature = process.env.VAPI_SECRET_TOKEN;

app.post("/vapi-webhook", async (req, res) => {
  try {
    const receivedSig = req.headers["x-vapi-signature"];
    if (receivedSig !== signature) {
      return res.status(401).send("Unauthorized");
    }

    const { message } = req.body;

    if (
      message?.type === "status-update" &&
      message?.status === "in-progress"
    ) {
      const callId = message?.call?.id;
      const sessionId = message?.call?.metaData?.sessionId;
      const now = Date.now();

      if (!callId || !sessionId) {
        return res.status(400).send("Missing call ID or session ID");
      }

      const clientId = sessionClientMap.get(sessionId);

      if (!clientId) {
        console.warn("❌ No clientId found for sessionId:", sessionId);
        return res.status(400).send("Missing client ID for session");
      }

      sessionMap.set(callId, { start: now, clientId });

      await sendGA4Event(clientId, "pf_voice_start_call", {
        start_time_unix: Math.floor(now / 1000),
      });

      console.log(`Call started: ${callId}, clientId: ${clientId}`);
    }

    res.status(200).send("Webhook received");
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(500).send("Internal Server Error");
  }
});

app.listen(process.env.PORT, () =>
  console.log(`✅ Server listening on port ${PORT}`)
);
