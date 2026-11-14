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
const STREAMLIT_APP = path.join(__dirname, "python", "streamlit_app.py");
const DATASET_CSV = path.join(__dirname, "python", "data", "nigerian_commodity_prices.csv");

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
  app.use(express.json({ limit: "4mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", engine: "python3" });
  });

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
    app.use(express.static(distDir));
    app.get("/{*path}", (_req, res) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NaijaPrice Tracker server running on http://localhost:${PORT}`);
  });
}

startServer();
