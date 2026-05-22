import { useEffect, useState } from "react";
import { CopilotDashboard, CopilotHelp, CopilotHistory } from "./features/copilot/components";
import { copilotApi } from "./api/copilot";

type Tab = "live" | "history" | "help";
type Theme = "dark" | "light";

export function App() {
  const [tab, setTab] = useState<Tab>("live");
  const [theme, setTheme] = useState<Theme>("dark");
  const [agent, setAgent] = useState("all");
  const [agents, setAgents] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
      return;
    }
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    copilotApi
      .agents()
      .then(setAgents)
      .catch(() => {});
  }, [tab]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap gap-2 items-center">
          <button
            onClick={() => setTab("live")}
            className={`px-3 py-1.5 text-sm rounded ${
              tab === "live"
                ? "bg-amber-500/20 text-amber-200"
                : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            Live
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-3 py-1.5 text-sm rounded ${
              tab === "history"
                ? "bg-amber-500/20 text-amber-200"
                : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            History
          </button>
          <button
            onClick={() => setTab("help")}
            className={`px-3 py-1.5 text-sm rounded ${
              tab === "help"
                ? "bg-amber-500/20 text-amber-200"
                : "text-slate-400 hover:bg-slate-800"
            }`}
          >
            Help
          </button>

          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="sm:ml-auto w-full sm:w-auto px-3 py-1.5 text-sm rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
            title="Toggle theme"
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </nav>
      {tab === "live" ? (
        <CopilotDashboard />
      ) : tab === "history" ? (
        <main className="max-w-6xl mx-auto px-3 sm:px-6 py-6">
          <CopilotHistory agent={agent} agents={agents} onAgentChange={setAgent} />
        </main>
      ) : (
        <CopilotHelp />
      )}
    </div>
  );
}
