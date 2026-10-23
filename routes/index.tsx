import { define } from "@/utils.ts";
import PublicHome from "@/islands/PublicHome.tsx";
export default define.page(({ state }) => (
  <PublicHome
    user={state.user ? { name: state.user.name } : undefined}
    demo={state.config.devMode}
    github={!!state.config.githubClientId && !!state.config.githubClientSecret}
    email={!!state.config.postmarkToken}
  />
));
