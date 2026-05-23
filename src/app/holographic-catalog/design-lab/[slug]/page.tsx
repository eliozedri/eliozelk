import { notFound } from "next/navigation";
import { HEROES, HERO_SLUGS } from "@/components/HolographicCatalog/design-lab/heroes";

export function generateStaticParams() {
  return HERO_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const h = HEROES[slug];
  return { title: h ? `${h.name} · Design Lab` : "Design Lab" };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hero = HEROES[slug];
  if (!hero) notFound();
  const { Component } = hero;
  return <Component />;
}
