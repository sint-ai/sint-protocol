import { serve } from "@hono/node-server";
import app from "./index.js";

const port = parseInt(process.env.PORT ?? "3200", 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`SINT badge server running on http://localhost:${info.port}`);
  console.log(`  GET  /badge/project/:id.svg`);
  console.log(`  POST /badge/claim`);
  console.log(`  GET  /badge/registry`);
});
