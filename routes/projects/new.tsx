import { define } from "@/utils.ts";
import NewProject from "@/islands/NewProject.tsx";
export default define.page(function New() {
  return (
    <>
      <a class="back" href="/websites">← Your websites</a>
      <div class="page-heading">
        <div>
          <p class="eyebrow">MAKE ROOM FOR YOUR IDEAS</p>
          <h1>Create a website</h1>
          <p>Simple by default. Expert configuration always available.</p>
        </div>
      </div>
      <NewProject />
    </>
  );
});
