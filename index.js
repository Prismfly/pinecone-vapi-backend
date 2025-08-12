import express from "express";
import { queryPinecone } from "./queryHandler.js";
const app = express();
const PORT = process.env.PORT || 3001;
import dotenv from "dotenv";
import cors from "cors";
import { sendGA4Event } from "./sendGA4Event.js";

dotenv.config();
app.use(
  cors({
    origin: "*",
  })
);

/* Middleware */
app.use(express.json());

const sessionMap = new Map();
const clients = new Map();

app.post("/vapi-query", async (req, res) => {
  let userQuery;

  try {
    // If toolCalls exist, extract directly from the object
    const toolCallId = req.body?.message?.toolCalls?.[0]?.id;
    const toolArgs = req.body?.message?.toolCalls?.[0]?.function?.arguments;

    if (toolArgs?.query) {
      userQuery = toolArgs.query;
    }

    // Fallback if query was passed outside of toolCalls (for testing purposes within Vapi)
    if (!userQuery) {
      userQuery = req.body.query || req.body.question;
    }

    if (!userQuery || !toolCallId) {
      console.warn("❌ No valid query or toolCallId found in request body.");
      return res.status(400).json({ error: "Missing query in request body" });
    }

    const sessionId =
      req.body?.message?.call?.metaData?.sessionId ||
      req.body?.message?.call?.metadata?.sessionId ||
      req.body?.sessionId ||
      req.query?.sessionId ||
      null;

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
        .join(" | ");
    }

    const formattedResult = formatProductsForVapi(productArray);

    const toNumber = (val) => {
      if (typeof val !== "string") return typeof val === "number" ? val : null;
      const m = val.match(/[\d.,]+/);
      return m ? Number(m[0].replace(/,/g, "")) : null;
    };

    const looksLikePages =
      productArray.length > 0 &&
      productArray.every(
        (p) => (p.url && /\/pages\//.test(p.url)) || p.price === "N/A"
      );

    // UI payloads
    let uiPayload;
    if (!looksLikePages) {
      uiPayload = {
        intent: "PRODUCT_RECS",
        sessionId,
        source: "vapi",
        items: productArray.map((p) => ({
          title: p.title,
          price: toNumber(p.price),
          priceFormatted:
            toNumber(p.price) != null
              ? `$${toNumber(p.price).toFixed(2)}`
              : null,
          blurb: p.description,
          url: p.url || null,
        })),
      };
    } else {
      const first = productArray[0] || {};
      uiPayload = {
        intent: "PAGE_INFO",
        sessionId,
        source: "vapi",
        title: first.title || "Info",
        url: first.url || "",
      };
    }

    if (sessionId && typeof pushUIAction === "function") {
      try {
        pushUIAction(sessionId, uiPayload);
      } catch (e) {
        console.warn("⚠️ pushUIAction failed:", e.message);
      }
    }

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

app.get("/events", (req, res) => {
  const sessionId = req.query.sessionId;
  if (!sessionId) return res.status(400).end("Missing sessionId");

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  res.write("retry: 5000\n\n");

  if (!clients.has(sessionId)) clients.set(sessionId, new Set());
  clients.get(sessionId).add(res);

  const hb = setInterval(() => res.write(": ping\n\n"), 25000);

  req.on("close", () => {
    clients.get(sessionId)?.delete(res);
    if (clients.get(sessionId)?.size === 0) clients.delete(sessionId);
  });
});

// Helper to send payloads to connected browsers
function pushUIAction(sessionId, payload) {
  const listeners = clients.get(sessionId);
  if (!listeners) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const r of listeners) r.write(data);
}

const sessionClientMap = new Map();

app.post("/store-client-id", (req, res) => {
  const { sessionId, clientId } = req.body;

  if (!sessionId || !clientId) {
    return res.status(400).send("Missing sessionId or clientId");
  }

  sessionClientMap.set(sessionId, clientId);

  res.status(200).send("Client ID stored");
});

const signature = process.env.VAPI_SECRET_TOKEN;

app.post("/vapi-webhook", async (req, res) => {
  try {
    const receivedSig = req.headers["x-vapi-signature"];

    if (receivedSig !== signature) {
      return res.status(401).send("Unauthorized");
    }

    const outer = req.body;
    const message = outer.message;

    if (
      message?.type === "status-update" &&
      message?.status === "in-progress"
    ) {
      const callId = message?.call?.id;
      const sessionId =
        message?.call?.assistantOverrides.variableValues?.sessionId;
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

      setTimeout(async () => {
        await sendGA4Event(clientId, "pf_voice_start_call", {
          start_time_unix: Math.floor(now / 1000),
          debug_mode: true,
        });
      }, 2000);
    }

    if (message?.type === "status-update" && message?.status === "ended") {
      const callId = message?.call?.id;
      const now = Date.now();

      const sessionData = sessionMap.get(callId);
      if (!sessionData) {
        console.warn("❌ No session data found for callId:", callId);
        return res.status(400).send("Missing session data");
      }

      const { start, clientId } = sessionData;
      const duration = Math.floor((now - start) / 1000);

      await sendGA4Event(clientId, "pf_voice_end_call", {
        end_time_unix: Math.floor(now / 1000),
        debug_mode: true,
      });

      await sendGA4Event(clientId, "pf_voice_call_duration", {
        call_duration_seconds: duration,
        start_time_unix: Math.floor(start / 1000),
        end_time_unix: Math.floor(now / 1000),
        debug_mode: true,
      });

      sessionMap.delete(callId);
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

export { pushUIAction };
