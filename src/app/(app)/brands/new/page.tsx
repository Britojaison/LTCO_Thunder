import { BrandForm } from "../brand-form";
import { createBrandAction } from "../actions";

export const metadata = { title: "Add brand" };

export default function NewBrandPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Add brand</h1>
      <BrandForm action={createBrandAction} cancelHref="/brands" submitLabel="Save brand" />
    </section>
  );
}
