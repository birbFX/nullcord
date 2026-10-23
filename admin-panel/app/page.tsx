import { NullCordLogin } from "@/components/common/auth/NullCordLogin";
import { Metadata } from "next";

import { Card, Flex, Heading, Text } from "@radix-ui/themes";

import styles from "./home.module.css";

export const metadata: Metadata = {
  title: "NullCord Admin",
  description: "Administration panel for this NullCord instance.",
};

export default function Home() {
  return (
    <main
      className={
        styles.main + " h-[100vh] p-4 flex items-center justify-center"
      }
    >
      <Card className="p-5">
        <Flex direction="column" gap="4">
          <Heading as="h1" size="7">
            NullCord Admin
          </Heading>
          <Text size="2" color="gray">
            Administrator sign-in
          </Text>

          <NullCordLogin />

          <Text align="center" size="1">
            <a href="https://github.com/birbFX/nullcord">
              Source code · AGPL-3.0
            </a>
          </Text>
        </Flex>
      </Card>
    </main>
  );
}
