// // mcpHandler.js
// import fetch from "node-fetch";

// export async function handleMcpQuery(req, res) {
//   const userQuery = req.body?.query;

//   if (!userQuery) {
//     return res.status(400).json({ error: "No query provided." });
//   }

//   try {
//     // Call Shopify MCP
//     const mcpResponse = await queryShopifyMCP(userQuery);

//     if (mcpResponse) {
//       // Here you can do extra formatting if you want it to sound more natural for Vapi
//       return res.json({ result: mcpResponse });
//     } else {
//       return res
//         .status(404)
//         .json({ result: "I couldn't find an answer for that." });
//     }
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "MCP query failed." });
//   }
// }

// async function queryShopifyMCP(query) {
//   const response = await fetch(
//     `https://${process.env.SHOPIFY_STORE_URL}/apps/messaging-customization/graphql.json`,
//     {
//       method: "POST",
//       headers: {
//         "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify({
//         query: `
//           query CustomMessaging($query: String!) {
//             customMessaging(query: $query) {
//               response
//             }
//           }
//         `,
//         variables: { query },
//       }),
//     }
//   );

//   const data = await response.json();
//   return data?.data?.customMessaging?.response || null;
// }
