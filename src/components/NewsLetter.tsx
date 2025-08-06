import {
  Card,
  Stack,
  Title,
  Text,
  Group,
  Button,
  MantineProvider,
} from "@mantine/core";
import CustomMantineProvider from "../stores/CustomMantineProvider";

export default function NewsLetter() {
  return (
    <CustomMantineProvider>
      <Card shadow="sm" padding="xl" radius="md" withBorder bg="blue.0">
        <Stack gap="md" align="center" ta="center">
          <Title order={3}>订阅我的博客</Title>
          <Text c="dimmed" maw={500}>
            获取最新的技术文章、播客更新和编程技巧，直接发送到你的邮箱。
          </Text>
          <Group>
            <Button size="md">立即订阅</Button>
            <Button variant="outline" size="md">
              了解更多
            </Button>
          </Group>
        </Stack>
      </Card>
    </CustomMantineProvider>
  );
}
