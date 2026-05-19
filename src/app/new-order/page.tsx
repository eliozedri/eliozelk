import { OrderForm } from "@/components/OrderForm";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const draftId = typeof params.edit === "string" ? params.edit : undefined;
  return <OrderForm draftId={draftId} />;
}
