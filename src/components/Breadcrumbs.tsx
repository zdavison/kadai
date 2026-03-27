import { Box, Text } from "ink";

interface BreadcrumbsProps {
  path: string[];
}

export function Breadcrumbs({ path }: BreadcrumbsProps) {
  const parts = ["kadai", ...path];
  return (
    <Box flexDirection="column">
      <Text dimColor>{parts.join(" > ")}</Text>
      <Text> </Text>
    </Box>
  );
}
