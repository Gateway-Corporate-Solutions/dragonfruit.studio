import { define } from "@/utils.ts";
import { JobTable } from "@/components/JobTable.tsx";
import JobRefresh from "@/islands/JobRefresh.tsx";
export default define.page(async function Jobs(ctx) {
  const jobs = await ctx.state.store.listJobs();
  return (
    <>
      <div class="page-heading">
        <div>
          <p class="eyebrow">DURABLE WORK</p>
          <h1>Validation jobs</h1>
          <p>Configuration checks, their progress, and retained results.</p>
        </div>
      </div>
      <section class="panel flush">
        <JobTable jobs={jobs} />
      </section>
      <JobRefresh
        active={jobs.some((j) => ["queued", "running"].includes(j.status))}
      />
    </>
  );
});
