import express from "express";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const PYTHON_ENGINE = path.join(__dirname, "python", "analytics_engine.py");
const PYTHON_SEO = path.join(__dirname, "python", "seo_tools.py");
const STREAMLIT_APP = path.join(__dirname, "python", "streamlit_app.py");
const DATASET_CSV = path.join(__dirname, "python", "data", "nigerian_commodity_prices.csv");
const PUBLIC_DIR = path.join(__dirname, "public");

function resolveBaseUrl(req: express.Request): string {
  const envUrl = (process.env.APP_URL || "").trim();
  const isPlaceholder = !envUrl || envUrl === "MY_APP_URL";
  if (!isPlaceholder) {
    const clean = envUrl.replace(/\/+$/, "");
    if (clean.startsWith("http://") && !clean.includes("localhost") && !clean.includes("127.0.0.1")) {
      return `https://${clean.slice("http://".length)}`;
    }
    return clean;
  }
  const host = req.headers.host || `localhost:${PORT}`;
  const isLocal = host.includes("localhost") || host.includes("127.0.0.1");
  const proto = isLocal ? (req.headers["x-forwarded-proto"] as string) || req.protocol || "http" : "https";
  return `${proto}://${host}`;
}

function runPythonSeo(command: string, baseUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [PYTHON_SEO, command, baseUrl], {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python SEO helper failed (${code}): ${stderr || stdout}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function runPythonEngine<T>(command: string, payload: Record<string, unknown> = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [PYTHON_ENGINE, command], {
      cwd: __dirname,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to invoke Python engine: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Python engine exited with code ${code}: ${stderr || stdout}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as T;
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Invalid JSON from Python engine: ${(err as Error).message}`));
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

async function startServer() {
  const app = express();
  app.set("trust proxy", true);
  app.use(express.json({ limit: "4mb" }));

  // Enforce HTTPS for non-localhost production requests and attach transport security headers
  app.use((req, res, next) => {
    const host = req.headers.host || "";
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const xfProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();

    if (!isLocal && xfProto === "http" && process.env.NODE_ENV === "production") {
      res.redirect(301, `https://${host}${req.originalUrl}`);
      return;
    }

    if (xfProto === "https" || req.secure) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", engine: "python3" });
  });

  // Dynamic SEO endpoints backed by Python seo_tools.py
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const xml = await runPythonSeo("sitemap", resolveBaseUrl(req));
      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(xml);
    } catch (err) {
      res.status(500).send(`<!-- ${(err as Error).message} -->`);
    }
  });

  app.get("/robots.txt", async (req, res) => {
    try {
      const txt = await runPythonSeo("robots", resolveBaseUrl(req));
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(txt);
    } catch (err) {
      res.status(500).send(`# ${(err as Error).message}`);
    }
  });

  app.get("/llms.txt", async (req, res) => {
    try {
      const txt = await runPythonSeo("llms", resolveBaseUrl(req));
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(txt);
    } catch (err) {
      res.status(500).send(`# ${(err as Error).message}`);
    }
  });

  // Google Search Console HTML file verification when GOOGLE_SITE_VERIFICATION is configured
  app.get(/^\/google([a-zA-Z0-9_-]+)\.html$/, (req, res, next) => {
    const token = (process.env.GOOGLE_SITE_VERIFICATION || "").trim();
    const requested = req.params[0];
    if (token && (requested === token || `google${requested}.html` === token)) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(`google-site-verification: google${requested}.html`);
      return;
    }
    next();
  });

  // Service Worker script (must never be long-cached so updates apply cleanly)
  app.get("/sw.js", (_req, res, next) => {
    const swPath = path.join(PUBLIC_DIR, "sw.js");
    if (!fs.existsSync(swPath)) {
      next();
      return;
    }
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Service-Worker-Allowed", "/");
    res.sendFile(swPath);
  });

  // Web App Manifest
  app.get("/manifest.webmanifest", (_req, res, next) => {
    const manifestPath = path.join(PUBLIC_DIR, "manifest.webmanifest");
    if (!fs.existsSync(manifestPath)) {
      next();
      return;
    }
    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.sendFile(manifestPath);
  });

  // Compressed static visual & PWA icon assets generated by Python
  app.get(
    [
      "/og-image.png",
      "/brand-mark.svg",
      "/favicon.svg",
      "/pwa-192x192.png",
      "/pwa-512x512.png",
      "/pwa-maskable-512x512.png",
      "/apple-touch-icon.png",
    ],
    (req, res, next) => {
      const filePath = path.join(PUBLIC_DIR, path.basename(req.path));
      if (!fs.existsSync(filePath)) {
        next();
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.sendFile(filePath);
    }
  );

  app.get("/api/meta", async (_req, res) => {
    try {
      const meta = await runPythonEngine("meta");
      res.json(meta);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/analyze", async (req, res) => {
    try {
      const { commodityId, marketId, forecastMonths, modelType, customRecords } = req.body ?? {};
      const result = await runPythonEngine<{ error?: string }>("analyze", {
        commodityId,
        marketId,
        forecastMonths,
        modelType,
        customRecords,
      });
      if (result.error) {
        res.status(400).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/ledger", async (req, res) => {
    try {
      const { commodityId, marketId, year, search, limit, offset, customRecords } = req.body ?? {};
      const result = await runPythonEngine("ledger", {
        commodityId,
        marketId,
        year,
        search,
        limit,
        offset,
        customRecords,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/observations", async (_req, res) => {
    try {
      const result = await runPythonEngine("observations_list");
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/observations", async (req, res) => {
    try {
      const records = Array.isArray(req.body?.records) ? req.body.records : [];
      const result = await runPythonEngine("observations_upsert", { records });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/observations/:id", async (req, res) => {
    try {
      const result = await runPythonEngine("observations_delete", { id: req.params.id });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/observations", async (_req, res) => {
    try {
      const result = await runPythonEngine("observations_clear", {});
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/watchlists/list", async (req, res) => {
    try {
      const result = await runPythonEngine("watchlist_list", req.body ?? {});
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/watchlists", async (req, res) => {
    try {
      const result = await runPythonEngine("watchlist_create", req.body ?? {});
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.put("/api/watchlists/:id", async (req, res) => {
    try {
      const result = await runPythonEngine("watchlist_update", {
        ...(req.body ?? {}),
        id: req.params.id,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.post("/api/watchlists/:id/toggle", async (req, res) => {
    try {
      const result = await runPythonEngine("watchlist_toggle", {
        ...(req.body ?? {}),
        watchlistId: req.params.id,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/watchlists/:id", async (req, res) => {
    try {
      const result = await runPythonEngine("watchlist_delete", {
        ...(req.body ?? {}),
        id: req.params.id,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/alerts/evaluate", async (req, res) => {
    try {
      const result = await runPythonEngine("alerts_evaluate", req.body ?? {});
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/alerts/rules", async (req, res) => {
    try {
      const result = await runPythonEngine("alert_rule_create", req.body ?? {});
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.patch("/api/alerts/rules/:id", async (req, res) => {
    try {
      const result = await runPythonEngine("alert_rule_update", {
        ...(req.body ?? {}),
        id: req.params.id,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  app.delete("/api/alerts/rules/:id", async (req, res) => {
    try {
      const result = await runPythonEngine("alert_rule_delete", {
        ...(req.body ?? {}),
        id: req.params.id,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post("/api/export/pdf", async (req, res) => {
    try {
      const result = await runPythonEngine<{ filename: string; pdfBase64: string }>(
        "export_pdf",
        req.body ?? {}
      );
      const buffer = Buffer.from(result.pdfBase64, "base64");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get("/api/export/dataset", (_req, res) => {
    if (!fs.existsSync(DATASET_CSV)) {
      res.status(404).json({ error: "Dataset CSV not found" });
      return;
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="nigerian_commodity_prices.csv"');
    fs.createReadStream(DATASET_CSV).pipe(res);
  });

  app.get("/api/export/streamlit", (_req, res) => {
    if (!fs.existsSync(STREAMLIT_APP)) {
      res.status(404).json({ error: "Streamlit script not found" });
      return;
    }
    res.setHeader("Content-Type", "text/x-python; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="streamlit_app.py"');
    fs.createReadStream(STREAMLIT_APP).pipe(res);
  });

  app.get("/api/python-source", (_req, res) => {
    try {
      const streamlitCode = fs.existsSync(STREAMLIT_APP)
        ? fs.readFileSync(STREAMLIT_APP, "utf-8")
        : "";
      const engineCode = fs.existsSync(PYTHON_ENGINE)
        ? fs.readFileSync(PYTHON_ENGINE, "utf-8")
        : "";
      res.json({ streamlitCode, engineCode });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, "dist");
    app.use(express.static(distDir, { maxAge: "1d" }));
    app.get("/{*path}", (req, res) => {
      const indexPath = path.join(distDir, "index.html");
      let html = fs.readFileSync(indexPath, "utf-8");
      const baseUrl = resolveBaseUrl(req);
      const token = (process.env.GOOGLE_SITE_VERIFICATION || "").trim();
      html = html.replace(/https:\/\/naijaprice-tracker\.app/g, baseUrl);
      if (token) {
        html = html.replace(
          "</head>",
          `  <meta name="google-site-verification" content="${token}" />\n  </head>`
        );
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NaijaPrice Tracker server running on http://localhost:${PORT}`);
  });
}

startServer();
