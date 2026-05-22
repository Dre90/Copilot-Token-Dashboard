import { useEffect, useState } from "react";
import {
  Link,
  Outlet,
  RouterProvider,
  createRoute,
  createRootRoute,
  createRouter,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import {
  CopilotDashboard,
  CopilotHelp,
  CopilotHistory,
  TeamComparePage,
} from "./features/copilot/components";
import {
  loadHistoryAgents,
  loadHistoryDetailsPrefetch,
  loadHistoryTrendsPrefetch,
} from "./features/copilot/lib/historyRouteLoader";
import type { HistoryBucket, HistoryView } from "./features/copilot/components";

type Theme = "dark" | "light";

type HistorySearch = {
  agent?: string;
  bucket?: HistoryBucket;
};

type HistoryLoaderData = {
  agents: string[];
  prefetched: Awaited<ReturnType<typeof loadHistoryDetailsPrefetch>>;
};

type HistoryTrendsLoaderData = {
  agents: string[];
  prefetched: Awaited<ReturnType<typeof loadHistoryTrendsPrefetch>>;
};

function navClass(active: boolean): string {
  return `px-3 py-1.5 text-sm rounded ${
    active ? "bg-amber-500/20 text-amber-200" : "text-slate-400 hover:bg-slate-800"
  }`;
}

function validateHistorySearch(search: Record<string, unknown>): HistorySearch {
  const bucket =
    search.bucket === "day" ||
    search.bucket === "week" ||
    search.bucket === "month" ||
    search.bucket === "year"
      ? search.bucket
      : undefined;

  return {
    agent: typeof search.agent === "string" && search.agent !== "all" ? search.agent : undefined,
    bucket,
  };
}

function AppShell() {
  const [theme, setTheme] = useState<Theme>("dark");

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-2 flex flex-wrap gap-2 items-center">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            className={navClass(false)}
            activeProps={{ className: navClass(true) }}
          >
            Live
          </Link>
          <Link
            to="/history/today"
            preload="render"
            className={navClass(false)}
            activeProps={{ className: navClass(true) }}
          >
            History
          </Link>
          <Link
            to="/team-compare"
            preload="render"
            className={navClass(false)}
            activeProps={{ className: navClass(true) }}
          >
            Team
          </Link>
          <Link to="/help" className={navClass(false)} activeProps={{ className: navClass(true) }}>
            Help
          </Link>

          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="sm:ml-auto w-full sm:w-auto px-3 py-1.5 text-sm rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
            title="Toggle theme"
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}

const rootRoute = createRootRoute({
  component: AppShell,
});

const liveRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: CopilotDashboard,
});

const historyRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history",
  validateSearch: validateHistorySearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/history/today", search });
  },
});

const historyTodayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history/today",
  validateSearch: validateHistorySearch,
  loaderDeps: ({ search }) => ({ agent: search.agent ?? "all" }),
  staleTime: 10 * 60_000,
  gcTime: 60 * 60_000,
  preloadStaleTime: 10 * 60_000,
  shouldReload: false,
  loader: async ({ deps }): Promise<HistoryLoaderData> => {
    const [agents, prefetched] = await Promise.all([
      loadHistoryAgents(),
      loadHistoryDetailsPrefetch(deps.agent),
    ]);
    return { agents, prefetched };
  },
  component: HistoryTodayPage,
});

const historyTrendsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history/trends",
  validateSearch: validateHistorySearch,
  loaderDeps: ({ search }) => ({
    agent: search.agent ?? "all",
    bucket: search.bucket ?? "day",
  }),
  staleTime: 10 * 60_000,
  gcTime: 60 * 60_000,
  preloadStaleTime: 10 * 60_000,
  shouldReload: false,
  loader: async ({ deps }): Promise<HistoryTrendsLoaderData> => {
    const [agents, prefetched] = await Promise.all([
      loadHistoryAgents(),
      loadHistoryTrendsPrefetch(deps.agent),
    ]);
    return { agents, prefetched };
  },
  component: HistoryTrendsPage,
});

const historyInsightsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/history/insights",
  validateSearch: validateHistorySearch,
  loaderDeps: ({ search }) => ({ agent: search.agent ?? "all" }),
  staleTime: 10 * 60_000,
  gcTime: 60 * 60_000,
  preloadStaleTime: 10 * 60_000,
  shouldReload: false,
  loader: async ({ deps }): Promise<HistoryLoaderData> => {
    const [agents, prefetched] = await Promise.all([
      loadHistoryAgents(),
      loadHistoryDetailsPrefetch(deps.agent),
    ]);
    return { agents, prefetched };
  },
  component: HistoryInsightsPage,
});

const helpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/help",
  component: CopilotHelp,
});

const teamCompareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/team-compare",
  staleTime: 2 * 60_000,
  gcTime: 10 * 60_000,
  component: TeamComparePage,
});

const routeTree = rootRoute.addChildren([
  liveRoute,
  historyRedirectRoute,
  historyTodayRoute,
  historyTrendsRoute,
  historyInsightsRoute,
  teamCompareRoute,
  helpRoute,
]);

const router = createRouter({
  routeTree,
  defaultPreload: "render",
  defaultPreloadStaleTime: 10 * 60_000,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function HistoryTodayPage() {
  const navigate = useNavigate({ from: "/history/today" });
  const { agent: maybeAgent } = historyTodayRoute.useSearch();
  const loaderData = historyTodayRoute.useLoaderData();
  return (
    <HistoryPageContent
      routePath="/history/today"
      view="today"
      agent={maybeAgent ?? "all"}
      agents={loaderData.agents}
      prefetched={loaderData.prefetched}
      navigate={navigate}
    />
  );
}

function HistoryTrendsPage() {
  const navigate = useNavigate({ from: "/history/trends" });
  const { agent: maybeAgent, bucket: maybeBucket } = historyTrendsRoute.useSearch();
  const loaderData = historyTrendsRoute.useLoaderData();
  return (
    <HistoryPageContent
      routePath="/history/trends"
      view="trends"
      agent={maybeAgent ?? "all"}
      bucket={maybeBucket ?? "day"}
      agents={loaderData.agents}
      prefetched={loaderData.prefetched}
      navigate={navigate}
    />
  );
}

function HistoryInsightsPage() {
  const navigate = useNavigate({ from: "/history/insights" });
  const { agent: maybeAgent } = historyInsightsRoute.useSearch();
  const loaderData = historyInsightsRoute.useLoaderData();
  return (
    <HistoryPageContent
      routePath="/history/insights"
      view="insights"
      agent={maybeAgent ?? "all"}
      agents={loaderData.agents}
      prefetched={loaderData.prefetched}
      navigate={navigate}
    />
  );
}

function HistoryPageContent({
  routePath,
  view,
  agent,
  bucket,
  agents,
  prefetched,
  navigate,
}: {
  routePath: "/history/today" | "/history/trends" | "/history/insights";
  view: HistoryView;
  agent: string;
  bucket?: HistoryBucket;
  agents: string[];
  prefetched: HistoryLoaderData["prefetched"] | HistoryTrendsLoaderData["prefetched"];
  navigate: ReturnType<typeof useNavigate>;
}) {
  const onAgentChange = (nextAgent: string) => {
    void navigate({
      from: routePath,
      search: (prev: HistorySearch) => ({
        ...(routePath === "/history/trends" ? prev : { ...prev, bucket: undefined }),
        agent: nextAgent === "all" ? undefined : nextAgent,
      }),
    });
  };

  const onViewChange = (nextView: HistoryView) => {
    void navigate({
      from: routePath,
      to: `/history/${nextView}`,
      search: (prev: HistorySearch) => ({
        agent: prev.agent,
        bucket: nextView === "trends" ? prev.bucket : undefined,
      }),
    });
  };

  const onBucketChange = (nextBucket: HistoryBucket) => {
    if (routePath !== "/history/trends") return;
    void navigate({
      from: routePath,
      search: (prev: HistorySearch) => ({
        ...prev,
        bucket: nextBucket === "day" ? undefined : nextBucket,
      }),
    });
  };

  return (
    <main className="max-w-6xl mx-auto px-3 sm:px-6 py-6">
      <CopilotHistory
        key={`${view}:${agent}`}
        view={view}
        initialBucket={bucket}
        agent={agent}
        agents={agents}
        onAgentChange={onAgentChange}
        onViewChange={onViewChange}
        onBucketChange={onBucketChange}
        prefetched={prefetched}
      />
    </main>
  );
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
