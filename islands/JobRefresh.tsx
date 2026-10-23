import { useEffect, useState } from "preact/hooks";
export default function JobRefresh({ active }: { active: boolean }) {
  const [refresh, setRefresh] = useState(active);
  useEffect(() => {
    if (!refresh) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") location.reload();
    }, 4000);
    return () => clearInterval(timer);
  }, [refresh]);
  if (!active) return null;
  return (
    <label class="refresh-toggle">
      <input
        type="checkbox"
        checked={refresh}
        onChange={(e) => setRefresh(e.currentTarget.checked)}
      />{" "}
      Refresh while jobs are active
    </label>
  );
}
