const express = require("express");
const app = express();
const router = express.Router();

function requireAuth(req, res, next) { next(); }

app.get("/health", (req, res) => res.send("ok"));
router.get("/users", requireAuth, (req, res) => res.json([]));
router.post("/users", requireAuth, (req, res) => res.json({}));
router.delete("/users/:id", requireAuth, (req, res) => res.send());
app.use("/api", router);

module.exports = app;
