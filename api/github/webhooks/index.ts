import { createNodeMiddleware, createProbot } from "probot";

const probot = createProbot();

import app from "../../../src/index";

module.exports = createNodeMiddleware(app, {
  probot,
  webhooksPath: "/api/github/webhooks",
});
