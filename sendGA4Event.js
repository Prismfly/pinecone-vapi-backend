import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const measurementId = process.env.GA4_MEASUREMENT_ID;
const ga4Secret = process.env.GA4_API_SECRET;

export async function sendGA4Event(clientId, eventName, params = {}) {
  console.log("👣 Entered sendGA4Event");
  const payload = {
    client_id: clientId,
    events: [
      {
        name: eventName,
        params: {
          ...params,
          debug_mode: true, // ensures event shows in DebugView
        },
      },
    ],
  };

  try {
    const res = await axios.post(
      `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${ga4Secret}`,
      payload,
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ GA4 event failed:", error?.response?.data);
  }
}
