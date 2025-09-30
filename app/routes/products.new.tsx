import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useNavigation, useSubmit } from "@remix-run/react";
import { Button, Group, Stack, Title } from "@mantine/core";
import { useForm } from "react-hook-form";
import { ProductDetailForm } from "../modules/product/components/ProductDetailForm";
import { action as productAction } from "./products.$id";

export const meta: MetaFunction = () => [{ title: "New Product" }];

export async function loader(_args: LoaderFunctionArgs) {
  // Provide minimal defaults to render the edit form for a new product
  return json({
    product: {
      id: 0,
      sku: "",
      name: "",
      description: "",
      type: "",
      costPrice: null,
      manualSalePrice: null,
      stockTrackingEnabled: false,
      batchTrackingEnabled: false,
    },
  });
}

export async function action(args: ActionFunctionArgs) {
  // Delegate to products.$id action with params.id = 'new'
  return productAction({
    ...(args as any),
    params: { ...(args.params as any), id: "new" },
  } as any);
}

export default function NewProductRoute() {
  const nav = useNavigation();
  const busy = nav.state !== "idle";
  const submit = useSubmit();
  const form = useForm({
    defaultValues: {
      sku: "",
      name: "",
      type: "",
      costPrice: undefined as any,
      manualSalePrice: undefined as any,
      stockTrackingEnabled: false,
      batchTrackingEnabled: false,
    },
  });
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const values = form.getValues();
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined || v === null || v === "") continue;
      if (typeof v === "boolean") {
        if (v) fd.set(k, "on");
      } else {
        fd.set(k, String(v));
      }
    }
    submit(fd, { method: "post" });
  };
  return (
    <Stack>
      <Title order={2}>Create New Product</Title>
      <form onSubmit={onSubmit}>
        <ProductDetailForm mode="edit" form={form as any} />
        <Group mt="md">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving..." : "Create"}
          </Button>
        </Group>
      </form>
    </Stack>
  );
}
