import type { Job } from "@/src/domain/models.ts";
import ActionButton from "@/islands/ActionButton.tsx";
export function JobTable({ jobs }: { jobs: Job[] }) {
  if (!jobs.length) {
    return (
      <div class="empty compact">
        <span class="empty-icon">≋</span>
        <h3>No validation jobs yet</h3>
        <p>Open a project to check its application configuration.</p>
      </div>
    );
  }
  return (
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Job</th>
            <th>Status</th>
            <th>Attempts</th>
            <th>Result</th>
            <th>
              <span class="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td>
                <a href={"/projects/" + job.projectId}>Configuration check</a>
                <small>
                  {job.id.slice(0, 8)} ·{" "}
                  {new Date(job.createdAt).toLocaleString("en-US")}
                </small>
              </td>
              <td>
                <span class={"badge " + job.status}>{job.status}</span>
              </td>
              <td>{job.attempts}</td>
              <td class="result">
                {job.result ?? (job.status === "running"
                  ? "Worker is validating configuration."
                  : "Waiting for worker.")}
              </td>
              <td>
                {["queued", "running"].includes(job.status) && (
                  <ActionButton
                    endpoint={"/api/jobs/" + job.id + "/cancel"}
                    label="Cancel"
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
