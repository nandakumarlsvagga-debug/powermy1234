import React from "react";
import { Route, Switch } from "wouter";
import { Layout } from "./components/Layout.tsx";
import { AmberProvider } from "./components/design-system/index.tsx";
import LandingRoute from "./routes/landing.tsx";
import ScanSetupRoute from "./routes/scan-setup.tsx";
import ScanRunRoute from "./routes/scan-run.tsx";
import ScanResultRoute from "./routes/scan-result.tsx";
import ScanPermalinkRoute from "./routes/scan-permalink.tsx";
import FeedRoute from "./routes/feed.tsx";
import LeaderboardsRoute from "./routes/leaderboards.tsx";
import ProfileRoute from "./routes/profile.tsx";
import { AuthCallbackRoute, AuthUsernameRoute } from "./routes/auth.tsx";

export default function App() {
  return (
    <AmberProvider>
      <Layout>
        <Switch>
          <Route path="/" component={LandingRoute} />
          <Route path="/scan" component={ScanSetupRoute} />
          <Route path="/scan/run/:id" component={ScanRunRoute} />
          <Route path="/scan/result/:id" component={ScanResultRoute} />
          <Route path="/scan/:id" component={ScanPermalinkRoute} />
          <Route path="/feed" component={FeedRoute} />
          <Route path="/leaderboards" component={LeaderboardsRoute} />
          <Route path="/u/:username" component={ProfileRoute} />
          <Route path="/me" component={ProfileRoute} />
          <Route path="/auth/callback" component={AuthCallbackRoute} />
          <Route path="/auth/username" component={AuthUsernameRoute} />
          <Route>
            <div className="flex-1 flex flex-col items-center justify-center text-center py-24 font-mono text-sm text-neutral-400">
              404 | LEDGER PATH NOT FOUND
            </div>
          </Route>
        </Switch>
      </Layout>
    </AmberProvider>
  );
}
