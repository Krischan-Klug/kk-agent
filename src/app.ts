import express, { Request, Response } from "express";
import cors from "cors";
import initPlugins from "./plugins/index.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => res.json({ ok: true }));

await initPlugins(app);

app.use((req: Request, res: Response) =>
  res.status(404).json({ error: "Not found" })
);

export default app;
