import { redirect } from "next/navigation";

// Catalog unification (2026-05-30): the visual catalog is now a view mode inside the
// single source-of-truth catalog at /catalog (toggle: cards/gallery ⇄ table). This
// route is kept only as a safe permanent redirect so old links/bookmarks still work.
export default function Page() {
  redirect("/catalog");
}
