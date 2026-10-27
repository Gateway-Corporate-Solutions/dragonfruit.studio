import { HttpError } from "fresh";
import { define } from "@/utils.ts";
import SiteEditor from "@/islands/SiteEditor.tsx";
import { WebsiteLockedError } from "@/src/billing/model.ts";
export default define.page(async function Editor(ctx) {
  if (!/^[a-f0-9-]{36}$/i.test(ctx.params.id)) throw new HttpError(404);
  let project;
  try {
    project = await ctx.state.store.getProject(ctx.params.id);
  } catch (error) {
    if (!(error instanceof WebsiteLockedError)) throw error;
    return (
      <main class="panel">
        <h1>Website locked</h1>
        <p>{error.message} Your website data has not been deleted.</p>
        <a class="button primary" href="/websites#permanent-access">
          Choose permanent websites
        </a>{" "}
        <a class="button" href="/billing">Add capacity</a>
      </main>
    );
  }
  if (!project) throw new HttpError(404);
  return <SiteEditor project={project} ephemeral={!ctx.state.store.durable} />;
});
