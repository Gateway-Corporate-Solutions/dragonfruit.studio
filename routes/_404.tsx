import { page } from "fresh";
import { define } from "@/utils.ts";
export const handler = define.handlers(() => page(null, { status: 404 }));
export default define.page(function NotFound() {
  return (
    <div class="empty">
      <p class="eyebrow">404</p>
      <h1>Nothing growing here.</h1>
      <p>This project or page could not be found.</p>
      <a class="button" href="/">Back to projects</a>
    </div>
  );
});
