import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import {
  Button,
  Group,
  NumberInput,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { prisma } from "~/utils/prisma.server";
import { requireAdminUser } from "../utils/auth.server";
import {
  loadCoverageToleranceDefaults,
  MATERIAL_TOLERANCE_SETTING_KEY,
  clearCoverageToleranceDefaultsCache,
} from "~/modules/materials/services/coverageTolerance.server";

type LoaderData = {
  defaultMargin: number;
  tolerance: Awaited<ReturnType<typeof loadCoverageToleranceDefaults>>;
};

const TOLERANCE_FIELDS = [
  { key: "default", label: "Default" },
  { key: "FABRIC", label: "Fabric" },
  { key: "TRIM", label: "Trim" },
  { key: "PACKAGING", label: "Packaging" },
] as const;

export const meta: MetaFunction = () => [{ title: "Global Settings" }];

export async function loader({ request }: LoaderFunctionArgs) {
  await requireAdminUser(request);
  const [setting, tolerance] = await Promise.all([
    prisma.setting.findUnique({
      where: { key: "defaultMargin" },
    }),
    loadCoverageToleranceDefaults(),
  ]);
  const defaultMargin =
    setting?.number != null
      ? Number(setting.number)
      : setting?.value != null
      ? Number(setting.value)
      : 0.1;
  return json<LoaderData>({ defaultMargin, tolerance });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireAdminUser(request);
  const fd = await request.formData();
  const defaultMarginValue = Number(fd.get("defaultMargin") || 0) || 0;

  const tolerancePayload: Record<
    string,
    { pct: number; abs: number }
  > = {};
  TOLERANCE_FIELDS.forEach(({ key }) => {
    const pctRaw = fd.get(`tol-${key}-pct`);
    const absRaw = fd.get(`tol-${key}-abs`);
    const pct = clampPct(parseNumber(pctRaw) / 100);
    const abs = clampAbs(parseNumber(absRaw));
    tolerancePayload[key === "default" ? "default" : key] = { pct, abs };
  });

  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: "defaultMargin" },
      create: { key: "defaultMargin", number: defaultMarginValue },
      update: { number: defaultMarginValue },
    });
    await tx.setting.upsert({
      where: { key: MATERIAL_TOLERANCE_SETTING_KEY },
      create: {
        key: MATERIAL_TOLERANCE_SETTING_KEY,
        json: {
          default: tolerancePayload.default,
          FABRIC: tolerancePayload.FABRIC,
          TRIM: tolerancePayload.TRIM,
          PACKAGING: tolerancePayload.PACKAGING,
        },
      },
      update: {
        json: {
          default: tolerancePayload.default,
          FABRIC: tolerancePayload.FABRIC,
          TRIM: tolerancePayload.TRIM,
          PACKAGING: tolerancePayload.PACKAGING,
        },
      },
    });
  });

  clearCoverageToleranceDefaultsCache();

  return redirect("/admin/settings/pricing");
}

export default function GlobalSettingsRoute() {
  const { defaultMargin, tolerance } = useLoaderData<typeof loader>();
  return (
    <Stack gap="lg">
      <Title order={2}>Global Settings</Title>
      <Form method="post">
        <Stack gap="xl">
          <Stack w={340}>
            <Title order={4}>Pricing defaults</Title>
            <NumberInput
              name="defaultMargin"
              label="Default Margin (decimal)"
              description="Used when no vendor/customer override is configured"
              step={0.01}
              min={0}
              max={10}
              defaultValue={defaultMargin}
            />
          </Stack>

          <Stack>
            <Title order={4}>Material coverage tolerance</Title>
            <Text size="sm" c="dimmed">
              Percent inputs represent % of required quantity; absolute inputs
              are additive buffers. Assemblies can override these values.
            </Text>
            <Table withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Category</Table.Th>
                  <Table.Th>Percent tolerance</Table.Th>
                  <Table.Th>Abs tolerance</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {TOLERANCE_FIELDS.map(({ key, label }) => {
                  const source =
                    key === "default"
                      ? tolerance.defaultPct
                      : tolerance.byType[key]?.pct ?? tolerance.defaultPct;
                  const sourceAbs =
                    key === "default"
                      ? tolerance.defaultAbs
                      : tolerance.byType[key]?.abs ?? tolerance.defaultAbs;
                  return (
                    <Table.Tr key={key}>
                      <Table.Td>{label}</Table.Td>
                      <Table.Td>
                        <NumberInput
                          name={`tol-${key}-pct`}
                          label="Percent"
                          aria-label={`${label} percent tolerance`}
                          suffix="%"
                          step={0.1}
                          min={0}
                          max={100}
                          defaultValue={roundPercent(source * 100)}
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          name={`tol-${key}-abs`}
                          label="Absolute qty"
                          aria-label={`${label} absolute tolerance`}
                          step={0.1}
                          min={0}
                          defaultValue={roundNumber(sourceAbs)}
                        />
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Stack>

          <Group>
            <Button type="submit">Save settings</Button>
          </Group>
        </Stack>
      </Form>
    </Stack>
  );
}

function parseNumber(value: FormDataEntryValue | null): number {
  if (typeof value !== "string") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function clampAbs(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function roundPercent(value: number) {
  return Math.round(value * 10) / 10;
}

function roundNumber(value: number) {
  return Math.round(value * 100) / 100;
}
