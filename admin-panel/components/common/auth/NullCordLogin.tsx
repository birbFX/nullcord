"use client";

import { signIn } from "next-auth/react";
import { FormEvent, useState } from "react";

import { Button, Callout, Flex, Text, TextField } from "@radix-ui/themes";

export function NullCordLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(undefined);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/panel",
    });

    if (!result || result.error) {
      setError("Invalid credentials, or this account is not an administrator.");
      setLoading(false);
      return;
    }

    window.location.href = "/panel";
  }

  return (
    <form onSubmit={submit}>
      <Flex direction="column" gap="3" style={{ minWidth: 300 }}>
        <TextField.Root
          type="email"
          placeholder="NullCord email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          required
        />
        <TextField.Root
          type="password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          required
        />
        {error && (
          <Callout.Root color="red" size="1">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
        <Text size="1" color="gray" align="center">
          Use your NullCord account. Only platform administrators can access
          this panel.
        </Text>
      </Flex>
    </form>
  );
}
