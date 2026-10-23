import { HttpError } from "fresh";
import { define } from "@/utils.ts";
import SiteEditor from "@/islands/SiteEditor.tsx";
export default define.page(async function Editor(ctx) {
  if (!/^[a-f0-9-]{36}$/i.test(ctx.params.id)) throw new HttpError(404);
  const project = await ctx.state.store.getProject(ctx.params.id);
  if (!project) throw new HttpError(404);
  return <SiteEditor project={project} ephemeral={!ctx.state.store.durable} />;
});
