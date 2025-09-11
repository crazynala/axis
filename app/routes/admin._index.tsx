import { Link } from "@remix-run/react";
import { Card, Group, Stack, Title } from "@mantine/core";

export default function AdminIndex() {
  return (
    <Stack>
      <Title order={3}>Admin</Title>
      <Card withBorder padding="md">
        <Card.Section inheritPadding py="xs">
          <Title order={5}>Tools</Title>
        </Card.Section>
        <Stack gap="xs" mt="sm">
          <Group gap="md">
            <Link to="/admin/import">Excel Import</Link>
            <Link to="/admin/logging">Logging</Link>
            <Link to="/admin/value-lists/Tax">Value Lists: Tax Codes</Link>
            <Link to="/admin/value-lists/Category">Value Lists: Category</Link>
            <Link to="/admin/value-lists/ProductType">
              Value Lists: Product Type
            </Link>
            <Link to="/admin/value-lists/JobType">Value Lists: Job Type</Link>
            <Link to="/admin/value-lists/JobStatus">
              Value Lists: Job Status
            </Link>
            <Link to="/admin/value-lists/Subcategory">
              Value Lists: Subcategory
            </Link>
            <Link to="/admin/forex/USD/TRY">Forex: USD → TRY</Link>
            <Link to="/admin/dhl-records">DHL Records</Link>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
